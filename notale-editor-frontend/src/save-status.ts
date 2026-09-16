import {editorSession,type SaveIndicator} from './state/editor-session.js';
// The save indicator says one thing at a glance and keeps the detail in its tooltip,
// the way Google Docs and Figma report saving. The version number moves to the tooltip
// because it is reference information, not a status.
type Report = SaveIndicator;
// The sync journal composes its own sentences; map the ones it can produce and fall back
// to showing whatever it said, so a reworded message degrades instead of disappearing.
const JOURNAL: Record<string, Report> = {
  '正在保存…': { label: '保存中', detail: '正在同步到服务器', state: 'busy' },
  '编辑中 · 草稿已存本机': { label: '编辑中', detail: '草稿已存本机，稍后自动同步', state: 'local' },
  '已同步 · 有待恢复草稿': { label: '已保存', detail: '有待恢复的草稿，见「恢复修改…」', state: 'local' },
  '已保存到本机 · 等待联网同步': { label: '待同步', detail: '已存本机，联网后自动同步', state: 'local' },
  '同步已暂停 · 草稿保留在本机': { label: '同步暂停', detail: '草稿保留在本机，点「立即同步」重试', state: 'paused' },
  '本机保存失败 · 请导出草稿': { label: '保存失败', detail: '无法写入本机草稿，请导出保留', state: 'failed' },
};
export function saveStatusReport(input: { journal?: string; editing?: boolean; busy?: boolean; version?: number }): Report {
  if (input.editing) return { label: '编辑中', detail: '正在编辑，稍后自动保存', state: 'busy' };
  const journal = input.journal?.trim();
  if (journal) return JOURNAL[journal] ?? { label: journal, detail: journal, state: 'local' };
  if (input.busy) return { label: '保存中', detail: '正在同步到服务器', state: 'busy' };
  return { label: '已保存', detail: input.version ? `已同步到服务器 · 版本 v${input.version}` : '已同步到服务器', state: 'saved' };
}
export function setSaveStatus(report: Report) {
  const current=editorSession.getSnapshot().save;
  if(current.label!==report.label||current.detail!==report.detail||current.state!==report.state)editorSession.update({save:report});
}
export const showSaveStatus = (input: Parameters<typeof saveStatusReport>[0]) => setSaveStatus(saveStatusReport(input));
export const PHASES: Record<string, Report> = {
  connecting: { label: '连接中', detail: '正在连接编辑服务', state: 'busy' },
  loading: { label: '载入中', detail: '正在载入讲义', state: 'busy' },
  restoring: { label: '恢复中', detail: '正在恢复到历史版本', state: 'busy' },
  saving: { label: '保存中', detail: '正在同步到服务器', state: 'busy' },
  importing: { label: '导入中', detail: '正在解析并导入 PPTX', state: 'busy' },
  waitingImport: { label: '待导入', detail: '选择一个工程包或 PPTX 后开始', state: 'local' },
};
