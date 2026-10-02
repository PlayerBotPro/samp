import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { clipClientMessage } from "../../shared/nearby";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { saveUserInventory } from "../auth/repository";
import { getAccount, isAuthenticated, patchAccount } from "../auth/session";
import { getMembership, getOrganization } from "../org";
import { findGangStockAtPlayer, refreshGangWarehouseLabels } from "./gang-stock";
import { findMafiaStockAtPlayer, refreshMafiaWarehouseLabels } from "./mafia-stock";
import {
  addWarehouseAmmo,
  addWarehouseDrugs,
  addWarehouseMetal,
  getWarehouse,
  setWarehouseLocked,
  takeWarehouseAmmo,
  takeWarehouseDrugs,
  takeWarehouseMetal,
  warehouseUsesLock,
} from "./repository";
import {
  clearOrgStockVisit,
  clearOrgStockVisitById,
  isOrgStockDialogBusy,
  markOrgStockVisit,
  setOrgStockDialogBusy,
} from "./stock-visit";

export const ORG_WAREHOUSE_MENU_DIALOG_ID = 65;
export const ORG_WAREHOUSE_AMOUNT_DIALOG_ID = 66;

const DIALOG_STYLE_LIST = 2;
const DIALOG_STYLE_INPUT = 1;
const PLAYER_STATE_ONFOOT = 1;
const LOCK_MIN_RANK = 7;
const MAX_TRANSFER = 10_000;
const DENY_COOLDOWN_MS = 2500;
const LIME = "{9ACD32}";

type StockItem = "ammo" | "metal" | "drugs";
type StockAction = "put" | "take";

type PendingTransfer = {
  orgId: number;
  action: StockAction;
  item: StockItem;
};

type OrgStockPoint = {
  orgId: number;
  x: number;
  y: number;
  z: number;
  world: number;
  interior: number;
};

const ITEM_LABEL: Record<StockItem, string> = {
  ammo: "ammunition",
  metal: "metal",
  drugs: "drugs",
};

const pendingByPlayer = new Map<number, PendingTransfer>();
const lastDenyAt = new Map<number, number>();

export function bindOrgWarehouseInteract(): void {
  omp.on("playerEnterCheckpoint", (player) => {
    tryOpenStockMenu(player);
  });

  omp.on("dialogResponse", (player, dialogId, response, listItem, inputText) => {
    const id = Number(dialogId);
    if (id === ORG_WAREHOUSE_MENU_DIALOG_ID) {
      setOrgStockDialogBusy(player, false);
      onMenuResponse(player, Number(response) !== 0, Number(listItem));
      return;
    }

    if (id === ORG_WAREHOUSE_AMOUNT_DIALOG_ID) {
      setOrgStockDialogBusy(player, false);
      onAmountResponse(player, Number(response) !== 0, String(inputText ?? ""));
    }
  });

  omp.on("playerDisconnect", (player) => {
    const id = playerId(player);
    if (id === null) {
      return;
    }

    pendingByPlayer.delete(id);
    lastDenyAt.delete(id);
    clearOrgStockVisitById(id);
  });
}

/**
 * Warehouse tick: player left the marker radius - reset the visit.
 * (To reopen the menu, step away and return to the marker.)
 */
export function notifyOrgStockStanding(player: Player, inside: boolean): void {
  if (inside) {
    return;
  }

  // Do not reset pending while the dialog is open (otherwise amount input is silently lost).
  if (isOrgStockDialogBusy(player)) {
    return;
  }

  clearPending(player);
  clearOrgStockVisit(player);
}

function tryOpenStockMenu(player: Player): void {
  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    return;
  }

  if (isOrgStockDialogBusy(player)) {
    return;
  }

  const stock = findStockAtPlayer(player);
  if (!stock) {
    return;
  }

  try {
    if (player.getState() !== PLAYER_STATE_ONFOOT) {
      return;
    }
  } catch {
    return;
  }

  if (!markOrgStockVisit(player)) {
    return;
  }

  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!membership || membership.org.id !== stock.orgId) {
    denyOutsider(player, stock.orgId);
    return;
  }

  showMenu(player, stock.orgId);
}

