/**
 * Cursor-like right panel state.
 *
 * The right panel is split into two stacked regions (top / bottom). Each
 * region has its own tab bar and can host any of the available pane kinds:
 *
 *   - "browser" — embedded web browser with URL bar + design edit mode
 *   - "terminal" — xterm.js docked into the right panel
 *   - "diffs" — the existing DiffPanel
 *
 * The store owns which panes are mounted in each region, the currently
 * visible pane per region, the overall panel open state + width, the
 * split ratio, and the design-edit toggle state for the browser pane.
 *
 * Persisted to localStorage under `t3code:right-panel:v1`.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export type RightPaneKind = "browser" | "terminal" | "diffs";

export const ALL_RIGHT_PANE_KINDS: ReadonlyArray<RightPaneKind> = ["browser", "terminal", "diffs"];

export type RightPanelRegionId = "top" | "bottom";

export interface RightPanelRegionState {
  tabs: RightPaneKind[];
  activeTab: RightPaneKind;
}

export interface RightPanelState {
  open: boolean;
  width: number;
  splitRatio: number;
  splitEnabled: boolean;
  top: RightPanelRegionState;
  bottom: RightPanelRegionState;
  designEditEnabled: boolean;
  browserUrl: string;
  browserHistory: string[];
  browserHistoryIndex: number;
}

export interface RightPanelActions {
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setWidth: (width: number) => void;
  setSplitRatio: (ratio: number) => void;
  setSplitEnabled: (enabled: boolean) => void;
  activateTab: (region: RightPanelRegionId, tab: RightPaneKind) => void;
  moveTabToRegion: (
    tab: RightPaneKind,
    region: RightPanelRegionId,
    options?: { activate?: boolean },
  ) => void;
  openTab: (
    tab: RightPaneKind,
    options?: { region?: RightPanelRegionId; activate?: boolean },
  ) => void;
  closeTab: (tab: RightPaneKind) => void;
  setDesignEditEnabled: (enabled: boolean) => void;
  navigateBrowser: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
}

const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;
const DEFAULT_SPLIT_RATIO = 0.6;

const DEFAULT_BROWSER_URL = "http://localhost:3000";

const initialState: RightPanelState = {
  open: false,
  width: DEFAULT_WIDTH,
  splitRatio: DEFAULT_SPLIT_RATIO,
  splitEnabled: true,
  top: { tabs: ["browser"], activeTab: "browser" },
  bottom: { tabs: ["terminal"], activeTab: "terminal" },
  designEditEnabled: false,
  browserUrl: DEFAULT_BROWSER_URL,
  browserHistory: [DEFAULT_BROWSER_URL],
  browserHistoryIndex: 0,
};

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(Math.max(Math.round(value), MIN_WIDTH), MAX_WIDTH);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPLIT_RATIO;
  return Math.min(Math.max(value, 0.15), 0.85);
}

function removeFromRegion(state: RightPanelRegionState, tab: RightPaneKind): RightPanelRegionState {
  const nextTabs = state.tabs.filter((t) => t !== tab);
  const nextActive: RightPaneKind =
    state.activeTab === tab ? (nextTabs[0] ?? ("browser" as RightPaneKind)) : state.activeTab;
  return { tabs: nextTabs, activeTab: nextActive };
}

function addToRegion(
  state: RightPanelRegionState,
  tab: RightPaneKind,
  activate: boolean,
): RightPanelRegionState {
  const tabs = state.tabs.includes(tab) ? state.tabs : [...state.tabs, tab];
  return {
    tabs,
    activeTab: activate ? tab : state.activeTab,
  };
}

function findRegionForTab(state: RightPanelState, tab: RightPaneKind): RightPanelRegionId | null {
  if (state.top.tabs.includes(tab)) return "top";
  if (state.bottom.tabs.includes(tab)) return "bottom";
  return null;
}

export const useRightPanelStore = create<RightPanelState & RightPanelActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setOpen: (open) => set({ open }),
      toggleOpen: () => set((state) => ({ open: !state.open })),
      setWidth: (width) => set({ width: clampWidth(width) }),
      setSplitRatio: (ratio) => set({ splitRatio: clampRatio(ratio) }),
      setSplitEnabled: (enabled) => set({ splitEnabled: enabled }),

      activateTab: (region, tab) =>
        set((state) => {
          const regionState = state[region];
          if (!regionState.tabs.includes(tab)) {
            return {};
          }
          return { [region]: { ...regionState, activeTab: tab } } as Partial<RightPanelState>;
        }),

      moveTabToRegion: (tab, region, options) => {
        const activate = options?.activate ?? true;
        set((state) => {
          const sourceRegion = findRegionForTab(state, tab);
          if (sourceRegion === region) {
            return {
              [region]: addToRegion(state[region], tab, activate),
            } as Partial<RightPanelState>;
          }
          const next: Partial<RightPanelState> = {};
          if (sourceRegion) {
            next[sourceRegion] = removeFromRegion(state[sourceRegion], tab);
          }
          next[region] = addToRegion(
            sourceRegion === region ? state[region] : (next[region] ?? state[region]),
            tab,
            activate,
          );
          return next;
        });
      },

      openTab: (tab, options) => {
        const region = options?.region ?? "top";
        const activate = options?.activate ?? true;
        set((state) => {
          const patch: Partial<RightPanelState> = { open: true };
          const existing = findRegionForTab(state, tab);
          if (existing) {
            patch[existing] = {
              ...state[existing],
              activeTab: activate ? tab : state[existing].activeTab,
            };
          } else {
            patch[region] = addToRegion(state[region], tab, activate);
          }
          return patch;
        });
      },

      closeTab: (tab) =>
        set((state) => {
          const region = findRegionForTab(state, tab);
          if (!region) return {};
          return {
            [region]: removeFromRegion(state[region], tab),
          } as Partial<RightPanelState>;
        }),

      setDesignEditEnabled: (enabled) => set({ designEditEnabled: enabled }),

      navigateBrowser: (rawUrl) => {
        const url = normalizeBrowserUrl(rawUrl);
        if (!url) return;
        set((state) => {
          const truncated = state.browserHistory.slice(0, state.browserHistoryIndex + 1);
          const history = truncated[truncated.length - 1] === url ? truncated : [...truncated, url];
          return {
            browserUrl: url,
            browserHistory: history,
            browserHistoryIndex: history.length - 1,
          };
        });
      },

      goBack: () =>
        set((state) => {
          if (state.browserHistoryIndex <= 0) return {};
          const nextIndex = state.browserHistoryIndex - 1;
          return {
            browserHistoryIndex: nextIndex,
            browserUrl: state.browserHistory[nextIndex] ?? state.browserUrl,
          };
        }),

      goForward: () =>
        set((state) => {
          if (state.browserHistoryIndex >= state.browserHistory.length - 1) return {};
          const nextIndex = state.browserHistoryIndex + 1;
          return {
            browserHistoryIndex: nextIndex,
            browserUrl: state.browserHistory[nextIndex] ?? state.browserUrl,
          };
        }),

      reload: () => {
        // The browser pane listens for reloadTick; bumping the URL (same value)
        // via a microtask is enough to force the iframe to remount via key.
        const current = get().browserUrl;
        set({ browserUrl: "" });
        queueMicrotask(() => set({ browserUrl: current }));
      },
    }),
    {
      name: "t3code:right-panel:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: (state) => ({
        width: state.width,
        splitRatio: state.splitRatio,
        splitEnabled: state.splitEnabled,
        top: state.top,
        bottom: state.bottom,
        browserUrl: state.browserUrl,
        browserHistory: state.browserHistory.slice(-20),
        browserHistoryIndex: Math.min(state.browserHistoryIndex, 19),
      }),
    },
  ),
);

export function normalizeBrowserUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.toString();
    } catch {
      return null;
    }
  }
  // Heuristic: treat localhost:PORT and bare hostnames as http URLs.
  if (/^localhost(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[\w.-]+\.[\w.-]+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}
