# LSRP — Version 2

This document describes additions after [docs.md](docs.md): the baseline covers login, hospital, city hall, mine, the Army, and admin levels 1–7 with `/alogin`. Player-facing text is Russian (UTF-8).

## Startup

Added modules: `vehicles`, `bank`, and `prison`; safe zones are in `zones`, and the speedometer is `hud/speedo.ts`. In `src/index.ts`, start `database`, `persist`, `auth`, `spawn`, and `mapping`; then gameplay modules through `zones`; then `hud`, `session`, `chat`, and `commands`; then `admin`, `org`, and `autoschool`; start `vehicles` last, after organizations and gates.

```
resources/src/modules/
  vehicles/     spawn, engine, lights, limiter, organization vehicles
  bank/         interior, tellers, transfers
  prison/       map icon and service entrance
  hud/speedo.ts driver HUD
  zones/        closed zones, safe zones, gang zones, captures
```

GPS adds LS Railway Station, Jail, Bank, County Police, LSPD, FBI, Driving School, LCN, Yakuza, Russian Mafia, Grove Street, Ballas, Vagos, Rifa, and Aztecas. In `/mn`, **Contact administration** opens the report dialog.

## Database and world

`sql/schema.sql` plus migrations in `auth/repository.ts` are authoritative.

| Column | Meaning |
|---|---|
| `bank` | INT bank account, default 0 |
| `lawfulness` | SMALLINT −100…100, new characters start at 100 |
| `muted_until` | INT UNSIGNED NULL Unix seconds; NULL means no mute |
| `jail_seconds` | INT UNSIGNED remaining sentence; counts down only while online |
| `license_car`, `license_moto`, `license_fly`, `license_boat`, `license_gun` | TINYINT license flags |
| `banned_until` | DATETIME NULL ban end, not a duration |
| `ban_reason` | VARCHAR(128) NULL ban reason |

Runtime account fields: `bank`, `lawfulness`, `mutedUntil` (ms), `jailSeconds`, and `licenses`. `gang_zones` holds the 104 map-cell rectangles and their `org_id`; reseeding does not overwrite capture ownership.

Civilian spawn: `1760.25, -1898.83, 13.56` (`spawn/point.ts`). The station heart pickup heals to 100 HP. Worlds: street 0, hospital 1, bank 2, jail 3, jail yard 4.

## Vehicles and HUD

Create vehicles only with `createServerVehicle`; engine and lights start off in street world. Eleven Faggio (462) scooters (color 191) spawn beside the station and respawn in 100 seconds; no license is required.

Drivers require `license_car` for cars, `license_moto` for motorcycles except Faggio, Pizzaboy, and bicycles, and `license_fly` for helicopters and planes. Passengers do not need licenses. Driving-school exam students may use the school Premier/Wayfarer; see `vehicles/drive-license.ts`.

`Vehicle.useManualEngineAndLights()` disables automatic starting. The driver toggles the engine with Left Ctrl (`KEY_ACTION = 1`) and lights with left mouse button (`KEY_FIRE = 4`); sound 4604 plays only for the driver. Respawn stops the engine and disables lights. A Hunter both fires and toggles lights on left mouse button.

`/limit` applies to a vehicle rather than a player:

| Command | Effect |
|---|---|
| `/limit` | show current limit or hint |
| `/limit [10–200]` | set this vehicle’s km/h limit |
| `/limit 0` | remove it |

Velocity is capped every 100 ms only for limited vehicles. The limiter resets on `vehicleDeath` and `vehicleSpawn`, including `/respcar`; occupied vehicles are not respawned.

Only the driver sees the lower-right speedometer: live km/h and body HP, static `Fuel 100`, plus `Open / max / E / S / M / L / B`. M and L change green/white; `max` shows the red limit when active.

## Bank, payday, safe zones, and jail

The bank uses world 2 and dialogs for balance, cash ↔ bank deposit/withdrawal, and P2P transfer by player ID. The money cap is `2147483647`; teller operations are serialized, including payday and `/givemoney` bank deposits. `/stats` displays balance.

At `:00`, authenticated non-AFK players receive one experience point, organization salary to the bank, +1 lawfulness below 100, and sound 6400. A full account cannot receive salary. Lawfulness starts at 100 and appears in `/stats` and passports.

Safe zones are invisible and cover the station, city hall, hospital, mine, and driving school. In street world/interior 0, on-foot players cannot deal damage and health/armor are restored.

The Jail icon is near `1810.86, -1576.44, 13.52`. Its service entrance and vehicles are restricted to LSPD, County Police, and FBI. `prison/` defines interior rooms, yard, locker, and controls. `/pult` opens/closes the yard; dialogs are 26–27. `/jail [id] [minutes] [reason]` is admin level 3+, accepts 1–10080 minutes, cannot jail admins, and persists `jail_seconds`. Death, killing, and reconnecting do not clear a sentence. `/unjail [id]` releases online jailed players; see `prison/sentence.ts` and `admin/jail.ts`.

## Reports, mute, and admin commands

`/report` and `/mn` use dialog 20. Its `account.id` cooldown is 30 seconds and survives reconnects; blank submission does not consume it, and mute does not block it. `/ans [id] [text]` is admin 1+, sends the answer to the target and `/alogin` admins, and plays sound 1085 for the target only.

