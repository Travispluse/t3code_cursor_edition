/**
 * Cursor-style right-hand panel.
 *
 * Hosts three panes — browser, terminal, diffs — inside two stacked regions
 * ("top" and "bottom"), each with its own tab bar. Width is resizable by
 * dragging the left edge; split ratio between the two regions is resizable
 * by dragging the horizontal divider.
 *
 * Backed by `rightPanelStore`. Panes outside the store's `top`/`bottom` lists
 * are unmounted so xterm/iframe state doesn't leak across session.
 */

import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  ChevronLeft,
  GitCompare,
  Globe,
  MousePointerClick,
  SquareTerminal,
  X as XIcon,
} from "lucide-react";
import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  type RightPaneKind,
  type RightPanelRegionId,
  useRightPanelStore,
} from "../rightPanelStore";
import { BrowserPanel } from "./BrowserPanel";
import { TerminalDockRight } from "./TerminalDockRight";
import { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";
import { DiffPanelHeaderSkeleton, DiffPanelLoadingState, DiffPanelShell } from "./DiffPanelShell";

const DiffPanelLazy = lazy(() => import("./DiffPanel"));

const PANE_ICON: Record<RightPaneKind, typeof Globe> = {
  browser: Globe,
  terminal: SquareTerminal,
  diffs: GitCompare,
};

const PANE_LABEL: Record<RightPaneKind, string> = {
  browser: "Browser",
  terminal: "Terminal",
  diffs: "Diffs",
};

export interface RightPanelProps {
  threadRef: ScopedThreadRef;
  diffOpen: boolean;
  onCloseDiffRoute: () => void;
  onOpenDiffRoute: () => void;
  onMarkDiffOpened: () => void;
  diffRenderRequested: boolean;
}

export const RightPanel = memo(function RightPanel(props: RightPanelProps) {
  const {
    threadRef,
    diffOpen,
    onCloseDiffRoute,
    onOpenDiffRoute,
    onMarkDiffOpened,
    diffRenderRequested,
  } = props;

  const open = useRightPanelStore((s) => s.open);
  const width = useRightPanelStore((s) => s.width);
  const splitRatio = useRightPanelStore((s) => s.splitRatio);
  const splitEnabled = useRightPanelStore((s) => s.splitEnabled);
  const top = useRightPanelStore((s) => s.top);
  const bottom = useRightPanelStore((s) => s.bottom);
  const setWidth = useRightPanelStore((s) => s.setWidth);
  const setSplitRatio = useRightPanelStore((s) => s.setSplitRatio);
  const setSplitEnabled = useRightPanelStore((s) => s.setSplitEnabled);
  const openTab = useRightPanelStore((s) => s.openTab);

  // Route-driven sync: when the diff route search becomes "diff=1", make sure
  // the diffs tab is visible in some region and the panel is open.
  useEffect(() => {
    if (diffOpen) {
      openTab("diffs", { region: "top", activate: true });
      onMarkDiffOpened();
    }
  }, [diffOpen, openTab, onMarkDiffOpened]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const widthDragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const splitDragState = useRef<{
    startY: number;
    startRatio: number;
    containerHeight: number;
  } | null>(null);

  const onWidthPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      widthDragState.current = { startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onWidthPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!widthDragState.current) return;
      const delta = widthDragState.current.startX - event.clientX;
      setWidth(widthDragState.current.startWidth + delta);
    },
    [setWidth],
  );

  const onWidthPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    widthDragState.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op: pointer may already be released
    }
  }, []);

  const onSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      event.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      splitDragState.current = {
        startY: event.clientY,
        startRatio: splitRatio,
        containerHeight: rect.height,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [splitRatio],
  );

  const onSplitPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = splitDragState.current;
      if (!drag || drag.containerHeight <= 0) return;
      const deltaRatio = (event.clientY - drag.startY) / drag.containerHeight;
      setSplitRatio(drag.startRatio + deltaRatio);
    },
    [setSplitRatio],
  );

  const onSplitPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    splitDragState.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  }, []);

  // Track which panes are mounted anywhere so that each pane renders at most
  // once — when it is moved from top to bottom we don't unmount state.
  const mountedPanes = useMemo(() => {
    const set = new Set<RightPaneKind>();
    for (const tab of top.tabs) set.add(tab);
    if (splitEnabled) {
      for (const tab of bottom.tabs) set.add(tab);
    }
    return set;
  }, [top.tabs, bottom.tabs, splitEnabled]);

  if (!open) return null;

  const topFlex = splitEnabled ? splitRatio : 1;
  const bottomFlex = splitEnabled ? 1 - splitRatio : 0;

  return (
    <div
      ref={containerRef}
      className="cursor-right-panel relative flex h-dvh flex-none flex-col text-foreground"
      style={{ width: `${width}px` }}
    >
      {/* Left edge resize handle for panel width */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute left-0 top-0 bottom-0 w-1 -translate-x-1/2 cursor-ew-resize select-none bg-transparent hover:bg-primary/40 z-10"
        onPointerDown={onWidthPointerDown}
        onPointerMove={onWidthPointerMove}
        onPointerUp={onWidthPointerUp}
        onPointerCancel={onWidthPointerUp}
      />

      <RightPanelRegion
        regionId="top"
        tabs={top.tabs}
        activeTab={top.activeTab}
        flex={topFlex}
        splitEnabled={splitEnabled}
        onToggleSplit={() => setSplitEnabled(!splitEnabled)}
        threadRef={threadRef}
        diffOpen={diffOpen}
        onCloseDiffRoute={onCloseDiffRoute}
        onOpenDiffRoute={onOpenDiffRoute}
        diffRenderRequested={diffRenderRequested}
        mountedPanes={mountedPanes}
      />

      {splitEnabled ? (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            className="h-1 cursor-ns-resize select-none bg-border hover:bg-primary/40"
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            onPointerCancel={onSplitPointerUp}
          />
          <RightPanelRegion
            regionId="bottom"
            tabs={bottom.tabs}
            activeTab={bottom.activeTab}
            flex={bottomFlex}
            splitEnabled={splitEnabled}
            onToggleSplit={() => setSplitEnabled(!splitEnabled)}
            threadRef={threadRef}
            diffOpen={diffOpen}
            onCloseDiffRoute={onCloseDiffRoute}
            onOpenDiffRoute={onOpenDiffRoute}
            diffRenderRequested={diffRenderRequested}
            mountedPanes={mountedPanes}
          />
        </>
      ) : null}
    </div>
  );
});

