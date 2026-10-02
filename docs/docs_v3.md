# LSRP - Version 3

**Release date: 22 September 2026**

Changes made **after** [docs_v2.md](docs_v2.md). The main additions in v3 are the **housing system** and **server-side anti-cheat** (`anticheat`). In chronological order, this also includes: **the loader job**, the warehouse safe zone, numbering in `/gps` and `/mn`, the `/goto`, `/gethere`, and `/arang` admin commands, the **organization warehouses** table, the Army ammunition workshop, hospital **medication delivery**, **Smokey's dealer** in the ghetto, **gang/mafia warehouses**, and **wanted status / military ID / medical card**.

Player-facing text is **Russian (UTF-8)**.

> **Current stopping point (30 September 2026):** **Army ammunition delivery** (`/putammo` `/takeammo`, Barracks 433 -> police/LSPD/FBI). Next: police wanted status and follow-up work.

---

## Table of Contents

1. [New Module and Startup Order](#new-module-and-startup-order)
2. [Database](#database)
3. [Houses on the Map](#houses-on-the-map)
4. [Purchase and Entry](#purchase-and-entry)
5. [Interior and Exit](#interior-and-exit)
6. [Rent (Daily Payment)](#rent-daily-payment)
7. [Bank: Housing Payment](#bank-housing-payment)
8. [Player Commands](#player-commands)
9. [House Menu: /hmenu](#house-menu-hmenu)
10. [Passport and Statistics](#passport-and-statistics)
11. [Dialogs](#dialogs)
12. [Restrictions and Known Details](#restrictions-and-known-details)
13. [Where to Edit (Houses)](#where-to-edit-houses)
14. [Anti-cheat](#anti-cheat)
15. [Anti-cheat: Enabled Checks](#anti-cheat-enabled-checks)
16. [Anti-cheat: Trust API](#anti-cheat-trust-api)
17. [Anti-cheat: Punishment and Configuration](#anti-cheat-punishment-and-configuration)
18. [Where to Edit (Anti-cheat)](#where-to-edit-anti-cheat)
19. [Loader Job](#loader-job)
20. [Warehouse Safe Zone](#warehouse-safe-zone)
21. [/gps and /mn: Numbering](#gps-and-mn-numbering)
22. [Admin: /goto and /gethere](#admin-goto-and-gethere)
23. [Admin: /arang](#admin-arang)
24. [Organization Warehouses (Database)](#organization-warehouses-database)
25. [Army Ammunition Workshop](#army-ammunition-workshop)
26. [Medication Delivery (Hospital)](#medication-delivery-hospital)
27. [Ghetto: Smokey's Dealer](#ghetto-smokeys-dealer)
28. [Wanted Status, Military ID, Medical Card](#wanted-status-military-id-medical-card)
29. [Ammunition Crates at the Army Base (Gang Raid)](#ammunition-crates-at-the-army-base-gang-raid)
30. [Current Stopping Point](#current-stopping-point)
31. [Where to Edit (After Anti-cheat)](#where-to-edit-after-anti-cheat)

---

## New Module and Startup Order

The **`houses`** module has been added. It is initialized in `src/index.ts` **after** `bank` and **before** `miner`:

```
database → persist → auth → spawn → mapping → hospital → cityhall → bank
→ houses → warehouse → miner → … → vehicles
```

```
resources/src/modules/houses/
  repository.ts    database, house cache, purchase/sale/rent
  entrances.ts     street pickups, purchase/entry dialogs
  exits.ts         exit from the interior (Left ALT at the pickup)
  enter.ts         entry logic, teleport into the interior
  purchase.ts      cash purchase
  sell.ts          /sellhouse - sale to the state
  menu.ts          /hmenu - lock, medkit, information
  heal.ts          /heal - treatment with a medkit
  map-icons.ts     map icons near houses
  interior.ts      "inside your own house" check (20 m radius)
  access.ts        pickup and "near house" radii
  session.ts       player slot -> house id inside the interior
  residence.ts     "Homeless" / "House (No. N)" label
  classes.ts       house class names
  rent-math.ts     rent rate and date calculation
  rent.ts          repossession at 00:00, reminder on entry
  bank-rent.ts     bank payment dialogs
  index.ts         module startup
```

Seed: `sql/houses_seed.sql` (382 houses, IDs 1-382).

---

## Database

The **`houses`** table (`sql/schema.sql` + `houses/repository.ts`):

| Column | Meaning |
|---|---|
| `id` | SMALLINT UNSIGNED, PK, house number |
| `owner_id` | INT UNSIGNED NULL -> `users.id`; NULL = unoccupied |
| `entrance_x/y/z` | street pickup |
| `interior_x/y/z` | point inside the interior |
| `vehicle_x/y/z`, `vehicle_angle` | vehicle point (reserved) |
| `price` | state price (INT UNSIGNED) |
| `interior_id` | GTA interior ID |
| `has_medkit` | TINYINT, medkit purchased |
| `is_locked` | TINYINT, door (1 = locked by default) |
| `class_id` | TINYINT 0-5, house class |
| Interior VW | house `1000 + id` (there is no `world` column in the database) |
| `rent_paid_until` | **DATE NULL** - last **paid** calendar day |

`rent_paid_until` is migrated on startup: if the column is missing, run `ALTER TABLE`. Occupied houses without a date receive `CURDATE()` so they are not repossessed immediately after the update.

**Classes** (`houses/classes.ts`):

| `class_id` | Name |
|---|---|
| 0 | Economy |
| 1 | Mid-range |
| 2 | Standard |
| 3 | Comfort |
| 4 | Premium |
| 5 | Elite |

---

## Houses on the Map

- **Entrance pickup:** model `1273` for an unoccupied house, `19522` for an occupied house. Interaction radius: **1.5 m**.
- **Map icons** (`map-icons.ts`): slots **11-99**, type `31` (for sale) / `32` (occupied), LOCAL, **300 m** radius - the nearest houses are shown.
- One player may own **at most one house**.

---

## Purchase and Entry

### Purchase

Requirements (`purchase.ts`):

- level **>= 3**;
- has a **passport**;
- does not own another house;
- has sufficient **cash** (`account.money`);
- is at the pickup (**1.5 m**).

On purchase:

- cash is deducted and `owner_id` is set to the player;
- `rent_paid_until = CURDATE()` - the house is paid **through today**;
- the player is teleported into the interior;
- the pickup and icon are updated.

The dialog and chat include a hint about **extending rent at the bank**, at **$X/day** (0.1% of the price, minimum $1).

### Entry to an Occupied House

- The **owner** may always enter.
- **Guests** may enter only when the house is **unlocked** (`is_locked = 0`).
- Dialog: owner, type, number, price, and status (Unlocked/Locked).

---

## Interior and Exit

- Exit: pickup `19132` in the interior, **Left ALT** key (`KEY_WALK = 1024`); it is not an automatic teleport.
- `insideHouse` (session) maps a player slot to a house ID for correct exits when interiors overlap.
- `/hmenu` and `/heal` work only inside **your own** house, within **20 m** of `interior_*` (`HOUSE_INTERIOR_RADIUS`).

---

## Rent (Daily Payment)

| Parameter | Value |
|---|---|
| Rate | **0.1%** of `price` per day (`HOUSE_RENT_RATE = 0.001`), minimum **$1** |
| On purchase | the **current day** is paid |
| Extension | only at the **bank**, from the **bank account** |
| Day input | any number from **1** to **999** at the bank |
| Overdue period | **none** - at **00:00** the next day, the house is repossessed by the state |
| Compensation | **none** |
| Repossession | a cron job checks for a date change every minute and on server startup; `rent_paid_until < CURDATE()` |
| On repossession | `owner_id = NULL`, reset medkit and lock, pickup -> unoccupied; players inside are moved outside |

New paid-until date formula:

```
base = max(rent_paid_until, today)
rent_paid_until = base + N days
```

### Reminder on Entry

On the **first spawn** of a session (`houses/index.ts`):

- if **<= 5 days** remain on the payment, show a message with the number of days;
- if **today is the last day**, warn that the state will take the house tomorrow at 00:00.

---

## Bank: Housing Payment

The teller menu (`bank/tellers.ts`) includes an **"Pay for house"** option:

- no house -> **"You do not own a house"** window;
- house owned -> house information -> day count input (1-999) -> confirmation -> charge from `bank`;
- show a dialog warning if today is the last paid day.

Dialog logic: `houses/bank-rent.ts`.

---

## Player Commands

| Command | Description |
|---|---|
| `/hmenu` | House menu inside your own interior |
| `/heal` | Full HP if a medkit is purchased ($7500), only in your own house |
| `/sellhouse` | Sell to the state for the full `price` in cash; you must stand **within 4 m** of your house's street entrance |

---

## House Menu: /hmenu

Options:

1. **Status** - toggle the lock (unlocked/locked).
2. **Medkit** - buy for **$7500** cash (once).
3. **Information** - house number, class, state price, paid-through date, and remaining days (or "today is the last day").

---

## Passport and Statistics

- `/pass` and `/stats` show a **"Residence"** line: `Бездомный` or `Дом (№N)` (`houses/residence.ts`).
- `/stats` shows inventory: **Drugs / Ammunition / Metal** (`users.drugs`, `ammo`, `metal`; default 0).

---

## Dialogs

| ID | Module | Purpose |
|---|---|---|
| 42 | `houses/entrances` | House purchase |
| 43 | `houses/entrances` | Entry to an occupied house |
| 44 | `houses/menu` | /hmenu menu |
| 45 | `houses/menu` | Medkit purchase |
| 46 | `houses/sell` | /sellhouse confirmation |
| 47 | `houses/bank-rent` | House-payment information |
| 48 | `houses/bank-rent` | Payment confirmation |
| 49 | `houses/bank-rent` | "You do not own a house" |
| 50 | `houses/menu` | House information |
| 51 | `houses/bank-rent` | Day count input |
| 52 | `loader` | Loader hiring |
| 53 | `loader` | End of loader shift |
| 54 | `army-locker` | Army armory (ammunition) |
| 55 | `police-doors` | Regional police service exit |
| 56 | `fbi-doors` | FBI roof / service exit |
| 57 | `admin/warehouse` | Admin: warehouse list |
| 58 | `admin/warehouse` | Admin: warehouse status |
| 59 | `miner` | Mine: metal purchase |
| 60 | `army-factory` | Ammunition workshop hiring |
| 61 | `army-factory` | End of workshop shift |
| 62 | `vehicles/hospital` | Medication delivery (route start) |
| 63 | `ghetto` | Smokey's dealer menu |
| 64 | `ghetto` | Drug purchase (quantity input) |
| 65 | `warehouse/stock-interact` | Gang/mafia warehouse menu |
| 66 | `warehouse/stock-interact` | Deposit/withdraw quantity |
| 67 | `commands/vbilet` | Military ID |
| 68 | `commands/medcard` | Medical card |

---

## Restrictions and Known Details

- Each house interior has its own VW (`1000 + id`); the street is VW `0`.
- Map icons have about 89 slots (11-99); when many houses are within 300 m, the closest ones are shown.
- There is no player-to-player sale and no cooldown on `/heal`.
- **`/asellhouse [id]`** (admin **5+**, after `/alogin`) releases a house without paying the owner.
- Sale to the state (`/sellhouse`) and repossession for non-payment are separate scenarios: the player receives money on sale, but not on repossession.

---

## Куда править (дома)

| Что | Файл |
|---|---|
| Схема и кэш домов | `houses/repository.ts`, `sql/schema.sql` |
| Координаты домов | `sql/houses_seed.sql` |
| Ставка аренды | `houses/rent-math.ts` → `HOUSE_RENT_RATE` |
| Изъятие в полночь | `houses/rent.ts` |
| Оплата в банке | `houses/bank-rent.ts`, `bank/tellers.ts` |
| Покупка / вход | `houses/purchase.ts`, `houses/entrances.ts`, `houses/enter.ts` |
| Продажа | `houses/sell.ts`, `commands/sellhouse.ts` |
| Админ: освободить дом | `admin/asellhouse.ts`, `houses/repository.ts` → `adminVacateHouse` |
| Меню / аптечка / инфо | `houses/menu.ts`, `commands/hmenu.ts` |
| Лечение | `houses/heal.ts`, `commands/heal.ts` |
| Иконки | `houses/map-icons.ts` |
| Радиусы | `houses/access.ts`, `houses/interior.ts` |
| Классы | `houses/classes.ts` |
| VW домов | `houses/world.ts` → `1000 + id` |
| Проживание в паспорте | `houses/residence.ts`, `commands/pass.ts`, `commands/stats.ts` |

---

## Античит

Модуль **`anticheat`** — серверные проверки без клиентских плагинов. Зеркалит ожидаемые деньги / HP / броню / оружие / позицию и сравнивает с тем, что приходит от клиента.

Подключается в `src/index.ts` **последним** (после `vehicles`), чтобы trust из гейммода уже был доступен остальным модулям при старте.

```
… → vehicles → anticheat
```

```
resources/src/modules/anticheat/
  index.ts          старт модуля, реэкспорт trust/config
  codes.ts          AcCode 0–52, NopCode, слоты оружия
  config.ts         пороги, список включённых кодов, INSTANT_KICK
  state.ts          состояние игрока, reconnect по ник+IP
  trust.ts          API «сервер разрешил» (grace-окна)
  punish.ts         лог, админам, soft-страйки, kick
  loop.ts           таймер проверок + bind событий
  messages.ts       русские названия кодов
  math.ts           дистанции, время
  detectors/
    movement.ts     airbreak / fly / speed / teleport
    vitals.ts       HP / броня / деньги
    weapons.ts      оружие / патроны / jetpack / crasher
    vehicle.ts      HP транспорта и связанные проверки
    connection.ts   ping / flood / sandbox / reconnect
```

Идея: **любое легитимное изменение** (телепорт, выдача оружия, зарплата) должно пройти через trust / `applyWallet` / `grantWeapon`, иначе античит увидит расхождение.

---

## Античит: включённые проверки

По умолчанию (`config.ts`) включены коды с реальной логикой и приемлемым FP. Остальные в `DISABLED_CODES` — выключены (заглушки или высокий ложный позитив).

| Код | Имя | Смысл |
|---|---|---|
| 0 / 1 | AirBreak пешком / транспорт | резкий разрыв позиции |
| 2 / 3 | Телепорт пешком / транспорт | скачок дальше порога |
| 4 | Телепорт в транспорт | сел слишком далеко от машины |
| 7 / 8 | FlyHack | полёт без основания |
| 9 / 10 | SpeedHack | скорость выше лимита |
| 11 / 12 | ХП транспорта / игрока | HP выше доверенного |
| 13 | Броня | броня выше доверенной |
| 14 | Деньги | наличные выше зеркала |
| 15 / 16 | Оружие / патроны (+) | лишнее оружие или рост ammo |
| 18 | Special action | jetpack без разрешения |
| 27 | Fake spawn | спавн вне ожидаемого сценария |
| 37 | Reconnect | тот же ник с того же IP слишком быстро |
| 38 | High ping | пинг выше `maxPing` (с предупреждениями) |
| 40 | Sandbox | слишком много коннектов с IP |
| 47 | Weapon crasher | неверный ID оружия |
| 49 | Callback flood | спам колбэков |
| 51 | DoS | аномальный поток пакетов |

**Выключены** (не кикают): Parkour, UnFreeze, FakeNpc, LagComp, ProAim, RCON brute, Attach/Tuning/Seat/Dialog crasher, GodMode, FullAiming, CarShot, QuickTurn, CarJack, AfkGhost, InvalidVersion, Connect/Seat flood, Invisible, DialogHack, TeleportVehToPlayer / Pickup, Tuning, FakeKill, NOP, AmmoInfinite, **RapidFire**, **CJ run**.

RapidFire и CJ run отключены из‑за ложных срабатываний на штатном геймплее.

---

## Античит: trust API

Импорт: `modules/anticheat` или `modules/anticheat/trust`.

| Функция | Когда вызывать |
|---|---|
| `trustPosition` | телепорт, спавн, slap, /tpcor, /goto, /gethere, карта админа |
| `trustMoney` | обычно через `applyWallet` в `auth/session` |
| `trustHealth` / `setTrustedHealth` | лечение, спавн HP |
| `trustArmour` / `grantArmour` | выдача брони (локер → `grantArmour`) |
| `trustWeapon` / `grantWeapon` | выдача оружия (локер → `grantWeapon`) |
| `clearTrustedWeapons` | сброс оружия сервером |
| `trustVehicle` | посадка в транспорт сервером |
| `trustDialog` | сервер открыл диалог |
| `markSpawned` / `markSpectating` | спавн / спект |

Уже завязано на trust:

- деньги — `applyWallet` (банк, дома, шахтёр, админ money, persist…);
- позиция — `spawn/point`, admin map / tpcor / slap / goto / gethere;
- оружие и броня — локеры org / prison (`grantWeapon`, `grantArmour`).

**Правило для новых фич:** не трогать `player.setMoney` / `giveWeapon` / `setPos` в обход этих путей — будет ложный кик.

---

## Античит: наказание и конфиг

При срабатывании (`punish.ts`):

1. Лог сервера: `[AC] …`
2. Сообщение админам (`adminLevel >= 1`)
3. Сообщение игроку
4. Kick, если `kickOnDetect = true` и достигнут лимит страйков

| Параметр | Сейчас | Смысл |
|---|---|---|
| `enabled` | `true` | модуль активен |
| `kickOnDetect` | `true` | кикать |
| `softStrikeMax` | `1` | сколько срабатываний одного кода до кика |
| `softStrikeDecayMs` | `90000` | сброс счётчика без повторов |
| `reconnectMinMs` | `8000` | мин. пауза до reconnect (ник+IP) |
| `maxPing` | `550` | порог High ping |
| `maxConnectsPerIp` | `4` | Sandbox |
| `speedFootMax` / `speedVehMax` | `300` / `380` | SpeedHack |
| `teleportFootDist` / `teleportVehDist` | `50` / `60` | Teleport |
| `moneyGraceMs` и др. | 2–3 с | окно после trust |

**Сразу кик** (без накопления): Weapon crasher, Fake spawn, Sandbox, DoS — `INSTANT_KICK_CODES`.

Кастомный обработчик: `setCheatHandler((player, code, detail) => …)`; вернуть `false`, чтобы отменить стандартное наказание.

Админской команды отладки нет.

---

## Куда править (античит)

| Что | Файл |
|---|---|
| Пороги и вкл/выкл кодов | `anticheat/config.ts` |
| Список кодов | `anticheat/codes.ts` |
| Названия в чате/логе | `anticheat/messages.ts` |
| Kick / страйки / админам | `anticheat/punish.ts` |
| Таймер и события | `anticheat/loop.ts` |
| Состояние / reconnect | `anticheat/state.ts` |
| Trust API | `anticheat/trust.ts` |
| Детекторы | `anticheat/detectors/*.ts` |
| Деньги без ложного кика | `auth/session.ts` → `applyWallet` |
| Оружие из локеров | `org/*-locker.ts`, `prison/prison-locker.ts` |

---

## Работа грузчика

Модуль **`loader`** — подработка на складе. Подключается в `src/index.ts` **после** `miner`, **до** `gps`:

```
… → houses → miner → loader → gps → …
```

```
resources/src/modules/loader/
  index.ts    найм, смена, мешки, чекпоинты, выплата
  points.ts   координаты раздевалки / погрузки / разгрузки
```

### Точки

| Точка | Координаты | Назначение |
|---|---|---|
| Раздевалка | `2127.31, -2274.98, 20.67` | пикап `1275`, лейбл «Склад / Работа грузчика», найм и конец смены |
| Погрузка | `2230.83, -2285.61, 14.38` | взять мешок |
| Разгрузка | `2174.94, -2249.53, 13.30` | сдать мешок |
| GPS | `2236.53, -2212.79, 13.55` | пункт **«Склад (грузчик)»** в `/gps` |

Иконка карты: слот **4**, тип **51**, LOCAL, радиус **~300 м** от раздевалки (тот же слот, что у тюрьмы — показывается по близости).

### Цикл смены

1. Пешком у раздевалки → диалог **52**: устроиться.
2. Скин: мужской **260**, женский **190**. Чекпоинт на погрузку.
3. Взять мешок → `SPECIAL_ACTION_CARRY`, объект **2060** в слоте **2**, чекпоинт на разгрузку.
4. Сдать мешок → **+$25** к зарплате смены, снова погрузка.
5. У раздевалки на смене → диалог **53**: завершить и получить накопленную сумму наличными (`applyWallet` + `queueSave`).

Прыжок (`KEY_JUMP`) или стрельба (`KEY_FIRE`), посадка в транспорт — мешок уронен, фаза снова «погрузка», зарплата смены **не** сгорает. Смерть / дисконнект — смена срывается, **невыплаченная** зарплата сгорает.

### Ограничения найма

Нельзя устроиться: в больнице (`hospitalized`), в тюрьме, на смене шахтёра, на экзамене автошколы. Нужно стоять у раздевалки пешком (улица, VW `0`).

GPS-чекпоинт и чекпоинт грузчика не конфликтуют: на смене грузчика GPS не ставит свой чекпоинт (`isLoaderOnShift`).

### Диалоги

| ID | Назначение |
|---|---|
| 52 | Устройство на работу |
| 53 | Завершение смены |
| 54 | Оружейка Армии (аммунация) |
| 55 | Служебный выход областной полиции (Парковка / Аммунация) |
| 56 | Крыша / служебный выход FBI (Офис·Крыша / Аммунация) |
| 57 | Админ: список складов (`/warehouse`) |
| 58 | Админ: состояние склада |
| 59 | Шахта: покупка металла |
| 62 | Доставка медикаментов (старт рейса) |
| 63 | Меню барыги Смоки |
| 64 | Покупка наркотиков у Смоки |
| 65 | Меню склада банды/мафии |
| 66 | Кол-во положить/взять на склад |
| 67 | Военный билет |
| 68 | Медицинская карта |

---

## Сейф-зона склада

В `zones/safe.ts` добавлен невидимый прямоугольник склада (как ЖД, мэрия, больница, шахта, автошкола):

```
minX 2153.8, minY -2292.9, maxX 2237.8, maxY -2218.9
```

Покрывает зону погрузки/разгрузки. Только VW улицы, interior `0`. Урон откатывается через снапшот HP/брони + `trustHealth` / `trustArmour`.

---

## /gps и /mn: нумерация

Списки в диалогах с `DIALOG_STYLE_LIST` показывают пункты с номерами:

- `/gps` — `1. Мэрия`, `2. Городская больница`, … (в т.ч. **Склад (грузчик)**)
- `/mn` — `1. Статистика`, `2. Правила сервера`, …

Выбор по `listItem` не менялся.

---

## Админка: /goto и /gethere

Уровень **2+**, нужен активный `/alogin`. Файлы: `admin/goto.ts`, каталог `admin/catalog.ts`.

| Команда | Поведение |
|---|---|
| `/goto [id]` | телепорт админа к игроку; копируются **позиция, interior, VW**; из машины админ выходит; `placeAt` + `trustPosition` + `refreshStreamForPlayer` |
| `/gethere [id]` | телепорт игрока к админу с **позицией, interior, VW** админа; если цель в машине — высадка и телепорт пешком |

Цель должна быть онлайн (не NPC). Себе нельзя. Состояние wasted / spectating — отказ.

`/gethere`: сообщение цели и админу; всем админам с `/alogin` серым:

```
[A] Администратор Name_Surname[ID] телепортировал к себе игрока Name_Surname[id]
```

`/goto`: серый лог админам без префикса `[A]` (как `/slap`).

---

## Админка: /arang

Уровень **7**, `/alogin`. Файл: `admin/arang.ts`.

| | |
|---|---|
| Синтаксис | `/arang [id] [+/-]` (пробел обязателен) |
| Цель | уже администратор **1–6**, онлайн; **не себя**; уровень **7** — только через `/makeadmin` |
| Диапазон итога | **1–6** (выдать/снять 0 или 7 — по-прежнему `/makeadmin`) |
| БД | `saveAdminLevel` — меняет только `admin_level`, **пароль админки не сбрасывается** |

---

## Склады организаций (БД)

Таблица **`warehouses`** (`sql/schema.sql` + `warehouse/repository.ts`). Модуль `warehouse` стартует после `houses`. Пополнение: металл с шахты, патроны с цеха Армии, медикаменты с доставки больницы. **Банды и мафии** кладут/берут патроны, металл и наркотики на своих HQ-складах (`warehouse/stock-interact.ts`).

| Колонка | Смысл | По умолчанию |
|---|---|---|
| `org_id` | PK = id органа | — |
| `ammo` | патроны | `0` |
| `meds` | медикаменты | `0` |
| `metal` | металл | `0` |
| `drugs` | наркотики | `0` |
| `is_locked` | 1 = закрыт, 0 = открыт | банды/мафии: **1**; гос + шахта: **0** (замок не используется) |

Строки (INSERT IGNORE при старте):

| org_id | Склад | is_locked |
|---|---|---|
| **0** | **Шахта** | 0 |
| 1 | Армия | 0 |
| 2 | Больница | 0 |
| 4 | Областная полиция | 0 |
| 5 | LSPD | 0 |
| 6 | FBI | 0 |
| 9–13 | Grove, Ballas, Vagos, Rifa, Aztecas | 1 (можно открыть/закрыть) |
| 14–16 | LCN, Yakuza, Русская мафия | 1 (можно открыть/закрыть) |

При старте `unlockNonLockableWarehouses` принудительно ставит `is_locked = 0` для гос/шахты (если строки уже были с 1). Хелпер: `warehouseUsesLock(orgId)`.

Сдача руды шахтёром (`miner` → `deliver`): **1 кг руды → +1 кг `metal`** на склад `org_id = 0` (`addMineMetal`). Лейбл у склада обновляется.

Пикап продажи металла (модель **19134**, лейбл «Продажа металла / 15$ за 1кг.»): диалог **59** — ввод кг, **$15/кг**. Списание со склада шахты → `users.metal`, деньги с наличных. `takeMineMetal`, `saveUserInventory` / `saveUserMoney`.

**Мафии (LCN / Yakuza / RM):** в HQ (интерьер 5, VW 14/15/16) точка `1261.60, -782.02, 1084.00` — красный чекпоинт (в радиусе ~45 м) и лейбл запасов (`Патроны` / `Металл` / `Наркотики` + открыт/закрыт). У каждой семьи свой VW и строка `warehouses`. Вход на чекпоинт — меню склада (см. ниже). `warehouse/mafia-stock.ts`.

**Банды (Grove / Ballas / Vagos / Rifa / Aztecas):** то же в своих HQ (свои interior + VW 9–13). Точки: Aztecas `217.64, 1251.28, 1082.15`; Ballas `227.90, 1155.78, 1082.61`; Vagos `331.03, 1128.74, 1083.88`; Rifa `-71.28, 1365.81, 1080.22`; Grove `2455.68, -1706.20, 1013.51`. `warehouse/gang-stock.ts`.

### Склад банды / мафии (взаимодействие)

Файл: `warehouse/stock-interact.ts`. Диалоги **65** (меню) / **66** (количество).

Вход на чекпоинт пешком:

1. **Свой орган** — список (меню открывается и при закрытом складе):
   - Положить патроны / металл / наркотики (белый)
   - `{9ACD32}` Взять патроны / металл / наркотики
   - Закрыть склад / Открыть склад — пункт меняется по состоянию склада; после переключения меню открывается снова с актуальным текстом
2. Ввод количества (до **10 000** за раз) → списание/выдача в `users` (`drugs`/`ammo`/`metal`) и `warehouses`, лейбл обновляется.
3. **Чужой** — «Доступ к складу разрешён только {org_name}.» (кулдаун ~2.5 с).

При выборе «Взять», если склад **закрыт** — «Склад закрыт.» **Положить** можно и при закрытом складе. **Открыть/закрыть** — только ранг **7+**. Чтобы снова открыть меню — выйти с красного маркера и зайти снова (из HQ выходить не нужно).

Сообщение всем онлайн-членам органа:

```
[Склад] {ранг} Name_Surname[ID] положил на склад: патроны N шт.
[Склад] {ранг} Name_Surname[ID] взял со склада: металл N шт.
[Склад] {ранг} Name_Surname[ID] открыл склад. / закрыл склад.
```

**Аммунация (склады патронов):** интерьер **6**, VW = `org_id` (Армия **1**, полиция **4**, LSPD **5**, FBI **6**). Входы:

| Склад | Откуда | Кто входит |
|---|---|---|
| LSPD | гараж `1568.63, -1690.08` | LSPD + FBI |
| Армия | база `2721.20, -2380.39` | Армия + FBI |
| Областная полиция | крыша / служебный выход HQ → меню **55** «Аммунация» (уличного входа в аммунацию нет) | только полиция + FBI |
| FBI | крыша / служебный выход HQ → меню **56** «Аммунация» (уличного входа нет) | только FBI |

Внутри выход `316.42, -170.03` (свой VW): у полиции и FBI — меню **55**/**56** Крыша / Офис. Оружейки в аммунации (`312.41, -165.58`, пикап **19134**, лейбл «Патроны: N»):

| Склад | VW | Диалог | Кто берёт | Набор |
|---|---|---|---|---|
| LSPD | 5 | **23** | только LSPD | броня, дубинка, DE, Shotgun, MP5, M4, SWAT |
| Областная полиция | 4 | **22** | только полиция | тот же набор, что у LSPD |
| Армия | 1 | **54** | только Армия | броня, DE, M4, Rifle |
| FBI | 6 | **24** | только FBI | броня, дубинка, DE, Shotgun, MP5, M4, Sniper, SWAT |

Служебный выход полиции: парковка отдельно (вход/выход без меню). Крыша `621.26, -569.20` — меню **55** Офис / Аммунация; в HQ у крыши лейбл «Крыша / Аммунация» `246.40, 88.01`.

FBI крыша: пикап `595.61, -1476.19` (меню **56**: Офис / Аммунация); в HQ лейбл «Крыша / Аммунация» `288.72, 167.32` (меню: Крыша / Аммунация); служебный вход с улицы без изменений. `org/fbi-doors.ts`, `org/police-doors.ts`, `org/ammunation-doors.ts`, `org/fbi-locker.ts`, `org/police-locker.ts`, `org/lspd-locker.ts`, `org/army-locker.ts`.

Ресурсы у всех колонок общие; какие поля реально используются (у шахты — `metal`) — решает игровая логика.

**Админ `/warehouse`** (уровень **5+**, `/alogin`): список складов → инфо по типу (шахта — металл; больница — медпрепараты; армия/полиция/LSPD/FBI — патроны; банды/мафии — патроны, металл, наркотики + открыт/закрыт). Диалоги **57** / **58**. `admin/warehouse.ts`.

---

## Цех патронов Армии

Работа **только для сотрудников Армии** внутри завода (interior **2**, VW = `ORG_ARMY_ID` **1**). Армия и FBI входят в этот VW; устроиться на смену может только Армия.

Двери: `org/army-factory-doors.ts` (вход с базы Армии ↔ интерьер). Логика смены: `army-factory/`.

### Цикл

1. **Раздевалка** (пикап `1275`) — диалог **60** найм / **61** конец смены. Скины: ♀ **190**, ♂ **260**.
2. **Заготовки гильз** (жёлтые `19135`) — взять заготовку, special action carry.
3. **Станок** (`18635`, ~20 с анимации) — сборка; ~70% успех → готовый ящик, иначе брак (+штраф при выплате).
4. **Склад готовых** (`1575`) — сдача: **+40 патронов** на склад Армии (`addWarehouseAmmo`), лейбл в аммунации обновляется.

Оплата при завершении: `$30` за партию − `$15` за брак (не ниже 0). Выход через дверь завода **автоматически** закрывает смену с выплатой и возвращает орг-скин. Смерть / дисконнект — смена срывается без выплаты.

Нельзя устроиться: не Армия, больница, тюрьма, смена шахтёра/грузчика, экзамен автошколы.

---

## Доставка медикаментов (больница)

Работа **только для сотрудников больницы** (`ORG_HOSPITAL_ID`). Файл: `vehicles/hospital.ts`. Склад медикаментов в служебном блоке: `org/hospital-stock.ts` (пикап + лейбл «Медикаменты: N», VW больницы).

### Цикл

1. Фургон (**модель 428**) у больницы `1148.13, -1304.40` — лейбл «Доставка лекарств».
2. Диалог **62**: подтвердить рейс → чекпоинт к **складу поставщика** `1351.37, 355.83`.
3. На точке загрузки **~12 с** (оставаться в фургоне) → **50 ед.** медикаментов в кузов.
4. Чекпоинт обратно на парковку фургона.
5. Пешком: **`/pickmed`** у фургона — коробка **1580** (по **10 ед.**), отнести на склад в служебном блоке `1156.48, -1342.85` (VW больницы).
6. Сдача: `addWarehouseMeds` + **$40** за коробку (`applyWallet` / persist). Повторять, пока фургон не пуст.

Несколько коробок за рейс (50 / 10 = 5). Лейбл склада обновляется (`refreshHospitalMedsStockLabel`).

---

## Гетто: барыга Смоки

Уличный дилер для **банд** Grove / Ballas / Vagos / Rifa / Aztecas (org **9–13**). Модуль `ghetto/` (старт после `warehouse` в `src/index.ts`).

| | |
|---|---|
| Имя / скин | **Смоки**, скин **28** |
| Координаты | `2515.93, -1474.61, 24.00`, угол `2.69`, VW улицы `0` |
| Взаимодействие | **Левый Alt** (`KEY_WALK`) в радиусе ~2.2 м, пешком |
| Покупка | **$50** за 1 шт. наркотиков → `users.drugs` + списание наличных |
| Лимит за раз | **1–500** шт. |
| Чужие | «Я работаю только с местными.» (кулдаун ~2.5 с) |

Диалоги: **63** (меню «Купить наркотики»), **64** (ввод количества). Сохранение: `saveUserMoney` + `saveUserInventory`.

Анимация актора: `DEALER` / `DEALER_IDLE` (loop). У клиента библиотека должна быть предзагружена (`player.applyAnimation` + `clearAnimations`); повтор анимации на **`actorStreamIn`** (иначе idle часто не виден).

Меню Смоки (диалог **63**):

1. Купить наркотики → диалог **64**
2. **Форма армии ($100 000)** — маскировка: скин ♂ **287** / ♀ **191**, цвет ника/метки как у Армии (`0x9c7a4b`), открытие **ворот армии**. Банда, `/f`, чат армии — без изменений. Снимается при **смерти** или **дисконнекте**. `org/army-disguise.ts`.

---

## Розыск, военный билет, медкарта

Поля в `users` (+ миграции `COLUMN_MIGRATIONS`):

| Колонка | Account | По умолчанию |
|---|---|---|
| `wanted_level` | `wantedLevel` 0–6 | `0` |
| `military_id` | `militaryId` | нет |
| `medcard` | `medcard` | нет |

### Розыск

Звёзды GTA SA через `player.setWantedLevel`. Синхрон при логине/спавне (`applyWantedLevel`). Persist: `saveUserWantedLevel`. Хелпер для системы/будущей полиции: `auth/wanted.ts` → `setPlayerWantedLevel`. **Полицейских команд выдачи пока нет.**

### Военный билет

| Команда | Кто | Что |
|---|---|---|
| `/givevbilet [id]` | Армия, ранг **8+** | выдать билет (цель онлайн, без билета) |
| `/vbilet` | владелец | посмотреть свой |
| `/vbilet [id]` | владелец | показать рядом стоящему (`WHISPER_RADIUS`) |

Диалог **67**. Файлы: `commands/vbilet.ts`.

### Медицинская карта

| Команда | Кто | Что |
|---|---|---|
| `/givemedcard [id] [сумма]` | Больница, ранг **6+** | предложить карту; сумма **$2000–5000**; пациент жмёт **Y** (купить) / **N** (отказ); платит пациент, врач получает |
| `/medcard` | владелец | посмотреть свою |
| `/medcard [id]` | владелец | показать рядом стоящему |

Выдача **только в больнице**: точка `1165.07, -1350.39, 4001.10`, VW `HOSPITAL_WORLD`, interior `0`, радиус **20 м**. Диалог **68**. Файлы: `commands/medcard.ts`.

В `/stats` отображаются розыск, военный билет, медкарта.

---

## Ящики патронов на базе Армии (рейд банд)

Файл: `ghetto/army-crates.ts`. Пикапы **3013** без лейбла (улица, VW 0):

| # | Координаты |
|---|---|
| 1 | `2792.68, -2393.04, 13.96` |
| 2 | `2743.31, -2454.36, 13.86` |

Только банды гетто (org **9–13**). Стоя на пикапе пешком, раз в **~2.5 с** со склада Армии (`warehouses` org_id **1**) списывается **20** патронов → `users.ammo`. Если склад пуст — сообщение «Ящик пуст…» (кулдаун). Лейбл аммунации Армии обновляется.

**Смерть в зоне базы** (прямоугольник `2664.8,-2589.1` … `2864.8,-2306.1`, улица): теряется **30%** текущих патронов (не меньше 1, если были).

---

## На чём остановились

**Дата среза: 30.09.2026.**

Сделано в этой ветке работ:

- доставка медикаментов; Смоки; склады банд/мафий;
- розыск / военный билет / медкарта;
- рейд базы Армии: ящики патронов для банд + штраф патронов при смерти в зоне;
- **доставка патронов Армии** на склады полиции / LSPD / FBI.

**Не делали:** выдача розыска полицией.

**Следующее (план):**

1. Полиция: выдача/снятие розыска (когда понадобится).
2. Баланс оплаты / объёма ящиков доставки.

---

### Доставка патронов Армии

Файл: `vehicles/army-ammo-delivery.ts` (старт из `spawnArmyVehicles`).

1. Пикап **19134** на базе `2735.95, -2465.98` — армеец берёт ящик **2358** (списание **100** патронов со склада Армии).
2. У Barracks **433**: `/putammo` (макс. **5** ящиков), лейбл «Загружено ящиков: N»; `/takeammo` — обратно в руки.
3. Точки разгрузки (радиус **10 м** → чекпоинт): FBI `607.31, -1520.50`; Обл. полиция `618.85, -586.44`; LSPD `1593.86, -1614.30`.
4. Сдача на чекпоинте: `addWarehouseAmmo` получателю + **$75**, лейбл оружейки обновляется.
5. Смерть / посадка в ТС с ящиком — возврат в грузовик или на склад Армии. Респавн Barracks с грузом — патроны возвращаются на склад Армии.

## Куда править (после античита)

| Что | Файл |
|---|---|
| Грузчик: логика смены | `loader/index.ts` |
| Грузчик: координаты | `loader/points.ts` |
| GPS: склад и нумерация | `gps/index.ts` |
| /mn: нумерация | `commands/mn.ts` |
| Сейф-зона склада | `zones/safe.ts` → `SAFE_ZONES` |
| /goto /gethere | `admin/goto.ts` |
| /arang | `admin/arang.ts`, `auth/repository.ts` → `saveAdminLevel` |
| Склады (таблица / seed) | `warehouse/repository.ts`, `sql/schema.sql` |
| Склады: металл с шахты | `warehouse` → `addMineMetal`, `miner/index.ts` → `deliver` |
| Склады: медикаменты больницы | `warehouse` → `addWarehouseMeds` |
| Больница: склад медикаментов (лейбл) | `org/hospital-stock.ts` |
| Больница: доставка лекарств | `vehicles/hospital.ts` |
| Склады банд/мафий: точки | `warehouse/gang-stock.ts`, `warehouse/mafia-stock.ts` |
| Склады банд/мафий: положить/взять/замок | `warehouse/stock-interact.ts` |
| Аммунация: двери | `org/ammunation-doors.ts` |
| Полиция: двери / служебный выход | `org/police-doors.ts` |
| Аммунация: оружейка LSPD | `org/lspd-locker.ts` |
| Аммунация: оружейка полиции | `org/police-locker.ts` |
| Аммунация: оружейка FBI | `org/fbi-locker.ts` |
| FBI: двери / крыша | `org/fbi-doors.ts` |
| Армия: завод (interior 2, VW 1) | `org/army-factory-doors.ts`, `army-factory/points.ts` → `ARMY_FACTORY_WORLD` |
| Армия: цех патронов | `army-factory/index.ts`, `army-factory/points.ts` |
| Склады: патроны с завода | `warehouse` → `addWarehouseAmmo` |
| Аммунация: оружейка Армии | `org/army-locker.ts` |
| Гетто: барыга Смоки | `ghetto/index.ts` |
| Розыск (звёзды / БД) | `auth/wanted.ts`, `auth/session.ts` → `applyWantedLevel` |
| Военный билет | `commands/vbilet.ts` |
| Медкарта | `commands/medcard.ts` |
| Армия: ящики патронов (рейд банд) | `ghetto/army-crates.ts` |
| Армия: маскировка банд (форма у Смоки) | `org/army-disguise.ts`, `ghetto/index.ts` |
| Армия: доставка патронов (Barracks) | `vehicles/army-ammo-delivery.ts` |
| Админ: склады | `admin/warehouse.ts` |
| Список в /ahelp | `admin/catalog.ts` |
| Порядок старта | `src/index.ts` |
