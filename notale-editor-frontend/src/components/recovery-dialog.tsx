'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/react';
import { editorActions, editorSession } from '../state/editor-session';
import { recoveryActions, recoveryState } from '../state/recovery';
import type { KeyboardRecovery } from '../state/keyboard-queue';
import './recovery-dialog.css';

const actionLabels: Record<string, string> = {
  nudge: '移动对象', delete: '删除对象', duplicate: '复制对象', group: '编组', ungroup: '取消编组',
  undo: '撤销', redo: '重做', paste: '粘贴', copy: '复制', cut: '剪切', front: '置顶',
  back: '置底', forward: '上移一层', backward: '下移一层',
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
function download(raw: string, filename: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The summary and details share one read of shortcut recovery records. */
export function RecoveryDialog() {
  const t = useI18n();
  const state = useSyncExternalStore(recoveryState.subscribe, recoveryState.getSnapshot, recoveryState.getServerSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const readGeneration = useRef(0);
  const ordinaryRunning = useRef(false);
  const keyboardRunning = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [ordinaryLoaded, setOrdinaryLoaded] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [ordinaryBusy, setOrdinaryBusy] = useState(false);
  const [keyboardBusy, setKeyboardBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [keyboard, setKeyboard] = useState<{ rows: KeyboardRecovery[]; loaded: boolean; error: string }>({ rows: [], loaded: false, error: '' });
  const invalidateReads = useCallback(() => { ++readGeneration.current; }, []);

  const close = () => {
    // Preserve the existing recovery transaction's close guard. Reading records
    // and inspecting a shortcut never prevent postponing this dialog.
    if (!ordinaryRunning.current) editorSession.update({ documentDialog: undefined });
  };
  useLayoutEffect(() => {
    const node = dialog.current!;
    mounted.current = true;
    node.showModal();
    return () => { mounted.current = false; invalidateReads(); node.close(); };
  }, [invalidateReads]);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => recoveryActions.refresh()).catch(cause => {
      if (live) setRefreshError(message(cause));
    }).finally(() => { if (live) setOrdinaryLoaded(true); });
    return () => { live = false; };
  }, []);

  const readKeyboard = useCallback(() => {
    const generation = ++readGeneration.current;
    void Promise.resolve().then(() => editorActions.keyboardRecoveries()).then(rows => {
      if (mounted.current && generation === readGeneration.current) {
        setKeyboard({ rows, loaded: true, error: '' });
      }
    }, cause => {
      if (mounted.current && generation === readGeneration.current) {
        setKeyboard(previous => ({ ...previous, loaded: true, error: message(cause) }));
      }
    });
  }, []);
  useEffect(() => { if (ordinaryLoaded) readKeyboard(); }, [state, ordinaryLoaded, readKeyboard]);

  const run = async (action: () => Promise<void>, kind: 'ordinary' | 'keyboard') => {
    const running = kind === 'ordinary' ? ordinaryRunning : keyboardRunning;
    const setBusy = kind === 'ordinary' ? setOrdinaryBusy : setKeyboardBusy;
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setActionError('');
    try { await action(); }
    catch (cause) { if (mounted.current) setActionError(message(cause)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  const markHandled = async (row: KeyboardRecovery) => {
    await editorActions.dismissKeyboardRecovery(row.id);
    if (!mounted.current) return;
    // Invalidate any read that started before the successful dismissal. Even a
    // late response must not resurrect it; a subsequent explicit import may.
    ++readGeneration.current;
    setKeyboard(previous => ({ ...previous, rows: previous.rows.filter(item => item.id !== row.id) }));
    readKeyboard();
  };

  const readError = refreshError || state.error || keyboard.error;
  const loaded = ordinaryLoaded && keyboard.loaded;
  const count = state.rows.length + keyboard.rows.length;
  const summary = readError ? t('部分记录暂时无法读取')
    : !loaded ? t('正在读取记录…')
      : count ? t(count === 1 ? '1 条待检查记录' : '{count} 条待检查记录', { count })
        : t('暂无待处理记录');

  return (
    <dialog ref={dialog} id="recovery-dialog" className="settings-dialog compact-recovery"
      aria-labelledby="recovery-dialog-title" onKeyDown={event => event.stopPropagation()}
      onCancel={event => { event.preventDefault(); close(); }}>
      <header>
        <h2 id="recovery-dialog-title">{t('待检查的修改')}</h2>
        <button type="button" aria-label={t('关闭')} disabled={ordinaryBusy} onClick={close}>×</button>
      </header>
      <div className="recovery-summary">
        <p className="recovery-count" role="status">{summary}</p>
        <p>{t(loaded && !readError && count === 0 ? '当前没有需要确认的编辑记录。' : '有一些编辑操作需要确认，可稍后查看详情。')}</p>
      </div>
      <div id="recovery-dialog-details" className="recovery-details" hidden={!expanded}
        role="region" aria-label={t('恢复详情')}>
        {state.rows.length > 0 && <div id="recovery-panel"><div id="recovery-list">
          {state.rows.map(row => <div key={row.id} className="recovery-row" data-recovery={row.legacyKey}>
            <p>{t(row.label)}</p>
            {row.action && <button type="button" data-recover={row.legacyKey} disabled={ordinaryBusy || row.disabled}
              onClick={() => void run(() => recoveryActions.run(row.id), 'ordinary')}>{t(row.action)}</button>}
            <button type="button" data-export-recovery={row.legacyKey} disabled={ordinaryBusy}
              onClick={() => void run(async () => download(recoveryActions.download(row.id), 'notale-recovery.json'), 'ordinary')}>{t(row.download)}</button>
          </div>)}
        </div></div>}
        {keyboard.rows.length > 0 && <section aria-label={t('待检查的快捷键操作')}>
          <h3>{t('待检查的快捷键操作')}</h3>
          <p className="hint">{t('这些操作未完整结束。先查看原页面，确认后标记已处理。')}</p>
          {keyboard.rows.map(row => <div key={row.id} className="recovery-row" data-keyboard-recovery={row.id}>
            <p className="recovery-row-heading"><span>{t(actionLabels[row.intent.action.type] ?? row.intent.action.type)} · {row.intent.ids.length}{t(' 个对象')}</span>
              <span className="recovery-phase">{t(row.phase === 'queued' ? '未执行' : '需核对')}</span></p>
            {row.error && <p>{t(row.error)}</p>}
            <button type="button" disabled={keyboardBusy} onClick={() => void run(() => editorActions.inspectKeyboardRecovery(row), 'keyboard')}>{t('查看原页面')}</button>
            <button type="button" disabled={keyboardBusy} onClick={() => download(JSON.stringify({ schema: 'notale-draft', documentId: row.intent.documentId, operations: [], keyboard: [row] }, null, 2), 'notale-keyboard-recovery.json')}>{t('导出记录')}</button>
            <button type="button" disabled={keyboardBusy} onClick={() => void run(() => markHandled(row), 'keyboard')}>{t('标记已处理')}</button>
          </div>)}
        </section>}
        {(readError || actionError) && <p className="recovery-error" role="alert">{[readError, actionError].filter(Boolean).map(value => t(value)).join('\n')}</p>}
        {loaded && !readError && count === 0 && <p>{t('暂无待处理记录')}</p>}
      </div>
      <footer>
        <button type="button" disabled={ordinaryBusy} onClick={close}>{t('稍后处理')}</button>
        <button type="button" className="recovery-toggle" aria-expanded={expanded} aria-controls="recovery-dialog-details"
          onClick={() => setExpanded(value => !value)}>{t(expanded ? '收起详情' : '查看详情')}</button>
      </footer>
    </dialog>
  );
}
