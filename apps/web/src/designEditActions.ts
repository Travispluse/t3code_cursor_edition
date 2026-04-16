/**
 * Design Edit → chat bridge.
 *
 * Called by `DesignEditOverlay` when the user submits a prompt from the
 * element picker popover. The prompt is staged into the current thread's
 * composer draft with element context appended, and the composer is
 * focused so the user can review & press Send.
 *
 * We intentionally *don't* auto-dispatch the turn: the send flow involves
 * provider routing, approvals and plan gating that are hard to replicate
 * here correctly. Surfacing the prompt in the composer matches Cursor's
 * "design edit drops a message you can refine" feel.
 */

import type { ScopedThreadRef } from "@t3tools/contracts";

import { useComposerDraftStore } from "./composerDraftStore";

export interface DesignEditSubmission {
  threadRef: ScopedThreadRef;
  prompt: string;
  selector: string;
  tagName: string;
  snippet: string;
  pageUrl: string;
  pagePoint: { x: number; y: number };
  sameOrigin: boolean;
}

const DESIGN_EDIT_PROMPT_HEADER = "<!-- design-edit context -->";

function stripPriorDesignEditContext(text: string): string {
  const idx = text.indexOf(DESIGN_EDIT_PROMPT_HEADER);
  if (idx < 0) return text;
  return text.slice(0, idx).trimEnd();
}

export function submitDesignEditPrompt(submission: DesignEditSubmission): void {
  const { threadRef, prompt } = submission;
  const store = useComposerDraftStore.getState();
  const existingDraft = store.getComposerDraft(threadRef);
  const existingPrompt = stripPriorDesignEditContext(existingDraft?.prompt ?? "");

  const contextBlock = buildContextBlock(submission);
  const prefix = existingPrompt.trim().length > 0 ? `${existingPrompt.trim()}\n\n` : "";
  const nextPrompt = `${prefix}${prompt}\n\n${contextBlock}`;

  store.setPrompt(threadRef, nextPrompt);

  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      const composer = document.querySelector<HTMLElement>(
        "[data-chat-composer-form='true'] [contenteditable='true']",
      );
      composer?.focus();
      const send = document.querySelector<HTMLButtonElement>(
        "[data-chat-composer-actions='right'] button[type='submit']",
      );
      if (send) {
        send.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }
}

function safeFence(content: string): string {
  let maxRun = 2;
  let run = 0;
  for (const ch of content) {
    if (ch === "`") {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  return "`".repeat(maxRun + 1);
}

function buildContextBlock(submission: DesignEditSubmission): string {
  const lines: string[] = [DESIGN_EDIT_PROMPT_HEADER];
  lines.push(`Page: ${submission.pageUrl}`);
  if (submission.sameOrigin && submission.selector) {
    lines.push(`Element: <${submission.tagName}>`);
    lines.push(`Selector: ${submission.selector}`);
    if (submission.snippet) {
      const fence = safeFence(submission.snippet);
      lines.push("Outer HTML:");
      lines.push(`${fence}html`);
      lines.push(submission.snippet);
      lines.push(fence);
    }
  } else {
    lines.push(
      `Pointer: (${submission.pagePoint.x}, ${submission.pagePoint.y}) — cross-origin, element not accessible`,
    );
  }
  return lines.join("\n");
}