interface RightPanelRegionProps {
  regionId: RightPanelRegionId;
  tabs: RightPaneKind[];
  activeTab: RightPaneKind;
  flex: number;
  splitEnabled: boolean;
  onToggleSplit: () => void;
  threadRef: ScopedThreadRef;
  diffOpen: boolean;
  onCloseDiffRoute: () => void;
  onOpenDiffRoute: () => void;
  diffRenderRequested: boolean;
  mountedPanes: Set<RightPaneKind>;
}

function RightPanelRegion(props: RightPanelRegionProps) {
  const {
    regionId,
    tabs,
    activeTab,
    flex,
    splitEnabled,
    onToggleSplit,
    threadRef,
    diffOpen,
    onCloseDiffRoute,
    onOpenDiffRoute,
    diffRenderRequested,
    mountedPanes,
  } = props;

  const activateTab = useRightPanelStore((s) => s.activateTab);
  const closeTab = useRightPanelStore((s) => s.closeTab);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      style={{ flex: `${flex} 1 0` }}
    >
      <div className="cursor-tabbar">
        {tabs.map((tab) => {
          const Icon = PANE_ICON[tab];
          const label = PANE_LABEL[tab];
          const isActive = tab === activeTab;
          return (
            <div key={tab} className="cursor-tab" data-active={isActive || undefined}>
              <button
                type="button"
                className="contents"
                onClick={() => {
                  if (tab === "diffs" && !diffOpen) {
                    onOpenDiffRoute();
                  }
                  activateTab(regionId, tab);
                }}
              >
                <Icon size={13} strokeWidth={2} />
                <span>{label}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${label}`}
                className="cursor-iconbtn ml-1"
                style={{ height: 16, width: 16 }}
                onClick={() => {
                  if (tab === "diffs" && diffOpen) {
                    onCloseDiffRoute();
                  }
                  closeTab(tab);
                }}
              >
                <XIcon size={11} />
              </button>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-0.5 pr-1">
          <button
            type="button"
            className="cursor-iconbtn"
            data-active={splitEnabled || undefined}
            onClick={onToggleSplit}
            title={splitEnabled ? "Merge panes" : "Split panes"}
          >
            <MousePointerClick size={12} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabs.length === 0 ? (
          <EmptyRegion />
        ) : (
          Array.from(mountedPanes).map((paneKind) => {
            const isActive = paneKind === activeTab && tabs.includes(paneKind);
            return (
              <PaneContent
                key={paneKind}
                paneKind={paneKind}
                visible={isActive}
                threadRef={threadRef}
                diffRenderRequested={diffRenderRequested}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function EmptyRegion() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      No panes in this region. Drag a tab here or toggle split off.
    </div>
  );
}

interface PaneContentProps {
  paneKind: RightPaneKind;
  visible: boolean;
  threadRef: ScopedThreadRef;
  diffRenderRequested: boolean;
}

function PaneContent(props: PaneContentProps) {
  const { paneKind, visible, threadRef, diffRenderRequested } = props;
  return (
    <div
      aria-hidden={!visible}
      className="absolute inset-0 flex min-h-0 min-w-0 flex-col"
      style={{
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {paneKind === "browser" ? <BrowserPanel threadRef={threadRef} /> : null}
      {paneKind === "terminal" ? <TerminalDockRight threadRef={threadRef} /> : null}
      {paneKind === "diffs" ? (
        <DiffWorkerPoolProvider>
          <Suspense
            fallback={
              <DiffPanelShell mode="sidebar" header={<DiffPanelHeaderSkeleton />}>
                <DiffPanelLoadingState label="Loading diff viewer..." />
              </DiffPanelShell>
            }
          >
            {diffRenderRequested ? <DiffPanelLazy mode="sidebar" /> : null}
          </Suspense>
        </DiffWorkerPoolProvider>
      ) : null}
    </div>
  );
}

export function RightPanelChromeIcons({ className }: { className?: string }): ReactNode {
  const setOpen = useRightPanelStore((s) => s.setOpen);
  const openTab = useRightPanelStore((s) => s.openTab);
  return (
    <div className={className}>
      <button
        type="button"
        className="cursor-iconbtn"
        title="Open browser"
        onClick={() => {
          setOpen(true);
          openTab("browser", { region: "top" });
        }}
      >
        <Globe size={14} />
      </button>
      <button
        type="button"
        className="cursor-iconbtn"
        title="Open terminal"
        onClick={() => {
          setOpen(true);
          openTab("terminal", { region: "bottom" });
        }}
      >
        <SquareTerminal size={14} />
      </button>
      <button
        type="button"
        className="cursor-iconbtn"
        title="Toggle panel"
        onClick={() => setOpen(true)}
      >
        <ChevronLeft size={14} />
      </button>
    </div>
  );
}
