import { createCodexWatcher } from '../events/watcher.mjs';

const route = '/dsh-pet-7340';

export async function startCodexBridge({ port, token, logger }) {
  let lastStatus = '';
  let lastUsage = '';
  let stopped = false;
  let pending = Promise.resolve();
  const send = (method, path, body) =>
    fetch(`http://127.0.0.1:${port}${route}${path}`, {
      method,
      headers: { 'x-dsh-pet-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000),
    });
  const watcher = createCodexWatcher({
    onChange(snapshot) {
      if (stopped) return;
      pending = pending
        .then(async () => {
          const status = JSON.stringify({ state: snapshot.state, task: snapshot.task });
          if (status !== lastStatus) {
            lastStatus = status;
            if (snapshot.state === 'idle') await send('DELETE', '/work-status');
            else await send('POST', '/work-status', { state: snapshot.state, task: snapshot.task.slice(0, 40) });
          }
          const usage = JSON.stringify(snapshot.usage ?? null);
          if (snapshot.usage && usage !== lastUsage) {
            lastUsage = usage;
            await send('POST', '/codex-usage', snapshot.usage);
          }
        })
        .catch(() => logger.warn('Codex 会话状态同步失败，稍后重试'));
    },
  });
  await watcher.start();
  return async () => {
    stopped = true;
    await watcher.stop();
    await pending;
  };
}
