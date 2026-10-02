import {
  Dialog,
  ObjectMp,
  omp,
  Pickup,
  TextLabel,
  type Player,
} from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerId } from "../../shared/player";
import { getAccount, isAuthenticated, patchAccount, applyWallet } from "../auth/session";
import { getExam } from "../autoschool/session";
import { isLoaderOnShift } from "../loader";
import { isMinerOnShift } from "../miner";
import { resolvePlayerSkin, ORG_ARMY_ID } from "../org";
import { getMembership } from "../org/membership";
import { refreshArmyAmmoStockLabel } from "../org/army-locker";
import { queueSave } from "../persist";
import { isJailed } from "../prison/sentence";
import type { GameModule } from "../types";
import { addWarehouseAmmo } from "../warehouse";
import {
  ARMY_FACTORY_INTERIOR,
  ARMY_FACTORY_WORLD,
  BENCH_POINTS,
  BLANK_POINTS,
  HIRE_POINT,
  STOCK_POINTS,
} from "./points";

export const ARMY_FACTORY_HIRE_DIALOG_ID = 60;
export const ARMY_FACTORY_QUIT_DIALOG_ID = 61;

const PICKUP_TYPE = 1;
const HIRE_PICKUP_MODEL = 1275;
const BLANK_PICKUP_MODEL = 19135;
const BENCH_PICKUP_MODEL = 18635;
const STOCK_PICKUP_MODEL = 1575;
const BLANK_ATTACH_MODEL = 1575;
const TOOL_ATTACH_MODEL = 18635;
const PRODUCT_MODEL = 1790;
const PICKUP_RADIUS = 1.45;
const LABEL_HEIGHT = 0.85;
const LABEL_DRAW_DISTANCE = 14;
const TICK_MS = 200;
const PLAYER_STATE_ONFOOT = 1;
const ANIM_SYNC_ALL = 1;
const SPECIAL_ACTION_NONE = 0;
const SPECIAL_ACTION_CARRY = 25;
const SLOT_HAND = 1;
const SKIN_MALE = 260;
const SKIN_FEMALE = 190;
const DIALOG_STYLE_MSGBOX = 0;
const CRAFT_MS = 20_000;
const PAY_PER_BOX = 30;
const FINE_PER_DEFECT = 15;
const AMMO_PER_BOX = 40;
const CRAFT_SUCCESS_CHANCE = 0.7;
const OBJECT_DRAW = 80;

type Phase = "idle" | "blank" | "craft" | "product";

type Job = {
  phase: Phase;
  delivered: number;
  defects: number;
  craftObject: ObjectMp | null;
  craftTimer: ReturnType<typeof setTimeout> | null;
};

const jobs = new Map<number, Job>();
const standing = new Map<number, string>();

export function isArmyFactoryOnShift(player: Player): boolean {
  const id = playerId(player);
  return id !== null && jobs.has(id);
}

/** Finish a shift with payment (leave factory / locker room). */
export function endArmyFactoryShift(player: Player): void {
  finishShift(player, { requireHirePoint: false, notifyExit: true });
}

export const armyFactoryModule: GameModule = {
  name: "army-factory",
  start() {
    spawnPickups();

    setInterval(tickFactory, TICK_MS);

    omp.on("playerConnect", (player) => {
      forgetSlot(player);
    });

    omp.on("dialogResponse", (player, dialogId, response) => {
      const id = Number(dialogId);
      const ok = Number(response) !== 0;

      if (id === ARMY_FACTORY_HIRE_DIALOG_ID) {
        if (ok) {
          hire(player);
        }
        return;
      }

      if (id === ARMY_FACTORY_QUIT_DIALOG_ID && ok) {
        finishShift(player, { requireHirePoint: true, notifyExit: false });
      }
    });

    omp.on("playerDeath", (player) => {
      abortShift(player, true);
    });

    omp.on("playerDisconnect", (player) => {
      abortShift(player, false);
      forgetSlot(player);
    });
  },
};

