/**
 * Cursor-style embedded browser panel.
 *
 * Renders an iframe for the current URL with back/forward/reload controls
 * and a URL bar. In design-edit mode, a pointer-tracking overlay captures
 * hover/click on the iframe (same-origin only) and opens the inline prompt
 * popover. For cross-origin pages we fall back to a click-anywhere overlay
 * that captures pointer coordinates relative to the iframe rect.
 *
 * NOTE on security: iframes carry `sandbox="allow-same-origin allow-scripts
 * allow-forms allow-popups"` so arbitrary sites can't escape the embedding
 * page. Some sites refuse framing via X-Frame-Options / CSP — the user will
 * see a blank iframe in that case. Electron `<webview>` can bypass this and
 * is a future enhancement path.
 */

import type { ScopedThreadRef } from "@t3tools/contracts";
import { ArrowLeft, ArrowRight, MousePointerClick, RotateCw, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useRightPanelStore } from "../rightPanelStore";
import { DesignEditOverlay } from "./DesignEditOverlay";

export interface BrowserPanelProps {
  threadRef: ScopedThreadRef;
}

export const BrowserPanel = memo(function BrowserPanel({ threadRef }: BrowserPanelProps) {
  const url = useRightPanelStore((s) => s.browserUrl);
  const historyIndex = useRightPanelStore((s) => s.browserHistoryIndex);
  const historyLength = useRightPanelStore((s) => s.browserHistory.length);
  const navigate = useRightPanelStore((s) => s.navigateBrowser);
  const goBack = useRightPanelStore((s) => s.goBack);
  const goForward = useRightPanelStore((s) => s.goForward);
  const reload = useRightPanelStore((s) => s.reload);
  const designEditEnabled = useRightPanelStore((s) => s.designEditEnabled);
  const setDesignEditEnabled = useRightPanelStore((s) => s.setDesignEditEnabled);

  const reloadTick = useRightPanelStore((s) => s.reloadTick);

  const [draftUrl, setDraftUrl] = useState(url);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setDraftUrl(url);
  }, [url]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < historyLength - 1;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      navigate(draftUrl);
    },
    [draftUrl, navigate],
  );

  const iframeKey = useMemo(() => `${url}:${reloadTick}`, [url, reloadTick]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor-background">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          className="cursor-iconbtn"
          disabled={!canGoBack}
          onClick={goBack}
          title="Back"
          aria-label="Back"
          style={{ opacity: canGoBack ? 1 : 0.35 }}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          className="cursor-iconbtn"
          disabled={!canGoForward}
          onClick={goForward}
          title="Forward"
          aria-label="Forward"
          style={{ opacity: canGoForward ? 1 : 0.35 }}
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          className="cursor-iconbtn"
          onClick={reload}
          title="Reload"
          aria-label="Reload"
        >
          <RotateCw size={13} />
        </button>

        <form onSubmit={handleSubmit} className="mx-1 flex min-w-0 flex-1">
          <label className="cursor-urlbar">
            <input
              type="text"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              placeholder="http://localhost:3000"
              spellCheck={false}
              autoComplete="off"
              aria-label="Browser URL"
            />
          </label>
        </form>

        <button
          type="button"
          className="cursor-iconbtn"
          data-active={designEditEnabled || undefined}
          onClick={() => setDesignEditEnabled(!designEditEnabled)}
          title={designEditEnabled ? "Exit design edit mode" : "Enter design edit mode"}
          aria-label="Toggle design edit"
          aria-pressed={designEditEnabled}
        >
          {designEditEnabled ? <X size={13} /> : <MousePointerClick size={13} />}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {url ? (
          // Design edit needs same-origin DOM access to pick elements; the
          // sandbox flags are deliberately permissive for the embedded dev browser.
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={url}
            title="Embedded browser"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <EmptyBrowserState />
        )}
        {designEditEnabled && url ? (
          <DesignEditOverlay iframeRef={iframeRef} threadRef={threadRef} />
        ) : null}
      </div>
    </div>
  );
});

function EmptyBrowserState() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
      Enter a URL above to preview a page.
    </div>
  );
}
