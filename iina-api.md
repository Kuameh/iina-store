# IINA Plugin API
Source: https://docs.iina.io

Welcome to the IINA Plugin API documentation!

Quick links to the documentation of each API module:

#### Control the player
- `iina.core`: open files, get and set various status, display OSD messages, etc.
- `iina.event`: listen to IINA and mpv events.
- `iina.mpv`: call mpv API, get and set mpv properties, run mpv commands, add hooks.

#### Extend functionalities
- `iina.menu`: add menu items.
- `iina.subtitle`: register custom subtitle downloaders.
- `iina.playlist`: manipulate playlist items, add custom actions to the playlist's context menu.
- `iina.input`: capture keyboard and mouse events.

#### Display custom user interfaces
- `iina.overlay`: display contents on top of the video.
- `iina.standaloneWindow`: create a standalone window to display additional contents.
- `iina.sidebar`: display additional contents in the sidebar.

#### Access the system and the network
- `iina.file`: access the file system.
- `iina.utils`: run shell commands, present dialogs, etc.
- `iina.http`: make HTTP requests.
- `iina.ws`: create WebSocket connections.

#### Control player instances
- `iina.global`: create and control player instances.

#### Logging and preferences
- `iina.console`: log messages.
- `iina.preferences`: get and set plugin's preferences.

---

## iina-plugin-definition
To use this package in a Typescript project, install it from npm:

