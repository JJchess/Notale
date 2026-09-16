"use client";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChartGridHost } from "../adapters/chart-grid";
import {
  chartGridState,
  type ChartGridRequest,
} from "../state/chart-grid-connection";
export function ChartGridView() {
  const request = useSyncExternalStore(
    chartGridState.subscribe,
    chartGridState.getSnapshot,
    chartGridState.getServerSnapshot,
  );
  return request
    ? createPortal(
        <Grid key={request.id} request={request} />,
        request.container,
      )
    : null;
}
function Grid({ request }: { request: ChartGridRequest }) {
  const host = useRef<HTMLDivElement>(null);
  const resource = useRef<
    { adapter: ChartGridHost; generation: number } | undefined
  >(undefined);
  useLayoutEffect(() => {
    // Effect replay must retain the adapter already handed to the controller.
    const entry = (resource.current ??= {
      adapter: new ChartGridHost(host.current!),
      generation: 0,
    });
    const generation = ++entry.generation;
    let active = true;
    void entry.adapter.load().then(
      (element) => {
        if (active && element)
          request.ready({ adapter: entry.adapter, element });
      },
      (cause) => {
        if (active) request.failed(cause);
      },
    );
    return () => {
      active = false;
      queueMicrotask(() => {
        if (entry.generation !== generation) return;
        entry.adapter.dispose();
        if (resource.current === entry) resource.current = undefined;
        request.failed(Error("图表数据面板已卸载"));
      });
    };
  }, [request]);
  return <div ref={host} style={{ height: "100%", minHeight: 0 }} />;
}
