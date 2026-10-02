# LSRP - Version 3

This document records the v3 additions after [docs_v2.md](docs_v2.md). It covers property, jobs, warehouses, organization production and delivery, the gang dealer, wanted level, identity documents, and the Army-base raid.

## Startup and persistence

Start the v3 modules after their dependencies in `src/index.ts`. Property, loader, warehouse, ghetto, Army factory, and delivery modules depend on authentication, organization, vehicle, and zone state being initialized first.

The `users` table and `COLUMN_MIGRATIONS` hold all persistent player state. Warehouse resources are stored in `warehouses`; resource labels must be refreshed after every successful deposit or withdrawal. Continue using repository helpers rather than writing account or warehouse values directly.

## Property and civilian activities

Houses and businesses use their configured street/interior coordinates, virtual worlds, pickups, checkpoints, labels, and dialogs. Ownership, money, and access are persisted. An owner can interact only at the appropriate property point; all cash movements use the wallet/persistence helpers. Do not allow jobs, jail, hospital, driving-school exams, or organization-specific actions to bypass their existing eligibility checks.

The miner and loader jobs use their respective point definitions and duty state. A player may not start an incompatible shift. Delivering the correct carried item completes the stage, updates its label/checkpoint, and pays through the normal wallet path. Death, disconnect, leaving the required vehicle/area, or otherwise invalidating a shift cancels it according to the job module.

## Warehouses

Warehouses contain organization resources. The actual field used by gameplay depends on the warehouse: the mine produces `metal`, hospital logistics uses medicines, government ammunition depots use ammo, and gang/mafia depots use ammunition, metal, and drugs.

### Gang and mafia warehouses

Mafia warehouses use interior 5 and worlds 14, 15, and 16. Gang warehouses use their respective headquarters and worlds 9-13. Entry to the red checkpoint on foot opens dialog **65**; dialog **66** asks for quantity.

Members of the owning organization can:

- deposit ammunition, metal, or drugs;
- withdraw ammunition, metal, or drugs;
- open or close the warehouse (rank **7+** only).

Deposits are allowed while closed; withdrawals are not. A warehouse can remain closed while its member menu is opened. Each operation accepts at most **10,000** units, updates `users` and `warehouses`, refreshes the label, and announces the action to online organization members. Non-members receive an access-denied message with a ~2.5-second cooldown.

### Ammunition depots

Ammunition depots use interior **6** and virtual world `org_id`: Army **1**, County Police **4**, LSPD **5**, FBI **6**.

| Depot | Access |
|---|---|
| LSPD garage | LSPD and FBI |
| Army base | Army and FBI |
| County Police roof/service exit | County Police and FBI via menu 55 |
| FBI roof/service exit | FBI via menu 56 |

The locker pickup is `312.41, -165.58`; its label displays current ammunition. LSPD uses dialog **23**, County Police **22**, Army **54**, and FBI **24**. Each locker has its defined weapon/armor kit and only its authorized organization may withdraw it. Police/FBI roof and office menus remain in `org/police-doors.ts`, `org/fbi-doors.ts`, and `org/ammunation-doors.ts`.

Admin `/warehouse` requires level **5+** and `/alogin`; dialogs **57** and **58** list warehouses and show resources relevant to their type.

## Army ammunition factory

The ammunition factory is an Army-only job in interior **2**, virtual world `ORG_ARMY_ID` **1**. Army and FBI can enter the world, but only Army employees may start a shift. Doors are in `org/army-factory-doors.ts`; shift logic is `army-factory/`.

1. At the changing room (pickup `1275`), dialog **60** hires and dialog **61** ends the shift. Work skins are female 190 and male 260.
2. Pick up a casing blank at yellow pickup `19135` using carry action.
3. Use machine `18635` for about 20 seconds. Success is about 70%; success produces a box, failure produces a defect and reduces later pay.
4. Deliver the completed box to pickup `1575`: add **40 ammunition** through `addWarehouseAmmo` and refresh the Army depot label.

Final pay is `$30` per batch minus `$15` per defect, never below zero. Leaving through the factory door ends the shift, pays, and restores the organization skin. Death or disconnect cancels the shift with no pay. Hospitalized, jailed, non-Army players, miners/loaders on shift, and driving-school examinees cannot start it.

## Hospital medicine delivery

Hospital-only delivery uses `vehicles/hospital.ts`; the medicine warehouse label and pickup are in `org/hospital-stock.ts` in the hospital world.

1. At van model **428** near `1148.13, -1304.40`, start dialog **62**.
2. Drive to supplier warehouse `1351.37, 355.83`.
3. Remain in the van for about 12 seconds to load **50** medicine units.
4. Return to the van parking checkpoint.
5. On foot, use `/pickmed` by the van to take box **1580** containing **10** units and carry it to `1156.48, -1342.85` in hospital world.
6. Delivery calls `addWarehouseMeds` and pays **$40** per box through `applyWallet` and persistence.

One trip holds five boxes. Refresh the stock label with `refreshHospitalMedsStockLabel`. The process repeats until the van is empty.

## Ghetto dealer and Army disguise