function showMenu(player: Player, orgId: number): void {
  const wh = getWarehouse(orgId);
  // Locked -> "Open warehouse", open -> "Lock warehouse".
  const lockLabel =
    wh && !wh.isLocked ? "Lock warehouse" : "Open warehouse";
  const body = [
    "Store ammunition",
    "Store metal",
    "Store drugs",
    `${LIME}Take ammunition`,
    `${LIME}Take metal`,
    `${LIME}Take drugs`,
    lockLabel,
  ].join("\n");

  try {
    Dialog.show(
      player,
      ORG_WAREHOUSE_MENU_DIALOG_ID,
      DIALOG_STYLE_LIST,
      "Organization warehouse",
      body,
      "Select",
      "Cancel"
    );
    setOrgStockDialogBusy(player, true);
  } catch {
    player.sendClientMessage(Color.error, "Could not open the dialog.");
  }
}

function onMenuResponse(player: Player, accepted: boolean, listItem: number): void {
  if (!accepted) {
    clearPending(player);
    return;
  }

  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    return;
  }

  const stock = findStockAtPlayer(player);
  if (!stock) {
    player.sendClientMessage(Color.error, "Move closer to the warehouse.");
    return;
  }

  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!membership || membership.org.id !== stock.orgId) {
    denyOutsider(player, stock.orgId);
    return;
  }

  if (listItem === 6) {
    toggleLock(player, stock.orgId);
    // Immediately show the menu with the current "Open/Lock" state.
    showMenu(player, stock.orgId);
    return;
  }

  const mapped = menuItemToAction(listItem);
  if (!mapped) {
    return;
  }

  const wh = getWarehouse(stock.orgId);
  if (mapped.action === "take" && wh?.isLocked) {
    player.sendClientMessage(Color.error, "The warehouse is locked.");
    return;
  }

  const id = playerId(player);
  if (id === null) {
    return;
  }

  pendingByPlayer.set(id, {
    orgId: stock.orgId,
    action: mapped.action,
    item: mapped.item,
  });
  showAmountDialog(player, mapped.action, mapped.item, stock.orgId);
}

function menuItemToAction(
  listItem: number
): { action: StockAction; item: StockItem } | null {
  switch (listItem) {
    case 0:
      return { action: "put", item: "ammo" };
    case 1:
      return { action: "put", item: "metal" };
    case 2:
      return { action: "put", item: "drugs" };
    case 3:
      return { action: "take", item: "ammo" };
    case 4:
      return { action: "take", item: "metal" };
    case 5:
      return { action: "take", item: "drugs" };
    default:
      return null;
  }
}

function showAmountDialog(
  player: Player,
  action: StockAction,
  item: StockItem,
  orgId: number
): void {
  const account = getAccount(player);
  if (!account) {
    clearPending(player);
    return;
  }

  const wh = getWarehouse(orgId);
  const label = ITEM_LABEL[item];
  const playerHave = playerItemAmount(account, item);
  const stockHave = wh ? warehouseItemAmount(wh, item) : 0;
  const verb = action === "put" ? "store" : "take";
  const available =
    action === "put"
      ? `You have: ${playerHave} units\nIn warehouse: ${stockHave} units`
      : `In warehouse: ${stockHave} units\nYou have: ${playerHave} units`;

  try {
    Dialog.show(
      player,
      ORG_WAREHOUSE_AMOUNT_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "Organization warehouse",
      `How much ${label} do you want to ${verb}?\n${available}\nMaximum per transaction: ${MAX_TRANSFER}`,
      "OK",
      "Cancel"
    );
    setOrgStockDialogBusy(player, true);
  } catch {
    player.sendClientMessage(Color.error, "Could not open the dialog.");
    clearPending(player);
  }
}

