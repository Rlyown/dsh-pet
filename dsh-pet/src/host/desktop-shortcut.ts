/** Codex standalone desktop visibility shortcut settings. */
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writePrivateJson } from '../standalone/ai-storage.ts';

export const DEFAULT_DESKTOP_SHORTCUT = 'Control+Alt+P';
const FILE_NAME = 'desktop-shortcut.json';
const MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super', 'Meta']);
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'VolumeUp',
  'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause',
]);

export function isValidDesktopShortcut(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  const parts = value.split('+');
  if (parts.length < 2 || parts.some((part) => !part)) return false;
  const modifiers = parts.slice(0, -1);
  const key = parts[parts.length - 1]!;
  if (modifiers.some((part) => !MODIFIERS.has(part)) || new Set(modifiers).size !== modifiers.length) return false;
  return /^[A-Za-z0-9]$/.test(key) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) || NAMED_KEYS.has(key);
}

export function desktopShortcutPath(userRoot: string): string {
  return join(userRoot, FILE_NAME);
}

export function readDesktopShortcut(userRoot: string): string | null {
  const path = desktopShortcutPath(userRoot);
  if (!existsSync(path)) return DEFAULT_DESKTOP_SHORTCUT;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) throw new Error('快捷键配置文件不安全');
  const value = JSON.parse(readFileSync(path, 'utf8')) as { accelerator?: unknown };
  if (value.accelerator === null) return null;
  if (!isValidDesktopShortcut(value.accelerator)) throw new Error('快捷键配置无效');
  return value.accelerator;
}

export function writeDesktopShortcut(userRoot: string, accelerator: string | null): void {
  if (accelerator !== null && !isValidDesktopShortcut(accelerator)) throw new Error('快捷键格式无效');
  writePrivateJson(desktopShortcutPath(userRoot), { accelerator });
}
