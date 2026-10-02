import { Dialog, omp, Pickup, TextLabel, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { SERVER_TAG } from "../../shared/brand";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { saveUserBankTransfer, saveUserMoney } from "../auth/repository";
import {
  applyWallet,
  getAccount,
  isAuthenticated,
  patchAccount,
} from "../auth/session";
import {
  BANK_HOUSE_RENT_CONFIRM_DIALOG_ID,
  BANK_HOUSE_RENT_DAYS_DIALOG_ID,
  BANK_HOUSE_RENT_EMPTY_DIALOG_ID,
  BANK_HOUSE_RENT_INFO_DIALOG_ID,
  clearHouseRentPending,
  handleHouseRentDialog,
  showHouseRentMenu,
} from "../houses/bank-rent";

export const BANK_MENU_DIALOG_ID = 13;
export const BANK_BALANCE_DIALOG_ID = 14;
export const BANK_DEPOSIT_DIALOG_ID = 15;
export const BANK_WITHDRAW_DIALOG_ID = 16;
export const BANK_SEND_ID_DIALOG_ID = 17;
export const BANK_SEND_CONFIRM_DIALOG_ID = 18;
export const BANK_SEND_AMOUNT_DIALOG_ID = 19;

const PICKUP_MODEL = 1274;
const PICKUP_TYPE = 1;
const PLAYER_STATE_ONFOOT = 1;
const TELLER_RADIUS = 0.9;
const LABEL_HEIGHT = 0.85;
const LABEL_DRAW_DISTANCE = 12;
const DIALOG_STYLE_MSGBOX = 0;
const DIALOG_STYLE_INPUT = 1;
const DIALOG_STYLE_LIST = 2;
const MAX_MONEY = 2_147_483_647;

const MENU_ITEMS = [
  "查看余额",
  "存款",
  "取款",
  "转账至账户",
  "支付房屋费用",
] as const;

type PendingSend = {
  slot: number;
  userId: number;
  label: string;
};

const TELLERS: readonly { x: number; y: number; z: number }[] = [
  { x: 1459.9399, y: -1010.5794, z: 38.1769 },
  { x: 1457.865, y: -1010.5794, z: 38.1769 },
  { x: 1456.041, y: -1010.5794, z: 38.1769 },
];

const standingOn = new Set<number>();
const busy = new Set<number>();
const pendingSend = new Map<number, PendingSend>();
let tellerWorld: number | null = null;

export function isBankBusy(player: Player): boolean {
  const id = playerId(player);
  return id !== null && busy.has(id);
}

export function startTellers(world: number): void {
  tellerWorld = world;

  for (const point of TELLERS) {
    new Pickup(PICKUP_MODEL, PICKUP_TYPE, point.x, point.y, point.z, world);
    new TextLabel(
      "银行账户",
      Color.info,
      point.x,
      point.y,
      point.z + LABEL_HEIGHT,
      LABEL_DRAW_DISTANCE,
      world,
      false
    );
  }

  omp.on("dialogResponse", (player, dialogId, response, listItem, inputText) => {
    handleDialog(
      player,
      Number(dialogId),
      Number(response) !== 0,
      Number(listItem),
      String(inputText ?? "")
    );
  });

  omp.on("playerDisconnect", (player) => {
    const id = playerId(player);
    if (id !== null) {
      standingOn.delete(id);
      busy.delete(id);
      pendingSend.delete(id);
      clearHouseRentPending(player);
    }
  });
}

export function tickTellers(player: Player, world: number, interior: number): void {
  const id = playerId(player);
  if (id === null || tellerWorld === null) {
    return;
  }

  if (world !== tellerWorld || interior !== 0) {
    standingOn.delete(id);
    return;
  }

  let pos;
  try {
    if (player.getState() !== PLAYER_STATE_ONFOOT) {
      standingOn.delete(id);
      return;
    }
    pos = player.getPos();
  } catch {
    return;
  }

  if (!nearTeller(pos.x, pos.y, pos.z)) {
    standingOn.delete(id);
    return;
  }

  if (standingOn.has(id)) {
    return;
  }

  standingOn.add(id);
  showMenu(player);
}

function handleDialog(
  player: Player,
  dialogId: number,
  ok: boolean,
  listItem: number,
  inputText: string
): void {
  if (
    dialogId !== BANK_MENU_DIALOG_ID &&
    dialogId !== BANK_BALANCE_DIALOG_ID &&
    dialogId !== BANK_DEPOSIT_DIALOG_ID &&
    dialogId !== BANK_WITHDRAW_DIALOG_ID &&
    dialogId !== BANK_SEND_ID_DIALOG_ID &&
    dialogId !== BANK_SEND_CONFIRM_DIALOG_ID &&
    dialogId !== BANK_SEND_AMOUNT_DIALOG_ID &&
    dialogId !== BANK_HOUSE_RENT_INFO_DIALOG_ID &&
    dialogId !== BANK_HOUSE_RENT_DAYS_DIALOG_ID &&
    dialogId !== BANK_HOUSE_RENT_CONFIRM_DIALOG_ID &&
    dialogId !== BANK_HOUSE_RENT_EMPTY_DIALOG_ID
  ) {
    return;
  }

  if (!isAuthenticated(player) || !isAtTeller(player)) {
    if (isAuthenticated(player)) {
      player.sendClientMessage(Color.gray, "此交易须在柜台办理。");
    }
    return;
  }

  if (handleHouseRentDialog(player, dialogId, ok, listItem, inputText)) {
    if (
      isAtTeller(player) &&
      (dialogId === BANK_HOUSE_RENT_EMPTY_DIALOG_ID ||
        (dialogId === BANK_HOUSE_RENT_INFO_DIALOG_ID && !ok))
    ) {
      showMenu(player);
    }
    return;
  }

  if (dialogId === BANK_MENU_DIALOG_ID) {
    if (!ok) {
      clearPending(player);
      clearHouseRentPending(player);
      return;
    }

    const item = pickMenuItem(listItem, inputText);
    if (item === 0) {
      showBalance(player);
      return;
    }
    if (item === 1) {
      showAmountDialog(player, "deposit");
      return;
    }
    if (item === 2) {
      showAmountDialog(player, "withdraw");
      return;
    }
    if (item === 3) {
      showSendIdDialog(player);
      return;
    }
    if (item === 4) {
      showHouseRentMenu(player);
      return;
    }

    showMenu(player);
    return;
  }

  if (dialogId === BANK_BALANCE_DIALOG_ID) {
    showMenu(player);
    return;
  }

  if (dialogId === BANK_SEND_ID_DIALOG_ID) {
    if (!ok) {
      showMenu(player);
      return;
    }
    showSendConfirm(player, inputText);
    return;
  }

  if (dialogId === BANK_SEND_CONFIRM_DIALOG_ID) {
    if (!ok) {
      clearPending(player);
      showMenu(player);
      return;
    }
    showSendAmountDialog(player);
    return;
  }

  if (dialogId === BANK_SEND_AMOUNT_DIALOG_ID) {
    if (!ok) {
      clearPending(player);
      showMenu(player);
      return;
    }
    void sendToPlayer(player, inputText);
    return;
  }

  if (!ok) {
    showMenu(player);
    return;
  }

  if (dialogId === BANK_DEPOSIT_DIALOG_ID) {
    void transfer(player, "deposit", inputText);
    return;
  }

  if (dialogId === BANK_WITHDRAW_DIALOG_ID) {
    void transfer(player, "withdraw", inputText);
  }
}

function pickMenuItem(listItem: number, inputText: string): number | null {
  const raw = inputText.trim().toLowerCase();
  const byLabel = MENU_ITEMS.findIndex((item) => item.toLowerCase() === raw);
  if (byLabel >= 0) {
    return byLabel;
  }

  if (listItem >= 0 && listItem < MENU_ITEMS.length) {
    return listItem;
  }

  return null;
}

function showMenu(player: Player): void {
  try {
    Dialog.show(
      player,
      BANK_MENU_DIALOG_ID,
      DIALOG_STYLE_LIST,
      "银行",
      MENU_ITEMS.join("\n"),
      "选择",
      "关闭"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开银行菜单。");
  }
}

function showBalance(player: Player): void {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  const body = [
    `现金：$${account.money}`,
    `银行账户：$${account.bank}`,
  ].join("\n");

  try {
    Dialog.show(
      player,
      BANK_BALANCE_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "余额",
      body,
      "返回",
      ""
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开余额界面。");
  }
}

function showAmountDialog(player: Player, mode: "deposit" | "withdraw"): void {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  const title = mode === "deposit" ? "存款" : "取款";
  const available = mode === "deposit" ? account.money : account.bank;
  const body =
    mode === "deposit"
      ? `现金：$${available}\n请输入存款金额：`
      : `银行账户：$${available}\n请输入取款金额：`;

  try {
    Dialog.show(
      player,
      mode === "deposit" ? BANK_DEPOSIT_DIALOG_ID : BANK_WITHDRAW_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      title,
      body,
      "确定",
      "返回"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开银行菜单。");
  }
}

function showSendIdDialog(player: Player): void {
  clearPending(player);
  try {
    Dialog.show(
      player,
      BANK_SEND_ID_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "转账",
      "请输入玩家ID：",
      "下一步",
      "返回"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开银行菜单。");
  }
}

function showSendConfirm(player: Player, inputText: string): void {
  const senderId = playerId(player);
  const slot = parsePlayerSlot(inputText);
  if (senderId === null || slot === null) {
    player.sendClientMessage(Color.error, "请输入玩家ID。");
    showSendIdDialog(player);
    return;
  }

  if (slot === senderId) {
    player.sendClientMessage(Color.error, "不能给自己转账。");
    showSendIdDialog(player);
    return;
  }

  const target = findOnlinePlayer(slot);
  const targetAccount = target ? getAccount(target) : null;
  if (!target || !targetAccount) {
    player.sendClientMessage(Color.error, "玩家不在游戏中。");
    showSendIdDialog(player);
    return;
  }

  const label = playerChatName(target);
  pendingSend.set(senderId, {
    slot,
    userId: targetAccount.id,
    label,
  });

  try {
    Dialog.show(
      player,
      BANK_SEND_CONFIRM_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "确认",
      `向${label}的账户转账？`,
      "是",
      "否"
    );
  } catch {
    clearPending(player);
    player.sendClientMessage(Color.error, "无法打开银行菜单。");
  }
}

function showSendAmountDialog(player: Player): void {
  const senderId = playerId(player);
  const pending = senderId !== null ? pendingSend.get(senderId) : undefined;
  const account = getAccount(player);
  if (!pending || !account) {
    showMenu(player);
    return;
  }

  if (!resolvePendingTarget(player, pending)) {
    player.sendClientMessage(Color.error, "玩家不在游戏中。");
    clearPending(player);
    showMenu(player);
    return;
  }

  try {
    Dialog.show(
      player,
      BANK_SEND_AMOUNT_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "转账",
      `${pending.label}\n你的账户：$${account.bank}\n请输入转账金额：`,
      "确定",
      "返回"
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开银行菜单。");
  }
}

async function sendToPlayer(player: Player, inputText: string): Promise<void> {
  const senderId = playerId(player);
  if (senderId === null || busy.has(senderId)) {
    return;
  }

  const pending = pendingSend.get(senderId);
  if (!pending) {
    showMenu(player);
    return;
  }

  if (!isAtTeller(player)) {
    player.sendClientMessage(Color.error, "请前往柜台。");
    return;
  }

  const amount = parseAmount(inputText);
  if (amount === null) {
    player.sendClientMessage(Color.error, "请输入大于0的整数金额。");
    showSendAmountDialog(player);
    return;
  }

  const senderAccount = getAccount(player);
  if (!senderAccount) {
    return;
  }

  const senderBank = Math.max(0, Math.floor(senderAccount.bank));
  if (amount > senderBank) {
    player.sendClientMessage(Color.error, "账户资金不足。");
    showSendAmountDialog(player);
    return;
  }

  const target = resolvePendingTarget(player, pending);
  const targetAccount = target ? getAccount(target) : null;
  if (!target || !targetAccount) {
    player.sendClientMessage(Color.error, "玩家不在游戏中。");
    clearPending(player);
    if (isAtTeller(player)) {
      showMenu(player);
    }
    return;
  }

  const targetSlot = playerId(target);
  if (targetSlot === null || busy.has(targetSlot)) {
    player.sendClientMessage(Color.error, "玩家正在忙，请稍候。");
    showSendAmountDialog(player);
    return;
  }

  const targetBank = Math.max(0, Math.floor(targetAccount.bank));
  if (targetBank > MAX_MONEY - amount) {
    player.sendClientMessage(Color.error, "收款账户无法接收此金额。");
    showSendAmountDialog(player);
    return;
  }

  const nextSenderBank = senderBank - amount;
  const nextTargetBank = targetBank + amount;

  busy.add(senderId);
  busy.add(targetSlot);
  try {
    await saveUserBankTransfer(
      senderAccount.id,
      nextSenderBank,
      targetAccount.id,
      nextTargetBank
    );
  } catch (error: unknown) {
    busy.delete(senderId);
    busy.delete(targetSlot);
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] bank transfer ${senderAccount.name}: ${message}`);
    player.sendClientMessage(Color.error, "交易失败，请重试。");
    if (isAtTeller(player)) {
      showMenu(player);
    }
    return;
  }

  busy.delete(senderId);
  busy.delete(targetSlot);
  clearPending(player);

  if (isAuthenticated(player) && getAccount(player)?.id === senderAccount.id) {
    const next = keepBankExtra(player, senderBank, nextSenderBank);
    player.sendClientMessage(
      Color.tryOk,
      `你向${pending.label}转账$${amount}，余额：$${next}。`
    );
  }

  if (isPlayerActive(target) && getAccount(target)?.id === targetAccount.id) {
    keepBankExtra(target, targetBank, nextTargetBank);
    target.sendClientMessage(
      Color.info,
      `玩家${senderAccount.name}[${senderId}]向你转账$${amount}。`
    );
  }

  if (isAtTeller(player)) {
    showMenu(player);
  }
}

function resolvePendingTarget(sender: Player, pending: PendingSend): Player | null {
  const senderId = playerId(sender);
  const target = findOnlinePlayer(pending.slot);
  if (!target || senderId === null) {
    return null;
  }

  const targetSlot = playerId(target);
  const targetAccount = getAccount(target);
  if (targetSlot !== pending.slot || !targetAccount || targetAccount.id !== pending.userId) {
    return null;
  }

  if (targetSlot === senderId) {
    return null;
  }

  return target;
}

function findOnlinePlayer(slot: number): Player | null {
  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target)) {
    return null;
  }

  try {
    if (target.isNPC()) {
      return null;
    }
  } catch {
    return null;
  }

  if (!isAuthenticated(target)) {
    return null;
  }

  return target;
}

function parsePlayerSlot(input: string): number | null {
  const raw = input.trim();
  if (!/^\d+$/.test(raw) || raw.length > 5) {
    return null;
  }

  const slot = Number(raw);
  if (!Number.isInteger(slot) || slot < 0) {
    return null;
  }

  return slot;
}

function clearPending(player: Player): void {
  const id = playerId(player);
  if (id !== null) {
    pendingSend.delete(id);
  }
}

async function transfer(
  player: Player,
  mode: "deposit" | "withdraw",
  inputText: string
): Promise<void> {
  const id = playerId(player);
  if (id === null || busy.has(id)) {
    return;
  }

  if (!isAtTeller(player)) {
    player.sendClientMessage(Color.error, "请前往柜台。");
    return;
  }

  const account = getAccount(player);
  if (!account) {
    return;
  }

  const amount = parseAmount(inputText);
  if (amount === null) {
    player.sendClientMessage(Color.error, "请输入大于0的整数金额。");
    showAmountDialog(player, mode);
    return;
  }

  const cash = Math.max(0, Math.floor(account.money));
  const bank = Math.max(0, Math.floor(account.bank));

  let nextCash = cash;
  let nextBank = bank;
  if (mode === "deposit") {
    if (amount > cash) {
      player.sendClientMessage(Color.error, "现金不足。");
      showAmountDialog(player, mode);
      return;
    }
    if (bank > MAX_MONEY - amount) {
      player.sendClientMessage(Color.error, "账户无法接收此金额。");
      showAmountDialog(player, mode);
      return;
    }
    nextCash = cash - amount;
    nextBank = bank + amount;
  } else {
    if (amount > bank) {
      player.sendClientMessage(Color.error, "账户资金不足。");
      showAmountDialog(player, mode);
      return;
    }
    if (cash > MAX_MONEY - amount) {
      player.sendClientMessage(Color.error, "无法携带这么多现金。");
      showAmountDialog(player, mode);
      return;
    }
    nextCash = cash + amount;
    nextBank = bank - amount;
  }

  busy.add(id);
  try {
    await saveUserMoney(account.id, nextCash, nextBank);
  } catch (error: unknown) {
    busy.delete(id);
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] bank ${account.name}: ${message}`);
    player.sendClientMessage(Color.error, "交易失败，请重试。");
    if (isAtTeller(player)) {
      showMenu(player);
    }
    return;
  }

  busy.delete(id);

  if (!isAuthenticated(player) || getAccount(player)?.id !== account.id) {
    return;
  }

  const extraCash = Math.max(0, Math.floor(getAccount(player)?.money ?? cash) - cash);
  const cashNow = Math.min(MAX_MONEY, nextCash + extraCash);
  const bankNow = keepBankExtra(player, bank, nextBank);
  patchAccount(player, {
    money: cashNow,
    bank: bankNow,
  });
  const fresh = getAccount(player);
  if (fresh) {
    applyWallet(player, fresh);
  }

  if (mode === "deposit") {
    player.sendClientMessage(
      Color.tryOk,
      `账户入账$${amount}，余额：$${bankNow}。`
    );
  } else {
    player.sendClientMessage(
      Color.tryOk,
      `你取出了$${amount}，现金：$${cashNow}。`
    );
  }

  if (isAtTeller(player)) {
    showMenu(player);
  }
}

function keepBankExtra(player: Player, snapshot: number, nextBank: number): number {
  const live = Math.max(0, Math.floor(getAccount(player)?.bank ?? snapshot));
  const extra = Math.max(0, live - snapshot);
  const result = Math.min(MAX_MONEY, nextBank + extra);
  patchAccount(player, { bank: result });
  return result;
}

function parseAmount(input: string): number | null {
  const raw = input.trim().replace(/^\$/, "");
  if (!/^\d+$/.test(raw) || raw.length > 10) {
    return null;
  }

  const amount = Number(raw);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MONEY) {
    return null;
  }

  return amount;
}

function isAtTeller(player: Player): boolean {
  if (tellerWorld === null || !isPlayerActive(player) || !isAuthenticated(player)) {
    return false;
  }

  try {
    if (player.getVirtualWorld() !== tellerWorld || player.getInterior() !== 0) {
      return false;
    }
    if (player.getState() !== PLAYER_STATE_ONFOOT) {
      return false;
    }
    const pos = player.getPos();
    return nearTeller(pos.x, pos.y, pos.z);
  } catch {
    return false;
  }
}

function nearTeller(x: number, y: number, z: number): boolean {
  for (const point of TELLERS) {
    if (Math.hypot(x - point.x, y - point.y, z - point.z) <= TELLER_RADIUS) {
      return true;
    }
  }

  return false;
}
