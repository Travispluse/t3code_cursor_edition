# macOS build & Cursor-parity verification (2026-04-24)

This note summarizes what we can verify from this Linux CI-style environment for your request:

- **Is the project ready to build for macOS?**
- **Will it behave like Cursor?**

## What was verified

### 1) macOS desktop packaging pathways exist

The repo includes explicit macOS distribution scripts and build-automation support:

- `dist:desktop:dmg`
- `dist:desktop:dmg:arm64`
- `dist:desktop:dmg:x64`

The desktop artifact builder also supports `--platform mac`, `--target dmg`, and `arm64` / `x64` / `universal` architecture choices.

### 2) Desktop runtime compiles in this environment

Running `bun run build:desktop` successfully built:

- `@t3tools/contracts`
- `@t3tools/desktop`
- `@t3tools/web`

Then it failed in the `t3` package because the host Node version was too old for one script execution path (`ERR_UNKNOWN_FILE_EXTENSION` on a TS script). This is an environment/runtime issue, not a missing macOS build pipeline.

### 3) Desktop tests pass

`apps/desktop` test suite passed (`11` files / `60` tests).

### 4) Cursor-related behavior has dedicated coverage

The server has tests for opening files in Cursor/editor commands (`apps/server/src/open.test.ts`), and those tests pass in this environment.

## Limits of this verification

From this Linux container, we **cannot fully verify real macOS app behavior** (native DMG install UX, keychain/signing/notarization, menu-bar conventions, macOS window lifecycle quirks, Rosetta/native runtime behavior, etc.).

Also, “behave like Cursor” can only be partially inferred from code/tests here. We can validate some parity-relevant pieces (desktop shell, provider orchestration, editor integration), but not full UX equivalence without manual macOS runtime validation.

## Practical recommendation

To truly verify macOS + Cursor-like behavior:

1. Build on a real macOS machine:
   - `bun run dist:desktop:dmg:arm64` (Apple Silicon)
   - `bun run dist:desktop:dmg:x64` (Intel)
2. Install and smoke-test both artifacts.
3. Validate key flows against Cursor-like expectations:
   - Open repo, start thread, send prompt, receive streamed output.
   - Agent edit/apply flow and diff rendering.
   - Keyboard shortcuts, command palette, model/provider switching.
   - “Open in editor” actions with Cursor installed.
4. If release-grade: validate signing/notarization + update flow end-to-end.
