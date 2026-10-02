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
    player.sendClientMessage(Color.error, "此房屋已被购买。");
    return;
  }

  if (account.level < MIN_BUY_LEVEL) {
    player.sendClientMessage(Color.error, "3级起可以购买房屋。");
    return;
  }

  if (!account.passport) {
    player.sendClientMessage(Color.error, "需要护照，请到市政厅办理。");
    return;
  }

  if (findOwnedHouse(account.id)) {
    player.sendClientMessage(Color.error, "你已有房屋。");
    return;
  }

  const cash = Math.max(0, Math.floor(account.money));
  if (cash < house.price) {
    player.sendClientMessage(Color.error, "现金不足。");
    return;
  }

  if (!isNearHouseEntrance(player, houseId)) {
    player.sendClientMessage(Color.error, "请靠近房屋拾取点。");
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
    player.sendClientMessage(Color.error, "购买失败，请重试。");
    return;
  }
  buying.delete(account.id);

  if (!result.ok) {
    if (result.reason === "owned") {
      player.sendClientMessage(Color.error, "你已有房屋。");
      return;
    }
    if (result.reason === "funds") {
      player.sendClientMessage(Color.error, "现金不足。");
      return;
    }
    if (result.reason === "sold") {
      player.sendClientMessage(Color.error, "此房屋已被购买。");
      return;
    }
    player.sendClientMessage(Color.error, "购买失败，请重试。");
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
    player.sendClientMessage(Color.error, "购买失败，请重试。");
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
    player.sendClientMessage(Color.error, "房屋购买成功，但传送失败。");
    return;
  }

  player.sendClientMessage(
    Color.info,
    `恭喜你以$${owned.price}购买了${owned.id}号房屋！`
  );
  player.sendClientMessage(
    Color.info,
    "房屋费用已缴至今天，请到银行续费。"
  );
  player.sendClientMessage(
    Color.info,
    "在房屋内使用/hmenu管理房屋。"
  );
}
