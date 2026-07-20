# Contributing to Kiln Dashboard

## Development environment

This is a normal Electron + React + TypeScript app (Vite for the
renderer bundle) - no WSL2 needed to *edit* it, but running it for real
does need a working Kiln/WSL2 setup on the same machine, since the app
is a client of `kilnd` (see the main
[Kiln repository](https://github.com/foulehistory/kiln)).

```sh
npm install
npm run dev
```

## Before opening a PR

- `npx tsc --noEmit` passes.
- If your change is UI-visible, actually exercise it in a real running
  Electron window (`npm start`), not just the Vite dev server in a
  browser tab - Electron-specific APIs (native dialogs, IPC, the
  `window.kiln` bridge) don't exist there.
- Keep the change scoped. A bug fix doesn't need surrounding cleanup.

## Code conventions

- Every Electron IPC call goes through `electron/preload.js`'s
  `contextBridge` - never enable `nodeIntegration` in the renderer as a
  shortcut around that.
- `electron/main.js` is the only place that talks to `kilnd` over HTTP;
  the renderer only ever calls `window.kiln.*`.
- Prefer a comment that explains *why* a piece of UI/IPC logic exists
  over one restating what the code obviously does.

## Commit messages

Focus on *why*, not *what*. Imperative mood ("Add X", not "Added X").

## Versioning

Independent from the main Kiln repository's own version - see its
README's Versioning section for how *that* repo is versioned. This one
bumps on every user-visible release, tracked in `package.json`.
