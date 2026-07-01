/**
 * Install/uninstall engine for Iina Store.
 *
 * Runs in the plugin MAIN ENTRY context (not a webview), so the ambient
 * `iina` global (typed by iina-plugin-definition) is available directly --
 * no import needed. This module owns all filesystem/network side effects
 * around installing and uninstalling plugins, plus the on-disk manifest
 * that tracks what the store has installed.
 *
 * Every public function reports progress via an `onProgress` callback using
 * the shared InstallProgressStage union so a later message-router step can
 * forward these as `event:install-progress` pushes to the webviews. Every
 * abort path throws a descriptive Error -- nothing here fails silently.
 */

import {
  InstalledManifest,
  InstalledManifestEntry,
  InstallProgressStage,
  InstallStatus,
  RegistryEntry,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_PATH = "@data/installed-manifest.json";
const MANIFEST_SCHEMA_VERSION = 1;

const PLUGINS_DIR =
  "~/Library/Application Support/com.colliderli.iina/plugins/";

const TMP_ROOT = "@tmp/iina-store/";

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB sane cap

// "owner/repo" -- letters, digits, underscore, dot, hyphen only, on each side.
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// Plugin identifiers: letters, digits, dot, hyphen only.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9.-]+$/;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Best-effort delete; never throws. */
function safeDelete(path: string | null | undefined): void {
  if (!path) return;
  try {
    if (iina.file.exists(path)) {
      iina.file.delete(path);
    }
  } catch {
    // best-effort cleanup only
  }
}

/**
 * Explicitly create a directory (mkdir -p semantics) before writing into it.
 *
 * IINA guarantees the top-level pseudo-folders (@tmp/, @data/) already
 * exist, but it has no reason to auto-create a subdirectory this plugin
 * invents underneath them (e.g. @tmp/iina-store/) -- and unlike `unzip -d`,
 * which creates its own target directory, `iina.http.download()` does not
 * appear to create missing parent directories for its destination path
 * (confirmed live: a download "succeeded" but iina.file.exists() on the
 * destination came back false). Calling this explicitly before both the
 * download and the extraction removes that gap instead of assuming either
 * API auto-creates directories.
 */
async function ensureDir(path: string): Promise<void> {
  const result = await iina.utils.exec("/bin/mkdir", ["-p", path]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to create directory ${path} (mkdir exited with status ${result.status}): ${result.stderr}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Manifest read/write
// ---------------------------------------------------------------------------

/**
 * Read the installed-plugins manifest from disk. Returns an empty manifest
 * (not an error) if the file doesn't exist yet or fails to parse -- a
 * missing/corrupt manifest just means "nothing tracked yet" from the
 * store's point of view, since the manifest is only bookkeeping for
 * store-managed installs, not the source of truth for what's on disk.
 */
export function readManifest(): InstalledManifest {
  const path = iina.utils.resolvePath(MANIFEST_PATH);
  const empty: InstalledManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    plugins: {},
  };

  if (!iina.file.exists(path)) {
    return empty;
  }

  let raw: string | undefined;
  try {
    raw = iina.file.read(path, {});
  } catch {
    return empty;
  }

  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.plugins === "object" &&
      parsed.plugins !== null
    ) {
      return {
        schemaVersion:
          typeof parsed.schemaVersion === "number"
            ? parsed.schemaVersion
            : MANIFEST_SCHEMA_VERSION,
        plugins: parsed.plugins as Record<string, InstalledManifestEntry>,
      };
    }
    return empty;
  } catch {
    return empty;
  }
}

/**
 * Atomically write the manifest: write to a sibling temp file, then move it
 * over the real manifest path with `mv -f`, since `file` has no rename
 * method. This avoids ever leaving a half-written manifest on disk.
 *
 * `utils.exec` is inherently async (it shells out), so this is declared
 * `async` and always awaited by its callers below -- there is no
 * synchronous way to guarantee the move completed otherwise.
 */
