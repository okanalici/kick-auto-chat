import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import ts from 'typescript';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
const { window } = dom;
const { document } = window;
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');

function loadModule(path, imports = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/dashboard/'));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => imports[name] ?? require(name), setTimeout, clearTimeout, FileReader: ControlledReader, Blob: globalThis.Blob, ...globals });
  return module.exports;
}

class ControlledReader {
  static instances = [];
  constructor() { ControlledReader.instances.push(this); }
  readAsText(file) { this.file = file; }
  abort() { this.aborted = true; }
  succeed(value) { this.result = value; this.onload?.({ target: this }); }
  fail() { this.onerror?.(); }
}

const emotes = loadModule('../data/emotes.ts');
const { extensionFiles } = loadModule('../data/extensionFiles.ts', {
  './emotes': emotes,
  ...Object.fromEntries(['content.js', 'popup.js', 'popup.html', 'styles.css'].map(name => [
    `../extension/${name}?raw`,
    { __esModule: true, default: readFileSync(new URL(`../extension/${name}`, import.meta.url), 'utf8') },
  ])),
});
const exportHelpers = loadModule('../lib/exportExtension.ts');
const { default: PreviewPanel } = loadModule('../components/PreviewPanel.tsx', { '../data/emotes': emotes });

async function mount(Component = PreviewPanel) {
  ControlledReader.instances = [];
  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(() => root.render(React.createElement(Component)));
  const button = name => [...container.querySelectorAll('button')].find(value => value.textContent.trim() === name || value.getAttribute('aria-label') === name);
  const click = async name => { await act(() => button(name).click()); };
  const input = async (element, value) => {
    const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    await act(() => element.dispatchEvent(new window.Event('input', { bubbles: true })));
  };
  const upload = async file => {
    const element = container.querySelector('input[type=file]');
    Object.defineProperty(element, 'files', { configurable: true, value: [file] });
    await act(() => element.dispatchEvent(new window.Event('change', { bubbles: true })));
    return element;
  };
  return { container, click, input, upload, close: async () => { await act(() => root.unmount()); } };
}

test('preview clears empty-message errors on edits and reset', async () => {
  const h = await mount();
  try {
    await h.click('Select Chat Input');
    await h.click('Click Chat to Select Target');
    await h.input(h.container.querySelector('textarea'), '');
    await h.click('START ENGINE');
    assert.match(h.container.textContent, /Please enter messages/);
    await h.input(h.container.querySelector('textarea'), 'valid message');
    assert.doesNotMatch(h.container.textContent, /Please enter messages/);
    await h.input(h.container.querySelector('textarea'), '');
    await h.click('START ENGINE');
    await h.click('Reset selected chat target');
    assert.doesNotMatch(h.container.textContent, /Please enter messages/);
    assert.match(h.container.textContent, /Waiting for target/);
  } finally { await h.close(); }
});

test('preview message and interval fields have associated labels', async () => {
  const h = await mount();
  try {
    for (const element of h.container.querySelectorAll('textarea, input[type=number]')) {
      assert.equal(element.labels.length, 1);
      assert.ok(element.labels[0].textContent.trim());
    }
    await h.click('single');
    assert.equal(h.container.querySelector('textarea').labels[0].textContent, 'Single Message');
  } finally { await h.close(); }
});

test('preview interval validation rejects invalid pairs and accepts inclusive bounds', async () => {
  const h = await mount();
  try {
    await h.click('Select Chat Input');
    await h.click('Click Chat to Select Target');
    const min = h.container.querySelector('#preview-min');
    const max = h.container.querySelector('#preview-max');
    for (const [lower, upper] of [['0', '1'], ['1', '86401'], ['2', '1'], ['1.5', '2'], ['', '2']]) {
      await h.input(min, lower);
      await h.input(max, upper);
      assert.equal([...h.container.querySelectorAll('button')].find(button => button.textContent.includes('START ENGINE')).disabled, true);
    }
    await h.input(min, '1');
    await h.input(max, '86400');
    assert.equal([...h.container.querySelectorAll('button')].find(button => button.textContent.includes('START ENGINE')).disabled, false);
  } finally { await h.close(); }
});

