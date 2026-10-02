# Deploying LSRP to a server

How to move the server from local OSPanel to a VPS/dedicated machine: what is required, how to build the game mode, what to copy, and how to update it.

For local development, see [README.md](../README.md). For the game mode architecture, see [docs.md](docs.md).

The pipeline template is [deploy.yml](../deploy.yml) in the root (build, typecheck, SSH deployment).

The current tree is assembled for **Windows** (`omp-server.exe`, `*.dll`). Linux uses the same game-mode files but requires **Linux open.mp binaries**, not `.exe` files.

---

## What the server needs

| Requirement | Purpose |
|---|---|
| open.mp (for the server OS) | `omp-server` / `omp-server.exe`, `libnode`, `components/` |
| **Node.js 18+** | Build TS and run `npm ci` in `resources/` |
| **MySQL 8** | `users` table |
| UDP **7777** (and TCP 7777 when artwork is enabled) | SA-MP / open.mp client |
| `lsrp` database and a MySQL user **that is not passwordless root** | `.env` |

omp-node runs the already built `resources/dist/index.js`. The `.ts` sources are not needed in production if the game mode is built in advance.

`mysql2` and `@omp-node/core` are **not bundled** into JS (`packages=external`). The server must contain `resources/node_modules` after `npm ci`.

---

## Build the game mode

From the repository root (locally or on the server):

```powershell
cd resources
npm ci
cd ..
npm run typecheck
npm run build
```

The result is `resources/dist/index.js` (and `.map`). `dist/` is **not** in git: without `build`, the server starts an empty or stale game mode.

After every TS change, run `npm run build` again, then **restart** `omp-server`. There is no hot reload.

---

## What to copy to the server

### Required

```
config.json
bans.json                 (can be an empty [])
gamemodes/lsrp.amx
components/               (DLL/SO for the server OS)
maps/
sql/schema.sql            (reference; the table is also created automatically)
resources/omp-node.json
resources/package.json
resources/package-lock.json
resources/dist/           (after npm run build)
package.json              (start script; see Linux below)
```

Also copy open.mp binaries for the server OS: `omp-server.exe` + `libnode.dll` (Windows), or `omp-server` + `libnode.so` (Linux).

Create `.env` **on the server**; do not copy your local one.

### Do not copy

| Path | Reason |
|---|---|
| `.env` | Contains the database password for your machine |
| `.git/` | Not required to run the server |
| `log.txt`, `*.log` | Junk files |
| `resources/src/` | Not needed when you built `dist` locally |
| `resources/node_modules/` | Do not move them from Windows to Linux |
| root `node_modules/` | It does not exist / is not needed |

When deploying using `git pull` on the server, do not copy anything: clone the repository, build there, and install runtime dependencies.

---

## First server start

### 1. MySQL

```sql
CREATE DATABASE lsrp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lsrp'@'127.0.0.1' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL ON lsrp.* TO 'lsrp'@'127.0.0.1';
FLUSH PRIVILEGES;
```

The `users` table is created when the game mode starts. You may apply `sql/schema.sql` in advance.

