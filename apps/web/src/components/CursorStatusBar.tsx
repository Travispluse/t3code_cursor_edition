/**
 * Minimal Cursor-like status bar. Rendered as a fixed-height strip
 * at the bottom of the chat view. Shows:
 *
 *   - provider / model hint (when available)
 *   - branch / git info (when available)
 *   - panel toggles (terminal, browser, right panel)
 *
 * Intentionally lightweight — everything it shows is derived from stores
 * the redesign already owns, no new data fetching.
 */

import { Cloud, GitBranch, Globe, PanelRightOpen, SquareTerminal } from "lucide-react";
import { memo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useRightPanelStore } from "../rightPanelStore";
import { getWsConnectionUiState, useWsConnectionStatus } from "../rpc/wsConnectionState";

export interface CursorStatusBarProps {
  providerLabel?: string | undefined;
  modelLabel?: string | undefined;
  branchLabel?: string | undefined;
  cwdLabel?: string | undefined;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
}

export const CursorStatusBar = memo(function CursorStatusBar(props: CursorStatusBarProps) {
  const { providerLabel, modelLabel, branchLabel, cwdLabel, terminalOpen, onToggleTerminal } =
    props;

  const rightPanelOpen = useRightPanelStore((s) => s.open);
  const toggleRightPanel = useRightPanelStore((s) => s.toggleOpen);
  const setRightPanelOpen = useRightPanelStore((s) => s.setOpen);
  const openTab = useRightPanelStore((s) => s.openTab);

  const wsStatus = useWsConnectionStatus();
  const uiState = getWsConnectionUiState(wsStatus);
  const navigate = useNavigate();

  const connectionDotColor =
    uiState === "connected"
      ? "var(--success)"
      : uiState === "offline" || uiState === "error"
        ? "var(--destructive)"
        : "var(--warning)";
  const connectionLabel =
    uiState === "connected"
      ? "Cloud session live"
      : uiState === "reconnecting"
        ? `Reconnecting${
            wsStatus.reconnectAttemptCount > 0 ? ` (${wsStatus.reconnectAttemptCount})` : ""
          }…`
        : uiState === "connecting"
          ? "Connecting…"
          : uiState === "offline"
            ? "Offline"
            : "Disconnected";

  return (
    <div className="cursor-statusbar">
      <span
        className="inline-flex items-center gap-1.5"
        title={`WebSocket: ${uiState}${wsStatus.lastError ? ` · ${wsStatus.lastError}` : ""}`}
      >
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-full"
          style={{ backgroundColor: connectionDotColor }}
        />
        <span>{connectionLabel}</span>
      </span>
      {branchLabel ? (
        <span className="inline-flex items-center gap-1">
          <GitBranch size={11} />
          <span className="truncate max-w-[160px]">{branchLabel}</span>
        </span>
      ) : null}
      {cwdLabel ? <span className="truncate max-w-[240px] opacity-80">{cwdLabel}</span> : null}
      <div className="ml-auto flex items-center gap-1">
        {providerLabel || modelLabel ? (
          <span className="truncate max-w-[200px] opacity-80">
            {providerLabel}
            {providerLabel && modelLabel ? " · " : ""}
            {modelLabel}
          </span>
        ) : null}
        <button
          type="button"
          className="cursor-iconbtn"
          onClick={() => void navigate({ to: "/settings/connections" })}
          title="Connect a cloud environment"
          aria-label="Connect a cloud environment"
        >
          <Cloud size={12} />
        </button>
        <button
          type="button"
          className="cursor-iconbtn"
          data-active={terminalOpen || undefined}
          onClick={onToggleTerminal}
          title="Toggle terminal"
          aria-label="Toggle terminal"
        >
          <SquareTerminal size={12} />
        </button>
        <button
          type="button"
          className="cursor-iconbtn"
          data-active={rightPanelOpen || undefined}
          onClick={() => {
            if (!rightPanelOpen) {
              setRightPanelOpen(true);
              openTab("browser", { region: "top", activate: true });
            } else {
              toggleRightPanel();
            }
          }}
          title="Toggle browser panel"
          aria-label="Toggle browser panel"
        >
          <Globe size={12} />
        </button>
        <button
          type="button"
          className="cursor-iconbtn"
          data-active={rightPanelOpen || undefined}
          onClick={toggleRightPanel}
          title="Toggle right panel"
          aria-label="Toggle right panel"
        >
          <PanelRightOpen size={12} />
        </button>
      </div>
    </div>
  );
});
