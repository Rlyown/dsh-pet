# dsh-pet for Codex

This integration keeps dsh-pet's standalone Electron app as the full-featured pet runtime. While it runs, it reads local Codex session records for activity and usage windows. The bundled MCP server provides pet controls in Codex. Lifecycle hook registration is not required.

## Prerequisites

- macOS desktop session with Node.js 22.12+ for the Codex session observer and global Shortcut. The standalone pet itself also supports Windows and Linux.
- Build the `dsh-pet` package once: run `pnpm install --frozen-lockfile` and `pnpm run build` in this package directory.
- Codex desktop with local plugin support and a signed-in Codex CLI.

## Install locally

1. Add the `dsh-pet/` package root as a local Codex plugin source. The root `plugin.json` and `mcp.json` must be installed together with `lib/` so the cached plugin can launch the desktop runtime.
2. Restart Codex. On macOS, use the global Shortcut described below to start or stop the standalone pet.
3. The pet's Chat and AI chatter use the signed-in Codex CLI by default. In its settings page, choose **单独配置模型** to use an API endpoint and key instead. The Task tab uses Codex CLI, starts read-only, and requires an explicit choice before allowing edits in the selected folder.

### Start or stop the desktop pet on macOS

Launching Electron from a sandboxed Codex process aborts on macOS. dsh-pet therefore uses the macOS Shortcuts app as the global hotkey entry point:

1. Create a shortcut named **dsh-pet 切换**.
2. Add **Run Shell Script** and set its command to:

   ```sh
   /opt/homebrew/bin/node /absolute/path/to/dsh-pet/codex/macos/toggle.mjs
   ```

   Replace both paths with the installed Node.js binary and this repository's `dsh-pet` directory. The script starts the desktop app when stopped and exits it when running.

3. Open the shortcut's Details and assign `Control+Option+Shift+P` (shown as `⌃⌥⇧P`). macOS invokes it globally; no resident listener or login item is needed.
4. Start/stop with that key. While the pet is running, its tray menu also offers show/hide controls.

If Shortcuts reports that scripting actions are disabled, enable **Allow Running Scripts** in Shortcuts > Settings > Advanced. The toggle script disables dsh-pet's own Electron visibility hotkey so that the macOS shortcut is the only global binding; it stores this preference in `~/.dsh/dsh-pet/desktop-shortcut.json`.

The local session observer updates Codex activity and quota while the pet is running. It does not send macOS task notifications; Codex handles its own notifications.

### Show or hide the desktop pet

- The macOS `Control+Option+Shift+P` shortcut starts/stops the process. The `pet_shortcut` MCP tool configures a separate in-app window visibility shortcut; keep it disabled or choose another key to avoid a collision.
- The in-app shortcut defaults to `Control+Option+P` on macOS (`Control+Alt+P` on Windows/Linux). The tray menu can also temporarily hide or restore all dsh-pet desktop windows.
- Without the shortcut, click the dsh-pet icon in the macOS menu bar (or system tray) and choose **显示桌面宠物** / **隐藏桌面宠物**. The per-pet checkbox above it changes the saved desktop display setting.
- This shortcut belongs to dsh-pet. The native Codex Pets shortcut is controlled by Codex and cannot be rebound by this plugin.

The standalone runtime stores its state and token under `$DSH_HOME/dsh-pet/standalone-runtime.json` (default `$HOME/.dsh/`). Keep that file private; the bridge reads the token locally and sends it only to the loopback server.

### Add a personal local marketplace

From the repository root, add this entry to `.agents/plugins/marketplace.json` (merge it into an existing `plugins` list if the file is already present):

```json
{
  "name": "dsh-pet-local",
  "interface": { "displayName": "dsh-pet local" },
  "plugins": [
    {
      "name": "dsh-pet-codex",
      "source": { "source": "local", "path": "./dsh-pet" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

Then run `codex plugin marketplace add /absolute/path/to/repository-root`, restart Codex desktop, open the Plugins Directory, choose `dsh-pet local`, and install `dsh-pet-codex`.

## What connects

- The pet tails recent files in `~/.codex/sessions` and maps observed task, tool, approval, completion, and error records to its existing work states. It reads `rate_limits` snapshots for Codex usage windows; it does not infer quota from token counts.
- The pet can chat with the signed-in Codex CLI or a separately configured model. The Task tab runs Codex CLI in a selected directory.
- MCP tools expose pet status, speech, generated whisper, animation, sleep/wake, todo CRUD, balance refresh, and pet chat.

### Startup behavior

On macOS, the pet starts and exits through the user-assigned Shortcuts hotkey. The local observer runs inside that process and stops with it. No login item or Codex lifecycle hook is required.

The local bridge sends state only to `127.0.0.1`; it does not upload prompts or tool payloads. Task labels are reduced to a short local status string before being sent. Multiple Codex sessions are aggregated locally so one session ending does not clear another active session.

## Scope

The Codex integration does not include the DSH browser overlay, Cordis service, or DSH-account authentication/balance integration. The standalone Electron window remains the pet's desktop UI; it is not a DSH web overlay. Generic balance providers configured by the user in dsh-pet settings, chat, voice, todos, animations, settings, physical interactions, and multi-pet mode remain available. Codex quota windows come from local CLI session records; they are usage percentages, not an account balance.

The DSH-specific browser overlay and Cordis account services remain excluded. The local Codex observer reads activity and quota fields only; it does not copy prompts or tool output into pet status or system notifications.
