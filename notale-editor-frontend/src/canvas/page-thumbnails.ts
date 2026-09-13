import { PreviewLeases } from "./preview-leases";
import type { CanvasPreview } from "./resources";
import { observeThumbnailHosts, type ThumbnailHost } from "./thumbnail-hosts";
import type { DeckDocument, Slide } from "@notale/editor/browser";
/** Visible thumbnails share incremental author updates; unrelated frames stay mounted. */
export function createPageThumbnails(context: { overview: () => boolean }) {
  let disposed = false,
    scheduledFrame = 0;
  let changedPaths: string[] = [];
  let width = 1600,
    height = 900,
    documentId = "",
    assetBase = "",
    queued = false,
    latest: DeckDocument | undefined;
  const hosts = new Map<HTMLElement, ThumbnailHost>();
  const visible = new Set<HTMLElement>(),
    mounted = new Map<HTMLElement, HTMLIFrameElement>(),
    urls = new Map<string, string>();
  const sources = new Map<string, Slide>(),
    painted = new WeakMap<HTMLIFrameElement, Slide>();
  const leases = new PreviewLeases(),
    releaseLease = new Map<HTMLIFrameElement, () => void>(),
    loaded = new WeakSet<HTMLIFrameElement>();
  let grant: CanvasPreview | undefined;
  function removeFrame(host: HTMLElement, frame: HTMLIFrameElement) {
    frame.remove();
    mounted.delete(host);
    host.classList.remove("thumbnail-ready");
    releaseLease.get(frame)?.();
    releaseLease.delete(frame);
  }
  const scripts = (s: Slide) =>
    JSON.stringify(s.html.match(/<script\b[\s\S]*?<\/script>/gi) ?? []);
  function post(frame: HTMLIFrameElement, type: string, data: unknown) {
    const channel = new URL(frame.src).pathname.split("/")[2];
    frame.contentWindow?.postMessage(
      { source: "notale-host", channel, type, data },
      new URL(frame.src).origin,
    );
  }
  function paint(host: HTMLElement, frame: HTMLIFrameElement) {
    if (!loaded.has(frame)) return;
    const registration = hosts.get(host);
    if (!registration || registration.documentId !== latest?.id) return;
    const id = registration.pageId,
      next = latest?.slides.find((s) => s.id === id),
      before = painted.get(frame) ?? sources.get(id);
    if (!before || !next || before === next) return;
    if (scripts(before) !== scripts(next)) return;
    post(frame, "author-resources", { assetBase, changedPaths });
    post(frame, "author-update", {
      before: before.html,
      after: next.html,
      transforms: next.transforms,
    });
    post(frame, "author-state", {
      slide: { ...next, html: "" },
      theme: {
        ...latest!.theme,
        ...latest!.layouts.find((l) => l.id === next.layoutId)?.theme,
        ...next.theme,
      },
      width,
      height,
    });
    painted.set(frame, next);
  }
  function refresh() {
    queued = false;
    if (disposed) return;
    const overview = context.overview();
    const candidates = [...visible]
      .filter(
        (h) =>
          hosts.get(h)?.documentId === documentId &&
          h.isConnected &&
          h.getClientRects().length,
      )
      .sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      );
    const wanted = new Set(candidates.slice(0, overview ? 8 : 6));
    for (const [host, frame] of mounted)
      if (!wanted.has(host)) {
        removeFrame(host, frame);
      }
    for (const host of wanted) {
      let frame = mounted.get(host);
      if (!frame) {
        const url = urls.get(hosts.get(host)!.pageId);
        if (!url) continue;
        frame = document.createElement("iframe");
        frame.title = "页面缩略图";
        frame.tabIndex = -1;
        frame.setAttribute("aria-hidden", "true");
        frame.inert = true;
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
        frame.setAttribute("allow", "autoplay 'none'; fullscreen 'none'");
        const created = frame;
        frame.addEventListener("load", () => {
          if (mounted.get(host) !== created) return;
          loaded.add(created);
          host.classList.add("thumbnail-ready");
          post(created, "mode", { mode: "edit" });
          paint(host, created);
        });
        const source = sources.get(hosts.get(host)!.pageId);
        if (source) painted.set(frame, source);
        if (grant) releaseLease.set(frame, leases.retain(documentId, grant));
        frame.src = url;
        mounted.set(host, frame);
        host.append(frame);
      }
      frame.style.width = width + "px";
      frame.style.height = height + "px";
      frame.style.transform = "scale(" + host.clientWidth / width + ")";
    }
  }
  function schedule() {
    if (!disposed && !queued) {
      queued = true;
      scheduledFrame = requestAnimationFrame(refresh);
    }
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && hosts.has(entry.target as HTMLElement))
        visible.add(entry.target as HTMLElement);
      else visible.delete(entry.target as HTMLElement);
    }
    schedule();
  });
  const resize = new ResizeObserver(schedule);
  const stopHosts = observeThumbnailHosts((registration, attached) => {
    const host = registration.element;
    if (attached) {
      hosts.set(host, registration);
      host.style.aspectRatio = width + "/" + height;
      observer.observe(host);
      resize.observe(host);
    } else if (hosts.get(host) === registration) {
      observer.unobserve(host);
      resize.unobserve(host);
      visible.delete(host);
      const frame = mounted.get(host);
      if (frame) removeFrame(host, frame);
      hosts.delete(host);
    }
    schedule();
  });
  function clearFrames() {
    for (const [host, frame] of mounted) removeFrame(host, frame);
    leases.clear();
  }
  window.addEventListener("pagehide", clearFrames);
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopHosts();
    hosts.clear();
    observer.disconnect();
    resize.disconnect();
    cancelAnimationFrame(scheduledFrame);
    queued = false;
    window.removeEventListener("pagehide", clearFrames);
    clearFrames();
    visible.clear();
    urls.clear();
    sources.clear();
    latest = undefined;
    changedPaths = [];
  }
  return {
    dispose,
    update(
      slides: { id: string; url: string }[],
      doc: DeckDocument,
      preview?: CanvasPreview,
    ) {
      if (disposed) return;
      if (documentId !== doc.id) {
        clearFrames();
        urls.clear();
        sources.clear();
        grant = undefined;
        documentId = doc.id;
      }
      latest = doc;
      width = doc.width;
      height = doc.height;
      const pageIds = new Set(doc.slides.map((slide) => slide.id));
      for (const id of urls.keys())
        if (!pageIds.has(id)) {
          urls.delete(id);
          sources.delete(id);
        }
      for (const [host, frame] of mounted)
        if (!pageIds.has(hosts.get(host)!.pageId)) {
          removeFrame(host, frame);
        }
      // New grants update future mounts; retained frames keep their own old grant.
      if (preview && (!grant || preview.version >= grant.version)) {
        grant = preview;
        for (const item of slides) {
          const next = doc.slides.find((s) => s.id === item.id);
          if (!next) continue;
          const previous = sources.get(item.id);
          if (previous && scripts(previous) !== scripts(next))
            for (const [host, frame] of mounted)
              if (hosts.get(host)?.pageId === item.id) removeFrame(host, frame);
          urls.set(item.id, item.url);
          sources.set(item.id, next);
        }
      }
      // Host registration owns observation. Clearing visibility here creates a
      // frame with no candidates and tears down healthy runtimes on every edit.
      for (const host of hosts.keys())
        host.style.aspectRatio = width + "/" + height;
      for (const [host, frame] of mounted) paint(host, frame);
      schedule();
    },
    patch(doc: DeckDocument, base = "", paths: string[] = []) {
      if (disposed) return;
      changedPaths = paths;
      latest = doc;
      width = doc.width;
      height = doc.height;
      if (base) assetBase = base;
      for (const [host, frame] of mounted) paint(host, frame);
    },
  };
}
