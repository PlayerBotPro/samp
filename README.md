# Los Santos Role Play (LSRP)

open.mp server. Game logic is written in TypeScript under `resources/src`. Do not touch the `resources/dist` folder: it is generated automatically.

Full documentation: [docs/docs.md](docs/docs.md).

VPS deployment: [docs/deploy.md](docs/deploy.md). Pipeline: [deploy.yml](deploy.yml).

## Where to write code

```
resources/src/
  index.ts                 loads modules
  shared/                  server name, colors, MySQL, helpers
  modules/
    database/              MySQL connection
    auth/                  registration and login (dialogs)
    persist/               saving HP and money, gradual health drain
    spawn/                 class, regular spawn, hospital respawn after death
    hospital/              hospital interior, beds
    cityhall/              passport, invite
    miner/                 mine
    gps/ afk/ payday/ worldtime/ zones/
    hud/                   Los Santos RP textdraw logo
    session/               login / logout logs
    chat/                  local chat
    commands/              /help /mn /me /do /try /todo /b /s /w /stats /pass /hospital /gps /leaders /r
    admin/                 /alogin and admin commands
    org/                   organizations (army), gates
    mapping/               maps/*.txt
```

A new system = a new folder in `modules`, then import it in `src/index.ts`.

A new command = a file in `modules/commands` following the pattern of `me.ts` (`registerCommand`), then add `import "./name"` in `modules/commands/index.ts`.

Mapping: place `.txt` files with `CreateDynamicObject` / `CreateObject` in the `maps` folder at the server root and restart. Currently: `jail.txt`, `hospital.txt`, `mine.txt`, `army.txt`. Army gates are handled in code (`org/gates.ts`), so do not duplicate them in `army.txt`.

Regular chat range is 20 meters, `/w` whisper is 5 meters, `/s` shout is 60 meters. Chat messages and speech bubbles appear above the head. Distant players do not see them. Character limit is 128.

After death, the player respawns in a hospital at a random location from several available points. First login and without an organization uses `DEFAULT_SPAWN` in `modules/spawn/point.ts`. The interior is currently `0`.

At login, the logo **Los Santos RP** appears in the upper-right corner (`modules/hud/index.ts`).

`gamemodes/lsrp.amx` is a Pawn stub; the actual logic is in TypeScript.

The name in `shared/brand.ts` must match `config.json` (`name` and `game.mode`).

## Account

The nickname is taken from the SA-MP name: format `Name_Surname` (for example `John_Doe`).

- No account: rules (accept / decline) → email → password → repeat password → date of birth (`DD.MM.YYYY`, minimum age 16) → gender (male / female) → skin → confirmation. Declining the rules kicks the player. Rules text: `resources/src/modules/auth/rules.ts`.
- Existing account: password only. Three errors = kick.

The password is stored in the database as an scrypt hash, not in plain text. Gender is `users.gender` (`male` / `female`). Money is `users.money`, donation balance is `users.donate`, health is `users.health` (columns are added automatically if they do not exist). New characters start with 100 HP. On login, the health bar is restored from the database. Every 15 minutes, health decreases by 1 HP, but not below 20. After death in the hospital, health resets to 100. Saving: on exit, every 3 minutes, and at the hospital. Before login, the player is locked from spectating, chat, and commands.

The `users` table is created automatically on startup. The schema is also in `sql/schema.sql`.

## MySQL

Copy `.env.example` to `.env` and add the database connection details. On startup the server runs `SELECT 1`.

```powershell
copy .env.example .env
```

Driver: `mysql2` (pure JS, no Prisma). Do not run queries inside the game tick: login, character saving, inventory — use events instead.

## Commands

From the root folder `D:\OSPanel\home\samp\public`:

```powershell
npm run build      # build JS
npm run dev        # rebuild on every save
npm run typecheck  # type checking
npm start          # run omp-server.exe
```

After `build`, **restart the server**. There is no hot reload yet: close the server window → run `npm start` → connect to `127.0.0.1:7777`.

A convenient workflow: run `npm run dev` in one terminal and restart the server manually after edits.
