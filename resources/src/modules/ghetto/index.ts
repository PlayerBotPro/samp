import { Actor, Dialog, omp, TextLabel, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerId } from "../../shared/player";
import { saveUserInventory, saveUserMoney } from "../auth/repository";
import {
  applyWallet,
  getAccount,
  isAuthenticated,
  patchAccount,
} from "../auth/session";
import {
  ORG_AZTECAS_ID,
  ORG_BALLAS_ID,
  ORG_GROVE_ID,
  ORG_RIFA_ID,
  ORG_VAGOS_ID,
  getMembership,
  isArmyDisguised,
  startArmyDisguise,
} from "../org";
import { STREET_WORLD } from "../spawn/point";
import type { GameModule } from "../types";
import { bindArmyAmmoCrates } from "./army-crates";

export const GHETTO_DEALER_MENU_DIALOG_ID = 63;
export const GHETTO_DEALER_BUY_DIALOG_ID = 64;

const DEALER_SKIN = 28;
const DEALER_NAME = "斯莫基";
const KEY_WALK = 1024;
const PLAYER_STATE_ONFOOT = 1;
const DIALOG_STYLE_LIST = 2;
const DIALOG_STYLE_INPUT = 1;
const INTERACT_RADIUS = 2.2;
const DENY_COOLDOWN_MS = 2500;
const LABEL_HEIGHT = 1.15;
const LABEL_DRAW_DISTANCE = 18;
const DRUG_PRICE = 50;
const MAX_BUY = 500;
const FORM_PRICE = 100_000;
const ANIM_SYNC_ALL = 1;

const DEALER = {
  x: 2515.9263,
  y: -1474.6146,
  z: 24.0046,
  angle: 2.6901,
} as const;

const GHETTO_GANG_IDS: ReadonlySet<number> = new Set([
  ORG_GROVE_ID,
  ORG_BALLAS_ID,
  ORG_VAGOS_ID,
  ORG_RIFA_ID,
  ORG_AZTECAS_ID,
]);

const lastDenyAt = new Map<number, number>();
let dealerActor: Actor | null = null;

export const ghettoModule: GameModule = {
  name: "ghetto",
  start() {
    spawnDealer();
    bindDealer();
    bindArmyAmmoCrates();
  },
};

function spawnDealer(): void {
  const actor = new Actor(DEALER_SKIN, DEALER.x, DEALER.y, DEALER.z, DEALER.angle);
  actor.setVirtualWorld(STREET_WORLD);
  actor.setInvulnerable(true);
  dealerActor = actor;
  applyDealerAnimation(actor);
  // The first call often only loads the library - retry on the next tick.
  setTimeout(() => applyDealerAnimation(actor), 250);

  new TextLabel(
    `${DEALER_NAME}\n商贩`,
    Color.info,
    DEALER.x,
    DEALER.y,
    DEALER.z + LABEL_HEIGHT,
    LABEL_DRAW_DISTANCE,
    STREET_WORLD,
    false
  );
}

/** The player must have the DEALER library loaded or the actor animation is invisible. */
function preloadDealerLibrary(player: Player): void {
  try {
    player.applyAnimation("DEALER", "DEALER_IDLE", 4.1, false, false, false, false, 1, ANIM_SYNC_ALL);
    player.clearAnimations(ANIM_SYNC_ALL);
  } catch {
    // Slot not ready yet / library will load while streaming.
  }
}

function applyDealerAnimation(actor: Actor): void {
  try {
    // Actor API: (animName, animLib, ...)
    actor.applyAnimation("DEALER_IDLE", "DEALER", 4.1, true, false, false, false, 0);
  } catch {
    // Actor not ready yet.
  }
}

function isDealerActor(actor: Actor): boolean {
  if (!dealerActor) {
    return false;
  }

  try {
    return actor.getID() === dealerActor.getID();
  } catch {
    return false;
  }
}

function bindDealer(): void {
  omp.on("playerConnect", (player) => {
    preloadDealerLibrary(player);
  });

  omp.on("actorStreamIn", (actor, forPlayer) => {
    if (!isDealerActor(actor)) {
      return;
    }

    preloadDealerLibrary(forPlayer);
    applyDealerAnimation(actor);
    setTimeout(() => applyDealerAnimation(actor), 100);
  });

  omp.on("playerKeyStateChange", (player, newKeys, oldKeys) => {
    const pressed = newKeys & ~oldKeys;
    if ((pressed & KEY_WALK) === 0) {
      return;
    }

    onInteract(player);
  });

  omp.on("dialogResponse", (player, dialogId, response, listItem, inputText) => {
    const id = Number(dialogId);
    if (id === GHETTO_DEALER_MENU_DIALOG_ID) {
      onMenuResponse(player, Number(response) !== 0, Number(listItem));
      return;
    }

    if (id === GHETTO_DEALER_BUY_DIALOG_ID) {
      onBuyResponse(player, Number(response) !== 0, String(inputText ?? ""));
    }
  });

  omp.on("playerDisconnect", (player) => {
    const id = playerId(player);
    if (id !== null) {
      lastDenyAt.delete(id);
    }
  });
}

function onInteract(player: Player): void {
  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    return;
  }

  if (!isNearDealer(player)) {
    return;
  }

  try {
    if (player.getState() !== PLAYER_STATE_ONFOOT) {
      return;
    }
  } catch {
    return;
  }

  if (!isGhettoGangMember(player)) {
    denyOutsider(player);
    return;
  }

  showMenu(player);
}

