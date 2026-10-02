# Deploying LSRP to a Server

How to move the server from a local OSPanel setup to a VPS or dedicated machine: what is required, how to build the mod, what to copy, and how to update it.

Local development: [README.md](../README.md). Mod architecture: [docs.md](docs.md).

Pipeline: [deploy.yml](../deploy.yml) in the project root (build, typecheck, deployment over SSH).

The project tree is currently configured for **Windows** (`omp-server.exe`, `*.dll`). On Linux, the same mod files are used, but the open.mp binaries must be the **Linux builds**, not `.exe` files.

---

## What must be on the server

| Required | Purpose |
|---|---|
| open.mp (for the server OS) | `omp-server` / `omp-server.exe`, `libnode`, `components/` folder |
| **Node.js 18+** | building TypeScript and running `npm ci` in `resources/` |
| **MySQL 8** | `users` table |
| UDP **7777** (and TCP 7777 if artwork is enabled) | SA-MP / open.mp client |
| Database `lsrp` and a MySQL user that is **not root and does not use a blank password** | `.env` |

`omp-node` runs the already built `resources/dist/index.js`. The `.ts` source files are not needed on production if you build them beforehand.

`mysql2` and `@omp-node/core` are **not bundled** into the JavaScript (`packages=external`). The server must have `resources/node_modules` after running `npm ci`.

---

## Building the mod

From the repository root (locally or on the server):

```powershell
cd resources
npm ci
cd ..
npm run typecheck
npm run build
```

Result: `resources/dist/index.js` (and `.map`). The `dist/` folder is **not stored in git** — without a build, the server will run an empty or stale mod.

After any TypeScript change: run `npm run build` again, then **restart** `omp-server`. There is no hot reload.

---

## What to copy to the server

### Required

```
config.json
bans.json                 (can be empty [])
gamemodes/lsrp.amx
components/               (DLL/SO for the server OS)
maps/
sql/schema.sql            (reference copy; table is also created automatically)
resources/omp-node.json
resources/package.json
resources/package-lock.json
resources/dist/           (after npm run build)
package.json              (start script; see Linux notes below)
```

Also copy the open.mp binaries for the target OS: `omp-server.exe` + `libnode.dll` (Windows) or `omp-server` + `libnode.so` (Linux).

Create `.env` **on the server**, do not copy your local one.

### Do not copy

| Path | Why |
|---|---|
| `.env` | contains your database password |
| `.git/` | not needed for runtime |
| `log.txt`, `*.log` | unnecessary noise |
| `resources/src/` | not needed if you built `dist` locally |
| `resources/node_modules/` | do not move from Windows to Linux |
| `node_modules/` in the root | it does not exist / is not needed |

If deploying via `git pull` on the server, you do not need to copy anything manually: clone the repo, build there, and install runtime dependencies.

---

## First launch on the server

### 1. MySQL

```sql
CREATE DATABASE lsrp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lsrp'@'127.0.0.1' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL ON lsrp.* TO 'lsrp'@'127.0.0.1';
FLUSH PRIVILEGES;
```

The `users` table is created when the mod starts. You can also apply the schema in advance from `sql/schema.sql`.

