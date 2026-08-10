# scraper-container

> **HTML version:** open [README.html](README.html) (`open README.html` opens it in your default browser)

Runs all Playwright scrapers sequentially in a container using [Orbstack](https://orbstack.dev) (Docker-compatible runtime on Mac).

Scraped data is sent directly to a production DB via API. No filesystem bridge between host and container.

## Prerequisites

- [Orbstack](https://orbstack.dev) (or Docker CLI)

## Build

```bash
# From map-event-scrapper/
docker build -f docker/Dockerfile -t scraper-container .
```

## Run

```bash
docker run --rm --init \
  --env-file .env \
  --cap-drop=ALL \
  --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
  --cap-add SETUID --cap-add SETGID --cap-add SETPCAP --cap-add NET_BIND_SERVICE \
  --security-opt=no-new-privileges:true \
  --pids-limit=256 \
  --tmpfs /tmp:size=1g \
  --tmpfs /app/scraper/src/eventFiles:uid=1000,gid=1000 \
  --tmpfs /app/scraper/test-results:uid=1000,gid=1000 \
  --tmpfs /app/scraper/playwright-report:uid=1000,gid=1000 \
  --tmpfs /app/scraper/logs:uid=1000,gid=1000 \
  scraper-container
```

The above flags are the hardened baseline (see [Security](#security)). If chromium in an
unrelated host environment stops launching, drop `--cap-drop=ALL` for that run.

## Environment variables

| Variable       | Required                             | Description                                                      |
| -------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `PROJECT`      | no (baked into image as `newcastle`) | Playwright `--project` (city filter)                             |
| `GITHUB_TOKEN` | for healer auto-PR                   | GitHub token with `contents:write` + `pull_requests:write` scope |

## How it works

1. All scraper spec files run sequentially in a single VM: scrape → scrape → ... → map → send to DB
2. Scraper code is baked into the image at build time
3. Secrets (`OPENCODE_API_KEY`, etc.) are passed at runtime via `--env-file`
4. If a test fails, the healer (opencode agent) is invoked to fix it. It retries up to 3 times with backoff — each attempt: fix via opencode, then verify with `npx playwright test`. Only exits 0 if verification passes.
5. After all tests complete, if any were fixed, `commitAndPushAllChanges` creates a branch (`healer-auto-fix-<timestamp>`), commits, pushes, and opens a PR via `gh`. Requires git credentials in the container (SSH key mount or `GITHUB_TOKEN` in `.env`).
6. After completion, results are in the database

## Why event files and scrappers are seeded twice (Dockerfile + entrypoint)

Both `src/eventFiles` and `src/scrappers` are copied into separate seed
directories at **build time**, then copied back into place at **runtime** by the
entrypoint. This is intentional — the working paths cannot be trusted from the
image layer:

### `src/eventFiles` — masked by tmpfs

The run command mounts `--tmpfs /app/scraper/src/eventFiles:uid=1000,gid=1000`.
A tmpfs mount **starts empty and hides the image layer** at that path, so the
data baked into the image at `src/eventFiles` is invisible at runtime. The seed
copy at `/app/seed/eventFiles` (Dockerfile) lives at a *non-masked* path, and
the entrypoint restores it before `npm run map` and `send-to-db` run. Without
this, the scrapers would run against an empty directory.

### `src/scrappers` — mutated by the healer

The healer edits the spec files at runtime to fix failing tests, and the git
reporter then pushes everything with `git add -A` up to a
`healer-auto-fix-<timestamp>` PR branch. Seeding `/app/seed-scrappers` at every
run's startup guarantees the scrapers are back to the exact baked/committed
versions before the next run, so:

- the test run (and the healer's verification) always exercises the pristine committed code, and
- any diff pushed to the PR branch contains *only* what the healer changed, not debris from previous runs.

### Why both Dockerfile and entrypoint copy

- **Dockerfile copy** → snapshots state into a separate, non-masked, read-only location at build time (`/app/seed` and `/app/seed-scrappers`).
- **Entrypoint copy** → restores from that safe location into the writable/masked working directories, just before use.

This makes each run hermetic: same baseline every time, regardless of tmpfs
mounts or mutations, even if a container is kept alive across multiple
entrypoint invocations.

## Playwright MCP server (opencode)

The `playwright-test` MCP server gives opencode agents live browser control for
scraper planning, generation, and healing. It is configured in `opencode.json`:

```json
{
  "mcp": {
    "playwright-test": {
      "type": "local",
      "command": ["npx", "playwright", "run-test-mcp-server"],
      "enabled": true
    }
  }
}
```

### How it launches

- **Local stdio server.** On opencode startup, the config above spawns
  `npx playwright run-test-mcp-server` as a child process. It must be launchable
  from the project root (i.e. `playwright` installed via `npm ci` and
  `npx` on `PATH`). The server exposes ~30 tools (`browser_navigate`,
  `browser_snapshot`, `browser_click`, `generator_write_test`,
  `planner_save_plan`, ...) to opencode.
- **Namespacing.** Every MCP tool is exposed as `playwright-test/<toolName>`;
  agent configs match them with glob patterns like `"playwright-test*browser_click"`.
- **Main agents get none of them.** The top-level `"tools": { "playwright*": false }`
  disables all Playwright tools for the main build/plan agents.
- **Subagents get allowlists.** Each `playwright-test-*` agent re-enables its own
  subset of tools:

## Security

The container is intentionally ephemeral (removed after each run) and needs
unrestricted outbound internet to scrape gig listings, so egress itself is not
firewalled. Hardening focuses on limiting what an attacker gains inside the
container and what leaks out:

- **No secrets in the image.** `.env` is excluded via `.dockerignore` and must
  never be baked in; secrets reach the container only through `--env-file` at runtime.
- **Non-root runtime (`USER node`).** The scraper, playwright, xvfb, and the
  healer all run as a dedicated non-root user with a writable home
  (`/home/node`) for node/git/opencode state.
- **Dropped capabilities.** `--cap-drop=ALL` plus a minimal allow-list
  (`CHOWN,DAC_OVERRIDE,FOWNER,SETUID,SETGID,SETPCAP,NET_BIND_SERVICE`), combined
  with `--security-opt=no-new-privileges:true`. What each retained capability
  actually grants (all Linux capability(7) scoped to the container's namespace):
  - `CHOWN` — allow changing file ownership (`chown`); needed by npm/node when
    fixing ownership of install artifacts written by root.
  - `DAC_OVERRIDE` — bypass file read/write/execute permission checks; the
    container's entrypoint and tmpfs re-owners rely on it to write where the
    image stored files as root. Effectively lets the non-root user ignore
    `DAC` (discretionary access control) permissions.
  - `FOWNER` — bypass permission checks on operations normally requiring the
    file's owner (e.g. `chmod` on root-owned files), used during setup scripts.
  - `SETUID` / `SETGID` — allow changing the effective UID/GID of processes
    and setting setuid/setgid bits; needed to drop from root to the `node`
    user and for git's ssh helpers.
  - `SETPCAP` — let the entrypoint modify its *own* capability sets (add/remove
    capabilities on itself), required to drop further capabilities after
    starting with the allow-list.
  - `NET_BIND_SERVICE` — bind to low ports (<1024); kept so the server can bind
    privileged ports if ever needed, harmless for scraping.

  Everything else — `NET_RAW` (raw/packet sockets), `SYS_ADMIN` (mounts,
  namespaces), `SYS_PTRACE`, `SYS_MODULE`, `DAC_READ_SEARCH`, etc. — is dropped,
  so a compromised scraper process cannot load kernel modules, attach ptrace,
  create raw sockets for network sniffing, or reconfigure namespaces.
- **Chromium runs `--no-sandbox`.** The container lacks `SYS_ADMIN`/userns, which
  breaks Chromium's setuid sandbox; Playwright is configured with
  `--no-sandbox --disable-setuid-sandbox` as an explicit trade-off.
- **Process limit.** `--pids-limit=256` constrains browser/child-process fan-out.
- **Ephemeral writes.** writable dirs (`/tmp`, `src/eventFiles`, `test-results`,
  `playwright-report`, `logs`) are tmpfs-backed, so no host state persists. The
  tmpfs mounts are created `uid=1000,gid=1000` so the non-root `node` user (also
  uid/gid 1000 in the image) can write to them. `1000` is the uid/gid that the
  official Node Docker base image assigns to the `node` user (the first non-root
  user in Linux, hence the conventional `1000`). A tmpfs mount starts owned by
  root, so `--tmpfs ...:uid=1000,gid=1000` re-owns it to `node` at mount time;
  without this the container — which runs as `USER node` — would get
  `EACCES`/`ENOENT` writing to those directories.
- **Egress hardening.** An attacker-influenced URL is blocked at the app layer
  (`src/helpers/ssrf.ts`: rejects private/loopback/link-local IPs, `host.docker.internal`
  and friends, plus DNS-rebinding-style internal resolutions) before any `page.goto`.
  For stronger isolation, run the container through an outbound allowlist proxy
  by setting `HTTPS_PROXY`/`HTTP_PROXY` in `.env` (also wired via `--env-file`).

For runtime egress allowlisting the container already reaches: the scraper target
domains, `bandcamp.com`, `api.github.com`, the Google AI/Maps/Places API hosts and
`PRODUCTION_DB_URL`.

## Image size

The built image is ~4.2 GB. Breakdown by layer:

| Layer                                    | Size    | Notes                                            |
| ---------------------------------------- | ------- | ------------------------------------------------ |
| Playwright base (Chromium + system deps) | ~2.7 GB | `mcr.microsoft.com/playwright:v1.61.1-noble`     |
| `npm ci` — installed dependencies        | ~137 MB | Baked into image, includes node_modules          |
| Opencode CLI                             | ~178 MB | Linux ARM64 binary for test self-healing         |
| Source code (excl. host node_modules)    | ~2.1 MB | Via `.dockerignore` — host node_modules excluded |
| Seed data backups                        | ~1.8 MB | Copied at build, restored to tmpfs at runtime    |

**Why not smaller?** The Playwright base image ships Chromium, Firefox, and WebKit
(~1.2 GB of browser binaries). This is the standard trade-off for a
zero-download-at-runtime sandbox.

### Ripgrep config

The image and entrypoint create `~/.config/ripgrep/config` (in the node user's `$HOME`) with `--max-columns=10000`. This prevents ripgrep's JSON output from exceeding its 65536-byte internal buffer when searching files with very long lines (e.g., minified HTML, WebFetch output).

## Troubleshooting

### Healer fails with `UnknownError`

If the healer crashes immediately with `"UnknownError"` and `"Unexpected server error"`, the model ID in `opencode.json` is likely invalid. OpenCode Zen model IDs use the format `deepseek-v4-flash-free`, not `deepseek/deepseek-v4-flash-free`. The slash prefix causes the server to fail before the agent can start.

### `--read-only` causes cascading failures

Running with `--read-only` breaks the healer and many tools. Specific symptoms:

| Symptom                                     | Cause                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `Ripgrep JSON record exceeded 65536 bytes`  | ripgrep can't write temp files, chokes on long lines                    |
| `locator.innerText: Unexpected token ""`    | healer can't write the fix to read-only `src/scrappers`                 |
| `ENOENT: mkdir '/app/scraper/test-results'` | Playwright can't create output directory                                |
| `UnknownError` on healer start              | opencode can't initialize its DB in read-only `~/.local/share/opencode` |
| `Failed to execute statement`               | SQLite can't create WAL files                                           |

**Fix:** Don't use `--read-only`. The container is ephemeral anyway — torn down after each run, so no lasting security benefit.
