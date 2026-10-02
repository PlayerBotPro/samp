import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { SERVER_TAG } from "../../shared/brand";
import { arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { byGender } from "../auth/gender";
import { saveLicenseSale } from "../auth/repository";
import {
  findLicense,
  missingLicenses,
  type LicenseDef,
  type LicenseKey,
} from "../auth/licenses";
import {
  applyWallet,
  getAccount,
  patchAccount,
} from "../auth/session";
import { AUTOSCHOOL_INTERIOR, ORG_AUTOSCHOOL_ID } from "../org/autoschool";
import { getMembership } from "../org";
import { STREET_WORLD } from "../spawn/point";
import { registerCommand } from "./registry";

export const SELL_LIC_LIST_DIALOG_ID = 29;
export const SELL_LIC_PRICE_DIALOG_ID = 30;
export const SELL_LIC_OFFER_DIALOG_ID = 31;

const DIALOG_STYLE_MSGBOX = 0;
const DIALOG_STYLE_INPUT = 1;
const DIALOG_STYLE_LIST = 2;
const DESK = { x: -2031.8607, y: -116.9832, z: 1035.1719 };
const DESK_RADIUS = 8;
const BUYER_RADIUS = 10;
const OFFER_TTL_MS = 60_000;
const MAX_MONEY = 2_147_483_647;
const PLAYER_STATE_ONFOOT = 1;

type PendingSelect = {
  targetSlot: number;
  targetAccountId: number;
  options: LicenseKey[];
};

type PendingOffer = {
  sellerSlot: number;
  sellerAccountId: number;
  buyerSlot: number;
  buyerAccountId: number;
  license: LicenseKey;
  price: number;
  timer: ReturnType<typeof setTimeout>;
};

const pendingSelect = new Map<number, PendingSelect>();
const pendingOfferByBuyer = new Map<number, PendingOffer>();
const busy = new Set<number>();

function tell(player: Player, color: number, text: string): void {
  try {
    if (isPlayerActive(player)) {
      player.sendClientMessage(color, text);
    }
  } catch {
    // Player slot is empty.
  }
}

function findPlayer(slot: number): Player | null {
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

  return getAccount(target) ? target : null;
}

function isAutoschoolStaff(player: Player): boolean {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  return membership?.org.id === ORG_AUTOSCHOOL_ID;
}

function atLicenseDesk(player: Player): boolean {
  try {
    if (player.getState() !== PLAYER_STATE_ONFOOT) {
      return false;
    }

    if (player.getVirtualWorld() !== STREET_WORLD) {
      return false;
    }

    if (player.getInterior() !== AUTOSCHOOL_INTERIOR) {
      return false;
    }

    return player.getDistanceFromPoint(DESK.x, DESK.y, DESK.z) <= DESK_RADIUS;
  } catch {
    return false;
  }
}

function saleReady(seller: Player, buyer: Player): string | null {
  if (!isAutoschoolStaff(seller)) {
    return "This command is available to driving school employees.";
  }

  if (!atLicenseDesk(seller)) {
    return "Licenses can only be sold at the driving school counter.";
  }

  if (!arePlayersNearby(seller, buyer, BUYER_RADIUS)) {
    return "Player is too far away.";
  }

  const sellerAccount = getAccount(seller);
  const buyerAccount = getAccount(buyer);
  if (sellerAccount?.hospitalized) {
    return "You need treatment. Take a bed: /hospital.";
  }

  if (buyerAccount?.hospitalized) {
    return "The player needs treatment.";
  }

  return null;
}

function clearSellerSelect(player: Player): void {
  const id = playerId(player);
  if (id !== null) {
    pendingSelect.delete(id);
  }
}

function clearBuyerOffer(player: Player, notify: boolean): void {
  const id = playerId(player);
  if (id === null) {
    return;
  }

  const offer = pendingOfferByBuyer.get(id);
  if (!offer) {
    return;
  }

  clearTimeout(offer.timer);
  pendingOfferByBuyer.delete(id);

  if (!notify) {
    return;
  }

  const buyer = findPlayer(offer.buyerSlot);
  if (buyer && getAccount(buyer)?.id === offer.buyerAccountId) {
    tell(buyer, Color.error, "License offer cancelled.");
  }

  const seller = findPlayer(offer.sellerSlot);
  if (seller && getAccount(seller)?.id === offer.sellerAccountId) {
    tell(seller, Color.info, "License offer cancelled.");
  }
}

function expireOffer(buyerSlot: number, buyerAccountId: number): void {
  const offer = pendingOfferByBuyer.get(buyerSlot);
  if (!offer || offer.buyerAccountId !== buyerAccountId) {
    return;
  }

  pendingOfferByBuyer.delete(buyerSlot);

  const buyer = findPlayer(buyerSlot);
  if (buyer && getAccount(buyer)?.id === buyerAccountId) {
    tell(buyer, Color.error, "License offer expired.");
  }

  const seller = findPlayer(offer.sellerSlot);
  if (seller && getAccount(seller)?.id === offer.sellerAccountId) {
    tell(seller, Color.error, "License offer expired.");
  }
}

function cancelOffersFromSeller(sellerSlot: number, sellerAccountId?: number): void {
  for (const [buyerSlot, offer] of pendingOfferByBuyer) {
    if (offer.sellerSlot !== sellerSlot) {
      continue;
    }

    if (sellerAccountId !== undefined && offer.sellerAccountId !== sellerAccountId) {
      continue;
    }

    clearTimeout(offer.timer);
    pendingOfferByBuyer.delete(buyerSlot);

    const buyer = findPlayer(buyerSlot);
    if (buyer && getAccount(buyer)?.id === offer.buyerAccountId) {
      tell(buyer, Color.error, "License offer cancelled.");
    }
  }
}

function showLicenseList(seller: Player, options: LicenseDef[]): boolean {
  try {
    Dialog.show(
      seller,
      SELL_LIC_LIST_DIALOG_ID,
      DIALOG_STYLE_LIST,
      "License sale",
      options.map((row) => row.label).join("\n"),
      "Next",
      "Cancel"
    );
    return true;
  } catch {
    tell(seller, Color.error, "Failed to open the license list.");
    return false;
  }
}

function showPriceDialog(seller: Player, license: LicenseDef): boolean {
  try {
    Dialog.show(
      seller,
      SELL_LIC_PRICE_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "License price",
      `License: ${license.label}\nRange: $${license.min} - $${license.max}`,
      "Offer",
      "Cancel"
    );
    return true;
  } catch {
    tell(seller, Color.error, "Failed to open the price dialog.");
    return false;
  }
}

function parsePrice(raw: string, license: LicenseDef): number | null {
  const text = raw.trim().replace(/[$\s]/g, "");
  const amount = Number(text);
  if (!Number.isInteger(amount) || amount < license.min || amount > license.max) {
    return null;
  }

  return amount;
}

registerCommand("selllic", "Sell a license to a student", (player, args) => {
  if (!isAutoschoolStaff(player)) {
    tell(player, Color.error, "This command is available to driving school employees.");
    return;
  }

  const rawId = args.trim();
  const slot = Number(rawId);
  if (!rawId || !Number.isInteger(slot) || slot < 0) {
    tell(player, Color.error, "Usage: /selllic [id]");
    return;
  }

  const target = findPlayer(slot);
  if (!target) {
    tell(player, Color.error, "Player not found.");
    return;
  }

  if (playerId(target) === playerId(player)) {
    tell(player, Color.error, "You cannot sell a license to yourself.");
    return;
  }

  const blocked = saleReady(player, target);
  if (blocked) {
    tell(player, Color.error, blocked);
    return;
  }

  const targetAccount = getAccount(target);
  const sellerId = playerId(player);
  if (!targetAccount || sellerId === null) {
    return;
  }

  const options = missingLicenses(targetAccount.licenses);
  if (options.length === 0) {
    tell(player, Color.error, "The player already has all licenses.");
    return;
  }

  const sellerAccount = getAccount(player);
  if (sellerAccount) {
    cancelOffersFromSeller(sellerId, sellerAccount.id);
  }

  clearBuyerOffer(target, true);
  pendingSelect.set(sellerId, {
    targetSlot: slot,
    targetAccountId: targetAccount.id,
    options: options.map((row) => row.key),
  });

  if (!showLicenseList(player, options)) {
    pendingSelect.delete(sellerId);
  }
});

export function bindSellLic(): void {
  omp.on("dialogResponse", (player, dialogId, response, listItem, inputText) => {
    const id = Number(dialogId);
    if (
      id !== SELL_LIC_LIST_DIALOG_ID &&
      id !== SELL_LIC_PRICE_DIALOG_ID &&
      id !== SELL_LIC_OFFER_DIALOG_ID
    ) {
      return;
    }

    if (id === SELL_LIC_LIST_DIALOG_ID) {
      onLicensePicked(player, Number(response), Number(listItem), String(inputText ?? ""));
      return;
    }

    if (id === SELL_LIC_PRICE_DIALOG_ID) {
      onPriceEntered(player, Number(response), String(inputText ?? ""));
      return;
    }

    onOfferAnswer(player, Number(response));
  });

  omp.on("playerConnect", (player) => {
    clearSellerSelect(player);
    clearBuyerOffer(player, false);
  });

  omp.on("playerDisconnect", (player) => {
    const id = playerId(player);
    clearSellerSelect(player);
    clearBuyerOffer(player, true);

    if (id !== null) {
      cancelOffersFromSeller(id);
    }
  });
}

function onLicensePicked(
  seller: Player,
  response: number,
  listItem: number,
  inputText: string
): void {
  const sellerId = playerId(seller);
  const pending = sellerId === null ? undefined : pendingSelect.get(sellerId);

  if (response === 0) {
    if (sellerId !== null) {
      pendingSelect.delete(sellerId);
    }
    return;
  }

  if (sellerId === null || !pending) {
    return;
  }

  const target = findPlayer(pending.targetSlot);
  if (!target || getAccount(target)?.id !== pending.targetAccountId) {
    pendingSelect.delete(sellerId);
    tell(seller, Color.error, "Player not found.");
    return;
  }

  const blocked = saleReady(seller, target);
  if (blocked) {
    pendingSelect.delete(sellerId);
    tell(seller, Color.error, blocked);
    return;
  }

  const live = getAccount(target);
  if (!live) {
    pendingSelect.delete(sellerId);
    return;
  }

  let key = pending.options[listItem];
  const typed = inputText.trim().toLowerCase();
  if (typed) {
    const byLabel = missingLicenses(live.licenses).find(
      (row) => row.label.toLowerCase() === typed
    );
    if (byLabel) {
      key = byLabel.key;
    }
  }

  const license = key ? findLicense(key) : null;
  if (!license || live.licenses[license.key]) {
    pendingSelect.delete(sellerId);
    tell(seller, Color.error, "This license cannot be sold to this player.");
    return;
  }

  pendingSelect.set(sellerId, {
    ...pending,
    options: [license.key],
  });

  if (!showPriceDialog(seller, license)) {
    pendingSelect.delete(sellerId);
  }
}

function onPriceEntered(seller: Player, response: number, inputText: string): void {
  const sellerId = playerId(seller);
  const pending = sellerId === null ? undefined : pendingSelect.get(sellerId);
  if (sellerId !== null) {
    pendingSelect.delete(sellerId);
  }

  if (response === 0 || !pending) {
    return;
  }

  const key = pending.options[0];
  const license = key ? findLicense(key) : null;
  if (!license) {
    return;
  }

  const target = findPlayer(pending.targetSlot);
  if (!target || getAccount(target)?.id !== pending.targetAccountId) {
    tell(seller, Color.error, "Player not found.");
    return;
  }

  const blocked = saleReady(seller, target);
  if (blocked) {
    tell(seller, Color.error, blocked);
    return;
  }

  const live = getAccount(target);
  if (!live || live.licenses[license.key]) {
    tell(seller, Color.error, "The player already has this license.");
    return;
  }

  const price = parsePrice(inputText, license);
  if (price === null) {
    tell(
      seller,
      Color.error,
      `Price for ${license.label}: $${license.min} - $${license.max}.`
    );
    if (sellerId !== null) {
      pendingSelect.set(sellerId, pending);
      showPriceDialog(seller, license);
    }
    return;
  }

  const buyerId = playerId(target);
  const sellerAccount = getAccount(seller);
  if (sellerId === null || buyerId === null || !sellerAccount) {
    return;
  }

  cancelOffersFromSeller(sellerId, sellerAccount.id);
  clearBuyerOffer(target, true);

  const offer: PendingOffer = {
    sellerSlot: sellerId,
    sellerAccountId: sellerAccount.id,
    buyerSlot: buyerId,
    buyerAccountId: live.id,
    license: license.key,
    price,
    timer: setTimeout(() => {
      expireOffer(buyerId, live.id);
    }, OFFER_TTL_MS),
  };
  pendingOfferByBuyer.set(buyerId, offer);

  try {
    Dialog.show(
      target,
      SELL_LIC_OFFER_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "License purchase",
      `Employee ${sellerAccount.name} offers to sell you a ${license.offer} license for $${price}.`,
      "Accept",
      "Decline"
    );
  } catch {
    clearTimeout(offer.timer);
    pendingOfferByBuyer.delete(buyerId);
    tell(seller, Color.error, "Failed to send the offer.");
    return;
  }

  tell(
    seller,
    Color.info,
    `You offered ${playerChatName(target)} a ${license.label} license for $${price}.`
  );
}

function onOfferAnswer(buyer: Player, response: number): void {
  const buyerId = playerId(buyer);
  const offer = buyerId === null ? undefined : pendingOfferByBuyer.get(buyerId);
  if (buyerId !== null) {
    pendingOfferByBuyer.delete(buyerId);
  }

  if (!offer) {
    tell(buyer, Color.error, "The offer is no longer valid.");
    return;
  }

  clearTimeout(offer.timer);

  const seller = findPlayer(offer.sellerSlot);
  const sellerOk =
    !!seller && getAccount(seller)?.id === offer.sellerAccountId && isPlayerActive(seller);
  const license = findLicense(offer.license);
  const buyerTag = playerChatName(buyer);

  if (response === 0) {
    tell(buyer, Color.info, "You declined the offer.");
    if (sellerOk && seller) {
      const verb = byGender(
        getAccount(buyer)?.gender ?? null,
        "declined",
        "declined"
      );
      tell(seller, Color.info, `${buyerTag} ${verb} the license offer.`);
    }
    return;
  }

  if (!sellerOk || !seller || !license) {
    tell(buyer, Color.error, "The offer is no longer valid.");
    return;
  }

  const blocked = saleReady(seller, buyer);
  if (blocked) {
    tell(buyer, Color.error, blocked);
    tell(seller, Color.error, blocked);
    return;
  }

  void completeSale(seller, buyer, license, offer.price);
}

async function completeSale(
  seller: Player,
  buyer: Player,
  license: LicenseDef,
  price: number
): Promise<void> {
  const sellerAccount = getAccount(seller);
  const buyerAccount = getAccount(buyer);
  if (!sellerAccount || !buyerAccount) {
    return;
  }

  if (busy.has(sellerAccount.id) || busy.has(buyerAccount.id)) {
    tell(seller, Color.error, "Please wait, another operation is in progress.");
    tell(buyer, Color.error, "Please wait, another operation is in progress.");
    return;
  }

  if (buyerAccount.licenses[license.key]) {
    tell(seller, Color.error, "The player already has this license.");
    tell(buyer, Color.error, "You already have this license.");
    return;
  }

  const sellerCash = Math.max(0, Math.floor(sellerAccount.money));
  const buyerCash = Math.max(0, Math.floor(buyerAccount.money));
  if (buyerCash < price) {
    tell(buyer, Color.error, "Not enough cash.");
    tell(seller, Color.error, "The player does not have enough cash.");
    return;
  }

  if (sellerCash > MAX_MONEY - price) {
    tell(seller, Color.error, "You cannot accept that much cash.");
    tell(buyer, Color.error, "The employee cannot accept payment.");
    return;
  }

  const nextSellerCash = sellerCash + price;
  const nextBuyerCash = buyerCash - price;
  const nextLicenses = { ...buyerAccount.licenses, [license.key]: true };

  busy.add(sellerAccount.id);
  busy.add(buyerAccount.id);
  try {
    await saveLicenseSale({
      sellerId: sellerAccount.id,
      sellerCash: nextSellerCash,
      sellerBank: sellerAccount.bank,
      buyerId: buyerAccount.id,
      buyerCash: nextBuyerCash,
      buyerBank: buyerAccount.bank,
      buyerLicenses: nextLicenses,
    });
  } catch (error: unknown) {
    busy.delete(sellerAccount.id);
    busy.delete(buyerAccount.id);
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] selllic ${sellerAccount.name}: ${message}`);
    tell(seller, Color.error, "Transaction failed. Try again.");
    tell(buyer, Color.error, "Transaction failed. Try again.");
    return;
  }

  busy.delete(sellerAccount.id);
  busy.delete(buyerAccount.id);

  if (isPlayerActive(seller) && getAccount(seller)?.id === sellerAccount.id) {
    patchAccount(seller, { money: nextSellerCash });
    const liveSeller = getAccount(seller);
    if (liveSeller) {
      applyWallet(seller, liveSeller);
    }
    tell(
      seller,
      Color.info,
      `You sold ${playerChatName(buyer)} a ${license.label} license for $${price}.`
    );
  }

  if (isPlayerActive(buyer) && getAccount(buyer)?.id === buyerAccount.id) {
    patchAccount(buyer, { money: nextBuyerCash, licenses: nextLicenses });
    const liveBuyer = getAccount(buyer);
    if (liveBuyer) {
      applyWallet(buyer, liveBuyer);
    }
    tell(buyer, Color.info, `You bought a ${license.offer} license for $${price}.`);
  }
}
