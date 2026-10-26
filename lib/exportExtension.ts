import type { CodeFile } from '../data/extensionFiles';

const EXPORT_FILE_NAMES = ['manifest.json', 'content.js', 'popup.js', 'popup.html', 'styles.css'] as const;
const REQUIRED_ICON_PATHS = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'] as const;

export const validateExportFiles = (files: readonly CodeFile[]): CodeFile[] => {
  return EXPORT_FILE_NAMES.map(name => {
    const matches = files.filter(file => file.name === name);
    if (matches.length !== 1 || typeof matches[0].content !== 'string' || !matches[0].content.trim()) {
      throw new Error(`Required export file missing, empty or duplicated: ${name}`);
    }
    return matches[0];
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const getManifestIconPaths = (manifestContent: string): string[] => {
  const manifest: unknown = JSON.parse(manifestContent);
  if (!isRecord(manifest) || manifest.manifest_version !== 3 || typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) {
    throw new Error('Invalid extension manifest');
  }
  if (!isRecord(manifest.action) || manifest.action.default_popup !== 'popup.html' || !Array.isArray(manifest.content_scripts) || !manifest.content_scripts.some(script => isRecord(script) && Array.isArray(script.js) && script.js.includes('content.js'))) {
    throw new Error('Invalid extension entry points');
  }
  const paths = new Set<string>(REQUIRED_ICON_PATHS);
  const addIcon = (value: unknown) => {
    if (typeof value !== 'string' || !REQUIRED_ICON_PATHS.some(path => path === value)) {
      throw new Error('Unsupported or unsafe manifest icon path');
    }
    paths.add(value);
  };
  const addIcons = (value: unknown) => {
    if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('Invalid manifest icons');
    Object.values(value).forEach(addIcon);
  };
  addIcons(manifest.icons);
  if (typeof manifest.action.default_icon === 'string') addIcon(manifest.action.default_icon);
  else addIcons(manifest.action.default_icon);
  return [...paths];
};

export const getAssetUrl = (assetPath: string, baseUrl: string): string => {
  if (!REQUIRED_ICON_PATHS.some(path => path === assetPath)) throw new Error('Unsupported asset path');
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${assetPath}`;
};