### 2. `.env` at the server root (next to `omp-server`)

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=lsrp
MYSQL_PASSWORD=STRONG_PASSWORD
MYSQL_DATABASE=lsrp
```

If MySQL is on another host, write that host instead of `127.0.0.1`. The MySQL user must be allowed to connect from the server machine.

### 3. Node dependencies on the server

```powershell
cd resources
npm ci --omit=dev
```

`--omit=dev` installs only `mysql2` and `@omp-node/core`. If you build the mod **on the same server**, use a full `npm ci` because `esbuild` and `typescript` are needed.

Do not copy `node_modules` from Windows to Linux.

### 4. `config.json` in production

Before opening the server to players:

- `rcon.password` — set your own **before** enabling RCON; it is better to leave `enable` as `false`. Do not commit the real password.
- `network.public_addr` — use a public IP or domain if behind NAT
- `announce` — set to `true` only if you want the server listed in the master server list
- `password` — set a server password if it is closed
- `name` / `game.mode` — must match `resources/src/shared/brand.ts` (after changing the brand, rebuild)

Port: `network.port` (default is 7777). In the firewall: **UDP 7777**. TCP 7777 is for artwork if `artwork.enable: true`.

### 5. Start

Windows (same as local):

```powershell
npm start
```

or run `omp-server.exe` from the project root.

Linux: the binary is usually `./omp-server` (set executable permissions with `chmod +x`). The root `npm start` script is designed for `.exe`, so on Linux run the binary directly.

The log should include `MySQL connected`, `users table ready`, and `LSRP ready`. The client should connect to `IP:7777` with the nickname `Name_Surname`.

---

## Updating the mod (already deployed)

1. Stop `omp-server`.
2. Upload the new files (or run `git pull`).
3. Rebuild if TypeScript changed:

   ```powershell
   npm run build
   ```

4. If `resources/package.json` or the lock file changed, run `cd resources && npm ci --omit=dev` again.
5. If maps changed, upload `maps/*.txt`.
6. Start the server again.

Players need to reconnect. In-memory sessions do not survive a restart; HP and money should already be stored in MySQL (save on exit and every 3 minutes).

---

## Two common deployment scenarios

### A. Build locally, upload to the server

On your machine:

```powershell
npm run build
```

On the server: upload `resources/dist/`, `maps/`, `config.json` (be careful not to overwrite production settings), and `gamemodes/` if necessary. On the server, once: `cd resources && npm ci --omit=dev`. Then restart.

You do not need to upload `resources/src` to production.

### B. Git on the server (good for updates)

```bash
git clone <url> /opt/lsrp
cd /opt/lsrp
# put the Linux open.mp binaries in this directory if the repo only contains Windows binaries
cd resources && npm ci && cd ..
npm run build
cd resources && npm ci --omit=dev && cd ..   # full ci is also acceptable
cp .env.example .env                         # set the password
# edit config.json
./omp-server                                 # or omp-server.exe
```

---

## Windows Server (service)

To prevent the server from stopping when the RDP session ends, wrap `omp-server.exe` in NSSM or WinSW, with **Working directory** set to the project root (where `.env` and `maps/` are stored).

Example NSSM:

```text
Path:           D:\lsrp\omp-server.exe
Startup dir:    D:\lsrp
```

Do not launch it from another folder: `.env` and `maps/` are read from the current working directory.

---

## Linux (systemd)

File: `/etc/systemd/system/lsrp.service` (replace the directory path as needed):

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

The open.mp log is also written to `log.txt` in the working directory.

---

## GitHub Actions (`deploy.yml`)

The file is at the project root: [deploy.yml](../deploy.yml).

It does not set up MySQL or copy `.env` / `config.json`; those are done manually once as described above. The pipeline builds the mod and uploads `resources/dist` and `maps/`, then restarts the `lsrp` service if it exists.

Secrets: repository → **Settings → Secrets and variables → Actions**:

| Secret | Example |
|---|---|
| `DEPLOY_HOST` | `203.0.113.10` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | full private key |
| `DEPLOY_PATH` | `/opt/lsrp` |

SSH port in `deploy.yml` is currently **22**. If you use another port, update `port:` in the file.

Run it: **Actions → Deploy → Run workflow**, or with a tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Without `DEPLOY_HOST`, the deploy job is skipped, but the build still runs.

---

## Short checklist

- [ ] MySQL: database, user, and password
- [ ] `.env` on the server, not from your home PC
- [ ] `npm run build` → `resources/dist/index.js` exists
- [ ] on the server, `resources/node_modules` installed with `npm ci --omit=dev` (do not copy from Windows to Linux)
- [ ] `gamemodes/lsrp.amx` and `components/` are present
- [ ] `config.json`: RCON, announce, public_addr
- [ ] firewall allows UDP 7777
- [ ] start from the **project root**
- [ ] log contains MySQL and `LSRP ready`
- [ ] player connects with nickname `Name_Surname`

---

## Common errors

| Symptom | Check |
|---|---|
| "Database unavailable" | `.env`, MySQL host, user, and whether the server was started from the project root |
| Modules do not load / old code is running | forgot to run `npm run build` or restart the process |
| `Cannot find package mysql2` | no `resources/node_modules`; run `npm ci --omit=dev` |
| Won't start on Linux | Windows `.exe` / `.dll` was uploaded; Linux binaries for open.mp are required |
| Players cannot see the server | UDP 7777, `public_addr`, `announce` |
| Nickname kick | the client nickname must be `Name_Surname` in Latin characters |
