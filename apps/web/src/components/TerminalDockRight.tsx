/**
 * TerminalDockRight — right-panel terminal host.
 *
 * The full xterm.js + session wiring lives in `ThreadTerminalDrawer` / the
 * `PersistentThreadTerminalDrawer` wrapper inside ChatView, and moving all of
 * that into a second mount point is a meaningful refactor. For the Cursor
 * redesign we expose the terminal as a right-panel pane with:
 *
 *   - a banner confirming the terminal is running in the bottom drawer
 *   - quick controls to open / close / focus the drawer
 *   - live subprocess status derived from `terminalStateStore`
 *
 * A follow-up refactor should extract PersistentThreadTerminalDrawer so the
 * same xterm instance can be portaled into either the bottom drawer or the
 * right panel without re-mounting state.
 */

import type { ScopedThreadRef } from "@t3tools/contracts";
import { SquareTerminal, Play, X as XIcon } from "lucide-react";
import { memo } from "react";

import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";

export interface TerminalDockRightProps {
  threadRef: ScopedThreadRef;
}

export const TerminalDockRight = memo(function TerminalDockRight({
  threadRef,
}: TerminalDockRightProps) {
  const terminalState = useTerminalStateStore((state) =>
    selectThreadTerminalState(state.terminalStateByThreadKey, threadRef),
  );
  const setTerminalOpen = useTerminalStateStore((state) => state.setTerminalOpen);

  const terminalsRunning = terminalState.runningTerminalIds.length;
  const terminalsOpenInDrawer = terminalState.terminalOpen;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor-background text-foreground">
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        Terminal
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
          <SquareTerminal size={18} />
        </div>
        <div className="text-sm font-medium text-foreground">
          {terminalsRunning > 0
            ? `${terminalsRunning} process${terminalsRunning > 1 ? "es" : ""} running`
            : "No terminal yet"}
        </div>
        <p className="max-w-sm text-xs text-muted-foreground">
          The terminal session renders in the bottom drawer inside the chat view. Use the button
          below to open or close it — input, scrollback and split state are shared with this panel.
        </p>
        <div className="flex items-center gap-2 pt-1">
          {terminalsOpenInDrawer ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
              onClick={() => setTerminalOpen(threadRef, false)}
            >
              <XIcon size={13} />
              Hide terminal drawer
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/10 px-2.5 py-1.5 text-xs text-foreground hover:bg-primary/20"
              onClick={() => setTerminalOpen(threadRef, true)}
            >
              <Play size={13} />
              Open terminal drawer
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
