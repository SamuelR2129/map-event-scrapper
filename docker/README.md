# scraper-container

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

| Variable | Required | Description |
|---|---|---|
| `PROJECT` | no (baked into image as `newcastle`) | Playwright `--project` (city filter) |
| `GITHUB_TOKEN` | for healer auto-PR | GitHub token with `contents:write` + `pull_requests:write` scope |

## How it works

1. All scraper spec files run sequentially in a single VM: scrape → scrape → ... → map → send to DB
2. Scraper code is baked into the image at build time
3. Secrets (`OPENCODE_API_KEY`, etc.) are passed at runtime via `--env-file`
4. If a test fails, the healer (opencode agent) is invoked to fix it. It retries up to 3 times with backoff — each attempt: fix via opencode, then verify with `npx playwright test`. Only exits 0 if verification passes.
5. After all tests complete, if any were fixed, `commitAndPushAllChanges` creates a branch (`healer-auto-fix-<timestamp>`), commits, pushes, and opens a PR via `gh`. Requires git credentials in the container (SSH key mount or `GITHUB_TOKEN` in `.env`).
6. After completion, results are in the database

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
  with `--security-opt=no-new-privileges:true`.
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

| Layer | Size | Notes |
|---|---|---|
| Playwright base (Chromium + system deps) | ~2.7 GB | `mcr.microsoft.com/playwright:v1.61.1-noble` |
| `npm ci` — installed dependencies | ~137 MB | Baked into image, includes node_modules |
| Opencode CLI | ~178 MB | Linux ARM64 binary for test self-healing |
| Source code (excl. host node_modules) | ~2.1 MB | Via `.dockerignore` — host node_modules excluded |
| Seed data backups | ~1.8 MB | Copied at build, restored to tmpfs at runtime |

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

| Symptom | Cause |
|---|---|
| `Ripgrep JSON record exceeded 65536 bytes` | ripgrep can't write temp files, chokes on long lines |
| `locator.innerText: Unexpected token ""` | healer can't write the fix to read-only `src/scrappers` |
| `ENOENT: mkdir '/app/scraper/test-results'` | Playwright can't create output directory |
| `UnknownError` on healer start | opencode can't initialize its DB in read-only `~/.local/share/opencode` |
| `Failed to execute statement` | SQLite can't create WAL files |

**Fix:** Don't use `--read-only`. The container is ephemeral anyway — torn down after each run, so no lasting security benefit.