Smokey is a street dealer for Grove, Ballas, Vagos, Rifa, and Aztecas (organizations **9-13**). The `ghetto/` module starts after `warehouse`.

| Property | Value |
|---|---|
| Name / skin | Smokey, skin 28 |
| Location | `2515.93, -1474.61, 24.00`, angle `2.69`, street world 0 |
| Interaction | Left Alt (`KEY_WALK`) within ~2.2 m on foot |
| Purchase | `$50` per drug unit; 1-500 units |
| Dialogs | 63 menu, 64 quantity |

Purchases increase `users.drugs` and debit cash using `saveUserMoney` and `saveUserInventory`. The actor loops `DEALER`/`DEALER_IDLE`; pre-load the animation library for the client and replay it on `actorStreamIn`.

Dialog 63 also sells an **Army uniform for $100,000**. It applies male skin 287 or female skin 191, Army name/label color, and Army-gate access. It does not change gang membership, `/f`, or Army chat. The disguise is removed on death or disconnect; see `org/army-disguise.ts`.

## Wanted level and documents

Persistent fields:

| Column | Account field | Default |
|---|---|---|
| `wanted_level` | `wantedLevel` | `0` |
| `military_id` | `militaryId` | no |
| `medcard` | `medcard` | no |

Wanted stars are applied with `player.setWantedLevel`, synchronized on login/spawn by `applyWantedLevel`, and persisted with `saveUserWantedLevel`. `auth/wanted.ts` exposes `setPlayerWantedLevel` for future systems. There are no police wanted-level commands yet.

| Command | User | Behavior |
|---|---|---|
| `/givevbilet [id]` | Army rank 8+ | issue military ID to an online player without one |
| `/vbilet` | holder | view own military ID |
| `/vbilet [id]` | holder | show it to a nearby player (`WHISPER_RADIUS`) |
| `/givemedcard [id] [amount]` | Hospital rank 6+ | offer medical card for $2000-5000; target uses Y/N |
| `/medcard` | holder | view own medical card |
| `/medcard [id]` | holder | show it to a nearby player |

Military ID uses dialog **67** and `commands/vbilet.ts`. Medical-card issuance is hospital-only at `1165.07, -1350.39, 4001.10`, `HOSPITAL_WORLD`, interior 0, radius 20 m; it uses dialog **68** and `commands/medcard.ts`. `/stats` displays wanted level, military ID, and medical card.

## Army-base ammunition raid

`ghetto/army-crates.ts` defines unlabeled pickup **3013** crates at:

| # | Coordinates |
|---|---|
| 1 | `2792.68, -2393.04, 13.96` |
| 2 | `2743.31, -2454.36, 13.86` |

Only ghetto gangs (organizations 9-13) may use them. While standing on a crate on foot, every ~2.5 seconds remove **20** ammunition from Army warehouse `org_id` 1 and add it to `users.ammo`; an empty warehouse displays a cooldown message. Refresh the Army depot label. Death in base rectangle `2664.8,-2589.1` ... `2864.8,-2306.1` in street world removes **30%** of current ammunition, at least one if any was held.

## Army ammunition delivery

`vehicles/army-ammo-delivery.ts` starts from `spawnArmyVehicles`.

1. At pickup **19134** on the Army base (`2735.95, -2465.98`), an Army player takes box **2358**, deducting **100** ammunition from Army warehouse.
2. At Barracks **433**, `/putammo` loads up to **5** boxes and `/takeammo` returns a box to the player.
3. Unload points are FBI `607.31, -1520.50`, County Police `618.85, -586.44`, and LSPD `1593.86, -1614.30`; entering within 10 m creates a checkpoint.
4. At the checkpoint, `addWarehouseAmmo` gives the recipient **100** ammunition per box and the driver receives **$75**; refresh the destination locker label.
5. Death or entering a vehicle while carrying a box returns it to the truck or Army warehouse. Respawning a loaded Barracks returns its ammunition to Army warehouse.

## Maintenance map

| Feature | Files |
|---|---|
| Loader | `loader/index.ts`, `loader/points.ts` |
| GPS and `/mn` numbering | `gps/index.ts`, `commands/mn.ts` |
| Warehouse schema and resources | `warehouse/repository.ts`, `sql/schema.sql`, `warehouse/stock-interact.ts` |
| Mine metal | `warehouse`, `miner/index.ts` |
| Hospital medicine stock/delivery | `org/hospital-stock.ts`, `vehicles/hospital.ts` |
| Gang/mafia stock points | `warehouse/gang-stock.ts`, `warehouse/mafia-stock.ts` |
| Ammunition doors and lockers | `org/ammunation-doors.ts`, `org/*-locker.ts` |
| Factory | `army-factory/index.ts`, `army-factory/points.ts`, `org/army-factory-doors.ts` |
| Smokey and base raid | `ghetto/index.ts`, `ghetto/army-crates.ts` |
| Wanted level and documents | `auth/wanted.ts`, `commands/vbilet.ts`, `commands/medcard.ts` |
| Army disguise/delivery | `org/army-disguise.ts`, `vehicles/army-ammo-delivery.ts` |
