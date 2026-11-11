import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { packageRoot } from '../../host/helper-process.ts';
import { parseRequest } from './request.ts';
import type { AiRuntime } from './types.ts';

const MODEL = 'codex-default';

type CodexCli = {
  codexBinary(): string | null;
  codexChat(input: {
    system: string;
    messages: Array<{ role: string; content: string }>;
    signal: AbortSignal;
  }): Promise<string>;
};

async function cli(): Promise<CodexCli> {
  let root = packageRoot;
  if (!existsSync(join(root, 'codex', 'bridge', 'cli.mjs'))) root = dirname(root);
  return import(pathToFileURL(join(root, 'codex', 'bridge', 'cli.mjs')).href) as Promise<CodexCli>;
}

export { MODEL as CODEX_MODEL };

export async function codexAvailable(): Promise<boolean> {
  return Boolean((await cli()).codexBinary());
}

export function createCodexStream(
  runtime: AiRuntime,
): (options: unknown) => AsyncIterable<{ type: 'text'; text: string }> {
  return async function* stream(options) {
    if (!runtime.ready()) throw new Error('Codex 生成通道不可用。');
    const { request, signal } = parseRequest(options, MODEL);
    if (runtime.active) throw new Error('桌宠正在处理另一条消息。');
    const controller = new AbortController();
    runtime.active = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const answer = await (await cli()).codexChat({ ...request, signal: controller.signal });
      if (controller.signal.aborted) throw new Error('Codex 请求已取消。');
      yield { type: 'text', text: answer };
    } finally {
      signal?.removeEventListener('abort', abort);
      if (runtime.active === controller) runtime.active = undefined;
    }
  };
}
