import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';

async function loadTypescript(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { validateExportFiles, getManifestIconPaths, getAssetUrl } = await loadTypescript('../lib/exportExtension.ts');
const { KICK_EMOJIS } = await loadTypescript('../data/emotes.ts');
const assembly = readFileSync(new URL('../data/extensionFiles.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(assembly, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const assembled = { exports: {}, require(path) {
  if (path === './emotes') return { KICK_EMOJIS };
  if (path.endsWith('?raw')) return { __esModule: true, default: readFileSync(new URL(path.slice(0, -4), new URL('../data/extensionFiles.ts', import.meta.url)), 'utf8') };
  throw new Error('Unexpected assembly import: ' + path);
} };
vm.runInNewContext(compiled, assembled);
const files = assembled.exports.extensionFiles;
const manifestContent = files.find(file => file.name === 'manifest.json').content;

test('shared catalog preserves unique names, URLs and resolves popup token to valid JS', () => {
  assert.equal(KICK_EMOJIS.length, 66);
  assert.equal(new Set(KICK_EMOJIS.map(value => value.name)).size, 66);
  assert.ok(KICK_EMOJIS.every(value => /^https:\/\/files\.kick\.com\/emotes\/\d+\/fullsize$/.test(value.url)));
  const popup = files.find(file => file.name === 'popup.js').content;
  assert.ok(!popup.includes('__KICK_EMOJIS__'));
  new vm.Script(popup);
});

test('export rejects missing, duplicate and empty core source files', () => {
  assert.equal(validateExportFiles(files).length, 5);
  assert.throws(() => validateExportFiles(files.slice(1)), /missing/);
  assert.throws(() => validateExportFiles([...files, files[0]]), /duplicated/);
  assert.throws(() => validateExportFiles(files.map(file => file.name === 'content.js' ? { ...file, content: '' } : file)), /empty/);
});

test('manifest rejects corrupt entries and unsafe icon paths; supports base paths', () => {
  assert.equal(getManifestIconPaths(manifestContent).length, 3);
  assert.throws(() => getManifestIconPaths('{'), SyntaxError);
  const manifest = JSON.parse(manifestContent);
  assert.throws(() => getManifestIconPaths(JSON.stringify({ ...manifest, manifest_version: 2 })), /Invalid/);
  assert.throws(() => getManifestIconPaths(JSON.stringify({ ...manifest, icons: { 16: '../outside.png' } })), /unsafe/);
  assert.equal(getAssetUrl('icons/icon16.png', '/dashboard/'), '/dashboard/icons/icon16.png');
  assert.throws(() => getAssetUrl('../outside.png', '/'), /Unsupported/);
});

test('actual assembled ZIP contains all sources and PNG icons with matching manifest references', async () => {
  const zip = new JSZip();
  for (const file of validateExportFiles(files)) zip.file(file.name, file.content);
  for (const path of getManifestIconPaths(manifestContent)) {
    const icon = readFileSync(new URL(`../public/${path}`, import.meta.url));
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    zip.file(path, icon);
  }
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(Object.values(loaded.files).filter(file => !file.dir).length, 8);
  for (const file of files) assert.equal(await loaded.file(file.name).async('string'), file.content);
  const manifest = JSON.parse(await loaded.file('manifest.json').async('string'));
  for (const path of Object.values(manifest.icons)) assert.ok(loaded.file(path));
  for (const name of ['content.js', 'popup.js']) new vm.Script(await loaded.file(name).async('string'));
});
