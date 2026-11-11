#!/usr/bin/env node
import { petQuery, petRequest } from './bridge.mjs';

const serverInfo = { name: 'dsh-pet-codex', version: '0.1.5' };
const tools = [
  {
    name: 'pet_status',
    description: 'Read dsh-pet state and configured pets.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pet_say',
    description: 'Show exact text in a pet bubble and optionally speak it aloud.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, pet: { type: 'string' }, speak: { type: 'boolean' } },
      required: ['text'],
    },
  },
  {
    name: 'pet_whisper',
    description: 'Ask the pet to generate a short in-character line using its configured model.',
    inputSchema: { type: 'object', properties: { pet: { type: 'string' } } },
  },
  {
    name: 'pet_play',
    description: 'Play one configured animation by name.',
    inputSchema: {
      type: 'object',
      properties: { animation: { type: 'string' }, pet: { type: 'string' } },
      required: ['animation'],
    },
  },
  {
    name: 'pet_sleep',
    description: 'Put a pet to sleep or wake it.',
    inputSchema: {
      type: 'object',
      properties: { pet: { type: 'string' }, sleep: { type: 'boolean' } },
      required: ['sleep'],
    },
  },
  {
    name: 'pet_chat',
    description: 'Send a message to the pet and get its configured-model reply.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' }, pet: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: 'pet_balance',
    description: 'Refresh the configured provider balance and let the pet react.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pet_todo',
    description: 'List, add, complete, edit, or delete a dsh-pet todo item.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'complete', 'edit', 'delete'] },
        text: { type: 'string' },
        dueAt: { type: 'number' },
        todoId: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'pet_shortcut',
    description:
      'Read or configure dsh-pet’s in-app Electron shortcut for toggling desktop windows while the pet is running. Use Electron accelerator syntax, e.g. Control+Alt+P. On macOS, the separate Shortcuts hotkey starts/stops the process; keep this optional in-app shortcut disabled or use a different key to avoid conflicts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'disable'] },
        accelerator: { type: 'string', description: 'Electron accelerator, e.g. Control+Alt+P' },
      },
      required: ['action'],
    },
  },
];

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
}

async function withPetLock(pet, fn) {
  // The host lock API expects milliseconds (minimum 1000); 25 was interpreted as 25 ms
  // and rejected every pet action from the Codex bridge.
  const acquired = await petRequest('POST', petQuery('/lock', { pet, surface: 'desktop' }), { ttl: 30_000 });
  const lockId = acquired.lockId ?? acquired.data?.lockId;
  if (!lockId) throw new Error('桌宠控制锁获取失败');
  try {
    return await fn(lockId);
  } finally {
    await petRequest('POST', petQuery('/lock/release', { pet, surface: 'desktop' }), { lockId }).catch(() => {});
  }
}

async function callTool(name, args) {
  const pet = typeof args.pet === 'string' && args.pet ? args.pet : 'main';
  switch (name) {
    case 'pet_status':
      return petRequest('GET', '/state');
    case 'pet_say':
      return withPetLock(pet, (lock) =>
        petRequest('POST', petQuery('/broadcast', { pet, lock, surface: 'desktop' }), {
          text: args.text,
          speak: args.speak === true,
        }),
      );
    case 'pet_whisper':
      return petRequest('POST', petQuery('/whisper', { pet, surface: 'desktop' }));
    case 'pet_play':
      return withPetLock(pet, (lock) =>
        petRequest('POST', petQuery('/anim', { pet, lock, surface: 'desktop' }), { name: args.animation }),
      );
    case 'pet_sleep':
      return petRequest('POST', petQuery(args.sleep ? '/sleep' : '/wake', { pet }));
    case 'pet_chat':
      if (typeof args.message !== 'string' || !args.message.trim()) throw new Error('message 不能为空');
      return petRequest('POST', petQuery('/chat', { pet, surface: 'desktop' }), {
        text: args.message.trim(),
        surface: 'desktop',
      });
    case 'pet_balance':
      return petRequest('POST', '/balance');
    case 'pet_todo':
      if (args.action === 'list') return petRequest('GET', '/todos');
      if (args.action === 'add') {
        if (typeof args.text !== 'string' || !args.text.trim()) throw new Error('add 操作需要 text');
        return petRequest('POST', '/todos', {
          text: args.text.trim(),
          ...(Number.isFinite(args.dueAt) ? { dueAt: args.dueAt } : {}),
        });
      }
      if (!args.todoId || typeof args.todoId !== 'string') throw new Error(`${args.action} 操作需要 todoId`);
      if (args.action === 'complete')
        return petRequest('PATCH', `/todos/${encodeURIComponent(args.todoId)}`, { done: true });
      if (args.action === 'edit') {
        const patch = {};
        if (typeof args.text === 'string') patch.text = args.text.trim();
        if (Number.isFinite(args.dueAt)) patch.dueAt = args.dueAt;
        if (!Object.keys(patch).length) throw new Error('edit 操作至少需要 text 或 dueAt');
        return petRequest('PATCH', `/todos/${encodeURIComponent(args.todoId)}`, patch);
      }
      if (args.action === 'delete') return petRequest('DELETE', `/todos/${encodeURIComponent(args.todoId)}`);
      throw new Error('未知 todo action');
    case 'pet_shortcut':
      if (args.action === 'get') return petRequest('GET', '/shortcut');
      if (args.action === 'disable') return petRequest('PUT', '/shortcut', { accelerator: null });
      if (args.action === 'set') {
        if (typeof args.accelerator !== 'string' || !args.accelerator.trim())
          throw new Error('set 操作需要 accelerator，例如 Control+Alt+P');
        return petRequest('PUT', '/shortcut', { accelerator: args.accelerator.trim() });
      }
      throw new Error('未知 shortcut action');
    default:
      throw new Error(`未知工具：${name}`);
  }
}

async function handle(message) {
  if (message.method === 'initialize')
    return {
      protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
      capabilities: { tools: {} },
      serverInfo,
    };
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
  if (message.method === 'ping') return {};
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    try {
      return textResult(await callTool(message.params?.name, message.params?.arguments ?? {}));
    } catch (error) {
      return { ...textResult(error instanceof Error ? error.message : String(error)), isError: true };
    }
  }
  throw new Error(`不支持的 MCP 方法：${message.method}`);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (!line) continue;
    void (async () => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === undefined) return;
      try {
        const result = await handle(message);
        if (result !== null) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`);
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: error instanceof Error ? error.message : String(error) } })}\n`,
        );
      }
    })();
  }
});