### 2. `.env` in the server root (beside `omp-server`)

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=lsrp
MYSQL_PASSWORD=STRONG_PASSWORD
MYSQL_DATABASE=lsrp
```

If MySQL is on another host, use that host rather than `127.0.0.1`. The server-machine user must have connection permission.

### 3. Node dependencies (on the server)

```powershell
cd resources
npm ci --omit=dev
```

`--omit=dev` installs only `mysql2` and `@omp-node/core`. If you build the game mode **on this server**, run the full `npm ci` (esbuild and TypeScript are required).

Do not copy `node_modules` from Windows to Linux.

### 4. Production `config.json`

Before opening the server to players:

- Set your own `rcon.password` **before** enabling RCON; it is best to leave `enable` as `false`. Do not commit a real password.
- Set `network.public_addr` to the public IP or domain when behind NAT.
- Set `announce` to `true` only when the master list is needed.
- Set `password` when the server is private.
- Keep `name` / `game.mode` aligned with `resources/src/shared/brand.ts` (rebuild after changing the brand).

The port is `network.port` (7777 by default). Allow **UDP 7777** through the firewall. TCP 7777 is for artwork when `artwork.enable: true`.

### 5. Start

Windows (as locally):

```powershell
npm start
```

Or run `omp-server.exe` from the root.

On Linux, the binary is usually `./omp-server` (make it executable with `chmod +x`). The root `npm start` script targets `.exe`; run the binary directly on Linux.

The log should include `MySQL connected`, `users table ready`, and `LSRP ready`. Connect with `IP:7777` and the `Name_Surname` nickname.

---

## Updating an installed game mode

1. Stop `omp-server`.
2. Upload changed files (or run `git pull`).
3. Build if TypeScript changed:

   ```powershell
   npm run build
   ```

4. If `resources/package.json` or its lock file changed, run `cd resources && npm ci --omit=dev` again.
5. If maps changed, upload `maps/*.txt`.
6. Start the server.

Players must reconnect. In-memory sessions do not survive a restart; HP/money should already be in MySQL (logout and autosave every 3 minutes).

---

## Two practical scenarios

### A. Build locally, upload to the server

On your machine:

```powershell
npm run build
```

Upload `resources/dist/`, `maps/`, and `config.json` (carefully: do not overwrite production settings); upload `gamemodes/` if needed. Once on the server, run `cd resources && npm ci --omit=dev`. Restart.

You do not need to place `resources/src` in production.

### B. Git on the server (convenient for updates)

```bash
git clone <url> /opt/lsrp
cd /opt/lsrp
# Install Linux open.mp binaries in this directory if the repository contains only Windows files.
cd resources && npm ci && cd ..
npm run build
cd resources && npm ci --omit=dev && cd ..   # Full ci may be kept instead
cp .env.example .env                         # Enter the password
# Edit config.json
./omp-server                                 # Or omp-server.exe
```

---

## Windows Server (service)

To keep the server running after the RDP session ends, run `omp-server.exe` with NSSM / WinSW. Set **Working directory** to the project root (where `.env` and `maps/` are located).

Example NSSM configuration:

```text
Path:           D:\lsrp\omp-server.exe
Startup dir:    D:\lsrp
```

Do not start it from another folder: `.env` and `maps/` are read from `cwd`.

---

## Linux (systemd)

Create `/etc/systemd/system/lsrp.service` (adjust the directory path):

```ini
[Unit]
Description=LSRP open.mp
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/lsrp
ExecStart=/opt/lsrp/omp-server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lsrp
sudo journalctl -u lsrp -f
```

open.mp also writes its log to `log.txt` in the working directory.

---

## GitHub Actions (`deploy.yml`)

The file is in the root: [deploy.yml](../deploy.yml).

The workflow neither installs MySQL nor copies `.env` / `config.json`: configure these manually once. It builds the game mode, uploads `resources/dist` and `maps/`, then restarts the `lsrp` service when present.

Repository secrets: **Settings -> Secrets and variables -> Actions**:

| Secret | Example |
|---|---|
| `DEPLOY_HOST` | `203.0.113.10` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | Complete private key |
| `DEPLOY_PATH` | `/opt/lsrp` |

The SSH port in `deploy.yml` is currently **22**. For another port, edit `port:` in the file.

Start it with **Actions -> Deploy -> Run workflow**, or tag a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Without `DEPLOY_HOST`, the deployment job is skipped while the build still runs.

---

## Short checklist

- [ ] MySQL database, user, and password
- [ ] `.env` on the server, not from the local PC
- [ ] `npm run build` -> `resources/dist/index.js` exists
- [ ] Server `resources/node_modules` created by `npm ci --omit=dev` (do not copy from Windows to Linux)
- [ ] `gamemodes/lsrp.amx` and `components/` are present
- [ ] `config.json`: RCON, announce, public_addr
- [ ] Firewall allows UDP 7777
- [ ] Start from the **project root**
- [ ] Log contains MySQL and "LSRP ready"
- [ ] Connect using `Name_Surname`

---

## Frequent errors

| Symptom | Check |
|---|---|
| "Database unavailable" | `.env`, MySQL host, user, and that the server started from the root |
| Modules do not load / old code | Forgot `npm run build` or did not restart the process |
| `Cannot find package mysql2` | `resources/node_modules` is missing; run `npm ci --omit=dev` |
| Does not start on Linux | Windows `.exe` / `.dll` was uploaded; Linux open.mp binaries are required |
| Players cannot see the server | UDP 7777, `public_addr`, `announce` |
| Kick for nickname | Client nickname must be Latin `Name_Surname` |
