# Los Santos Role Play (LSRP)

open.mp server. Game code is TypeScript in `resources/src`. Do not modify `resources/dist`: it is generated automatically.

Full documentation: [docs/docs.md](docs/docs.md).

VPS deployment: [docs/deploy.md](docs/deploy.md). Pipeline: [deploy.yml](deploy.yml).

## Where to write code

```
resources/src/
  index.ts                 imports modules
  shared/                  server name, colors, MySQL, helpers
  modules/
    database/              MySQL connection
    auth/                  registration and authorization (dialogs)
    persist/               saves HP and money; gradual health loss
    spawn/                 class, normal spawn, hospital after death
    hospital/              hospital interior and beds
    cityhall/              passport and invitation
    miner/                 mine
    gps/ afk/ payday/ worldtime/ zones/
    hud/                   "Los Santos RP" textdraw logo
    session/               login/logout log
    chat/                  local chat
    commands/              /help /mn /me /do /try /todo /b /s /w /stats /pass /hospital /gps /leaders /r
    admin/                 /alogin and admin commands
    org/                   organizations (army), gates
    mapping/               maps/*.txt
```

A new system is a new folder in `modules`, then an import in `src/index.ts`.

A new command is a file in `modules/commands` following `me.ts` (`registerCommand`), then `import "./name"` in `modules/commands/index.ts`.

Mapping: place a `.txt` with `CreateDynamicObject` / `CreateObject` in the `maps` folder at the server root and restart. Current maps: `jail.txt`, `hospital.txt`, `mine.txt`, `army.txt`. Army gates are in code (`org/gates.ts`); do not duplicate them in `army.txt`.

Normal chat is 20 m, `/w` whisper is 5 m, and `/s` shout is 60 m. Messages appear in chat and as a bubble above the speaker's head. Distant players cannot see them. The limit is 128 characters.

After death, a player respawns in one hospital at a random point. The first login and players without an organization use `DEFAULT_SPAWN` in `modules/spawn/point.ts`. The interior is currently `0`.

On login, the **Los Santos RP** logo appears in the upper-right corner (`modules/hud/index.ts`).

`gamemodes/lsrp.amx` is a Pawn stub; the logic is in TS.

The name in `shared/brand.ts` must match `config.json` (`name` and `game.mode`).

## Account

The nickname comes from the SA-MP name and must use `Name_Surname` format (for example, `John_Doe`).

- No account: rules (accept / decline) → email → password → repeat password → date of birth (`DD.MM.YYYY`, at least 16 years old) → gender (male / female) → skin → confirmation. Declining the rules results in a kick. Rules text: `resources/src/modules/auth/rules.ts`.
- Existing account: password only. Three failed attempts result in a kick.

Passwords are stored in the database as scrypt hashes, not plaintext. Gender is `users.gender` (`male` / `female`). Money is `users.money`, donation balance is `users.donate`, and health is `users.health` (the columns are added automatically if absent). A new character starts with 100 HP. Health is restored from the database on login. Every 15 minutes, HP decreases by 1 but never below 20. After death, it returns to 100 in hospital. Saving occurs on logout, every 3 minutes, and on entering hospital. Before login, the player is spectating and chat and commands are unavailable.

The `users` table is created automatically at startup. Its schema is also in `sql/schema.sql`.

## MySQL

Copy `.env.example` to `.env` and enter database credentials. The server runs `SELECT 1` at startup.

```powershell
copy .env.example .env
```

The driver is `mysql2` (plain JS, no Prisma). Do not run queries in the game tick: run login, character saving, and inventory queries on events.

## Commands

From the `D:\OSPanel\home\samp\public` root:

```powershell
npm run build      # build JS
npm run dev        # build on every save
npm run typecheck  # check types
npm start          # start omp-server.exe
```

After `build`, **restart the server**. There is no hot reload yet: close the server window → `npm start` → connect to `127.0.0.1:7777`.

Convenient workflow: run `npm run dev` in one terminal and restart the server manually after changes.
