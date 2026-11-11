/** Local Codex CLI task form. */
export function taskScript(): string {
  return `
let taskAbort = null;
function wireTaskPanel() {
  byId('task-cancel').addEventListener('click', () => taskAbort?.abort());
  byId('codex-task-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (taskAbort) return;
    const directory = byId('task-directory').value.trim();
    const prompt = byId('task-prompt').value.trim();
    const allowEdits = byId('task-allow-edits').checked;
    if (!directory || !prompt) return;
    if (allowEdits && !(await confirmDialog({ title: '允许 Codex 修改文件', text: 'Codex 可以修改所选工作目录。确认运行这个任务？', confirmLabel: '运行任务' }))) return;
    taskAbort = new AbortController();
    byId('task-run').disabled = true;
    byId('task-cancel').disabled = false;
    byId('task-result').textContent = '';
    byId('task-status').textContent = 'Codex 正在处理任务…';
    try {
      const response = await fetch('/standalone-ai/codex-task', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-DSH-Pet-Token': TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, prompt, allowEdits }), signal: taskAbort.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || '任务失败');
      byId('task-result').textContent = result.result;
      byId('task-status').textContent = '任务完成';
    } catch (error) {
      byId('task-status').textContent = error.name === 'AbortError' ? '任务已取消' : '任务失败：' + (error.message || String(error));
    } finally {
      taskAbort = null;
      byId('task-run').disabled = false;
      byId('task-cancel').disabled = true;
    }
  });
}
`;
}