async function writeManifest(manifest: InstalledManifest): Promise<void> {
  const realPath = iina.utils.resolvePath(MANIFEST_PATH);
  const tmpPath = `${realPath}.${generateId()}.tmp`;

  iina.file.write(tmpPath, JSON.stringify(manifest, null, 2));

  const result = await iina.utils.exec("/bin/mv", ["-f", tmpPath, realPath]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to atomically write manifest (mv exited with status ${result.status}): ${result.stderr}`,
    );
  }
}

// ---------------------------------------------------------------------------
// installPlugin
// ---------------------------------------------------------------------------

export async function installPlugin(
  entry: RegistryEntry,
  onProgress: (stage: InstallProgressStage, message?: string) => void,
): Promise<void> {
  const id = generateId();
  const zipPath = iina.utils.resolvePath(`${TMP_ROOT}${id}.zip`);
  const quarantineDir = iina.utils.resolvePath(`${TMP_ROOT}${id}/`);

  try {
    // (1) validate entry.repo shape.
    if (!REPO_PATTERN.test(entry.repo)) {
      throw new Error(
        `Refusing to install "${entry.name}": repo "${entry.repo}" does not match the expected owner/repo pattern.`,
      );
    }

    // (2) resolve a download URL.
    onProgress("resolving");
    const url = await resolveDownloadUrl(entry);

    // (3) download to an isolated tmp path.
    onProgress("downloading");
    await ensureDir(iina.utils.resolvePath(TMP_ROOT));
    try {
      await iina.http.download(url, zipPath);
    } catch (err) {
      throw new Error(
        `Failed to download plugin archive from ${url}: ${errorMessage(err)}`,
      );
    }
    if (!iina.file.exists(zipPath)) {
      throw new Error(
        `Download reported success but no file was found at ${zipPath}.`,
      );
    }

    // (4) validate the downloaded file is a plausible, safely-sized zip.
    onProgress("validating");
    validateZipFile(zipPath);

    // (5) extract into an isolated quarantine directory. unzip -d normally
    // creates its own target directory, but create it explicitly anyway
    // rather than relying on that -- consistent with the ensureDir call
    // above, and cheap/idempotent either way.
    onProgress("extracting");
    await ensureDir(quarantineDir);
    const unzipResult = await iina.utils.exec("/usr/bin/unzip", [
      "-o",
      zipPath,
      "-d",
      quarantineDir,
    ]);
    if (unzipResult.status !== 0) {
      throw new Error(
        `Failed to extract plugin archive (unzip exited with status ${unzipResult.status}): ${unzipResult.stderr}`,
      );
    }

    const extracted = listDirAbsolute(quarantineDir, { includeSubDir: true });

    // (6) locate exactly one directory containing a top-level Info.json.
    const candidateDir = findSingleCandidateDir(extracted, quarantineDir);

    // (7) read + validate Info.json.
    const infoPath = joinPath(candidateDir, "Info.json");
    const infoRaw = iina.file.read(infoPath, {});
    if (!infoRaw) {
      throw new Error(`Could not read Info.json at ${infoPath}.`);
    }

    let info: Record<string, unknown>;
    try {
      info = JSON.parse(infoRaw);
    } catch (err) {
      throw new Error(`Info.json at ${infoPath} is not valid JSON: ${errorMessage(err)}`);
    }

    const parsedIdentifier = requireInfoFields(info, infoPath);

    // (8) authoritative identifier check against the registry entry.
    if (entry.identifier != null && entry.identifier !== parsedIdentifier) {
      throw new Error(
        `Identifier mismatch: registry entry expects "${entry.identifier}" but the downloaded plugin declares "${parsedIdentifier}".`,
      );
    }

    // (9) compute destination path.
    const pluginsDir = iina.utils.resolvePath(PLUGINS_DIR);
    const folderName = `${parsedIdentifier}.iinaplugin`;
    const destPath = joinPath(pluginsDir, folderName);

    // (10) collision check against manifest.
    const manifest = readManifest();
    const existingEntry = manifest.plugins[entry.id];
    if (
      iina.file.exists(destPath) &&
      !(existingEntry && existingEntry.folderName === folderName)
    ) {
      throw new Error(
        `A plugin already exists at "${destPath}" and is not tracked by Iina Store as this entry. Refusing to overwrite it.`,
      );
    }

    // (11) move the validated candidate folder into place.
    onProgress("moving");
    const mvResult = await iina.utils.exec("/bin/mv", ["-f", candidateDir, destPath]);
    if (mvResult.status !== 0) {
      throw new Error(
        `Failed to move plugin into place (mv exited with status ${mvResult.status}): ${mvResult.stderr}`,
      );
    }

    // (12) update manifest in memory and persist it.
    const ghVersion = readGhVersion(info);
    const newEntry: InstalledManifestEntry = {
      installedVersion: String(info.version),
      installedAt: new Date(Date.now()).toISOString(),
      installedIdentifier: parsedIdentifier,
      folderName,
      sourceRepo: entry.repo,
      sourceType: entry.install.type,
      installedFromUrl: url,
      managedByStore: true,
      ...(ghVersion !== undefined ? { ghVersionAtInstall: ghVersion } : {}),
    };

    manifest.plugins[entry.id] = newEntry;
    await writeManifest(manifest);

    // (13) best-effort cleanup.
    safeDelete(quarantineDir);
    safeDelete(zipPath);

    // (14) done.
    onProgress("done");
    iina.core.osd(
      `Installed ${entry.name}. Restart IINA to finish loading it.`,
    );
  } catch (err) {
    const message = errorMessage(err);
    onProgress("error", message);
    throw err instanceof Error ? err : new Error(message);
  }
}

// ---------------------------------------------------------------------------
// uninstallPlugin
// ---------------------------------------------------------------------------

export async function uninstallPlugin(
  entryId: string,
  onProgress: (stage: InstallProgressStage, message?: string) => void,
): Promise<void> {
  try {
    // (1) look up the manifest entry.
    const manifest = readManifest();
    const record = manifest.plugins[entryId];
    if (!record || record.managedByStore !== true) {
      throw new Error(
        `Plugin "${entryId}" was not installed by Iina Store and cannot be uninstalled through it.`,
      );
    }

    // (2) build the on-disk path from the manifest's folderName, never
    // re-derived, and confirm the folder still contains what we expect.
    const pluginsDir = iina.utils.resolvePath(PLUGINS_DIR);
    const pluginPath = joinPath(pluginsDir, record.folderName);

    const infoPath = joinPath(pluginPath, "Info.json");
    const infoRaw = iina.file.read(infoPath, {});
    if (!infoRaw) {
      throw new Error(
        `Could not read Info.json at ${infoPath}; the plugin folder may have been moved or removed outside Iina Store.`,
      );
    }

    let info: Record<string, unknown>;
    try {
      info = JSON.parse(infoRaw);
    } catch (err) {
      throw new Error(
        `Info.json at ${infoPath} is not valid JSON: ${errorMessage(err)}`,
      );
    }

    if (info.identifier !== record.installedIdentifier) {
      throw new Error(
        `Identifier mismatch at ${infoPath}: expected "${record.installedIdentifier}" but found "${String(
          info.identifier,
        )}". Refusing to uninstall a folder that was modified outside Iina Store.`,
      );
    }

    // (3) confirm with the user.
    onProgress("confirming");
    const name = typeof info.name === "string" ? info.name : entryId;
    const confirmed = iina.utils.ask(
      `Uninstall ${name}? It will be moved to the Trash.`,
    );
    if (!confirmed) {
      return;
    }

    // (4) trash the folder.
    onProgress("removing");
    iina.file.trash(pluginPath);

    // (5) update + persist the manifest.
    delete manifest.plugins[entryId];
    await writeManifest(manifest);

    // (6) done.
    onProgress("done");
    iina.core.osd(
      `Uninstalled ${name}. Restart IINA to finish removing it.`,
    );
  } catch (err) {
    const message = errorMessage(err);
    onProgress("error", message);
    throw err instanceof Error ? err : new Error(message);
  }
}

