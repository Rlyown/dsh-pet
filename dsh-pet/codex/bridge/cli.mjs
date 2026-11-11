import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTimeout } from 'node:timers';

const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const CHAT_DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'code_mode', 'apps', 'plugins', 'hooks',
  'browser_use', 'in_app_browser', 'computer_use', 'image_generation', 'view_image',
  'multi_agent', 'multi_agent_v2', 'memories', 'workspace_dependencies', 'shell_snapshot',
  'skill_search', 'sleep_tool', 'goals',
];
const TOOL_TYPES = new Set(['command_execution', 'mcp_tool_call', 'web_search', 'file_change', 'tool_call', 'collab_tool_call']);

export function codexBinary() {
  if (process.env.CODEX_CLI_PATH && existsSync(process.env.CODEX_CLI_PATH)) return process.env.CODEX_CLI_PATH;
  const found = spawnSync('/usr/bin/which', ['codex'], { encoding: 'utf8', timeout: 2000 });
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  return existsSync(bundled) ? bundled : null;
}

export async function runCodex({ prompt, directory, allowEdits = false, signal, timeoutMs = 600000, threadSource }) {
  const binary = codexBinary();
  if (!binary) throw new Error('未找到 Codex CLI，请先安装并登录。');
  const cwd = resolve(directory);
  if (!statSync(cwd).isDirectory()) throw new Error('任务目录不是文件夹。');
  const args = [
    'exec',
    ...(threadSource === 'pet-chat' ? ['--ephemeral'] : []),
    '--ignore-user-config',
    '--skip-git-repo-check',
    '-C',
    cwd,
    '-s',
    allowEdits ? 'workspace-write' : 'read-only',
  ];
  if (threadSource === 'pet-chat') {
    args.push(
      '--json', '--thread-source', 'pet-chat', '--color', 'never',
      '-c', 'approval_policy="never"', '-c', 'web_search="disabled"',
      '-c', 'project_doc_max_bytes=0',
      ...CHAT_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    );
  }
  args.push('-');
  const child = spawn(binary, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  let stdout = '';
  let stderr = '';
  let answer = '';
  let jsonBuffer = '';
  let attemptedTool = false;
  const limit = 256 * 1024;
  const parseEvent = (line) => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.item && TOOL_TYPES.has(event.item.type)) {
      attemptedTool = true;
      child.kill('SIGTERM');
    }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' &&
        !['commentary', 'analysis'].includes(event.item.phase) &&
        !['commentary', 'analysis'].includes(event.item.channel) &&
        typeof event.item.text === 'string') answer = event.item.text.trim();
  };
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
    if (stdout.length > limit) child.kill();
    if (threadSource !== 'pet-chat') return;
    jsonBuffer += chunk;
    let newline;
    while ((newline = jsonBuffer.indexOf('\n')) >= 0) {
      parseEvent(jsonBuffer.slice(0, newline));
      jsonBuffer = jsonBuffer.slice(newline + 1);
    }
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > limit) child.kill();
  });
  child.stdin.on('error', () => {});
  const abort = () => child.kill('SIGTERM');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    child.stdin.end(prompt);
    const code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    if (signal?.aborted) throw new Error('Codex 请求已取消。');
    if (attemptedTool) throw new Error('普通聊天不能调用工具；请在任务面板选择目录和权限。');
    if (code !== 0) throw new Error(stderr.slice(-800) || `Codex CLI 退出码 ${code}`);
    if (threadSource === 'pet-chat') {
      if (jsonBuffer.trim()) parseEvent(jsonBuffer);
      if (!answer) throw new Error('Codex 没有返回文字。');
      return answer;
    }
    if (!stdout.trim()) throw new Error('Codex 没有返回文字。');
    return stdout.trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function codexChat({ system, messages, signal }) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-pet-codex-chat-'));
  try {
    const transcript = messages.map((m) => `${m.role === 'assistant' ? '宠物' : '用户'}：${m.content}`).join('\n');
    const prompt = [
      '你是桌面宠物。仅进行简短对话，不使用工具，不访问文件，不执行任务。用户需要文件任务时，请让用户在任务面板选择目录。',
      system,
      transcript,
      '请直接给出宠物的回复，不要重复对话记录。',
    ]
      .filter(Boolean)
      .join('\n\n');
    return await runCodex({ prompt, directory, signal, timeoutMs: 120000, threadSource: 'pet-chat' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