test('preview rejects oversized or non-text imports before reading and preserves messages', async () => {
  const h = await mount();
  try {
    const original = h.container.querySelector('textarea').value;
    await h.upload(new window.File(['test'], 'wrong.json'));
    assert.equal(ControlledReader.instances.length, 0);
    assert.match(h.container.textContent, /Import a .txt file no larger than 1 MiB/);
    await h.upload(new window.File([new Uint8Array(1048577)], 'large.txt'));
    assert.equal(ControlledReader.instances.length, 0);
    assert.equal(h.container.querySelector('textarea').value, original);
  } finally { await h.close(); }
});

test('preview reports read failure without replacing messages and resets the file input', async () => {
  const h = await mount();
  try {
    const original = h.container.querySelector('textarea').value;
    const element = await h.upload(new window.File(['test'], 'list.txt'));
    await act(() => ControlledReader.instances[0].fail());
    assert.match(h.container.textContent, /Unable to read imported file/);
    assert.equal(h.container.querySelector('textarea').value, original);
    assert.equal(element.value, '');
    await h.upload(new window.File(['again'], 'list.txt'));
    await act(() => ControlledReader.instances[1].succeed('restored\nmessages'));
    assert.equal(h.container.querySelector('textarea').value, 'restored\nmessages');
    assert.doesNotMatch(h.container.textContent, /Unable to read imported file/);
  } finally { await h.close(); }
});

test('preview cancels superseded imports and ignores old callbacks after replacement or unmount', async () => {
  const h = await mount();
  await h.upload(new window.File(['old'], 'old.txt'));
  const old = ControlledReader.instances[0];
  await h.upload(new window.File(['new'], 'new.txt'));
  const current = ControlledReader.instances[1];
  assert.equal(old.aborted, true);
  await act(() => current.succeed('new messages'));
  await act(() => old.succeed('stale messages'));
  assert.equal(h.container.querySelector('textarea').value, 'new messages');
  await h.upload(new window.File(['pending'], 'pending.txt'));
  const pending = ControlledReader.instances[2];
  await h.close();
  assert.equal(pending.aborted, true);
  await act(() => pending.succeed('after unmount'));
});

