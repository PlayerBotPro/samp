# LSRP documentation

**Los Santos Role Play.** An [open.mp](https://open.mp) game server whose logic is written in **TypeScript** through **omp-node**. Client: SA-MP 0.3.7 or open.mp. Local address: `127.0.0.1:7777`.

Quick start: [README.md](../README.md). Deployment: [deploy.md](deploy.md). Pipeline template: [deploy.yml](../deploy.yml) (currently commented out). This document covers architecture, modules, database, commands, configuration, and pre-release checks.

`npm run typecheck` passed without errors when this documentation was written.

Player-facing chat and dialog text uses **Russian UTF-8**. The DLL/component handles encoding for the 0.3.7 client.

## Startup

`npm start` from the root starts `omp-server.exe`. It reads `config.json` and raises two independent layers:

| Layer | Loads | Role |
|---|---|---|
| Pawn | `gamemodes/lsrp.amx` (`pawn.main_scripts`: `lsrp 1`) | Empty stub required by `Pawn.dll`; contains no logic. |
| Node | `resources/` -> `resources/omp-node.json` -> `dist/index.js` | The complete game mode. |

```
omp-server.exe
  |- Pawn.dll      -> gamemodes/lsrp.amx          (stub)
  +- omp-node      -> resources/omp-node.json
                       +- dist/index.js         (compiled TypeScript)
```

**AMX neither sees nor compiles TypeScript.** Build the game mode separately:

```powershell
npm run build
```

The server runs the compiled JS. After changes, run `npm run build` and **restart** `omp-server.exe`; there is no hot reload. During development, run `npm run dev` in one terminal and restart the server manually.

Ctrl+C can sometimes crash embedded Node in omp-node, which is a runtime characteristic. If the console hangs, close it and run `npm start` again. Cyrillic often appears garbled in the Windows console; `log.txt` contains normal text.

## Project tree

The repository root is the working directory of `omp-server.exe` (`process.cwd()`). It is where `.env`, `maps/`, and `config.json` are read.

```
omp-server.exe                 open.mp binary (Windows)
libnode.dll                    Node for omp-node
config.json                    server configuration (in git)
bans.json                      engine IP bans
.env / .env.example            MySQL (.env is in .gitignore)
deploy.yml                     GitHub Actions template (commented out)
docs/
  docs.md                      this documentation
  deploy.md                    VPS deployment
maps/
  jail.txt                     jail interior (in the sky)
  hospital_new.txt             hospital interior (lobby/service area)
  hospitalMap.txt              hospital exterior (street)
  army.txt                     army objects; gates are in code and must not be duplicated
sql/schema.sql                 reference users table
gamemodes/lsrp.amx             Pawn stub
resources/
  src/                         TypeScript sources
  dist/                        build output (gitignored)
```

**Do not delete:** `components/`, `omp-server.exe`, `libnode.dll`, `config.json`, `resources/`, `maps/`, `sql/`, `bans.json`, or `gamemodes/lsrp.amx`.

## Game-mode sources

Make all changes in `resources/src/`. A new system means a folder in `modules/`, an import, and an entry in the `src/index.ts` array.

```
resources/src/
  shared/
    database.ts                mysql2 pool; .env from cwd
    nearby.ts                  local chat; sanitizeChatText
    player.ts                  id, name, kickSamePlayer
  modules/
    persist/                   saves HP; money only from account.money
    auth/                      login, session, scrypt, migrations
    spawn/                     class, hospital after death, HQ on first spawn
    hospital/                  interior, beds, /hospital
    cityhall/                  passport, invite
    miner/                     mine
    payday/                    :00, exp, organization salary
    worldtime/                 real local time
    session/                   connect log (not auth/session)
    chat/                      IC chat and animation
    commands/                  game commands
    admin/                     /alogin and levels 1-7
    org/                       catalog, army, gates, appearance
```

Build: `esbuild`, ESM, `packages=external` (`mysql2` and `@omp-node/core` are not bundled). Target: ES2018.

## Module order

The order in `src/index.ts` **matters**. In particular, start **`persist` before `auth`** so disconnect saves first and then clears the session. open.mp events invoke every subscriber; registration order equals `start()` order.

## Modules

### Database and persistence

`.env` is read from the **server root**. The mysql2 pool uses `connectionLimit: 10`, `utf8mb4`, and `dateStrings: true`.

`queueSave` writes **HP from the health bar** and **money from the account in memory**, never `player.getMoney()`. The client money cache is aligned with the account on save, preventing trainer money from being saved. Economy modules (mine, payday) must call `patchAccount({ money })` before `giveMoney`.

Save immediately on exit, every 3 minutes for authorized players, and reduce HP by 1 every 15 minutes to a floor of 20 when not `hospitalized`. Damage enters memory immediately and is reconciled after 50 ms. A player in spectator mode/death does not write 0 HP to the database. `closeDatabase()` is not called on server stop.

### Authentication

The nickname comes only from the client: `Name_Surname`, 5-24 characters, `^[A-Z][a-z]+_[A-Z][a-z]+$`.

New accounts follow: rules -> email -> password (6-32) -> repeat -> birth date (16-80 years old) -> gender -> skin -> confirmation. Existing accounts require a password; three failures or dialog cancellation kick the player. Before login, the player spectates and cannot use chat or commands.

Passwords use `scrypt:salt:key`. The session is `Map<slot, Account>` and resets on **connect and disconnect** so a slot never inherits another account. After `await`, call `isSamePlayer`.

Dialog IDs are auth **1**, stats **2**, pass **3**, menu **4**, rules **5**, invite **6**, GPS **7**, mine **8-10**, alogin **11**, and makeleader **12**. Do not reuse them for new windows without checking.

### Spawn, HUD, and chat

There is one `Class`, team `255`. Death sends the player to a random hospital point, marks them `hospitalized`, and sets HP to 20. The first session spawn for organization members teleports to HQ; later spawns do not. F4 does not heal.

There is one global textdraw: `Los_Santos_RP` (shown as "Los Santos RP"), at 545, 4 with color `0x0099FFFF`, in `modules/hud/index.ts`.

IC chat range is **20 m**, restricted by VW and interior. Format: `Name_Surname[ID]: text`. Organization members receive the nametag color. `{` is removed from text; the limit is 128 characters. `game.use_chat_radius: false`.

### Maps, hospital, city hall, mine, payday, time, AFK

`maps/*.txt` uses CreateObject / CreateDynamicObject, materials, and text. Streamer VW/interior is **not** applied (world 0, draw distance 300). `army.txt` holds buildings; army gates are created in `org/gates.ts` and must not be duplicated in the txt file.

Hospital entry is from the street. Beds are available only to `hospitalized` players. Healing is +10 every 4.5 seconds while in bed range; standing stops treatment and leaving before treatment is prohibited.

City hall provides passports and one-time invites (`invited_by IS NULL`). The mine provides shifts, ore, and payment at the hiring point; GPS and the mine share one checkpoint. At `:00`, all online players get exp and organization salaries depend on rank; players without organizations and AFK players are not paid (no `playerUpdate` for about 8 seconds or prolonged idle). Server time is local `Date`, updated every minute and on connect/spawn. AFK handles client pause and idleness.

## Database

Driver: `mysql2`, placeholders: `?`. Reference schema: `sql/schema.sql`. The table and missing columns are created at startup by `ensureUsersTable`.

| Column | Meaning |
|---|---|
| `name` | Client nickname, UNIQUE |
| `email` | Lowercase, UNIQUE |
| `skin` | Civilian skin |
| `money` | Cash; new character starts with **500** |
| `donate` | Account balance; no system yet |
| `health` | HP; new character starts with **100** |
| `passport` | City hall status |
| `hospitalized` | Player must use a bed |
| `invited_by` | Nickname of inviter |
| `admin_password_hash` | scrypt; NULL means set it through `/alogin` or after `/makeadmin` |
| `org_id` / `org_rank` | 0 = civilian; ranks 1-10 |

Create the `lsrp` database in advance. On a VPS, use a dedicated user rather than passwordless `root`.

## Event flows

```
playerConnect
  -> reset auth/admin/spawn/hospital slot
  -> HUD after 250 ms
  -> beginAuth after 500 ms
playerSpawn (first)
  -> wallet/HP from account; organization HQ when applicable
playerDeath
  -> next playerSpawn at hospital; message about /hospital
playerDisconnect
  -> save, then clear state
```

## Player commands

Ranges: chat, `/me`, `/do`, `/try`, `/todo`, `/b`, and `/r` bubble are **20 m**; `/s` is **60 m**; `/w` is **5 m**.

| Command | Behavior |
|---|---|
| `/help` | List of game commands |
| `/mn` | Menu |
| `/b` | Nearby OOC; after `/alogin`: `Administrator` |
| `/s` `/w` | Shout / whisper, with `[ID]` in the line |
| `/stats` | Character dialog, including email |
| `/pass` | Show passport nearby |
| `/hospital` | Occupy a bed |
| `/gps` | Markers |
| `/leaders` | Online leaders (rank 10) |
| `/r` | Organization radio |

Unknown commands show a message. Before login, they remain silent.

## Administration

Database permissions are in `admin_level`. Commands work only after **`/alogin`** and when the level is sufficient. Otherwise they are silent, like an unknown admin command. `/ahelp` lists commands only up to the user's level.

Clicking the map teleports any `/alogin` administrator, including their driven vehicle.

| Level | Commands |
|---|---|
| 1 | `/a`, `/ahelp`, `/admins`, `/slap [id]`, map teleport |
| 2 | `/kick [id] [reason]`; everyone sees the kick; self-kick is allowed |
| 3 | `/ao [text]` to all as `Administrator Name[ID]:` |
| 4 | `/sethp [id] [0-100]`; cannot target another active `/alogin` admin; `/ban [id] [days] [reason]`; `/unban [Nick_Name]`; `/tpint [id]` |
| 5 | `/makeleader [id]`; organization list or remove; passport required; rank 10; no teleport |
| 7 | `/makeadmin [id] [0-7]`; resets the admin password, which the target sets in a dialog; **not self** |

`/makeadmin 0` removes administration. Granting it again resets the password again.

## Organizations

Catalog: `modules/org/catalog.ts`. Currently **army id 1** (`army.ts`): color `0x9c7a4bff`, HQ spawn, 10 ranks/skins/salaries (1500...9000).

Two gate objects (19912) open with C on foot or the vehicle horn for **Army, State Police, LSPD, and FBI**; they auto-close after about 5 seconds. Ranks 1-9 can only be set by editing the database; the game has no command other than leader management.

## open.mp configuration

| Key | Purpose |
|---|---|
| `name` / `game.mode` | Must match `shared/brand.ts` |
| `rcon.enable` | Leave `false`; set a password **before** enabling and do not commit it |
| `announce` | Master list; use `false` or `password` for private tests |

`bans.json` contains only engine IP bans. Account bans use `users.banned_until` (**DATETIME** ban end, not a day count) and `users.ban_reason`.

## Build and run

```powershell
npm run typecheck
npm run build
npm start
```

Connect at `127.0.0.1:7777` with `Name_Surname`. Restart after `build`. `dist/` is not in git. For production, see [deploy.md](deploy.md).

## Where to change things

| Task | File |
|---|---|
| Spawn / hospital points | `modules/spawn/point.ts` |
| HP and save intervals | `modules/auth/session.ts`, `persist` |
| Login | `modules/auth/flow.ts` |
| Rules | `modules/auth/rules.ts` |
| Logo | `modules/hud/index.ts` |
| Game command | `modules/commands/*.ts` + `index.ts` |
| Admin command | `modules/admin/*.ts` + `catalog.ts` + `admin/index.ts` |
| Organization | New file + `org/catalog.ts` |
| Map | `maps/*.txt` |
| Name | `brand.ts` + `config.json` |
| Schema | `sql/schema.sql` + `auth/repository.ts` |

## Project verification

Reviewed: `resources/src`, `config.json`, `sql/schema.sql`, `.gitignore`, and deployment documentation. TypeScript is strict and typecheck is clean.

### Correct behavior

- SQL uses `?`; nick/email SQL injection is prevented.
- Player and administrator passwords use scrypt and are not logged.
- Commands and chat are unavailable before login.
- Admin commands require `/alogin` and a sufficient level.
- The account session resets on connect.
- A delayed kick checks the slot and nickname, so it does not kick a new player on the same ID.
- Database money never comes from the client.
- A bed heals only a `hospitalized` player lying within range.
- `{` is removed from IC/OOC/RP/admin chat.
- `.env` and `dist/` are not in git.

### Fixed before deployment

- Saving money from `getMoney()` (cheat) was replaced with `account.money` only.
- Fixed session inheritance on a slot at connect.
- Fixed kicking the wrong slot after 120 ms.
- Fixed healing from a bed while outside.
- Fixed chat color codes.
- Removed a test Sultan near the station.
- Removed hardcoded RCON password `changeme1` from `config.json` (RCON is disabled and the password is empty; set one if enabling it).

### Remaining limitations

- No chat/command flood protection.
- A level-2 `/kick` can kick anyone, including level 7.
- `/alogin`: three errors cause a kick; after reconnecting, three attempts are available again (per process, by `account.id`).
- Player passwords have a 6-character minimum with no complexity policy.
- Maps have no VW/interior; `setSpawnInfo` does not set them (hospital uses `placeAt`).
- `/stats` shows the user's own email; money uses account memory, which is correct after the save fix.
- Multiple leaders for one organization are possible because `/makeleader` does not remove the previous leader.
- Organization ranks 1-9 cannot be granted in game.
- Payday treats no update for about 8 seconds from a minimized client as AFK.
- A `users` migration error is logged but the server still starts.
- MySQL intervals and pool are not cleared on `resourceStop`.
- The registration password remains in `Pending` memory until confirmation.
- The first `/alogin` without a hash sets an admin password as intended after `/makeadmin`; this is dangerous if `admin_level` is set manually through SQL.
- `announce: true` can list the server publicly.

### Not implemented

Vehicles as a system, houses, inventory, `/pm`, `/report`, removal/promotion of ranks 1-9, and hot reload.

### Conclusion

The code does not allow bypassing login, running an admin command without `/alogin`, or injecting SQL through a normal client. Trainer money no longer reaches the database. Before opening publicly: set your own RCON password if needed, add a login password or disable `announce`, add flood protection, and keep `.env` private.
