import { omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerId } from "../../shared/player";
import { saveUserMoney } from "../auth/repository";
import { applyWallet, getAccount, patchAccount } from "../auth/session";
import { refreshStreamForPlayer } from "../mapping/stream";
import { SERVER_TAG } from "../../shared/brand";
import { updateEntrancePickup } from "./entrances";
import { teleportToHouseInterior } from "./enter";
import { refreshAllHouseMapIcons } from "./map-icons";
import { currentDateLocal } from "./rent-math";
import {
  findOwnedHouse,
  getHouse,
  purchaseHouse,
  setHouseOwner,
  setHouseRentPaidUntil,
} from "./repository";

import { isNearHouseEntrance } from "./access";

const MIN_BUY_LEVEL = 3;

const buying = new Set<number>();

export async function tryPurchaseHouse(player: Player, houseId: number): Promise<void> {
  const account = getAccount(player);
  const slotId = playerId(player);
  if (!account || slotId === null || !isPlayerActive(player)) {
    return;
  }

  const house = getHouse(houseId);
  if (!house || house.ownerId !== null) {
    player.sendClientMessage(Color.error, "This house has already been purchased.");
    return;
  }

  if (account.level < MIN_BUY_LEVEL) {
    player.sendClientMessage(Color.error, "You can buy a house from level 3.");
    return;
  }

  if (!account.passport) {
    player.sendClientMessage(Color.error, "A passport is required. Get one at City Hall.");
    return;
  }

  if (findOwnedHouse(account.id)) {
    player.sendClientMessage(Color.error, "You already own a house.");
    return;
  }

  const cash = Math.max(0, Math.floor(account.money));
  if (cash < house.price) {
    player.sendClientMessage(Color.error, "Not enough cash.");
    return;
  }

  if (!isNearHouseEntrance(player, houseId)) {
    player.sendClientMessage(Color.error, "Move closer to the house pickup.");
    return;
  }

  if (buying.has(account.id)) {
    return;
  }

  buying.add(account.id);
  let result;
  try {
    result = await purchaseHouse(houseId, account.id);
  } catch (error: unknown) {
    buying.delete(account.id);
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] house purchase ${houseId} (${account.name}): ${message}`);
    player.sendClientMessage(Color.error, "Purchase failed. Try again.");
    return;
  }
  buying.delete(account.id);

  if (!result.ok) {
    if (result.reason === "owned") {
      player.sendClientMessage(Color.error, "You already own a house.");
      return;
    }
    if (result.reason === "funds") {
      player.sendClientMessage(Color.error, "Not enough cash.");
      return;
    }
    if (result.reason === "sold") {
      player.sendClientMessage(Color.error, "This house has already been purchased.");
      return;
    }
    player.sendClientMessage(Color.error, "Purchase failed. Try again.");
    return;
  }

  if (
    !isPlayerActive(player) ||
    getAccount(player)?.id !== account.id ||
    !isNearHouseEntrance(player, houseId)
  ) {
    return;
  }

  const owned = setHouseOwner(houseId, account.id, account.name);
  if (!owned) {
    player.sendClientMessage(Color.error, "Purchase failed. Try again.");
    return;
  }

  setHouseRentPaidUntil(houseId, currentDateLocal());

  patchAccount(player, { money: result.cashLeft });
  const live = getAccount(player);
  if (live) {
    applyWallet(player, live);
  }

  void saveUserMoney(account.id, result.cashLeft, account.bank).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] could not save money for ${account.name}: ${message}`);
  });

  updateEntrancePickup(houseId);
  refreshAllHouseMapIcons();

  if (!teleportToHouseInterior(player, owned)) {
    player.sendClientMessage(Color.error, "House purchased, but teleportation failed.");
    return;
  }

  player.sendClientMessage(
    Color.info,
    `Congratulations on purchasing house #${owned.id} for $${owned.price}!`
  );
  player.sendClientMessage(
    Color.info,
    "The house is paid through today. To extend it, pay for housing at the bank."
  );
  player.sendClientMessage(
    Color.info,
    "Use /hmenu inside the interior to manage your house."
  );
}
