# Kick Auto Chat — Developer Dashboard & Chrome Extension

**English** | [Türkçe](README.tr-TR.md)

Initial release: [v1.0.0](https://github.com/okanalici/kick-auto-chat/tree/v1.0.0), published on 2026-10-26. See [CHANGELOG.md](CHANGELOG.md) for release details.

A client-side dashboard that simulates, displays and packages a Chrome Manifest V3 extension for Kick chat. It has no backend, account service or Kick API integration. The dashboard simulation does not send messages to Kick, and its settings are not embedded in the exported ZIP.

## Features

- List, single-message and emote modes, sequential/random list order and `.txt` import.
- Local simulation with the configured interval and a three-message preview history.
- Read-only source explorer with clipboard error reporting.
- Browser-side JSZip export of extension sources and required icons.
- Chat-only automation: a verified editor in `#chatroom-footer` and the exact `#send-message-button`. No generic form submission, channel-point button selection or synthetic Enter fallback.
- Explicit errors when the target/control is missing, ambiguous, disabled or changed. Stop/reset cancel pending sends. Existing drafts are not overwritten.

## Architecture

```text
index.html -> index.tsx -> App.tsx
  components/PreviewPanel.tsx       local simulation only
  components/CodePanel.tsx          generated source viewer
  data/emotes.ts                   shared emote catalog
  data/extensionFiles.ts            raw source/manifest assembly
  extension/content.js             page-local automation engine
  extension/popup.js                controls, Chrome storage, messaging
  extension/popup.html, styles.css  standalone popup UI
  lib/exportExtension.ts           validation and asset URLs; ZIP packaging in App.tsx
  tests/                           Node regression tests
```

The dashboard imports extension assets as raw strings. The popup catalog placeholder is replaced during assembly; the source viewer and ZIP use the same assembled files. `dist/` is the dashboard build, not an unpacked extension.

The popup stores preferences in `chrome.storage.local` and communicates with the active Kick tab. The content script owns target/run state and timers. Closing the popup does not stop it; refreshing the page discards the selected target and stops the page-local engine. Preferences remain. No background service worker is used.

## Requirements and commands

Use Node.js **24.15 or newer in the 24.x line** and npm. On PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
npm run verify
npm run build
npm run preview
```

The development server binds to `127.0.0.1:3000`; if that port is occupied, use the alternative port printed by Vite. `verify` runs lint, strict TypeScript checks, regression tests and a Vite production build. Individual commands: `npm run lint`, `npm run typecheck`, `npm test`.

Stack: React 19.3, TypeScript 6.0, Vite 8.3, Tailwind CSS 4.3 via its Vite plugin, Lucide React 1.61 and JSZip 3.10. TypeScript stays on the 6.0 patch line because typescript-eslint requires TypeScript below 6.1. CSS is compiled locally; there is no Tailwind runtime CDN or remote font dependency. Emote images still load from Kick's CDN.

## Install and operate the extension

1. Open the dashboard and click **Export ZIP**.
2. Extract `kick-auto-chat-extension.zip`.
3. Open `chrome://extensions/`, enable Developer mode and load the extracted folder as an unpacked extension.
4. After installing/updating, refresh the Kick page.
5. Open the popup, choose **Select Chat Input**, then click the actual chat editor. Reopen the popup.
6. Choose messages and an integer interval from **1 to 86400 seconds**, then start. Use only where the channel permits automated messages and obey platform restrictions.
7. Stop before typing your own draft or changing channels. Escape cancels target selection.

Popup preference controls become available after the initial storage read settles. Start also requires a successful engine status response; Stop remains available for a running engine even if preferences cannot be read. Text import accepts `.txt` files up to 1 MiB; newer imports, preference edits and popup closure cancel pending reads so stale results cannot replace newer settings.

Automation triggers one verified UI control; it does not confirm server acceptance, bypass authentication, followers-only rules, moderation or rate limits. Emote mode inserts the catalog name; actual conversion into an emote depends on Kick's editor. Duplicate-marker bypass is intentionally removed.

## Validation boundaries

Local tests cover DOM selection, unrelated controls, cancellation and failure paths. Offline checks and a working dashboard do not prove that a logged-in account can send on every Kick channel. Current selectors were observed read-only on 2026-10-04; UI changes can require revalidation. See [AGENTS.md](AGENTS.md) for engineering rules and [SECURITY.md](SECURITY.md) for reporting and trust boundaries.

## License

[MIT](LICENSE).