function onAmountResponse(player: Player, accepted: boolean, rawInput: string): void {
  if (!accepted) {
    clearPending(player);
    return;
  }

  if (!isPlayerActive(player) || !isAuthenticated(player)) {
    clearPending(player);
    return;
  }

  const id = playerId(player);
  const pending = id !== null ? pendingByPlayer.get(id) : undefined;
  if (!pending) {
    player.sendClientMessage(Color.error, "Operation cancelled. Enter the warehouse again.");
    return;
  }

  const stock = findStockAtPlayer(player);
  if (!stock || stock.orgId !== pending.orgId) {
    player.sendClientMessage(Color.error, "Move closer to the warehouse.");
    clearPending(player);
    return;
  }

  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership || membership.org.id !== pending.orgId) {
    denyOutsider(player, pending.orgId);
    clearPending(player);
    return;
  }

  const wh = getWarehouse(pending.orgId);
  if (pending.action === "take" && (!wh || wh.isLocked)) {
    player.sendClientMessage(Color.error, "The warehouse is locked.");
    clearPending(player);
    return;
  }

  const amount = Math.floor(Number(rawInput.trim().replace(",", ".")));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) {
    player.sendClientMessage(Color.error, "Enter an integer greater than 0.");
    showAmountDialog(player, pending.action, pending.item, pending.orgId);
    return;
  }

  if (amount > MAX_TRANSFER) {
    player.sendClientMessage(
      Color.error,
      `You can transfer no more than ${MAX_TRANSFER} units at a time.`
    );
    showAmountDialog(player, pending.action, pending.item, pending.orgId);
    return;
  }

  if (pending.action === "put") {
    applyPut(player, pending.orgId, pending.item, amount);
  } else {
    applyTake(player, pending.orgId, pending.item, amount);
  }
}

function applyPut(player: Player, orgId: number, item: StockItem, amount: number): void {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership) {
    clearPending(player);
    return;
  }

  const have = playerItemAmount(account, item);
  if (have < amount) {
    player.sendClientMessage(Color.error, `Not enough ${ITEM_LABEL[item]}.`);
    showAmountDialog(player, "put", item, orgId);
    return;
  }

  const nextDrugs = item === "drugs" ? account.drugs - amount : account.drugs;
  const nextAmmo = item === "ammo" ? account.ammo - amount : account.ammo;
  const nextMetal = item === "metal" ? account.metal - amount : account.metal;
  if (nextDrugs < 0 || nextAmmo < 0 || nextMetal < 0) {
    player.sendClientMessage(Color.error, `Not enough ${ITEM_LABEL[item]}.`);
    showAmountDialog(player, "put", item, orgId);
    return;
  }

  patchAccount(player, { drugs: nextDrugs, ammo: nextAmmo, metal: nextMetal });

  if (item === "ammo") {
    addWarehouseAmmo(orgId, amount);
  } else if (item === "metal") {
    addWarehouseMetal(orgId, amount);
  } else {
    addWarehouseDrugs(orgId, amount);
  }

  void saveUserInventory(account.id, nextDrugs, nextAmmo, nextMetal).catch(() => {
    // The cache has already been updated.
  });

  refreshStockLabels(orgId);
  clearPending(player);
  player.sendClientMessage(
    Color.info,
    `You stored ${amount} units of ${ITEM_LABEL[item]}.`
  );
  broadcastStock(
    orgId,
    `[Warehouse] ${membership.rank.title} ${playerChatName(player)} stored ${amount} units of ${ITEM_LABEL[item]}.`
  );
}