test('preview preserves imported sequential messages, live mode inputs and stop/reset scheduling', async () => {
  const timers = controlledTimers();
  const { default: TimedPreview } = loadModule('../components/PreviewPanel.tsx', { '../data/emotes': emotes }, timers);
  const h = await mount(TimedPreview);
  const messages = () => [...h.container.querySelectorAll('.text-white.break-words')].map(element => element.textContent.replace(/^\[.*?\] /, ''));
  try {
    await h.upload(new window.File(['list'], 'list.txt'));
    await act(() => ControlledReader.instances[0].succeed(' first \r\n \n second '));
    await h.click('Select Chat Input');
    await h.click('Click Chat to Select Target');
    await act(() => h.container.querySelector('#seq-check').click());
    await h.input(h.container.querySelector('#preview-min'), '2');
    await h.input(h.container.querySelector('#preview-max'), '2');
    await h.click('START ENGINE');
    assert.deepEqual([...timers.callbacks.values()].map(timer => timer.delay), [500]);
    await timers.run(500);
    assert.deepEqual(messages(), ['first']);
    await timers.run(2000);
    assert.deepEqual(messages(), ['second', 'first']);
    await h.click('single');
    await h.input(h.container.querySelector('#preview-single'), '  live single  ');
    await timers.run(2000);
    assert.deepEqual(messages(), ['live single', 'second', 'first']);
    await h.click('emoji');
    await h.click('Select emojiAngel');
    await timers.run(2000);
    assert.equal(h.container.querySelector('img[alt="emoji"]').getAttribute('src'), emotes.KICK_EMOJIS.find(emoji => emoji.name === 'emojiAngel').url);
    await h.click('STOP');
    assert.equal(timers.callbacks.size, 0);
    await h.click('list');
    await h.click('START ENGINE');
    await timers.run(500);
    assert.equal(messages()[0], 'first');
    await h.click('Reset selected chat target');
    assert.equal(timers.callbacks.size, 0);
    assert.match(h.container.textContent, /Waiting for target/);
    assert.equal(h.container.querySelector('#preview-list').value, ' first \n \n second ');
  } finally { await h.close(); }
  assert.equal(timers.callbacks.size, 0);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function controlledTimers() {
  const callbacks = new Map();
  let id = 0;
  return {
    callbacks,
    setTimeout(callback, delay) { callbacks.set(++id, { callback, delay }); return id; },
    clearTimeout(key) { callbacks.delete(key); },
    async run(delay) {
      for (const [key, value] of [...callbacks]) {
        if (value.delay === delay) {
          callbacks.delete(key);
          await act(() => value.callback());
        }
      }
    },
  };
}

async function mountComponent(Component) {
  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(() => root.render(React.createElement(Component)));
  return { container, close: async () => { await act(() => root.unmount()); } };
}

async function mountApp({ files = extensionFiles, response } = {}) {
  const timers = controlledTimers();
  const requests = [], downloads = [], revoked = [], alerts = [], errors = [];
  const icons = new Map(['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'].map(path => [
    `/dashboard/${path}`, readFileSync(new URL(`../public/${path}`, import.meta.url)),
  ]));
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ href: this.href, filename: this.download, attached: this.isConnected });
  };
  const blobs = [];
  const { default: App } = loadModule('../App.tsx', {
    './components/PreviewPanel': { __esModule: true, default: () => null },
    './components/CodePanel': { __esModule: true, default: () => null },
    './data/extensionFiles': { extensionFiles: files },
    './lib/exportExtension': exportHelpers,
  }, {
    ...timers, document,
    window: { alert: message => alerts.push(message) },
    console: { error: (...args) => errors.push(args) },
    URL: {
      createObjectURL: blob => { blobs.push(blob); return `blob:http://localhost/export-${blobs.length}`; },
      revokeObjectURL: url => revoked.push(url),
    },
    fetch: async url => {
      requests.push(url);
      if (response) return response(url);
      assert.ok(icons.has(url), `Unexpected icon request: ${url}`);
      return { ok: true, blob: async () => new Blob([icons.get(url)], { type: 'image/png' }) };
    },
  });
  const h = await mountComponent(App);
  const button = h.container.querySelector('button');
  // React's event dispatcher discards async return values. Retain the real mounted
  // handler's promise so completion (including after unmount) is controlled, not timed.
  const invoke = () => button[Object.keys(button).find(key => key.startsWith('__reactProps$'))].onClick();
  return { ...h, button, invoke, timers, requests, downloads, revoked, alerts, errors, blobs, icons,
    close: async () => { await h.close(); window.HTMLAnchorElement.prototype.click = originalClick; } };
}

