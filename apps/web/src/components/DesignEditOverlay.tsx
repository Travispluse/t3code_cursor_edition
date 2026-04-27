/**
 * Design Edit overlay — Cursor-style visual element picker for the browser pane.
 *
 * When the user enables design edit mode in `BrowserPanel`, this overlay
 * covers the iframe and listens for pointer events. Strategy:
 *
 *   1. Try same-origin access: if we can read `iframe.contentDocument`,
 *      perform `document.elementFromPoint(x, y)` to get the exact element,
 *      compute a CSS selector and outerHTML snippet, and draw an outline
 *      box over it.
 *   2. Cross-origin fallback: same-origin access will throw; we then just
 *      capture the pointer coordinates relative to the iframe's bounding
 *      rect and submit those as context instead.
 *
 * On click, a prompt popover opens at the cursor. The user types an
 * instruction ("make this button blue") and submits — the prompt is posted
 * as a new user turn in the current chat thread via `composerDraftStore`
 * (we insert into the active composer draft so the existing send flow
 * handles provider dispatch, approvals, etc.).
 */

import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useRightPanelStore } from "../rightPanelStore";
import { submitDesignEditPrompt } from "../designEditActions";

interface PickedElement {
  rect: { x: number; y: number; width: number; height: number };
  selector: string;
  tagName: string;
  snippet: string;
  sameOrigin: boolean;
  pagePoint: { x: number; y: number };
  pageUrl: string;
}

export interface DesignEditOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  threadRef: ScopedThreadRef;
}

