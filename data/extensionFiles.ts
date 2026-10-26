import contentScript from '../extension/content.js?raw';
import popupScript from '../extension/popup.js?raw';
import popupHtml from '../extension/popup.html?raw';
import popupStyles from '../extension/styles.css?raw';
import { KICK_EMOJIS } from './emotes';

export interface CodeFile {
  name: string;
  language: string;
  content: string;
}

export const extensionFiles: CodeFile[] = [
  {
    name: 'manifest.json',
    language: 'json',
    content: `{
  "manifest_version": 3,
  "name": "Kick Auto Chat",
  "version": "1.0.0",
  "author": "okanalici",
  "description": "Automated chat interaction and interval sender for Kick.com.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "permissions": ["storage"],
  "host_permissions": ["https://kick.com/*", "https://*.kick.com/*"],
  "content_scripts": [
    {
      "matches": ["https://kick.com/*", "https://*.kick.com/*"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ]
}`
  },
  { name: 'content.js', language: 'javascript', content: contentScript },
  { name: 'popup.js', language: 'javascript', content: popupScript.replace('__KICK_EMOJIS__', () => JSON.stringify(KICK_EMOJIS)) },
  { name: 'popup.html', language: 'html', content: popupHtml },
  { name: 'styles.css', language: 'css', content: popupStyles }
];