test('App downloads one complete real ZIP for overlapping export requests and cleans up its object URL', async () => {
  const gate = deferred();
  const h = await mountApp({ response: async url => {
    await gate.promise;
    return { ok: true, blob: async () => new Blob([readFileSync(new URL(`../public/${url.replace('/dashboard/', '')}`, import.meta.url))], { type: 'image/png' }) };
  } });
  try {
    let first, second;
    await act(() => { first = h.invoke(); h.button.click(); second = h.invoke(); });
    assert.equal(h.button.disabled, true);
    assert.equal(h.requests.length, 3);
    assert.equal(h.downloads.length, 0);
    await act(async () => { gate.resolve(); await Promise.all([first, second]); });
    assert.equal(h.downloads.length, 1);
    assert.deepEqual(h.downloads[0], { href: 'blob:http://localhost/export-1', filename: 'kick-auto-chat-extension.zip', attached: true });
    assert.equal(document.querySelector('a[download]'), null);
    assert.equal(h.button.disabled, false);
    assert.match(h.button.textContent, /Downloaded!/);
    const zip = await JSZip.loadAsync(await h.blobs[0].arrayBuffer());
    assert.deepEqual(Object.values(zip.files).filter(file => !file.dir).map(file => file.name).sort(),
      ['manifest.json', 'content.js', 'popup.js', 'popup.html', 'styles.css', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'].sort());
    for (const file of extensionFiles) assert.equal(await zip.file(file.name).async('string'), file.content);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    for (const path of Object.values(manifest.icons)) {
      assert.deepEqual(await zip.file(path).async('uint8array'), new Uint8Array(h.icons.get(`/dashboard/${path}`)));
    }
    assert.deepEqual(h.alerts, []);
    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.revoked, []);
    await h.timers.run(1000);
    assert.deepEqual(h.revoked, ['blob:http://localhost/export-1']);
    await h.timers.run(3000);
    assert.equal(h.button.textContent, 'Export ZIP');
  } finally { await h.close(); }
});

for (const failure of ['missing source', 'missing icon', 'HTTP failure', 'empty icon', 'wrong MIME icon']) {
  test(`App rejects ${failure} without downloading or showing success`, async () => {
    const h = await mountApp({
      files: failure === 'missing source' ? extensionFiles.filter(file => file.name !== 'content.js') : extensionFiles,
      response: async () => {
        if (failure === 'missing icon') throw new TypeError('Network request failed');
        return { ok: failure !== 'HTTP failure', blob: async () => new Blob(
          failure === 'empty icon' ? [] : ['not an image'],
          { type: failure === 'wrong MIME icon' ? 'text/html' : 'image/png' },
        ) };
      },
    });
    try {
      await act(async () => { await h.invoke(); });
      assert.equal(h.downloads.length, 0);
      assert.equal(h.blobs.length, 0);
      assert.equal(h.alerts.length, 1);
      assert.equal(h.errors.length, 1);
      assert.equal(h.button.textContent, 'Export ZIP');
      assert.equal(h.button.disabled, false);
      assert.equal(h.timers.callbacks.size, 0);
      if (failure === 'missing source') assert.equal(h.requests.length, 0);
    } finally { await h.close(); }
  });
}

test('App ignores pending export completion after unmount and still revokes an earlier download URL', async () => {
  const gate = deferred();
  const h = await mountApp({ response: async () => {
    await gate.promise;
    return { ok: true, blob: async () => new Blob([readFileSync(new URL('../public/icons/icon16.png', import.meta.url))], { type: 'image/png' }) };
  } });
  let pending;
  await act(() => { pending = h.invoke(); });
  await h.close();
  await act(async () => { gate.resolve(); await pending; });
  assert.equal(h.downloads.length, 0);
  assert.equal(h.blobs.length, 0);
  assert.equal(h.alerts.length, 0);
  assert.equal(h.timers.callbacks.size, 0);
  assert.equal(h.container.textContent, '');

  const completed = await mountApp();
  await act(async () => { await completed.invoke(); });
  await completed.close();
  assert.equal([...completed.timers.callbacks.values()].some(timer => timer.delay === 3000), false);
  await completed.timers.run(1000);
  assert.deepEqual(completed.revoked, ['blob:http://localhost/export-1']);
});

async function mountCodePanel(writeText) {
  const timers = controlledTimers();
  const { default: CodePanel } = loadModule('../components/CodePanel.tsx', {
    '../data/extensionFiles': { extensionFiles },
  }, { ...timers, navigator: { clipboard: { writeText } } });
  const h = await mountComponent(CodePanel);
  const button = () => [...h.container.querySelectorAll('button')].find(element => /Copy Code|Copied!|Copy failed/.test(element.textContent));
  return { ...h, timers, button, click: async () => { await act(() => button().click()); },
    select: async name => { await act(() => [...h.container.querySelectorAll('button')].find(element => element.textContent === name).click()); } };
}

test('CodePanel copies the selected real source only after clipboard success and clears feedback', async () => {
  const gate = deferred(), writes = [];
  const h = await mountCodePanel(text => { writes.push(text); return gate.promise; });
  try {
    await h.select('popup.js');
    await h.click();
    assert.deepEqual(writes, [extensionFiles.find(file => file.name === 'popup.js').content]);
    assert.equal(h.button().textContent, 'Copy Code');
    await act(async () => { gate.resolve(); await gate.promise; });
    assert.equal(h.button().textContent, 'Copied!');
    await h.timers.run(2000);
    assert.equal(h.button().textContent, 'Copy Code');
  } finally { await h.close(); }
});

for (const failure of ['rejected', 'falsy rejection', 'synchronous throw']) {
  test(`CodePanel reports ${failure} clipboard failure and allows a successful retry`, async () => {
    const gate = deferred();
    let attempts = 0;
    const h = await mountCodePanel(() => {
      if (++attempts > 1) return Promise.resolve();
      if (failure === 'synchronous throw') throw new Error('Clipboard unavailable');
      return gate.promise;
    });
    try {
      await h.click();
      if (failure !== 'synchronous throw') await act(async () => { gate.reject(failure === 'falsy rejection' ? undefined : new Error('Permission denied')); await gate.promise.catch(() => {}); });
      assert.equal(h.button().textContent, 'Copy failed — retry');
      assert.equal(h.timers.callbacks.size, 0);
      await h.click();
      assert.equal(h.button().textContent, 'Copied!');
    } finally { await h.close(); }
  });
}

for (const outcome of ['resolve', 'reject']) {
  test(`CodePanel ignores clipboard ${outcome} when only the selected file changed`, async () => {
    const gate = deferred();
    const h = await mountCodePanel(() => gate.promise);
    try {
      await h.click();
      await h.select('content.js');
      await act(async () => { gate[outcome](); await gate.promise.catch(() => {}); });
      assert.equal(h.button().textContent, 'Copy Code');
      assert.equal(h.timers.callbacks.size, 0);
    } finally { await h.close(); }
  });

  test(`CodePanel keeps the newest same-file copy result after an older ${outcome}`, async () => {
    const old = deferred(), current = deferred();
    const queue = [old, current];
    const h = await mountCodePanel(() => queue.shift().promise);
    try {
      await h.click();
      await h.click();
      await act(async () => { current.reject(new Error('Permission denied')); await current.promise.catch(() => {}); });
      assert.equal(h.button().textContent, 'Copy failed — retry');
      await act(async () => { old[outcome](); await old.promise.catch(() => {}); });
      assert.equal(h.button().textContent, 'Copy failed — retry');
      assert.equal(h.timers.callbacks.size, 0);
    } finally { await h.close(); }
  });

  test(`CodePanel ignores stale clipboard ${outcome} after file switch, newer copy and unmount`, async () => {
    const old = deferred(), current = deferred(), pending = deferred();
    const queue = [old, current, pending];
    const h = await mountCodePanel(() => queue.shift().promise);
    await h.click();
    await h.select('content.js');
    assert.equal(h.button().textContent, 'Copy Code');
    await h.click();
    await act(async () => { current.resolve(); await current.promise; });
    assert.equal(h.button().textContent, 'Copied!');
    await act(async () => {
      old[outcome]();
      await old.promise.catch(() => {});
    });
    assert.equal(h.button().textContent, 'Copied!');
    await h.select('popup.html');
    assert.equal(h.button().textContent, 'Copy Code');
    assert.equal(h.timers.callbacks.size, 0);
    await h.click();
    await h.close();
    await act(async () => { pending[outcome](); await pending.promise.catch(() => {}); });
    assert.equal(h.container.textContent, '');
    assert.equal(h.timers.callbacks.size, 0);
  });
}