`/mute [id] [minutes] [reason]` is level 2, accepts 1–10080 minutes, cannot mute admins, and writes `muted_until`. It blocks normal chat and `/me /do /try /todo /b /s /w /r /d /gov /f`, not `/report`.

Additional admin commands: `/slap` (1); `/veh`, `/delveh`, `/jail`, `/unjail`, `/tpcor` (3); `/respcar`, `/setskin`, `/ban`, `/unban`, `/tpint` (4); `/makeleader`, `/gzcolor` (5); `/givemoney`, `/setlevel` (6). `/ban` accepts 1–3650 days and blocks login through `banned_until`; `/givemoney` uses 0 cash and 1 bank.

## Organizations

Army (`org_id = 1`) has 25 base vehicles, 100-second respawn, and member-only access; see `vehicles/army.ts`. Hospital is `org_id = 2`, `gov: true`, color `0xff7a8aff`, has 10 ranks, member-only Ambulance/Maverick/FBI Rancher, and roof logic in `org/hospital-roof.ts`. City Hall is `org_id = 3`, `gov: true`, color `0xffff00ff`, has 10 ranks, `/r`, `/d`, rank-10 `/gov`, member-only vehicles, locker, service entrance, and roof.

| ID | Organization | File |
|---|---|---|
| 4 | County Police | `org/police.ts` |
| 5 | LSPD | `org/lspd.ts` |
| 6 | FBI | `org/fbi.ts` |
| 7 | Driving School | `org/autoschool.ts` |
| 8 | Radio Center | `org/radio.ts` |

Organizations 4–8 are `gov: true`, `illegal: false`, use `/r`, `/d`, rank-10 `/gov`, and ranks 9–10 staff management. Their vehicle, door, map, and locker modules define access. FBI, LSPD, and County Police share designated service routes and LSPD gates. Locker dialogs: 22 County Police, 23 LSPD, 24 FBI.

Radio Center uses `maps/radio.txt`, world 8, dialog 36 for office/street/roof, camera pickup 367, and member-only News Chopper/Newsvan vehicles. `/ad` costs $500 and queues an announcement; `/edit` lets employees accept or reject it. Accepted broadcasts wait at least 3 minutes and have a 3-minute interval.

Driving School sells missing licenses through `/selllic [id]` and runs $500 five-question car/motorcycle exams followed by a 29-checkpoint route in the school Premier or Wayfarer. See `modules/autoschool/`.

## Gangs, mafias, and captures

| ID | Gang | Color |
|---|---|---|
| 9 | Grove Street | `0x009900aa` |
| 10 | The Ballas | `0xcc00ffaa` |
| 11 | Los Santos Vagos | `0xffcd00aa` |
| 12 | The Rifa | `0x6666ffaa` |
| 13 | Varios Los Aztecas | `0x00b4e1aa` |

Gangs spawn in their headquarters, have 10 ranks, organization-colored names/zones, and use `/f`. Ranks 9–10 use `/invite`, `/uninvite`, `/rang`; invitations require a passport, expire after 60 seconds, and require proximity in the same interior/world. Gang vehicles are members-only. See `org/gangs.ts`, `vehicles/gangs.ts`, and `org/gang-doors.ts`.

Mafias are LCN (14), Yakuza (15), and Russian Mafia (16): `gov: false`, `illegal: false`, `mafia: true`. They use `/f`, have no turf captures, and share gang staff controls. See `org/mafias.ts`, `vehicles/mafias.ts`, and `org/mafia-doors.ts`.

There are 104 east-LS gang cells. Spawn/HQ cells cannot be captured. `/capture` requires gang rank 8+, a living attacker on an enemy cell in street world, and a defender online. One capture lasts 420 seconds. Only attacker-vs-defender kills on that cell score; a strict attacker lead transfers `org_id`. HUD/GPS is visible only to the two gangs. See `zones/turf.ts`, `zones/capture.ts`, and `commands/capture.ts`.

## Commands, dialogs, and sounds

v2 adds `/report`, `/limit`, staff commands, `/r /f /d /gov`, `/capture`, `/time`, `/lic`, `/selllic`, `/ad`, and `/edit`. `/stats` and `/pass` include bank, lawfulness, and organization.

Do not reuse dialog IDs: 1–12 v1; 13–19 bank; 20 report; 21 invite; 22–25 lockers; 26–27 jail control; 28–31 licenses; 32–35 exams; 36–39 Radio Center; 40 ban notice; 41 `/tpint`.

`playGameSound` is Pawn `PlayerPlaySound` and targets one player. IDs: 1083 skin-selection arrows, 1085 `/ans`, 4604 lights, 6400 payday.

## Where to edit

Use `vehicles/` for vehicle spawning/access, `modules/bank/` for banking, `payday/index.ts` for payday, `prison/` and `admin/jail.ts` for jail, `admin/ans.ts` and `admin/mute.ts` for moderation, `auth/licenses.ts` plus `commands/lic.ts` and `commands/selllic.ts` for licenses, `org/` and `vehicles/` for organizations, `zones/` plus `commands/capture.ts` for territories, and `sql/schema.sql` plus `auth/repository.ts` for persistence.