function applyTake(player: Player, orgId: number, item: StockItem, amount: number): void {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership) {
    clearPending(player);
    return;
  }

  const taken =
    item === "ammo"
      ? takeWarehouseAmmo(orgId, amount)
      : item === "metal"
        ? takeWarehouseMetal(orgId, amount)
        : takeWarehouseDrugs(orgId, amount);

  if (!taken) {
    player.sendClientMessage(Color.error, `The warehouse does not have enough ${ITEM_LABEL[item]}.`);
    showAmountDialog(player, "take", item, orgId);
    return;
  }

  const nextDrugs = item === "drugs" ? account.drugs + amount : account.drugs;
  const nextAmmo = item === "ammo" ? account.ammo + amount : account.ammo;
  const nextMetal = item === "metal" ? account.metal + amount : account.metal;

  if (
    !Number.isSafeInteger(nextDrugs) ||
    !Number.isSafeInteger(nextAmmo) ||
    !Number.isSafeInteger(nextMetal)
  ) {
    // Roll back the warehouse in cache/database by adding the items back.
    if (item === "ammo") {
      addWarehouseAmmo(orgId, amount);
    } else if (item === "metal") {
      addWarehouseMetal(orgId, amount);
    } else {
      addWarehouseDrugs(orgId, amount);
    }
    player.sendClientMessage(Color.error, "Amount is too large.");
    clearPending(player);
    return;
  }

  patchAccount(player, { drugs: nextDrugs, ammo: nextAmmo, metal: nextMetal });
  void saveUserInventory(account.id, nextDrugs, nextAmmo, nextMetal).catch(() => {
    // The cache has already been updated.
  });

  refreshStockLabels(orgId);
  clearPending(player);
  player.sendClientMessage(
    Color.info,
    `You took ${amount} units of ${ITEM_LABEL[item]} from the warehouse.`
  );
  broadcastStock(
    orgId,
    `[Warehouse] ${membership.rank.title} ${playerChatName(player)} took ${amount} units of ${ITEM_LABEL[item]} from the warehouse.`
  );
}

function toggleLock(player: Player, orgId: number): void {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership || membership.org.id !== orgId) {
    return;
  }

  if (membership.rank.id < LOCK_MIN_RANK) {
    player.sendClientMessage(
      Color.error,
      "Only rank 7 and above can open and lock the warehouse."
    );
    return;
  }

  if (!warehouseUsesLock(orgId)) {
    return;
  }

  const wh = getWarehouse(orgId);
  const currentlyOpen = Boolean(wh && !wh.isLocked);
  // Open -> lock; locked -> open.
  const nextLocked = currentlyOpen;
  setWarehouseLocked(orgId, nextLocked);
  refreshStockLabels(orgId);

  const verb = nextLocked ? "locked the warehouse" : "opened the warehouse";
  player.sendClientMessage(
    Color.info,
    nextLocked ? "The warehouse is locked." : "The warehouse is open."
  );
  broadcastStock(
    orgId,
    `[Warehouse] ${membership.rank.title} ${playerChatName(player)} ${verb}.`
  );
}

function denyOutsider(player: Player, orgId: number): void {
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
  const org = getOrganization(orgId);
  const name = org?.name ?? "this organization";
  player.sendClientMessage(Color.error, `Warehouse access is only available to ${name}.`);
}

function broadcastStock(orgId: number, rawLine: string): void {
  const line = clipClientMessage(rawLine);
  omp.players.forEach((other) => {
    if (!isPlayerActive(other)) {
      return;
    }

    try {
      if (other.isNPC()) {
        return;
      }
    } catch {
      return;
    }

    const otherAccount = getAccount(other);
    const otherOrg = otherAccount ? getMembership(otherAccount) : null;
    if (!otherOrg || otherOrg.org.id !== orgId) {
      return;
    }

    try {
      other.sendClientMessage(Color.info, line);
    } catch {
      // Slot is empty.
    }
  });
}

function findStockAtPlayer(player: Player): OrgStockPoint | null {
  return findGangStockAtPlayer(player) ?? findMafiaStockAtPlayer(player);
}

function playerItemAmount(
  account: { drugs: number; ammo: number; metal: number },
  item: StockItem
): number {
  if (item === "ammo") {
    return account.ammo;
  }
  if (item === "metal") {
    return account.metal;
  }
  return account.drugs;
}

function warehouseItemAmount(
  wh: { ammo: number; metal: number; drugs: number },
  item: StockItem
): number {
  if (item === "ammo") {
    return wh.ammo;
  }
  if (item === "metal") {
    return wh.metal;
  }
  return wh.drugs;
}

function refreshStockLabels(_orgId: number): void {
  refreshGangWarehouseLabels();
  refreshMafiaWarehouseLabels();
}

function clearPending(player: Player): void {
  const id = playerId(player);
  if (id !== null) {
    pendingByPlayer.delete(id);
  }
}
