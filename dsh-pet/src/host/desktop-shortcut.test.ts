import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_DESKTOP_SHORTCUT,
  isValidDesktopShortcut,
  readDesktopShortcut,
  writeDesktopShortcut,
} from './desktop-shortcut.ts';
import { handleDesktopRoutes } from './routes/desktop.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Codex desktop shortcut settings', () => {
  test('validates Electron accelerator syntax', () => {
    assert.equal(isValidDesktopShortcut('Control+Alt+P'), true);
    assert.equal(isValidDesktopShortcut('Command+Shift+F12'), true);
    assert.equal(isValidDesktopShortcut('Control+Control+P'), false);
    assert.equal(isValidDesktopShortcut('Control+'), false);
    assert.equal(isValidDesktopShortcut('P'), false);
    assert.equal(isValidDesktopShortcut('Control+not-a-key'), false);
  });

  test('reads the default, persists a custom key, and can disable it', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-shortcut-'));
    dirs.push(root);
    const userRoot = join(root, 'dsh-pet');
    mkdirSync(userRoot);
    assert.equal(readDesktopShortcut(userRoot), DEFAULT_DESKTOP_SHORTCUT);
    writeDesktopShortcut(userRoot, 'Control+Shift+P');
    assert.equal(readDesktopShortcut(userRoot), 'Control+Shift+P');
    writeDesktopShortcut(userRoot, null);
    assert.equal(readDesktopShortcut(userRoot), null);
  });

  test('GET and PUT /shortcut expose configuration and request a helper reload', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-shortcut-route-'));
    dirs.push(root);
    let reloads = 0;
    const deps = {
      userRoot: root,
      requestRestart: async () => {
        reloads += 1;
      },
    } as never;
    const result = await handleDesktopRoutes(deps, {
      url: new URL('http://localhost/shortcut'),
      rest: 'shortcut',
      method: 'GET',
    });
    assert.deepEqual(result && result.kind === 'json' ? result.obj : null, { accelerator: DEFAULT_DESKTOP_SHORTCUT });

    const saved = await handleDesktopRoutes(deps, {
      url: new URL('http://localhost/shortcut'),
      rest: 'shortcut',
      method: 'PUT',
      body: JSON.stringify({ accelerator: 'Command+Shift+P' }),
    });
    assert.deepEqual(saved && saved.kind === 'json' ? saved.obj : null, {
      accelerator: 'Command+Shift+P',
      reloading: true,
    });
    assert.equal(readDesktopShortcut(root), 'Command+Shift+P');
    assert.equal(reloads, 1);
  });
});