function spawnPickups(): void {
  new Pickup(
    HIRE_PICKUP_MODEL,
    PICKUP_TYPE,
    HIRE_POINT.x,
    HIRE_POINT.y,
    HIRE_POINT.z,
    ARMY_FACTORY_WORLD
  );
  new TextLabel(
    "Ammunition Workshop\nLocker Room",
    Color.info,
    HIRE_POINT.x,
    HIRE_POINT.y,
    HIRE_POINT.z + LABEL_HEIGHT,
    LABEL_DRAW_DISTANCE,
    ARMY_FACTORY_WORLD,
    false
  );

  for (const point of BLANK_POINTS) {
    new Pickup(
      BLANK_PICKUP_MODEL,
      PICKUP_TYPE,
      point.x,
      point.y,
      point.z,
      ARMY_FACTORY_WORLD
    );
    new TextLabel(
      "Blanks\nCasings",
      Color.info,
      point.x,
      point.y,
      point.z + LABEL_HEIGHT,
      LABEL_DRAW_DISTANCE,
      ARMY_FACTORY_WORLD,
      false
    );
  }

  for (const bench of BENCH_POINTS) {
    new Pickup(
      BENCH_PICKUP_MODEL,
      PICKUP_TYPE,
      bench.pickup.x,
      bench.pickup.y,
      bench.pickup.z,
      ARMY_FACTORY_WORLD
    );
    new TextLabel(
      "Machine\nAmmunition Assembly",
      Color.info,
      bench.pickup.x,
      bench.pickup.y,
      bench.pickup.z + LABEL_HEIGHT,
      LABEL_DRAW_DISTANCE,
      ARMY_FACTORY_WORLD,
      false
    );
  }

  for (const point of STOCK_POINTS) {
    new Pickup(
      STOCK_PICKUP_MODEL,
      PICKUP_TYPE,
      point.x,
      point.y,
      point.z,
      ARMY_FACTORY_WORLD
    );
    new TextLabel(
      "Warehouse\nFinished Ammunition",
      Color.info,
      point.x,
      point.y,
      point.z + LABEL_HEIGHT,
      LABEL_DRAW_DISTANCE,
      ARMY_FACTORY_WORLD,
      false
    );
  }
}

function tickFactory(): void {
  omp.players.forEach((player) => {
    if (!isPlayerActive(player) || !isAuthenticated(player)) {
      return;
    }

    const id = playerId(player);
    if (id === null) {
      return;
    }

    try {
      const job = jobs.get(id);
      const world = player.getVirtualWorld();
      const interior = player.getInterior();
      const inFactory =
        world === ARMY_FACTORY_WORLD && interior === ARMY_FACTORY_INTERIOR;

      // /goto, /tpint, etc.: the shift must not remain active outside the workshop.
      if (job && !inFactory) {
        endArmyFactoryShift(player);
        standing.delete(id);
        return;
      }

      if (!inFactory) {
        standing.delete(id);
        return;
      }

      if (player.getState() !== PLAYER_STATE_ONFOOT) {
        standing.delete(id);
        return;
      }

      if (job?.phase === "craft") {
        return;
      }

      const pos = player.getPos();
      const zone = resolveZone(pos);
      if (!zone) {
        standing.delete(id);
        return;
      }

      if (standing.get(id) === zone.key) {
        return;
      }

      standing.set(id, zone.key);

      switch (zone.kind) {
        case "hire":
          onHirePickup(player, job);
          break;
        case "blank":
          onBlankPickup(player, job);
          break;
        case "bench":
          onBenchPickup(player, job, zone.index);
          break;
        case "stock":
          onStockPickup(player, job);
          break;
      }
    } catch {
      // Slot is empty.
    }
  });
}

function resolveZone(pos: {
  x: number;
  y: number;
  z: number;
}):
  | { kind: "hire"; key: string }
  | { kind: "blank"; key: string; index: number }
  | { kind: "bench"; key: string; index: number }
  | { kind: "stock"; key: string; index: number }
  | null {
  if (near(pos, HIRE_POINT)) {
    return { kind: "hire", key: "hire" };
  }

  for (let i = 0; i < BLANK_POINTS.length; i++) {
    if (near(pos, BLANK_POINTS[i]!)) {
      return { kind: "blank", key: `blank:${i}`, index: i };
    }
  }

  for (let i = 0; i < BENCH_POINTS.length; i++) {
    if (near(pos, BENCH_POINTS[i]!.pickup)) {
      return { kind: "bench", key: `bench:${i}`, index: i };
    }
  }

  for (let i = 0; i < STOCK_POINTS.length; i++) {
    if (near(pos, STOCK_POINTS[i]!)) {
      return { kind: "stock", key: `stock:${i}`, index: i };
    }
  }

  return null;
}

