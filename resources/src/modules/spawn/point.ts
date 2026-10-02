import type { Player } from "@omp-node/core";
import { isPlayerActive, playerId } from "../../shared/player";
import { trustPosition } from "../anticheat/trust";

export type SpawnPoint = {
  x: number;
  y: number;
  z: number;
  angle: number;
  interior: number;
  world: number;
};

export type PlaceAtOptions = {
  /**
   * milliseconds to freeze after teleportation (for collision/texture loading).
   * `false` - do not freeze. Default: interior>0 or not outdoors -> 2500 ms.
   */
  settleMs?: number | false;
};

export const NO_TEAM = 255;

/** Skin for the class selector when the player does not yet have an account. */
export const DEFAULT_SPAWN_SKIN = 26;

export const STREET_WORLD = 0;

/** Delay after entering an interior/custom VW while objects load. */
export const INTERIOR_SETTLE_MS = 2500;

/** Separate hospital VW: players and pickups inside do not overlap with the street. */
export const HOSPITAL_WORLD = 1;

/** Separate prison VW: sky interior does not overlap with the street. Bank = 2. */
export const PRISON_WORLD = 3;

/** Prison yard at station coordinates: players do not overlap with the street. */
export const PRISON_YARD_WORLD = 4;

/** Mafias (interior 5): LCN VW 14, Yakuza 15, Russian 16 - `org/mafias.ts`. */
/** Gangs (houses): Grove VW 9, Ballas 10, Vagos 11, Rifa 12, Aztecas 13 - `org/gangs.ts`. */
/** Radio center (custom interior): VW 8 - `org/radio.ts`. */
/** City Hall (custom interior): VW 3 (= org id) - `org/meriya.ts`. Matches PRISON_WORLD; coordinates are far apart. */

/** Normal spawn while the player is not in an organization. */
export const DEFAULT_SPAWN: SpawnPoint = {
  x: 1760.2538,
  y: -1898.8334,
  z: 13.5629,
  angle: 269.124,
  interior: 0,
  world: STREET_WORLD,
};

export const HOSPITAL_SPAWNS: readonly SpawnPoint[] = [
  {
    x: 1172.5653,
    y: -1344.8042,
    z: 4001.1001,
    angle: 90.5063,
    interior: 0,
    world: HOSPITAL_WORLD,
  },
  {
    x: 1172.564,
    y: -1354.6053,
    z: 4001.1001,
    angle: 89.9031,
    interior: 0,
    world: HOSPITAL_WORLD,
  },
  {
    x: 1165.129,
    y: -1361.8331,
    z: 4001.1001,
    angle: 0.9389,
    interior: 0,
    world: HOSPITAL_WORLD,
  },
  {
    x: 1158.2642,
    y: -1354.5325,
    z: 4001.1001,
    angle: 271.0115,
    interior: 0,
    world: HOSPITAL_WORLD,
  },
  {
    x: 1157.9478,
    y: -1344.7404,
    z: 4001.1001,
    angle: 270.0948,
    interior: 0,
    world: HOSPITAL_WORLD,
  },
];

const settleTimers = new Map<number, ReturnType<typeof setTimeout>>();
/** Token for the active settle session (an expired timer does not affect controls). */
const settleTokens = new Map<number, object>();

export function pickHospitalSpawn(): SpawnPoint {
  const first = HOSPITAL_SPAWNS[0];
  if (!first) {
    return DEFAULT_SPAWN;
  }

  const index = Math.floor(Math.random() * HOSPITAL_SPAWNS.length);
  return HOSPITAL_SPAWNS[index] ?? first;
}

export function writeSpawnInfo(player: Player, skin: number, point: SpawnPoint): void {
  player.setSpawnInfo(
    NO_TEAM,
    skin,
    point.x,
    point.y,
    point.z,
    point.angle,
    0,
    0,
    0,
    0,
    0,
    0
  );
}

export function placeAt(player: Player, point: SpawnPoint, options?: PlaceAtOptions): void {
  // Clear the previous settle freeze (otherwise exit/new teleport causes a permanent lock).
  clearPlaceAtSettle(player);

  player.setInterior(point.interior);
  player.setVirtualWorld(point.world);
  player.setPos(point.x, point.y, point.z);
  player.setFacingAngle(point.angle);
  player.setCameraBehind();
  trustPosition(player, point.x, point.y, point.z, point.interior, point.world);

  const settleMs = resolveSettleMs(point, options);
  if (settleMs <= 0) {
    return;
  }

  const id = playerId(player);
  if (id === null) {
    return;
  }

  try {
    player.toggleControllable(false);
  } catch {
    return;
  }

  const token = {};
  settleTokens.set(id, token);

  settleTimers.set(
    id,
    setTimeout(() => {
      settleTimers.delete(id);
      if (settleTokens.get(id) !== token) {
        return;
      }
      settleTokens.delete(id);

      try {
        if (isPlayerActive(player)) {
          player.toggleControllable(true);
        }
      } catch {
        // The player has already disconnected.
      }
    }, settleMs)
  );
}

/** Clear pending unfreeze (disconnect / new teleport). */
export function clearPlaceAtSettle(player: Player): void {
  const id = playerId(player);
  if (id === null) {
    return;
  }

  const hadSettle = settleTimers.has(id) || settleTokens.has(id);

  const timer = settleTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    settleTimers.delete(id);
  }
  settleTokens.delete(id);

  // Unfreeze only if we froze the player (not mine / machine / skin picker).
  if (!hadSettle) {
    return;
  }

  try {
    if (isPlayerActive(player)) {
      player.toggleControllable(true);
    }
  } catch {
    // The player has already disconnected.
  }
}

function resolveSettleMs(point: SpawnPoint, options?: PlaceAtOptions): number {
  if (options?.settleMs === false) {
    return 0;
  }

  if (typeof options?.settleMs === "number") {
    return Math.max(0, options.settleMs);
  }

  // Interior or custom VW (hospital, prison, factory, HQ...) - wait for collision loading.
  if (point.interior > 0 || point.world !== STREET_WORLD) {
    return INTERIOR_SETTLE_MS;
  }

  return 0;
}
