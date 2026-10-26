# Changelog

## [1.0.0] — 2026-10-26

Initial release.

### Features

- Client-side React dashboard with a local chat simulation, read-only source explorer and browser-side extension ZIP export.
- Standalone Chrome Manifest V3 extension with list, single-message and catalog emote modes, sequential/random list selection and configurable intervals.
- Shared emote catalog and raw extension sources used by both the source explorer and ZIP assembly.
- Text imports limited to `.txt` files up to 1 MiB; superseded reads are cancelled so stale results cannot overwrite newer preferences.

### Automation boundaries

- Target selection and sending are restricted to a verified Kick chat editor and the exact send-button ID in the same footer. No generic submit or synthetic Enter fallback is used.
- Existing drafts are preserved. Stop/reset cancel pending sends; stale callbacks cannot affect a newer run.
- Targets are bound to the selected channel path. Missing, ambiguous, readonly or changed editors and controls stop the engine.
- Intervals must be finite integers from 1 to 86400 seconds.
- Text is checked at the delayed send boundary to accommodate Lexical updates. Emote decorators must match the selected catalog name and asset identity.
- Popup startup, storage and status handling prevent duplicate starts and preserve Stop access when preferences cannot be read. Local errors remain visible across status polling.
- UI interaction does not confirm Kick server acceptance or guarantee compatibility with every channel. Automation does not bypass platform restrictions or duplicate-message checks.

### Development and validation

- React 19.3, TypeScript 6.0, Vite 8.3 and locally compiled Tailwind CSS 4.3; no Tailwind runtime CDN or remote font loading.
- Loopback development server, strict TypeScript, ESLint and Node/jsdom regression tests for dashboard, popup, content-script and ZIP behavior.
- Combined `npm run verify` command for lint, typecheck, tests and production build.
- English and Turkish usage documentation, project engineering guidance and a security policy.

[1.0.0]: https://github.com/okanalici/kick-auto-chat/tree/v1.0.0