// ---------------------------------------------------------------------------
// getInstallStatus
// ---------------------------------------------------------------------------

export async function getInstallStatus(
  entry: RegistryEntry,
): Promise<InstallStatus> {
  const manifest = readManifest();
  const record = manifest.plugins[entry.id];

  if (!record) {
    return "not-installed";
  }

  // Best-effort freshness check: only meaningful when both sides have a
  // comparable ghVersion integer. True live version checking against GitHub
  // is out of scope for v1 -- this is intentionally simple.
  const knownGhVersion = entry.update?.ghVersionKnown;
  const installedGhVersion = record.ghVersionAtInstall;

  if (
    typeof knownGhVersion === "number" &&
    typeof installedGhVersion === "number" &&
    knownGhVersion > installedGhVersion
  ) {
    return "update-available";
  }

  return "installed";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveDownloadUrl(entry: RegistryEntry): Promise<string> {
  if (entry.install.type === "release-asset") {
    const apiUrl = `https://api.github.com/repos/${entry.repo}/releases/latest`;
    let response;
    try {
      response = await iina.http.get(apiUrl);
    } catch (err) {
      throw new Error(
        `Failed to fetch latest release for ${entry.repo}: ${errorMessage(err)}`,
      );
    }

    const data = response?.data;
    const assets: unknown[] = Array.isArray(data?.assets) ? data.assets : [];
    const pattern = entry.install.assetNamePattern;

    const asset = assets.find((a: any) => matchesAssetPattern(a?.name, pattern));
    const downloadUrl = (asset as any)?.browser_download_url;

    if (!asset || typeof downloadUrl !== "string" || downloadUrl.length === 0) {
      throw new Error(
        `No release asset matching pattern "${pattern ?? "(none)"}" found in the latest release of ${entry.repo}.`,
      );
    }

    return downloadUrl;
  }

  // codeload-fallback
  const branch = entry.install.defaultBranch || "main";
  return `https://codeload.github.com/${entry.repo}/zip/refs/heads/${branch}`;
}

/** Simple glob/suffix matcher for GitHub release asset names. */
function matchesAssetPattern(name: unknown, pattern: string | undefined): boolean {
  if (typeof name !== "string") return false;
  if (!pattern) return false;

  if (!pattern.includes("*")) {
    // Treat as a plain suffix match (e.g. ".iinaplgz").
    return name.endsWith(pattern);
  }

  // Simple glob: escape regex specials, then turn `*` into `.*`.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  return re.test(name);
}

function validateZipFile(path: string): void {
  let handle: IINA.API.FileHandle | undefined;
  try {
    handle = iina.file.handle(path, "read");
    if (!handle) {
      throw new Error(`Could not open downloaded file at ${path} for validation.`);
    }

    const header = handle.read(4);
    if (!header || header.length < 4) {
      throw new Error(`Downloaded file at ${path} is too small to be a valid zip archive.`);
    }
    for (let i = 0; i < ZIP_MAGIC.length; i++) {
      if (header[i] !== ZIP_MAGIC[i]) {
        throw new Error(
          `Downloaded file at ${path} does not have a valid zip signature.`,
        );
      }
    }

    handle.seekToEnd();
    const size = handle.offset();
    if (size <= 0) {
      throw new Error(`Downloaded file at ${path} is empty.`);
    }
    if (size > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `Downloaded file at ${path} is ${size} bytes, exceeding the ${MAX_DOWNLOAD_BYTES}-byte safety cap.`,
      );
    }
  } finally {
    try {
      handle?.close();
    } catch {
      // ignore close failures; we've already thrown on any real problem
    }
  }
}

