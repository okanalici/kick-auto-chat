# Security Policy

## Scope and supported code

The repository contains a client-side dashboard and the standalone Chrome Manifest V3 extension it exports. Current source is maintained; old exported ZIPs do not update automatically. Reload the unpacked extension and refresh Kick after updates.

## Trust boundaries

- The dashboard assembles extension source and icons locally. Its simulation never accesses a Kick account.
- The extension content script manipulates the DOM of HTTPS Kick pages. It does not use a Kick API client, read credentials or have a background worker.
- Preferences and imported message text are stored in `chrome.storage.local`, not a remote database. Do not use message lists as a secret store.
- Emote images are fetched from Kick's CDN. The dashboard does not load remote executable scripts or fonts.
- Build dependencies and npm lifecycle scripts form a separate supply-chain boundary. Review updates and run full-scope audits; production-only audits do not cover build tools.

## Automation constraints

Sending is limited to a uniquely validated chat editor and `#send-message-button` in the same `#chatroom-footer`. Never substitute generic submit controls, channel-points controls or Enter events. Missing, hidden, ambiguous, disabled or changed controls stop the engine. Existing drafts must not be overwritten. Stop/reset invalidate pending timers and older runs.

A UI click is not server acceptance. The extension must not bypass authentication, channel restrictions, moderation, duplicate checks or rate limits. No blind resend or invisible duplicate markers. The selector contract was observed read-only on 2026-10-04, not proven for every UI variation or logged-in account.

## Reporting a vulnerability

Please report through the repository's private GitHub security advisory feature or contact the maintainer privately rather than publishing account data or exploit details in a public issue.

Include the extension version, browser environment, a minimal reproduction and expected/observed behavior. Remove cookies, tokens, private messages and account-identifying data. Prefer a local HTML fixture for DOM/automation reports.
