# Kiln Dashboard

An Electron + React GUI for [Kiln](https://github.com/foulehistory/kiln),
a daemonless, rootless-by-default container runtime. Detects and sets up
WSL2 + Kiln for you on first run, then gives you a live view of
containers, images, volumes, networks (including live per-packet flow
observability), secrets, and an in-browser exec terminal.

## Install

Download the latest Windows installer from
[Releases](https://github.com/foulehistory/kiln-dashboard/releases) and
run it — the first-run setup flow handles installing WSL2 and Kiln
itself if they aren't already present.

## Development

```sh
npm install
npm run dev        # Vite dev server for the renderer
npm start           # build + launch the real Electron app
```

Talks to `kilnd` (Kiln's own local HTTP daemon, loopback-only) over
`127.0.0.1` inside WSL2 — see the main
[Kiln repository](https://github.com/foulehistory/kiln)'s `kilnd` crate
for what that daemon actually does. Nothing in this repo runs container
workloads itself; it's a client.

```sh
npx tsc --noEmit    # typecheck
npm run dist        # build an installer locally, without publishing
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
