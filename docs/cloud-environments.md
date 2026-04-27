# Cloud environments

Run the T3 Code server on a machine that stays online so your coding-agent
sessions keep working when you close your laptop — and reattach from any
device by connecting to the same backend.

## How it works

T3 Code is split into three runtime pieces:

- **`apps/web`** — the React UI (runs in your browser).
- **`apps/server`** — a Node.js process that wraps Codex / Claude via the
  Codex app-server JSON-RPC transport, persists sessions to SQLite, and
  streams events to connected clients over WebSocket.
- **`apps/desktop`** — an optional Electron shell that embeds the web UI.

Everything stateful lives in the server. Codex / Claude sessions, turn
history, terminal state and pending approvals are all owned by the server
process and written to a SQLite database under `T3CODE_BASE_DIR` (default
`~/.t3code` locally, `/data` in the Docker image). When the web client
disconnects — because you closed your laptop, a network blip, a browser
refresh — the server keeps running the turn. The client reconnects with
exponential backoff (1s → 64s, up to 8 attempts) and catches up on missed
events via the `replayEvents(fromSequenceExclusive)` RPC.

So making your work continue while your laptop is off is mostly about
**where the server runs**. If it runs on your laptop, closing the lid kills
it. If it runs in the cloud, it doesn't.

## Option A — self-host on Fly.io (fastest path)

The repo ships with `apps/server/Dockerfile` and a `fly.toml` at the root.

### 1. Install the Fly CLI and authenticate

```bash
brew install flyctl     # or: curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Launch the app

From the repo root:

```bash
fly launch --no-deploy --copy-config
```

Accept the prompts; when it asks for a name pick something unique (e.g.
`t3code-yourname`). Edit `fly.toml` if you want a different region.

### 3. Create a persistent volume

```bash
fly volumes create t3code_data --region iad --size 10
```

This backs `/data` inside the container so SQLite state survives restarts
and redeploys. Without this every redeploy would wipe your thread history.

### 4. Deploy

```bash
fly deploy
```

Fly terminates HTTPS at its edge and forwards plaintext traffic to the
container on port 3773. Once the deploy finishes you'll see a URL like
`https://t3code-yourname.fly.dev`.

### 5. Create a pairing credential on the server

```bash
fly ssh console
  > node apps/server/dist/bin.mjs auth pairing create --label "my-laptop"
```

Copy the pairing URL that gets printed.

### 6. Connect from the UI

In your local T3 Code:

1. Open **Settings → Connections** (or tap the cloud icon in the status
   bar at the bottom of the chat view).
2. Click **Add backend**.
3. Paste the pairing URL.
4. Give it a label and save.

The new cloud environment shows up in the environment selector. Any thread
you start there keeps running even when your laptop is closed. Reopen
T3 Code on another device, add the same pairing URL, and you'll see the
same sessions.

## Option B — self-host on your own VM or another provider

The Dockerfile is host-agnostic. Any platform that can run a container,
accepts WebSocket traffic and provides a persistent volume will work:

- **Railway:** `railway init` → pick Dockerfile → add a volume mounted at
  `/data` → set `T3CODE_HOST=0.0.0.0`, `T3CODE_PORT=3773`.
- **Render:** Create a Web Service from the repo, choose "Docker",
  `Dockerfile Path = apps/server/Dockerfile`, add a Disk mounted at `/data`.
- **AWS ECS / Fargate:** Build and push the image, run it behind an ALB
  with WebSocket support enabled, mount EFS at `/data`.
- **A plain VM:**

  ```bash
  docker build -f apps/server/Dockerfile -t t3code-server .
  docker run -d --name t3code \
    -p 3773:3773 \
    -v t3code-data:/data \
    t3code-server
  ```

  Put Caddy or nginx in front for HTTPS.

The two things every host needs to provide:

1. **Long-lived WebSocket connections** (not Lambda / short-lived workers).
2. **A persistent volume mounted at `/data`** — without it the server will
   lose all sessions on restart.

## Configuration reference

| Env var           | Default     | Purpose                                             |
| ----------------- | ----------- | --------------------------------------------------- |
| `T3CODE_HOST`     | `127.0.0.1` | Interface to bind. Set to `0.0.0.0` in a container. |
| `T3CODE_PORT`     | `3773`      | HTTP + WebSocket port.                              |
| `T3CODE_BASE_DIR` | `~/.t3code` | Where SQLite + auth state live.                     |

CLI equivalents: `--host`, `--port`, `--base-dir`.

## Reconnection behavior

The Cursor-style status bar at the bottom of the chat view shows a coloured
dot for the current WebSocket connection:

- **green** — connected to the backend, sessions streaming live
- **yellow** — reconnecting (auto-retry with backoff, up to 8 attempts)
- **red** — offline / error — check the backend and your network

While the dot is yellow, any in-flight turn keeps running on the server.
The client will catch up on missed events as soon as the socket is back.

## Troubleshooting

**The iframe in the new right-panel browser doesn't load my cloud URL.**
Some sites send `X-Frame-Options: DENY` / `Content-Security-Policy:
frame-ancestors` headers that refuse embedding. For localhost dev servers
you control you can disable the header; for third-party sites you're out of
luck until we ship the Electron `<webview>` path for the desktop app.

**Fly deploys succeed but `fly ssh console` shows no `dist/` folder.**
The Dockerfile uses a multi-stage build; the runtime image only contains
the copied-forward monorepo. Confirm the image tag matches your last
`fly deploy` — if you ran `fly ssh console` against a stopped machine Fly
will start a fresh one which might be on an older image.

**"Reconnecting…" never turns green after a long disconnect.** The client
gives up after 8 attempts (~2 minutes). Refresh the page to start a new
connection cycle; the server-side session is still intact.
