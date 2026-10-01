import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { SERVER_TAG } from "../../shared/brand";
import { saveUserMoney } from "../auth/repository";
import { applyWallet, getAccount, patchAccount } from "../auth/session";
import { houseClassLabel } from "./classes";
import { houseLockStatusLabel } from "./enter";
import { findOwnedHouseAtInterior } from "./interior";
import { formatRentDate, rentDaysLeftLabel, rentDaysRemaining } from "./rent-math";
import {
  getHouse,
  purchaseHouseMedkit,
  saveHouseLock,
  setHouseLock,
  setHouseMedkit,
} from "./repository";
export const HOUSE_MENU_DIALOG_ID = 44;
export const HOUSE_MEDKIT_DIALOG_ID = 45;
export const HOUSE_INFO_DIALOG_ID = 50;

const DIALOG_STYLE_MSGBOX = 0;
const DIALOG_STYLE_LIST = 2;
const MENU_TITLE = "{FFCC00}";
const MENU_LABEL = "{FFFFFF}";
const MENU_VALUE = "{33CCFF}";
const MEDKIT_PRICE = 7500;

const pendingMedkitHouse = new Map<number, number>();
const savingLock = new Set<number>();
const buyingMedkit = new Set<number>();

export function bindHouseMenuDialogs(): void {
  omp.on("dialogResponse", (player, dialogId, response, listItem) => {
    const id = Number(dialogId);
    const ok = Number(response) !== 0;
    const account = getAccount(player);
    if (!account) {
      return;
    }

    if (id === HOUSE_MENU_DIALOG_ID) {
      if (!ok) {
        return;
      }

      const house = findOwnedHouseAtInterior(player);
      if (!house || house.ownerId !== account.id) {
        player.sendClientMessage(Color.error, "The house menu is available only inside your house.");
        return;
      }

      const item = Number(listItem);
      if (item === 0) {
        void toggleHouseLock(player, house.id);
        return;
      }

      if (item === 1) {
        void openMedkitFlow(player, house.id);
        return;
      }

      if (item === 2) {
        showHouseInfoDialog(player, house);
      }
      return;
    }

    if (id === HOUSE_INFO_DIALOG_ID) {
      if (!ok) {
        return;
      }

      showHouseMenu(player);
      return;
    }

    if (id === HOUSE_MEDKIT_DIALOG_ID) {
      const houseId = pendingMedkitHouse.get(account.id);
      pendingMedkitHouse.delete(account.id);
      if (!ok || houseId === undefined) {
        return;
      }

      void buyMedkit(player, houseId);
    }
  });

  omp.on("playerDisconnect", () => {
    // account.id unavailable here easily; pending cleared on next login attempt
  });
}

export function showHouseMenu(player: Player): void {
  const house = findOwnedHouseAtInterior(player);
  if (!house) {
    player.sendClientMessage(Color.error, "The house menu is available only inside your house.");
    return;
  }

  const items = [
    `Status (${houseLockStatusLabel(house.isLocked)})`,
    "Medkit",
    "Information",
  ];

  try {
    Dialog.show(
      player,
      HOUSE_MENU_DIALOG_ID,
      DIALOG_STYLE_LIST,
      `${MENU_TITLE}House menu`,
      items.join("\n"),
      "Select",
      "Close"
    );
  } catch {
    player.sendClientMessage(Color.error, "Could not open the house menu.");
  }
}

