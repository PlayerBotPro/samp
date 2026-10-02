import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { SERVER_TAG } from "../../shared/brand";
import { isPlayerActive, playerId } from "../../shared/player";
import { saveUserMoney } from "../auth/repository";
import { applyWallet, getAccount, patchAccount } from "../auth/session";
import { isNearOwnHouse } from "./access";
import { updateEntrancePickup } from "./entrances";
import { refreshAllHouseMapIcons } from "./map-icons";
import {
  clearHouseForSale,
  findOwnedHouse,
  getHouse,
  sellHouseToState,
} from "./repository";
import { clearInsideHouse } from "./session";

export const HOUSE_SELL_DIALOG_ID = 46;

const DIALOG_STYLE_MSGBOX = 0;

const selling = new Set<number>();

export function bindHouseSellDialog(): void {
  omp.on("dialogResponse", (player, dialogId, response) => {
    if (Number(dialogId) !== HOUSE_SELL_DIALOG_ID) {
      return;
    }

    if (Number(response) === 0) {
      return;
    }

    void confirmSellHouse(player);
  });
}

export function showSellHouseDialog(player: Player): void {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "请先登录。");
    return;
  }

  const house = findOwnedHouse(account.id);
  if (!house) {
    player.sendClientMessage(Color.error, "你没有房屋。");
    return;
  }

  if (!isNearOwnHouse(player, house.id)) {
    player.sendClientMessage(Color.error, "请靠近自己的房屋。");
    return;
  }

  try {
    Dialog.show(
      player,
      HOUSE_SELL_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "出售房屋",
      `将${house.id}号房屋以$${house.price}出售给政府？`,
      "出售",
      "取消"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开出售界面。");
  }
}

async function confirmSellHouse(player: Player): Promise<void> {
  const account = getAccount(player);
  const slotId = playerId(player);
  if (!account || slotId === null || !isPlayerActive(player)) {
    return;
  }

  const house = findOwnedHouse(account.id);
  if (!house) {
    player.sendClientMessage(Color.error, "你没有房屋。");
    return;
  }

  if (!isNearOwnHouse(player, house.id)) {
    player.sendClientMessage(Color.error, "请靠近自己的房屋。");
    return;
  }

  if (selling.has(account.id)) {
    return;
  }

  selling.add(account.id);
  let result;
  try {
    result = await sellHouseToState(house.id, account.id);
  } catch (error: unknown) {
    selling.delete(account.id);
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] house sale ${house.id} (${account.name}): ${message}`);
    player.sendClientMessage(Color.error, "出售失败，请重试。");
    return;
  }
  selling.delete(account.id);

  if (!result.ok) {
    if (result.reason === "owner") {
      player.sendClientMessage(Color.error, "你没有房屋。");
      return;
    }
    player.sendClientMessage(Color.error, "出售失败，请重试。");
    return;
  }

  if (
    !isPlayerActive(player) ||
    getAccount(player)?.id !== account.id ||
    !isNearOwnHouse(player, house.id)
  ) {
    return;
  }

  const cleared = clearHouseForSale(house.id);
  if (!cleared) {
    player.sendClientMessage(Color.error, "出售失败，请重试。");
    return;
  }

  patchAccount(player, { money: result.cashLeft });
  const live = getAccount(player);
  if (live) {
    applyWallet(player, live);
  }

  void saveUserMoney(account.id, result.cashLeft, account.bank).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] could not save money for ${account.name}: ${message}`);
  });

  updateEntrancePickup(house.id);
  refreshAllHouseMapIcons();
  clearInsideHouse(slotId);

  const sold = getHouse(house.id);
  player.sendClientMessage(
    Color.info,
    `你将${house.id}号房屋以$${sold?.price ?? result.price}出售给了政府。`
  );
}
