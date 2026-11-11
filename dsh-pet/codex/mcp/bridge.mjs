import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const route = '/dsh-pet-7340';
const home = process.env.DSH_HOME || join(homedir(), '.dsh');
const runtimeFile = join(home, 'dsh-pet', 'standalone-runtime.json');
const pluginRoot = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || resolve(import.meta.dirname, '../..');
const packageRoot =
  process.env.DSH_PET_PACKAGE_ROOT ||
  (existsSync(join(pluginRoot, 'lib', 'standalone.js')) ? pluginRoot : resolve(pluginRoot, '..'));
const standaloneEntry = join(packageRoot, 'lib', 'standalone.js');
let startPromise;

function runtime() {
  try {
    const data = JSON.parse(readFileSync(runtimeFile, 'utf8'));
    if (!Number.isInteger(data.port) || typeof data.token !== 'string' || !/^\d+$/.test(String(data.pid))) return null;
    return data;
  } catch {
    return null;
  }
}

async function health(data) {
  try {
    const response = await fetch(`http://127.0.0.1:${data.port}/health`, { signal: AbortSignal.timeout(700) });
    if (!response.ok) return false;
    const status = await response.json();
    return status?.name === 'dsh-pet-standalone';
  } catch {
    return false;
  }
}

export async function getRunningPet() {
  const data = runtime();
  return data && (await health(data)) ? data : null;
}

export async function ensurePet() {
  const existing = runtime();
  if (existing && (await health(existing))) return existing;
  if (startPromise) return startPromise;
  startPromise = (async () => {
    if (!existsSync(standaloneEntry)) {
      throw new Error(`独立模式尚未构建：${standaloneEntry} 不存在。请在 dsh-pet 包目录运行 npm run build。`);
    }
    if (process.platform === 'darwin') {
      throw new Error('macOS 上请先用配置好的「dsh-pet 切换」快捷指令启动桌宠；Codex 沙箱不能启动 Electron。');
    } else {
      const child = spawn(process.execPath, [standaloneEntry], {
        cwd: packageRoot,
        env: { ...process.env, DSH_HOME: home },
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const data = runtime();
      if (data && (await health(data))) return data;
    }
    throw new Error('dsh-pet 启动超时。请检查 Electron 是否已安装，以及 ~/.dsh/dsh-pet/ 下的日志。');
  })().finally(() => {
    startPromise = undefined;
  });
  return startPromise;
}

export async function petRequest(method, path, body) {
  const data = await ensurePet();
  const response = await fetch(`http://127.0.0.1:${data.port}${route}${path}`, {
    method,
    headers: {
      'x-dsh-pet-token': data.token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`dsh-pet 请求失败 (${response.status}): ${text.slice(0, 300)}`);
  if (response.status === 204 || !text) return { ok: true };
  const result = JSON.parse(text);
  if (result?.ok === false) throw new Error(result.message || result.reason || 'dsh-pet 请求失败');
  return result;
}

export function petQuery(path, values = {}) {
  const query = new URLSearchParams(values);
  return `${path}${query.size ? `?${query}` : ''}`;
}
