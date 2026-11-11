'use strict';

/** Codex-only system shortcut; on macOS this is Control+Option+P. */
const PET_VISIBILITY_ACCELERATOR = 'Control+Alt+P';

/** Register the standalone pet visibility shortcut without affecting DSH-hosted pets. */
function registerPetVisibilityShortcut({
  globalShortcut,
  enabled,
  accelerator = PET_VISIBILITY_ACCELERATOR,
  toggleVisibility,
  log = console.error,
}) {
  if (!enabled || !accelerator) return () => {};
  try {
    if (!globalShortcut.register(accelerator, toggleVisibility)) {
      log(`[dsh-pet] shortcut ${accelerator} is already in use; use the menu bar toggle instead`);
      return () => {};
    }
  } catch (error) {
    log(
      `[dsh-pet] shortcut ${accelerator} registration failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return () => {};
  }
  return () => globalShortcut.unregister(accelerator);
}

module.exports = { PET_VISIBILITY_ACCELERATOR, registerPetVisibilityShortcut };