async function toggleHouseLock(player: Player, houseId: number): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  const house = findOwnedHouseAtInterior(player);
  if (!house || house.id !== houseId || house.ownerId !== account.id) {
    player.sendClientMessage(Color.error, "The house menu is available only inside your house.");
    return;
  }

  if (savingLock.has(account.id)) {
    return;
  }

  const nextLocked = !house.isLocked;
  savingLock.add(account.id);

  let saved = false;
  try {
    saved = await saveHouseLock(houseId, account.id, nextLocked);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] house lock ${houseId} (${account.name}): ${message}`);
  } finally {
    savingLock.delete(account.id);
  }

  if (!saved) {
    player.sendClientMessage(Color.error, "Could not change house status.");
    return;
  }

  setHouseLock(houseId, nextLocked);
  player.sendClientMessage(
    Color.info,
    nextLocked ? "The house is locked." : "The house is open."
  );
  showHouseMenu(player);
}

async function openMedkitFlow(player: Player, houseId: number): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  const house = getHouse(houseId);
  if (!house || house.ownerId !== account.id) {
    return;
  }

  if (!findOwnedHouseAtInterior(player)) {
    player.sendClientMessage(Color.error, "The house menu is available only inside your house.");
    return;
  }

  if (house.hasMedkit) {
    player.sendClientMessage(Color.info, "The house already has a medkit.");
    showHouseMenu(player);
    return;
  }

  pendingMedkitHouse.set(account.id, houseId);
  try {
    Dialog.show(
      player,
      HOUSE_MEDKIT_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "Medkit",
      `Buy a medkit for $${MEDKIT_PRICE}?`,
      "Buy",
      "Cancel"
    );
  } catch {
    pendingMedkitHouse.delete(account.id);
    player.sendClientMessage(Color.error, "Could not open the medkit purchase.");
  }
}

async function buyMedkit(player: Player, houseId: number): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  const house = getHouse(houseId);
  if (!house || house.ownerId !== account.id) {
    return;
  }

  if (!findOwnedHouseAtInterior(player)) {
    player.sendClientMessage(Color.error, "Purchase is available only inside your house.");
    return;
  }

  if (house.hasMedkit) {
    player.sendClientMessage(Color.info, "The house already has a medkit.");
    return;
  }

  const cash = Math.max(0, Math.floor(account.money));
  if (cash < MEDKIT_PRICE) {
    player.sendClientMessage(Color.error, "Not enough cash.");
    return;
  }

  if (buyingMedkit.has(account.id)) {
    return;
  }

  buyingMedkit.add(account.id);
  let result;
  try {
    result = await purchaseHouseMedkit(houseId, account.id, MEDKIT_PRICE);
  } catch (error: unknown) {
    buyingMedkit.delete(account.id);
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] house medkit ${houseId} (${account.name}): ${message}`);
    player.sendClientMessage(Color.error, "Purchase failed. Try again.");
    return;
  }
  buyingMedkit.delete(account.id);

  if (!result.ok) {
    if (result.reason === "exists") {
      player.sendClientMessage(Color.info, "The house already has a medkit.");
      setHouseMedkit(houseId, true);
      return;
    }
    if (result.reason === "funds") {
      player.sendClientMessage(Color.error, "Not enough cash.");
      return;
    }
    player.sendClientMessage(Color.error, "Purchase failed. Try again.");
    return;
  }

  if (getAccount(player)?.id !== account.id) {
    return;
  }

  setHouseMedkit(houseId, true);
  patchAccount(player, { money: result.cashLeft });
  const live = getAccount(player);
  if (live) {
    applyWallet(player, live);
  }

  void saveUserMoney(account.id, result.cashLeft, account.bank).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] could not save money for ${account.name}: ${message}`);
  });

  player.sendClientMessage(Color.info, `Medkit purchased for $${MEDKIT_PRICE}.`);
  showHouseMenu(player);
}

function showHouseInfoDialog(player: Player, house: ReturnType<typeof findOwnedHouseAtInterior>): void {
  if (!house) {
    return;
  }

  const daysLeft = rentDaysRemaining(house.rentPaidUntil);
  const rentLines = buildRentInfoLines(house.rentPaidUntil, daysLeft);
  const body = [
    `${MENU_LABEL}House number:\t\t${MENU_VALUE}${house.id}`,
    `${MENU_LABEL}Class:\t\t\t${MENU_VALUE}${houseClassLabel(house.classId)}`,
    `${MENU_LABEL}State price:\t${MENU_VALUE}$${house.price}`,
    ...rentLines,
  ].join("\n");

  try {
    Dialog.show(
      player,
      HOUSE_INFO_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${MENU_TITLE}House information`,
      body,
      "Back",
      ""
    );
  } catch {
    player.sendClientMessage(Color.error, "Could not open house information.");
  }
}

function buildRentInfoLines(
  rentPaidUntil: string | null,
  daysLeft: number | null
): string[] {
  if (rentPaidUntil === null) {
    return [`${MENU_LABEL}Payment:\t\t${MENU_VALUE}unpaid`];
  }

  const lines = [
    `${MENU_LABEL}Paid through:\t\t${MENU_VALUE}${formatRentDate(rentPaidUntil)}`,
  ];

  if (daysLeft === null) {
    return lines;
  }

  if (daysLeft === 0) {
    lines.push(`${MENU_LABEL}Deadline:\t\t\t${MENU_VALUE}today is the last day`);
    return lines;
  }

  lines.push(
    `${MENU_LABEL}Remaining:\t\t${MENU_VALUE}${daysLeft} ${rentDaysLeftLabel(daysLeft)}`
  );
  return lines;
}