function onHirePickup(player: Player, job: Job | undefined): void {
  if (job) {
    showQuitDialog(player, job);
    return;
  }

  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (membership?.org.id !== ORG_ARMY_ID) {
    player.sendClientMessage(Color.error, "Workshop work is only available to Army personnel.");
    return;
  }

  showHireDialog(player);
}

function onBlankPickup(player: Player, job: Job | undefined): void {
  if (!job) {
    player.sendClientMessage(Color.error, "Start your shift at the locker room first.");
    return;
  }

  if (job.phase === "blank") {
    player.sendClientMessage(Color.error, "You already have a casing blank.");
    return;
  }

  if (job.phase !== "idle") {
    player.sendClientMessage(
      Color.error,
      job.phase === "product"
        ? "Deliver the finished ammunition to the warehouse first."
        : "Wait for the assembly to finish."
    );
    return;
  }

  job.phase = "blank";
  giveCarry(player, BLANK_ATTACH_MODEL);
  player.sendClientMessage(
    Color.info,
    "You took a casing blank. Take it to an assembly machine."
  );
}

function onBenchPickup(
  player: Player,
  job: Job | undefined,
  benchIndex: number
): void {
  if (!job) {
    player.sendClientMessage(Color.error, "Start your shift at the locker room first.");
    return;
  }

  if (job.phase === "craft") {
    return;
  }

  if (job.phase !== "blank") {
    player.sendClientMessage(
      Color.error,
      job.phase === "product"
        ? "The ammunition is assembled - take it to the warehouse."
        : "Take a casing blank from a yellow pickup."
    );
    return;
  }

  const bench = BENCH_POINTS[benchIndex];
  if (!bench) {
    return;
  }

  startCraft(player, job, bench);
}

function onStockPickup(player: Player, job: Job | undefined): void {
  if (!job) {
    player.sendClientMessage(Color.error, "Start your shift at the locker room first.");
    return;
  }

  if (job.phase !== "product") {
    player.sendClientMessage(
      Color.error,
      job.phase === "blank"
        ? "Assemble the ammunition on a machine first."
        : "You do not have finished ammunition."
    );
    return;
  }

  job.phase = "idle";
  job.delivered += 1;
  clearCarry(player);
  playPutdown(player);

  addWarehouseAmmo(ORG_ARMY_ID, AMMO_PER_BOX);
  refreshArmyAmmoStockLabel();

  player.sendClientMessage(
    Color.info,
    `Batch delivered to the Army warehouse (+${AMMO_PER_BOX} ammunition). Batches completed: ${job.delivered}.`
  );
}

function startCraft(
  player: Player,
  job: Job,
  bench: (typeof BENCH_POINTS)[number]
): void {
  const id = playerId(player);
  if (id === null) {
    return;
  }

  clearCarry(player);
  job.phase = "craft";

  try {
    destroyCraftObject(job);
    job.craftObject = new ObjectMp(
      PRODUCT_MODEL,
      bench.object.x,
      bench.object.y,
      bench.object.z,
      0,
      0,
      bench.object.rz,
      OBJECT_DRAW
    );
  } catch {
    job.craftObject = null;
  }

  try {
    player.setFacingAngle(bench.facing);
    player.toggleControllable(false);
    player.applyAnimation(
      "OTB",
      "BETSLP_LOOP",
      4.1,
      true,
      false,
      false,
      false,
      0,
      ANIM_SYNC_ALL
    );
    player.setAttachedObject(
      SLOT_HAND,
      TOOL_ATTACH_MODEL,
      5,
      0.037,
      0.072,
      0,
      155,
      0,
      0,
      1,
      1,
      1,
      0,
      0
    );
  } catch {
    // Otherwise phase=craft + freeze without a timer causes a permanent lock.
    cancelCraft(player, job, true);
    job.phase = "blank";
    giveCarry(player, BLANK_ATTACH_MODEL);
    player.sendClientMessage(Color.error, "The machine is unavailable; try again.");
    return;
  }

  if (job.craftTimer) {
    clearTimeout(job.craftTimer);
  }

  job.craftTimer = setTimeout(() => {
    job.craftTimer = null;
    finishCraft(player, id);
  }, CRAFT_MS);
}

