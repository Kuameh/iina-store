<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Iina Store logo" />
</p>

<h1 align="center">Iina Store</h1>

<p align="center">
  A plugin that discovers, searches, and installs other <a href="https://github.com/iina/iina">IINA</a> plugins &mdash; from inside IINA itself.
</p>

<p align="center">
  <a href="https://github.com/Kuameh/iina-store/actions/workflows/ci.yml"><img src="https://github.com/Kuameh/iina-store/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/Kuameh/iina-store/actions/workflows/crawl-registry.yml"><img src="https://github.com/Kuameh/iina-store/actions/workflows/crawl-registry.yml/badge.svg" alt="Registry crawl status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-ISC-blue.svg" alt="ISC license" /></a>
</p>

## Why this exists

IINA has no official plugin store. Plugins are scattered across a community
"awesome list", a handful of independent GitHub repos, and word of mouth —
[iina/iina#5731](https://github.com/iina/iina/issues/5731) is an open,
unanswered issue asking exactly that: "is it just serendipity based?"

Iina Store is itself an IINA plugin. Install it once, and it gives you a
searchable, filterable catalog of other IINA plugins with one-click install
and uninstall, right inside the app.

## Features

- **Browse and search** a curated catalog of IINA plugins by name, category, and tags
- **Sort** by featured, name, stars, or recency
- **One-click install and uninstall**, including safety checks against a
  malicious or malformed plugin package (path-traversal guards, identifier
  verification, atomic moves, no clobbering a plugin the store didn't install)
- **Live-updating catalog** &mdash; a curated base list ships with every
  release, topped up by a daily crawl of GitHub's `iina-plugin` topic, so new
  plugins can appear without you needing to update Iina Store itself
- A companion sidebar tab for a quick glance at what's available without
  opening the full window

## Installing Iina Store

1. Download the latest `.iinaplgz` from [Releases](https://github.com/Kuameh/iina-store/releases), or build it yourself (see below)
2. Open it with IINA, or install it via IINA's Preferences &rarr; Plugins &rarr; install-from-GitHub-URL flow, pointing at this repo
3. Restart IINA, then enable the plugin under Preferences &rarr; Plugins

## Development

Requires Node.js and the `iina-plugin` CLI (bundled with IINA &ge; 1.4.0, at
`IINA.app/Contents/MacOS/iina-plugin`).

```sh
git clone https://github.com/Kuameh/iina-store.git
cd iina-store
npm install
npm run typecheck   # tsc --noEmit
npm run build        # parcel build . -> dist/
iina-plugin link .   # symlinks this folder as a dev plugin
```

Restart IINA to load it. Entry-script changes (anything under `src/`) need a
full IINA restart to take effect; webview-only changes (`ui/`) can usually be
picked up with a right-click "Reload" on the window or sidebar instead.

## How it works

| Layer | What it does |
|---|---|
| [`src/registry.ts`](src/registry.ts) | Search, filter, and sort logic over the merged catalog |
| [`resources/registry.json`](resources/registry.json) | Hand-curated base catalog, bundled into the plugin at build time |
| [`src/liveRegistry.ts`](src/liveRegistry.ts) | Fetches a live overlay from Upstash (12h local cache, fails closed to the bundled catalog if unreachable) |
| [`scripts/crawl-registry.mjs`](scripts/crawl-registry.mjs) | Runs daily via [GitHub Actions](.github/workflows/crawl-registry.yml), crawls GitHub's `iina-plugin` topic, writes the merged result to Upstash |
| [`src/installer.ts`](src/installer.ts) | Downloads, validates, and installs/uninstalls a plugin package, tracking what it's installed in a local manifest |
| [`ui/window`](ui/window), [`ui/sidebar`](ui/sidebar) | The two React surfaces, talking to the entry script over `postMessage` (see [`ui/shared/bridge.ts`](ui/shared/bridge.ts)) |

Curator-authored fields in the registry (name, description, tags, category)
are never overwritten by the crawler &mdash; it can only refresh objective
signals like star counts and last-seen timestamps, or add newly discovered
plugins as unreviewed entries. See the `_comment` field at the top of
`resources/registry.json` for the exact rule.

If you fork this project to run your own instance, you'll want your own
Upstash database — see [`src/upstashConfig.ts`](src/upstashConfig.ts) for the
embedded (read-only, safe to make public) token, and
[CONTRIBUTING.md](CONTRIBUTING.md) for how the write-side secrets are kept
separate from it.

## Contributing

Contributions are welcome, code or not — see [CONTRIBUTING.md](CONTRIBUTING.md).

Don't want to write code? You can still help by
[submitting a plugin](.github/ISSUE_TEMPLATE/submit_a_plugin.md) you think
belongs in the curated catalog.

## License

[ISC](LICENSE)

## Acknowledgments

- [IINA](https://github.com/iina/iina) and its [plugin API](https://docs.iina.io)
- [iina-plugin-definition](https://github.com/iina/iina-plugin-definition) for the TypeScript ambient types
- [Upstash](https://upstash.com) for the live registry's backing store
