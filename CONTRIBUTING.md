# Contributing to IINA Store

Thanks for considering it. There are two very different ways to contribute
here, and neither requires the other:

- [Submit a plugin](#submitting-a-plugin-to-the-catalog) to the curated catalog &mdash; no code required
- [Contribute code](#contributing-code) to the store plugin itself

## Submitting a plugin to the catalog

The fastest way is to [open a "Submit a plugin" issue](.github/ISSUE_TEMPLATE/submit_a_plugin.md)
with the plugin's repo URL and a short description. A maintainer will do the
verification and add it.

If you'd rather open a pull request directly, add an entry to
[`resources/registry.json`](resources/registry.json) following the existing
entries. Required fields:

| Field | Notes |
|---|---|
| `id` | `"gh:owner/repo"`, all lowercase &mdash; this is the stable dedup key, never reused for a different plugin |
| `repo` | `"owner/repo"` exactly as it appears on GitHub |
| `repoUrl` | Full `https://github.com/owner/repo` URL |
| `name`, `tagline`, `description`, `author` | Keep the tagline to one short line |
| `category` | One of `subtitles`, `appearance`, `playback`, `automation`, `utility`, `other` |
| `tags` | A few lowercase keywords |
| `install` | `{"type": "release-asset", "assetNamePattern": "*.iinaplgz"}` if the repo publishes a GitHub Release with a `.iinaplgz` asset, otherwise `{"type": "codeload-fallback", "defaultBranch": "main"}` (or whatever the repo's actual default branch is) |
| `update` | `{"mechanism": "none"}` unless you know the plugin declares `ghRepo`/`ghVersion` in its own `Info.json`, in which case `{"mechanism": "ghVersion", "ghRepo": "owner/repo"}` |
| `featured`, `verifiedInstallable` | Leave both `false` unless you've actually installed it through IINA Store yourself and confirmed it works |
| `source` | `{"type": "curated", "curatorNote": null, "addedAt": "<today, YYYY-MM-DD>"}` |

Fields you don't know (`iconUrl`, `homepageUrl`, `license`, `stars`,
`lastUpdated`) should be `null`/omitted rather than guessed — don't invent
stats. A maintainer will verify `verifiedInstallable` before merging.

**Please don't hand-edit any entry with `"source": {"type": "crawled", ...}`**
— those are owned by the automated crawl
([`scripts/crawl-registry.mjs`](scripts/crawl-registry.mjs)) and get
overwritten on its next run. If a crawled entry deserves to be promoted to
curated (better metadata, a proper category, a verified install), change its
`source.type` to `"curated"` as part of your edit.

## Contributing code

```sh
git clone https://github.com/Kuameh/iina-store.git
cd iina-store
npm install
npm run typecheck
npm run build
iina-plugin link .   # symlinks this folder as a dev plugin in IINA
```

A few things worth knowing before you dig in:

- **Entry script vs. webviews.** Code under `src/` runs in IINA's plugin
  entry-script context and has direct access to the `iina` global
  (`iina.http`, `iina.file`, `iina.utils`, etc.). Code under `ui/` runs in
  separate sandboxed webviews with *no* access to that global at all — they
  can only exchange JSON messages with the entry script via
  `postMessage`/`onMessage` (see [`ui/shared/bridge.ts`](ui/shared/bridge.ts)
  and the message shapes in [`src/types.ts`](src/types.ts)). If you add a new
  message type, update `types.ts` first, then both sides.
- **Don't guess at the IINA plugin API.** More than one bug in this project's
  history came from assuming an API's behavior (path resolution, a return
  shape, a method that turned out not to exist in the actually-installed
  `iina-plugin-definition` version) instead of checking
  `node_modules/iina-plugin-definition/iina/index.d.ts` directly, or testing
  live. If you're relying on specific behavior, read the type declarations
  first and mention what you verified in your PR description.
- **Full restart vs. reload.** Changes under `src/` need a full IINA restart
  to take effect. Changes under `ui/` can usually be picked up with a
  right-click "Reload" on the window or sidebar webview instead.
- **Run `npm run typecheck` before opening a PR.** CI runs it too, but it's
  faster to catch locally.

### Pull requests

- Keep PRs focused — one change per PR is easier to review than a bundle.
- Explain the *why*, not just the *what*, in the PR description.
- If you touched the install/uninstall flow, describe how you tested it
  (ideally against a real plugin, not just `npm run build` succeeding).

### Cutting a release

(Maintainers only.) Pushing a tag matching `v*` runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which
builds the plugin and packages it exactly the way the real `iina-plugin
pack` CLI does — `zip -ryq <name>-<version>.iinaplgz . -x 'node_modules/*'
-x '.*'` from the plugin root, verified directly against
[`iina-plugin`'s own source](https://github.com/iina/iina/blob/master/iina-plugin/main.swift)
rather than assumed — then attaches the result to a new GitHub Release.

Before tagging:

1. Bump `version` in [`Info.json`](Info.json) (the packaged filename comes
   from this field, not the git tag)
2. Bump `ghVersion` in `Info.json` by 1 so IINA's own auto-update check
   (via the `ghRepo`/`ghVersion` fields) notices the new release for anyone
   who already has it installed
3. `git tag v<version> && git push origin v<version>`

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