function finishCraft(player: Player, expectedId: number): void {
  const id = playerId(player);
  if (id === null || id !== expectedId) {
    return;
  }

  const job = jobs.get(id);
  if (!job || job.phase !== "craft") {
    return;
  }

  destroyCraftObject(job);
  clearHandObject(player);

  try {
    player.clearAnimations(ANIM_SYNC_ALL);
    player.toggleControllable(true);
  } catch {
    // Player has already disconnected.
  }

  if (!isPlayerActive(player)) {
    return;
  }

  const success = Math.random() < CRAFT_SUCCESS_CHANCE;
  if (!success) {
    job.phase = "idle";
    job.defects += 1;
    player.sendClientMessage(
      Color.error,
      "Defect: the casings cracked. Take a new blank."
    );
    return;
  }

  job.phase = "product";
  giveCarry(player, BLANK_ATTACH_MODEL);
  player.sendClientMessage(
    Color.info,
    "Ammunition assembled. Take the box to the finished-goods warehouse."
  );
}

function hire(player: Player): void {
  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    return;
  }

  const id = playerId(player);
  const account = getAccount(player);
  if (id === null || !account) {
    return;
  }

  if (jobs.has(id)) {
    return;
  }

  if (account.hospitalized) {
    player.sendClientMessage(Color.error, "Finish treatment first.");
    return;
  }

  if (isJailed(player)) {
    player.sendClientMessage(Color.error, "You cannot work in prison.");
    return;
  }

  if (isMinerOnShift(player) || isLoaderOnShift(player)) {
    player.sendClientMessage(Color.error, "Finish your other job first.");
    return;
  }

  if (getExam(player)) {
    player.sendClientMessage(Color.error, "Finish your driving-school exam first.");
    return;
  }

  const membership = getMembership(account);
  if (membership?.org.id !== ORG_ARMY_ID) {
    player.sendClientMessage(Color.error, "Workshop work is only available to Army personnel.");
    return;
  }

  if (!isInFactoryOnFoot(player) || !near(player.getPos(), HIRE_POINT, PICKUP_RADIUS + 0.8)) {
    player.sendClientMessage(Color.error, "Move closer to the workshop locker room.");
    return;
  }

  const skin = account.gender === "female" ? SKIN_FEMALE : SKIN_MALE;
  jobs.set(id, {
    phase: "idle",
    delivered: 0,
    defects: 0,
    craftObject: null,
    craftTimer: null,
  });

  try {
    player.setSkin(skin);
    preloadAnims(player);
  } catch {
    abortShift(player, false);
    return;
  }

  player.sendClientMessage(
    Color.info,
    "Ammunition workshop shift started. Take a casing blank and assemble a batch at a machine."
  );
  player.sendClientMessage(
    Color.info,
    "Deliver finished ammunition to the warehouse. End the shift at the locker room."
  );
}

function finishShift(
  player: Player,
  options: { requireHirePoint: boolean; notifyExit: boolean }
): void {
  const id = playerId(player);
  const account = getAccount(player);
  const job = id !== null ? jobs.get(id) : undefined;
  if (id === null || !account || !job) {
    return;
  }

  if (options.requireHirePoint) {
    try {
      if (
        !isInFactoryOnFoot(player) ||
        !near(player.getPos(), HIRE_POINT, PICKUP_RADIUS + 0.8)
      ) {
        player.sendClientMessage(Color.error, "Move closer to the workshop locker room.");
        return;
      }
    } catch {
      return;
    }
  }

  const salary = Math.max(0, job.delivered * PAY_PER_BOX - job.defects * FINE_PER_DEFECT);
  const delivered = job.delivered;
  const defects = job.defects;

  cancelCraft(player, job, true);
  restoreWorker(player, resolvePlayerSkin(account));
  jobs.delete(id);
  standing.delete(id);

  if (salary > 0) {
    patchAccount(player, { money: account.money + salary });
    const updated = getAccount(player);
    if (updated) {
      applyWallet(player, updated);
    }
    queueSave(player);
  }

  if (!isPlayerActive(player)) {
    return;
  }

  if (options.notifyExit) {
    player.sendClientMessage(
      Color.info,
      salary > 0
        ? `You left the factory. Shift closed. Pay: $${salary}.`
        : "You left the factory. Shift closed."
    );
    return;
  }

  if (delivered > 0 || defects > 0) {
    player.sendClientMessage(
      Color.info,
      `Shift ended. Batches: ${delivered}, defects: ${defects}. Pay: $${salary}.`
    );
  } else {
    player.sendClientMessage(Color.info, "Shift ended. You earned nothing.");
  }
}