export const DesignEditOverlay = memo(function DesignEditOverlay(props: DesignEditOverlayProps) {
  const { iframeRef, threadRef } = props;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const setDesignEditEnabled = useRightPanelStore((s) => s.setDesignEditEnabled);
  const browserUrl = useRightPanelStore((s) => s.browserUrl);

  const [hover, setHover] = useState<PickedElement | null>(null);
  const [pinned, setPinned] = useState<PickedElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvePicked = useCallback(
    (clientX: number, clientY: number): PickedElement | null => {
      const iframe = iframeRef.current;
      const overlay = overlayRef.current;
      if (!iframe || !overlay) return null;

      const overlayRect = overlay.getBoundingClientRect();
      const x = clientX - overlayRect.left;
      const y = clientY - overlayRect.top;

      let sameOrigin = false;
      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
        if (doc) sameOrigin = true;
      } catch {
        sameOrigin = false;
      }

      if (sameOrigin && doc) {
        const scaleX = doc.documentElement.clientWidth / overlayRect.width || 1;
        const scaleY = doc.documentElement.clientHeight / overlayRect.height || 1;
        const innerX = x * scaleX;
        const innerY = y * scaleY;
        const element = doc.elementFromPoint(innerX, innerY);
        if (!element || !(element instanceof HTMLElement)) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {
          rect: {
            x: rect.left / scaleX,
            y: rect.top / scaleY,
            width: rect.width / scaleX,
            height: rect.height / scaleY,
          },
          selector: cssSelectorFor(element),
          tagName: element.tagName.toLowerCase(),
          snippet: clampSnippet(element.outerHTML),
          sameOrigin: true,
          pagePoint: { x: Math.round(innerX), y: Math.round(innerY) },
          pageUrl: browserUrl,
        };
      }

      // Cross-origin fallback: return a point-only selection.
      return {
        rect: { x: x - 12, y: y - 12, width: 24, height: 24 },
        selector: "(cross-origin)",
        tagName: "",
        snippet: "",
        sameOrigin: false,
        pagePoint: { x: Math.round(x), y: Math.round(y) },
        pageUrl: browserUrl,
      };
    },
    [browserUrl, iframeRef],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pinned) return;
      const picked = resolvePicked(event.clientX, event.clientY);
      setHover(picked);
    },
    [pinned, resolvePicked],
  );

  const handlePointerLeave = useCallback(() => {
    if (pinned) return;
    setHover(null);
  }, [pinned]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const picked = resolvePicked(event.clientX, event.clientY);
      if (!picked) return;
      setPinned(picked);
      setPrompt("");
      setSubmitState("idle");
      setErrorMessage(null);
    },
    [resolvePicked],
  );

  const clearSelection = useCallback(() => {
    setPinned(null);
    setPrompt("");
    setSubmitState("idle");
    setErrorMessage(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!pinned || prompt.trim().length === 0) return;
    setSubmitState("pending");
    setErrorMessage(null);
    try {
      submitDesignEditPrompt({
        threadRef,
        prompt: prompt.trim(),
        selector: pinned.selector,
        tagName: pinned.tagName,
        snippet: pinned.snippet,
        pageUrl: pinned.pageUrl,
        pagePoint: pinned.pagePoint,
        sameOrigin: pinned.sameOrigin,
      });
      setSubmitState("sent");
      setTimeout(() => {
        clearSelection();
        setDesignEditEnabled(false);
      }, 600);
    } catch (error) {
      setSubmitState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to send prompt");
    }
  }, [clearSelection, pinned, prompt, setDesignEditEnabled, threadRef]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [clearSelection, handleSubmit],
  );

  // Escape at document level exits design edit mode entirely.
  useEffect(() => {
    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (pinned) {
        clearSelection();
      } else {
        setDesignEditEnabled(false);
      }
    };
    document.addEventListener("keydown", onDocKeyDown);
    return () => document.removeEventListener("keydown", onDocKeyDown);
  }, [clearSelection, pinned, setDesignEditEnabled]);

  const activeBox = pinned ?? hover;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30 cursor-crosshair"
      style={{ backgroundColor: "rgba(10, 10, 20, 0.04)" }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      {activeBox ? (
        <div
          className="pointer-events-none absolute rounded-[3px] transition-[left,top,width,height] duration-75"
          style={{
            left: activeBox.rect.x,
            top: activeBox.rect.y,
            width: activeBox.rect.width,
            height: activeBox.rect.height,
            boxShadow:
              "0 0 0 2px var(--primary), 0 0 0 4px color-mix(in srgb, var(--primary) 40%, transparent)",
            background: "color-mix(in srgb, var(--primary) 10%, transparent)",
          }}
        />
      ) : null}

      {hover && !pinned ? (
        <div
          className="pointer-events-none absolute rounded-[3px] bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"
          style={{
            left: Math.max(4, hover.rect.x),
            top: Math.max(4, hover.rect.y - 18),
          }}
        >
          {hover.tagName || "point"}
        </div>
      ) : null}

      {pinned ? (
        <div
          className="absolute flex w-[320px] max-w-[calc(100%-16px)] flex-col gap-2 rounded-md border border-border bg-popover p-2 shadow-lg"
          style={{
            left: Math.min(
              pinned.rect.x,
              Math.max(0, (overlayRef.current?.clientWidth ?? 0) - 336),
            ),
            top: Math.min(
              pinned.rect.y + pinned.rect.height + 8,
              Math.max(0, (overlayRef.current?.clientHeight ?? 0) - 160),
            ),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] text-muted-foreground">
              {pinned.sameOrigin
                ? `<${pinned.tagName}> · ${pinned.selector}`
                : `Point at (${pinned.pagePoint.x}, ${pinned.pagePoint.y})`}
            </div>
            <button
              type="button"
              className="cursor-iconbtn"
              onClick={clearSelection}
              aria-label="Cancel"
            >
              ×
            </button>
          </div>
          <textarea
            className="min-h-[64px] resize-none rounded-sm border border-border bg-background p-1.5 text-xs text-foreground outline-none focus:border-primary"
            placeholder="Describe the change to apply…"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          {errorMessage ? (
            <div className="text-[11px] text-[var(--destructive-foreground)]">{errorMessage}</div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-muted-foreground">
              {submitState === "pending"
                ? "Sending…"
                : submitState === "sent"
                  ? "Sent to chat"
                  : "⏎ to send · Esc to cancel"}
            </div>
            <button
              type="button"
              className="rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
              disabled={prompt.trim().length === 0 || submitState === "pending"}
              onClick={() => void handleSubmit()}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

function cssSelectorFor(element: HTMLElement): string {
  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  let depth = 0;
  while (current && current.nodeType === 1 && depth < 6) {
    const tagName: string = current.tagName.toLowerCase();
    let selector = tagName;
    if (current.classList.length > 0) {
      const classes = Array.from(current.classList)
        .slice(0, 3)
        .map((cls) => `.${cssEscape(cls)}`)
        .join("");
      selector += classes;
    }
    const parentElement: HTMLElement | null = current.parentElement;
    if (parentElement) {
      const siblings: Element[] = Array.from(parentElement.children).filter(
        (child: Element) => child.tagName.toLowerCase() === tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(selector);
    current = parentElement;
    depth += 1;
  }
  return parts.join(" > ");
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^\w-]/g, "\\$&");
}

function clampSnippet(html: string): string {
  const MAX = 600;
  if (html.length <= MAX) return html;
  return `${html.slice(0, MAX)}… [truncated]`;
}