interface ListedFile {
  filename: string;
  path: string;
  isDir: boolean;
}

/**
 * Typed wrapper around `iina.file.list`. The shipped `iina-plugin-definition`
 * `.d.ts` types this call as returning a single `{filename,path,isDir}`
 * object; a previous pass assumed (but never confirmed against a live IINA
 * instance) that the real runtime returns an array instead. That same kind
 * of unverified assumption already broke registry loading once (see
 * registry.ts's git history), so rather than guess again, this normalizes
 * whichever shape actually comes back -- an array is used as-is, a single
 * object is wrapped in a one-element array, and anything else (null,
 * undefined, an unrecognizable shape) becomes an empty array rather than
 * throwing, so a shape mismatch here degrades to "no candidate found"
 * instead of crashing the whole install.
 */
function listDir(path: string, options: { includeSubDir?: boolean }): ListedFile[] {
  const result: unknown = iina.file.list(path, options);
  if (Array.isArray(result)) {
    return result as ListedFile[];
  }
  if (result && typeof result === "object" && "path" in (result as Record<string, unknown>)) {
    return [result as ListedFile];
  }
  return [];
}

/** Normalize away trailing slashes for prefix comparisons. */
function normalizeDir(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function joinPath(dir: string, name: string): string {
  return normalizeDir(dir) + "/" + name;
}

/**
 * List a directory tree, validate it for path-traversal, and return entries
 * with `.path` rewritten to absolute paths.
 *
 * Confirmed live: `iina.file.list(baseDir, ...)` returns each entry's
 * `.path` RELATIVE to `baseDir` (e.g. "xegq5kge/ui"), not an absolute path.
 * An earlier version of this code assumed absolute paths and checked
 * whether each one started with the absolute quarantine-dir prefix -- a
 * check a relative path can never pass, so it flagged every single
 * extraction as a false-positive traversal attempt. The real traversal
 * check has to happen on the RAW relative path instead: reject anything
 * that is itself absolute, or that contains a ".." segment, before joining
 * it onto `baseDir`. Once validated, `.path` is rewritten to absolute here
 * so every other function in this file (which expects absolute paths) is
 * unaffected by this distinction.
 */
function listDirAbsolute(baseDir: string, options: { includeSubDir?: boolean }): ListedFile[] {
  const base = normalizeDir(baseDir);
  return listDir(baseDir, options).map((entry) => {
    const relative = entry.path;
    if (relative.startsWith("/") || relative.split("/").includes("..")) {
      safeDelete(baseDir);
      throw new Error(
        `Extraction produced an unsafe path ("${relative}"); aborting as a possible path traversal attempt.`,
      );
    }
    return { ...entry, path: joinPath(base, relative) };
  });
}

function findSingleCandidateDir(entries: ListedFile[], quarantineDir: string): string {
  const prefix = normalizeDir(quarantineDir);
  const dirs = entries.filter((e) => e.isDir);

  const candidates = dirs.filter((d) => {
    const infoPath = joinPath(d.path, "Info.json");
    const hasInfo = entries.some((e) => normalizeDir(e.path) === normalizeDir(infoPath) && !e.isDir);
    if (hasInfo) return true;
    // Fall back to a direct filesystem check in case `list` didn't include
    // the Info.json entry for some reason (e.g. hidden-file quirks).
    return iina.file.exists(infoPath);
  });

  // Also consider the quarantine root itself as a candidate (archives that
  // extract flat, with Info.json directly at the top level).
  const rootInfoPath = joinPath(prefix, "Info.json");
  const rootIsCandidate = iina.file.exists(rootInfoPath);

  const allCandidates = rootIsCandidate ? [prefix, ...candidates.map((c) => c.path)] : candidates.map((c) => c.path);

  // De-duplicate.
  const unique = Array.from(new Set(allCandidates.map(normalizeDir)));

  if (unique.length === 0) {
    safeDelete(quarantineDir);
    throw new Error(
      `No directory containing a top-level Info.json was found in the extracted archive.`,
    );
  }
  if (unique.length > 1) {
    safeDelete(quarantineDir);
    throw new Error(
      `Ambiguous archive contents: found ${unique.length} directories with a top-level Info.json (expected exactly 1).`,
    );
  }

  return unique[0];
}

function requireInfoFields(info: Record<string, unknown>, infoPath: string): string {
  const required = ["name", "version", "identifier", "entry"];
  for (const field of required) {
    if (info[field] === undefined || info[field] === null || info[field] === "") {
      throw new Error(`Info.json at ${infoPath} is missing required field "${field}".`);
    }
  }

  const identifier = info.identifier;
  if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      `Info.json at ${infoPath} has an invalid identifier "${String(identifier)}"; expected letters, digits, dot, and hyphen only.`,
    );
  }

  return identifier;
}

function readGhVersion(info: Record<string, unknown>): number | undefined {
  const value = (info as any).ghVersion;
  return typeof value === "number" ? value : undefined;
}