function showMenu(player: Player): void {
  try {
    Dialog.show(
      player,
      GHETTO_DEALER_MENU_DIALOG_ID,
      DIALOG_STYLE_LIST,
      DEALER_NAME,
      `购买毒品\n军服（$${FORM_PRICE}）`,
      "选择",
      "取消"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开对话框。");
  }
}

function onMenuResponse(player: Player, accepted: boolean, listItem: number): void {
  if (!accepted) {
    return;
  }

  if (!isNearDealer(player) || !isGhettoGangMember(player)) {
    return;
  }

  if (listItem === 0) {
    showBuyDialog(player);
    return;
  }

  if (listItem === 1) {
    buyArmyForm(player);
  }
}

function buyArmyForm(player: Player): void {
  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    return;
  }

  if (!isNearDealer(player)) {
    player.sendClientMessage(Color.error, "请靠近商贩。");
    return;
  }

  if (!isGhettoGangMember(player)) {
    denyOutsider(player);
    return;
  }

  const account = getAccount(player);
  if (!account) {
    return;
  }

  if (account.jailSeconds > 0) {
    player.sendClientMessage(Color.error, "监禁期间无法使用军服。");
    return;
  }

  if (isArmyDisguised(player)) {
    player.sendClientMessage(Color.error, `${DEALER_NAME}：你已经穿着军服了。`);
    return;
  }

  if (account.money < FORM_PRICE) {
    player.sendClientMessage(
      Color.error,
      `资金不足，需要$${FORM_PRICE}。`
    );
    return;
  }

  // Give the uniform first - otherwise money would already be deducted if it fails.
  if (!startArmyDisguise(player)) {
    player.sendClientMessage(Color.error, "无法发放军服。");
    return;
  }

  const nextMoney = account.money - FORM_PRICE;
  patchAccount(player, { money: nextMoney });
  const updated = getAccount(player);
  if (updated) {
    applyWallet(player, updated);
  }

  void saveUserMoney(account.id, nextMoney, account.bank).catch(() => {
    // Cache already updated.
  });

  player.sendClientMessage(
    Color.info,
    `${DEALER_NAME}：这是你花$${FORM_PRICE}买的军服，军队大门会为你打开。`
  );
  player.sendClientMessage(
    Color.gray,
    "死亡或断线后军服会被移除。"
  );
}

function showBuyDialog(player: Player): void {
  try {
    Dialog.show(
      player,
      GHETTO_DEALER_BUY_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "购买毒品",
      `你想购买多少份？\n单价：$${DRUG_PRICE}`,
      "购买",
      "取消"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开对话框。");
  }
}

function onBuyResponse(player: Player, accepted: boolean, rawInput: string): void {
  if (!accepted) {
    return;
  }

  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    return;
  }

  if (!isNearDealer(player)) {
    player.sendClientMessage(Color.error, "请靠近商贩。");
    return;
  }

  if (!isGhettoGangMember(player)) {
    denyOutsider(player);
    return;
  }

  const account = getAccount(player);
  if (!account) {
    return;
  }

  const amount = Math.floor(Number(rawInput.trim().replace(",", ".")));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) {
    player.sendClientMessage(Color.error, "请输入大于0的整数。");
    showBuyDialog(player);
    return;
  }

  if (amount > MAX_BUY) {
    player.sendClientMessage(Color.error, `单次最多购买${MAX_BUY}份。`);
    showBuyDialog(player);
    return;
  }

  const total = amount * DRUG_PRICE;
  if (!Number.isSafeInteger(total) || total <= 0) {
    player.sendClientMessage(Color.error, "数量过大。");
    showBuyDialog(player);
    return;
  }

  if (account.money < total) {
    player.sendClientMessage(Color.error, `资金不足，需要$${total}。`);
    showBuyDialog(player);
    return;
  }

  const nextDrugs = account.drugs + amount;
  if (!Number.isSafeInteger(nextDrugs) || nextDrugs < account.drugs) {
    player.sendClientMessage(Color.error, "数量过大。");
    showBuyDialog(player);
    return;
  }

  const nextMoney = account.money - total;
  patchAccount(player, { money: nextMoney, drugs: nextDrugs });
  const updated = getAccount(player);
  if (updated) {
    applyWallet(player, updated);
  }

  void Promise.all([
    saveUserMoney(account.id, nextMoney, account.bank),
    saveUserInventory(account.id, nextDrugs, account.ammo, account.metal),
  ]).catch(() => {
    // Cache already updated.
  });

  player.sendClientMessage(
    Color.info,
    `${DEALER_NAME}：这是你花$${total}买的${amount}份。`
  );
  player.sendClientMessage(Color.white, `毒品：${nextDrugs}份。`);
}

function denyOutsider(player: Player): void {
  const id = playerId(player);
  if (id === null) {
    return;
  }

  const now = Date.now();
  const last = lastDenyAt.get(id) ?? 0;
  if (now - last < DENY_COOLDOWN_MS) {
    return;
  }

  lastDenyAt.set(id, now);
  player.sendClientMessage(Color.gray, `${DEALER_NAME}：我只和本地人做生意。`);
}

function isGhettoGangMember(player: Player): boolean {
  const account = getAccount(player);
  if (!account) {
    return false;
  }

  const membership = getMembership(account);
  return membership !== null && GHETTO_GANG_IDS.has(membership.org.id);
}

function isNearDealer(player: Player): boolean {
  try {
    if (player.getVirtualWorld() !== STREET_WORLD || player.getInterior() !== 0) {
      return false;
    }

    const pos = player.getPos();
    return (
      Math.hypot(pos.x - DEALER.x, pos.y - DEALER.y, pos.z - DEALER.z) <= INTERACT_RADIUS
    );
  } catch {
    return false;
  }
}