function abortShift(player: Player, notify: boolean): void {
  const id = playerId(player);
  const job = id !== null ? jobs.get(id) : undefined;
  if (id === null || !job) {
    return;
  }

  cancelCraft(player, job, true);
  const account = getAccount(player);
  restoreWorker(player, account ? resolvePlayerSkin(account) : null);
  jobs.delete(id);
  standing.delete(id);

  if (notify && isPlayerActive(player)) {
    player.sendClientMessage(
      Color.error,
      "Shift interrupted. Unpaid wages were forfeited."
    );
  }
}

function cancelCraft(player: Player, job: Job, unlock: boolean): void {
  if (job.craftTimer) {
    clearTimeout(job.craftTimer);
    job.craftTimer = null;
  }

  destroyCraftObject(job);
  clearCarry(player);

  if (unlock) {
    try {
      player.toggleControllable(true);
      player.clearAnimations(ANIM_SYNC_ALL);
    } catch {
      // Player has already disconnected.
    }
  }
}

function destroyCraftObject(job: Job): void {
  if (!job.craftObject) {
    return;
  }

  try {
    job.craftObject.destroy();
  } catch {
    // Already destroyed.
  }

  job.craftObject = null;
}

function giveCarry(player: Player, model: number): void {
  clearCarry(player);
  try {
    player.setAttachedObject(
      SLOT_HAND,
      model,
      1,
      -0.073,
      0.358,
      -0.032,
      0,
      88,
      0,
      1,
      1,
      1,
      0,
      0
    );
    player.setSpecialAction(SPECIAL_ACTION_CARRY);
  } catch {
    // Slot is not ready yet.
  }
}

function clearCarry(player: Player): void {
  clearHandObject(player);
  try {
    player.setSpecialAction(SPECIAL_ACTION_NONE);
    player.clearAnimations(ANIM_SYNC_ALL);
  } catch {
    // Player has already disconnected.
  }
}

function clearHandObject(player: Player): void {
  try {
    player.removeAttachedObject(SLOT_HAND);
  } catch {
    // Slot did not exist.
  }
}

function playPutdown(player: Player): void {
  try {
    player.applyAnimation(
      "CARRY",
      "PUTDWN",
      4.1,
      false,
      false,
      false,
      false,
      0,
      ANIM_SYNC_ALL
    );
  } catch {
    // Library will load later.
  }
}

function preloadAnims(player: Player): void {
  try {
    player.applyAnimation("OTB", "BETSLP_LOOP", 4.1, false, false, false, false, 1, ANIM_SYNC_ALL);
    player.applyAnimation("CARRY", "PUTDWN", 4.1, false, false, false, false, 1, ANIM_SYNC_ALL);
    player.clearAnimations(ANIM_SYNC_ALL);
  } catch {
    // It will load on the first assembly.
  }
}

function restoreWorker(player: Player, skin: number | null): void {
  try {
    clearCarry(player);
    player.toggleControllable(true);
    if (skin !== null) {
      player.setSkin(skin);
    }
  } catch {
    // Player has already disconnected.
  }
}

function showHireDialog(player: Player): void {
  try {
    Dialog.show(
      player,
      ARMY_FACTORY_HIRE_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "Ammunition Workshop",
      "Change clothes and start a shift in the ammunition workshop?",
      "Yes",
      "No"
    );
  } catch {
    player.sendClientMessage(Color.error, "Failed to open dialog.");
  }
}

function showQuitDialog(player: Player, job: Job): void {
  const salary = Math.max(0, job.delivered * PAY_PER_BOX - job.defects * FINE_PER_DEFECT);
  try {
    Dialog.show(
      player,
      ARMY_FACTORY_QUIT_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "Ammunition Workshop",
      `End shift and collect pay?\nBatches: ${job.delivered}, defects: ${job.defects}, payable: $${salary}`,
      "Yes",
      "No"
    );
  } catch {
    player.sendClientMessage(Color.error, "Failed to open dialog.");
  }
}

function isInFactoryOnFoot(player: Player): boolean {
  try {
    return (
      player.getState() === PLAYER_STATE_ONFOOT &&
      player.getVirtualWorld() === ARMY_FACTORY_WORLD &&
      player.getInterior() === ARMY_FACTORY_INTERIOR
    );
  } catch {
    return false;
  }
}

function near(
  pos: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
  radius = PICKUP_RADIUS
): boolean {
  return Math.hypot(pos.x - point.x, pos.y - point.y, pos.z - point.z) <= radius;
}

function forgetSlot(player: Player): void {
  const id = playerId(player);
  if (id !== null) {
    standing.delete(id);
  }
}
