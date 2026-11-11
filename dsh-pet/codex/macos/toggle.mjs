#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const standaloneEntry = join(packageRoot, 'lib', 'standalone.js');
const home = process.env.DSH_HOME || join(homedir(), '.dsh');
const runtimeFile = join(home, 'dsh-pet', 'standalone-runtime.json');
const route = '/dsh-pet-7340';

function readRuntime() {
  try {
    const data = JSON.parse(readFileSync(runtimeFile, 'utf8'));
    if (!Number.isInteger(data.port) || typeof data.token !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

async function isRunning(data) {
  try {
    const response = await fetch(`http://127.0.0.1:${data.port}/health`, {
      signal: AbortSignal.timeout(700),
    });
    return response.ok && (await response.json())?.name === 'dsh-pet-standalone';
  } catch {
    return false;
  }
}

async function hideOrQuit(data) {
  await fetch(`http://127.0.0.1:${data.port}${route}/shortcut`, {
    method: 'PUT',
    headers: { 'x-dsh-pet-token': data.token, 'content-type': 'application/json' },
    body: JSON.stringify({ accelerator: null }),
    signal: AbortSignal.timeout(2000),
  });
  const response = await fetch(`http://127.0.0.1:${data.port}${route}/quit`, {
    method: 'POST',
    headers: { 'x-dsh-pet-token': data.token },
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`无法关闭桌宠 (${response.status})`);
  const result = await response.json();
  if (result?.ok === false) throw new Error(result.message || '桌宠拒绝退出');
}

async function main() {
  const running = readRuntime();
  if (running && (await isRunning(running))) {
    await hideOrQuit(running);
    return;
  }
  if (!existsSync(standaloneEntry)) {
    throw new Error(`未找到 ${standaloneEntry}；请先在 dsh-pet 包目录运行 pnpm run build。`);
  }

  const settingsDir = join(home, 'dsh-pet');
  mkdirSync(settingsDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(settingsDir, 'desktop-shortcut.json'), JSON.stringify({ accelerator: null }), { mode: 0o600 });
  const env = { ...process.env, DSH_HOME: home };
  delete env.CODEX_SANDBOX;
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [standaloneEntry], {
    cwd: packageRoot,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

main().catch((error) => {
  process.stderr.write(`[dsh-pet-toggle] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
