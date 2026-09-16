/** Embedded code labs own their editor, worker and visualizer; author edits never serialize them. */
interface CodeLab {
  getState(): { playing?: boolean; editorReady?: boolean; runtimeReady?: boolean; viewReady?: boolean };
  ensureInteractive?(): Promise<unknown>;
  pause?(): void;
  resume?(): void;
  dispose(): void;
}
export function workbenchLifecycle(doc: Document,report:(state:{busy:boolean;heavy:boolean})=>void=()=>{}) {
  const activity=new Map<Window,{busy:boolean;heavy:boolean}>();
  const receive=(event:MessageEvent)=>{if(event.origin!==location.origin||event.data?.source!=='notale-code-lifecycle')return;if(![...doc.querySelectorAll('iframe')].some(frame=>frame.contentWindow===event.source))return;for(const key of activity.keys())if(![...doc.querySelectorAll('iframe')].some(frame=>frame.contentWindow===key))activity.delete(key);activity.set(event.source as Window,{busy:event.data.busy===true,heavy:event.data.heavy===true});report({busy:[...activity.values()].some(s=>s.busy),heavy:[...activity.values()].some(s=>s.heavy)});};
  window.addEventListener('message',receive);
  const frames = new Map<HTMLIFrameElement, { lab?: CodeLab; playing: boolean }>();
  let visible = true;
  const api = (frame: HTMLIFrameElement) => {
    try { return (frame.contentWindow as (Window & { CodeLab?: CodeLab }) | null)?.CodeLab; } catch { return undefined; }
  };
  const pause = (frame: HTMLIFrameElement, lab: CodeLab) => {
    if (lab.pause) lab.pause();
    else if (lab.getState().playing) frame.contentDocument?.getElementById('playButton')?.click();
  };
  function scan() {
    for (const [frame, state] of frames) if (!frame.isConnected) { state.lab?.dispose(); frames.delete(frame); }
    for (const frame of doc.querySelectorAll('iframe')) {
      const state = frames.get(frame) ?? {playing: false};
      state.lab = api(frame);
      frames.set(frame, state);
      if (!visible && state.lab) pause(frame, state.lab);
    }
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('iframe') || node.querySelector('iframe'))))) scan();
  });
  observer.observe(doc.documentElement, {subtree: true, childList: true});
  doc.addEventListener('load', scan, true);
  scan();
  const dispose = () => { window.removeEventListener('message',receive);activity.clear();observer.disconnect(); doc.removeEventListener('load', scan, true); for (const state of frames.values()) state.lab?.dispose(); frames.clear(); };
  window.addEventListener('pagehide', dispose, {once: true});
  return {interact(){scan();for(const state of frames.values())void state.lab?.ensureInteractive?.().catch(()=>{});},setVisible(next: boolean) {
    if (visible === next) return;
    scan();
    visible = next;
    for (const [frame, state] of frames) {
      const lab = api(frame); if (!lab) continue;
      state.lab = lab;
      if (!next) { state.playing = !!lab.getState().playing; pause(frame, lab); }
      else if (state.playing) { state.playing = false; if (lab.resume) lab.resume(); else frame.contentDocument?.getElementById('playButton')?.click(); }
    }
  }, dispose};
}
