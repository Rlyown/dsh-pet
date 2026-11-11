/** Codex's visibility shortcut must be isolated from DSH-hosted helpers. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

interface ShortcutModule {
  PET_VISIBILITY_ACCELERATOR: string;
  registerPetVisibilityShortcut(deps: {
    globalShortcut: {
      register: (accelerator: string, callback: () => void) => boolean;
      unregister: (accelerator: string) => void;
    };
    enabled: boolean;
    accelerator?: string;
    toggleVisibility: () => void;
    log?: (message: string) => void;
  }): () => void;
}

const { PET_VISIBILITY_ACCELERATOR, registerPetVisibilityShortcut } = createRequire(import.meta.url)(
  '../../runtime/electron-helper/main/visibility-shortcut.js',
) as ShortcutModule;

describe('registerPetVisibilityShortcut', () => {
  test('registers the Codex shortcut and unregisters it on shutdown', () => {
    const calls: string[] = [];
    const callback = () => calls.push('toggle');
    const globalShortcut = {
      register: (accelerator: string, action: () => void) => {
        assert.equal(accelerator, 'Control+Alt+P');
        action();
        return true;
      },
      unregister: (accelerator: string) => calls.push(`unregister:${accelerator}`),
    };
    const dispose = registerPetVisibilityShortcut({ globalShortcut, enabled: true, toggleVisibility: callback });
    assert.deepEqual(calls, ['toggle']);
    dispose();
    assert.equal(calls[1], `unregister:${PET_VISIBILITY_ACCELERATOR}`);
  });

  test('does not register in a DSH-hosted helper', () => {
    let registered = false;
    const dispose = registerPetVisibilityShortcut({
      globalShortcut: {
        register: () => {
          registered = true;
          return true;
        },
        unregister: () => {},
      },
      enabled: false,
      toggleVisibility: () => {},
    });
    dispose();
    assert.equal(registered, false);
  });

  test('uses the Codex-configured accelerator and supports disabling it', () => {
    const registered: string[] = [];
    const globalShortcut = {
      register: (accelerator: string) => {
        registered.push(accelerator);
        return true;
      },
      unregister: () => {},
    };
    const dispose = registerPetVisibilityShortcut({
      globalShortcut,
      enabled: true,
      accelerator: 'Control+Shift+P',
      toggleVisibility: () => {},
    });
    dispose();
    const disabled = registerPetVisibilityShortcut({
      globalShortcut,
      enabled: true,
      accelerator: '',
      toggleVisibility: () => {},
    });
    disabled();
    assert.deepEqual(registered, ['Control+Shift+P']);
  });

  test('a key conflict is reported and leaves the tray action available', () => {
    const messages: string[] = [];
    let unregistered = false;
    const dispose = registerPetVisibilityShortcut({
      globalShortcut: { register: () => false, unregister: () => (unregistered = true) },
      enabled: true,
      toggleVisibility: () => {},
      log: (message) => messages.push(message),
    });
    dispose();
    assert.equal(unregistered, false);
    assert.match(messages[0] ?? '', /already in use/);
  });
});