\`\`\`
yarn add iina-plugin-definition
\`\`\`

or

\`\`\`
npm i iina-plugin-definition
\`\`\`

Then add it to typeRoots in tsconfig.json:

\`\`\`json
{
  "typeRoots": [
    "./node_modules/@types",
    "./node_modules/iina-plugin-definition"
  ]
}
\`\`\`

---

# Getting Started
## Windows, Players, and Entry Points
IINA can have multiple windows opened simultaneously. Each window is associated with a player core (or simply player), which reads the video file and renders it to the window. Internally, players are separated from each other, meaning they have their own mpv instances and plugin instances, and don't share any data.

A plugin starts from an entry point — a JavaScript file executed by IINA. There are two types: main entry and global entry. Each plugin can have at most one of each.

The main entry is executed in a player's context. The code can control the associated player. The main entry file is loaded immediately after a player is initialized, and a plugin instance is created. Therefore, the plugin has multiple instances, one for each player.

The global entry is not associated with any player. The plugin only has one global instance, created for the global entry. Because it is executed when IINA starts, it can display windows and menus when no video is playing. It cannot control any player directly, but the global instance can create managed players and communicate with main entry instances, controlling them indirectly.

Entry files (both main and global) are executed before opening any video file. You can write initialization code directly in the entry files, such as registering subtitle downloaders, adding menu items, and creating custom windows, but for runtime actions you should use event listeners. For example, listen to the "mpv.file-loaded" event.

## Structure of a Plugin
A plugin is a folder with an Info.json file and some other JavaScript files and resources. The folder should be named with the extension .iinaplugin. On macOS, such a folder is displayed as a package.

The simplest plugin contains only the Info.json file and a main entry file:

\`\`\`json
{
  "name": "My Plugin",
  "identifier": "com.example.myplugin",
  "version": "1.0.0",
  "entry": "main.js"
}
\`\`\`

\`\`\`javascript
// main.js
iina.console.log("Hello, world!");
\`\`\`

## Writing the Code for Your Plugin
All IINA APIs are exposed through the iina object. Methods are grouped into modules such as iina.console and iina.menu. It is recommended to destructure the iina object:

\`\`\`javascript
const { console, core, event } = iina;
console.log("Hello, world!");
event.on("mpv.file-loaded", () => {
  core.osd("Starts playing");
});
\`\`\`

### Which version of JavaScript can I use?
IINA uses the JavaScriptCore engine (same as Safari). IINA 1.3.2's minimum macOS version is 10.11, which generally supports ES2015 (ES6) features. You can use Babel to transpile to ES6, recommended when using a bundler like Webpack or Parcel.

---

# Creating Plugins
## The CLI Tool
Starting from 1.4.0, IINA provides a CLI tool iina-plugin to create and pack plugins. Located at IINA.app/Contents/MacOS/iina-plugin, add it to your PATH:

\`\`\`bash
ln -s /Applications/IINA.app/Contents/MacOS/iina-plugin /usr/local/bin/iina-plugin
\`\`\`

### Creating a Plugin
\`\`\`bash
iina-plugin new <name>
\`\`\`

Creates a folder named <name> in the current directory. Can also generate templates for React and Vue interfaces.

### Packing a Plugin
\`\`\`bash
iina-plugin pack <dir>
\`\`\`

Packs the plugin into a .iinaplgz file for distribution (essentially a zip file). Recommended to distribute as a GitHub repository for easy updates.

## Distributing Plugins
Plugins should be .iinaplugin packages located in ~/Library/Application Support/com.colliderli.iina/plugins. Users don't need to place them manually — IINA creates the package on install.

Installation methods:
- Opening a packed .iinaplgz file with IINA
- Installing from a GitHub repository by entering the repository URL in IINA

### Loading a development plugin
Symlink a plugin folder to the plugin directory with a .iinaplugin-dev suffix:

\`\`\`bash
# manually
ln -s /path/to/plugin ~/Library/Application\ Support/com.colliderli.iina/plugins/<name>.iinaplugin-dev

# using the CLI
iina-plugin link <dir>
iina-plugin unlink <dir>
\`\`\`

### Auto-Update Using GitHub
Specify ghRepo (format: username/repo) and ghVersion (integer, increment on each release) in Info.json. IINA will compare ghVersion with the latest code on GitHub and prompt updates.

---

# Development Guide
## Info.json Structure
Required fields:
- name: Plugin name displayed in IINA's preferences
- version: Format major.minor.patch (e.g., 1.0.0)
- identifier: Reverse domain name format (e.g., com.example.myplugin)
- author: Object with name, optional email and url
- entry: Path to the main entry file (relative to plugin folder)

Optional fields:
- description: Short description
- globalEntry: Path to global entry file
- preferencesPage: Path to preferences HTML page
- preferenceDefaults: Default preference values
- helpPage: Path to help page (HTML or external URL)
- subProviders: Array of subtitle providers
- sidebarTab: Object with name for sidebar tab title
- permissions: Array of required permissions
- allowedDomains: Array of accessible domains (use ["*"] for all)
- ghRepo: GitHub repository (username/repo)
- ghVersion: Integer version for GitHub auto-update
- localized: Dictionary of localized strings

## Plugin Permissions
Plugins must declare permissions in Info.json:
- show-osd: Show OSD messages (iina.core.osd())
- show-alert: Show native alert dialogs (iina.utils methods)
- video-overlay: Draw on video overlay (iina.overlay)
- network-request: Access network (iina.http)
- file-system: Access file system (iina.file or iina.utils.exec())

## Type Definitions
Install type definitions:

\`\`\`bash
npm install --save-dev iina-plugin-definition
\`\`\`

Example tsconfig.json:

\`\`\`json
{
  "compilerOptions": {
    "lib": ["es6", "es7", "esnext"],
    "sourceMap": false,
    "target": "es6",
    "module": "es6",
    "typeRoots": [
      "./node_modules/@types",
      "./node_modules/iina-plugin-definition"
    ]
  },
  "compileOnSave": false
}
\`\`\`

Don't include "DOM" in lib — IINA doesn't provide a browser environment.

## Equivalents of Common Browser APIs
No window object is available. IINA provides equivalents:
- setTimeout() and clearTimeout() — available directly
- setInterval() and clearInterval() — available directly
- fetch() — use iina.http module
- prompt() — use iina.utils.ask()
- localStorage — use iina.file module
- console — use iina.console module

## JavaScript Module System
IINA provides a Node-flavored module system. In entry files use require():

\`\`\`javascript
const { foo } = require("./foo.js");
\`\`\`

In other files, export with module.exports:

\`\`\`javascript
module.exports = { foo: "bar" };
\`\`\`

For more features (ES6 modules, third-party libs, React/Vue), use a bundler.

## Using Bundlers
IINA recommends Parcel. Example package.json target:

\`\`\`json
{
  "targets": {
    "entry": {
      "distDir": "./dist/",
      "source": "src/index.ts",
      "isLibrary": false
    }
  }
}
\`\`\`

For custom UIs (React), add another target pointing to src/ui/index.html.

## Debugging
### Reloading
Symlink plugin folder with .iinaplugin-dev suffix. Modify code (or build), restart IINA. Webviews can be reloaded via context menu without restarting.

### Log Viewer
Window > Log Viewer shows logs from all subsystems. Plugin logs appear under global - <plugin name> or player<id> - <plugin name>.

### JS Dev Tool
Plugin > Developer Tool (IINA 1.4.0+) — JavaScript console in any plugin context. Access IINA APIs, global variables, and test code.

### Safari Web Inspector
Enable Develop menu in Safari Preferences > Advanced. After launching IINA, select Develop > (your computer) and choose the JavaScript context. Full breakpoint debugging, variable inspection, and console.

## Localization
Since IINA 1.5.0. Add localized field to Info.json:

\`\`\`json
{
  "localized": {
    "en": {
      "name": "My Plugin",
      "description": "This is my plugin.",
      "sidebarTab": { "name": "My Tab" }
    },
    "fr": {
      "name": "Mon Plugin",
      "description": "Ceci est mon plugin.",
      "sidebarTab": { "name": "Mon Onglet" }
    }
  }
}
\`\`\`

For plugin UI, use iina.utils.preferredLocalizations() and your preferred JS localization library.

---

# Global Entry Point
Each IINA player core is isolated — own window, mpv instance, and plugin instances. The global entry point allows controlling multiple player windows.

## The global entry point
Specify in Info.json:

\`\`\`json
{ "global": "global.js" }
\`\`\`

Loaded when IINA starts, before any player core. Creates a "global plugin instance" isolated from player core instances. Cannot use core or mpv modules, but can use the global module. Has its own menu and can create standalone windows.

## Creating player cores
\`\`\`javascript
const player = global.createPlayerInstance({
  url: "/path/to/video.mp4",
  disableWindowAnimation: true,
  disableUI: true,
  enablePlugins: false,
});
\`\`\`

disableWindowAnimation disables resize animation, disableUI hides titlebar and OSC. Useful for programmatic players (presentations, video walls).

## Communication with the player cores
Message passing similar to webviews:

\`\`\`javascript
// Global entry — send to all players
global.postMessage(null, "message-name", data);

// Send to a managed player
const player = global.createPlayerInstance({ ... });
global.postMessage(player, "message-name", data);

// Receive from players
global.onMessage("message-name", (data, playerID) => {
  global.postMessage(playerID, "reply-message", replyData);
});
\`\`\`

Player side:

\`\`\`javascript
global.postMessage("message-name", data);
global.onMessage("message-name", (data) => {
  // handle
});
\`\`\`

---

# Web Views
IINA provides StandaloneWindow, Sidebar, and Overlay — all based on Webviews. Load HTML via loadHTML() method in each module.

## Simple Mode
For simple UIs, skip HTML files. Call simpleMode(), then setStyle() and setContent():

\`\`\`javascript
const { overlay } = iina;
overlay.simpleMode();
overlay.setStyle('body { color: green; }');
setInterval(() => {
  overlay.setContent('<p>Current time: ' + core.status.position + '</p>');
}, 1000);
\`\`\`

## Communication between a webview and the plugin
Webview and plugin script run in separate processes — no direct access. Communication via postMessage() and onMessage():

\`\`\`javascript
// Plugin script
sidebar.postMessage("update", { time: core.status.position, paused: core.status.paused });

// Webview
iina.onMessage("update", ({ time, paused }) => {
  document.getElementById("time").innerText = time;
});

// Webview to plugin
iina.postMessage("toggle-pause");

// Plugin handles it
sidebar.onMessage("toggle-pause", () => {
  core.togglePause();
});
\`\`\`

Signature: postMessage(name, data?) and onMessage(name, handler). Data must be JSON-serializable.

## Supporting Light and Dark Appearances
Use CSS variables and prefers-color-scheme media query. Webview backgrounds are transparent (follow window background).

## Enabling Interactions for the Overlay Webview
By default, overlay is not interactive. Enable with overlay.setClickable(true). Mark clickable elements with data-clickable attribute. Disable when done with overlay.setClickable(false).

---

# Subtitle Providers
The subtitle module registers external subtitle providers that integrate with IINA's search and download system.

## Registering a subtitle provider
Add subtitleProviders to Info.json:

\`\`\`json
{
  "subtitleProviders": [
    { "id": "open-sub", "name": "OpenSubtitles" }
  ]
}
\`\`\`

Register in the main entry script:

\`\`\`javascript
subtitles.registerProvider("open-sub", {
  search: async (query) => { /* ... */ },
  description: (item) => { /* ... */ },
  download: async (item) => { /* ... */ },
});
\`\`\`

Three methods:
- search(): Gather info from IINA API, search for subtitles, return SubtitleItems
- description(item): Return { name, left, right } labels for display
- download(item): Download subtitle file(s), return array of paths

## Downloading the subtitle files
Download using http module. Use @tmp/ pseudo directory (cleaned up after player quits):

\`\`\`javascript
download: async (item) => {
  const path = await http.download(url, "@tmp/");
  return [path];
}
\`\`\`

## Using custom user interface
Return subtitle.CUSTOM_IMPLEMENTATION from search() to skip built-in UI and use sidebar or standaloneWindow instead.

---

# Plugin Preferences
Provide settings via an integrated preference panel. Specify in Info.json:

\`\`\`json
{ "preferencesPage": "preferences.html" }
\`\`\`

## The Preferences API
\`\`\`javascript
const { preferences } = iina;
preferences.set("key", value);
preferences.get("key");
\`\`\`

Declare defaults in Info.json:

\`\`\`json
{ "preferenceDefaults": { "key": "value" } }
\`\`\`

## Binding in the preference page
Add data-pref-key attribute to input elements for automatic sync:

\`\`\`html
<input type="checkbox" data-type="bool" data-pref-key="foo" />
\`\`\`

Rules:
- Boolean: input type="checkbox" with data-type="bool"
- Numeric: input type="number" with data-type="int" or data-type="float"
- String: input type="text", data-type optional
- Radio buttons: use name attribute instead of data-pref-key

For custom bindings, use window.iina.preferences.get() and set() in JavaScript.
