import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { WHISPER_RADIUS, arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerId, playerName } from "../../shared/player";
import { byGender } from "../auth/gender";
import { saveUserMedcard, saveUserMoney } from "../auth/repository";
import {
  applyWallet,
  getAccount,
  isAuthenticated,
  patchAccount,
  type Account,
} from "../auth/session";
import { ORG_HOSPITAL_ID, getMembership } from "../org";
import { HOSPITAL_WORLD } from "../spawn/point";
import { registerCommand } from "./registry";

export const MEDCARD_DIALOG_ID = 68;

const DIALOG_STYLE_MSGBOX = 0;
const ISSUE_MIN_RANK = 6;
const MIN_PRICE = 2000;
const MAX_PRICE = 5000;
const ISSUE_RADIUS = 20;
const KEY_YES = 65536;
const KEY_NO = 131072;
const OFFER_TTL_MS = 60_000;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

/** Medcard issue area in the hospital (entire staff area, ~20 m). */
const ISSUE_POINT = {
  x: 1165.0743,
  y: -1350.3879,
  z: 4001.1001,
} as const;

type MedcardOffer = {
  issuerId: number;
  issuerUserId: number;
  price: number;
  expiresAt: number;
};

/** Medcard offers: target slot → offer. */
const pendingOffers = new Map<number, MedcardOffer>();

registerCommand("medcard", "Medcard: view or show it by ID", (player, args) => {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "Log in first.");
    return;
  }

  if (!account.medcard) {
    player.sendClientMessage(Color.error, "You do not have a medical card.");
    return;
  }

  const rawId = args.trim();
  if (!rawId) {
    showMedcard(player, account);
    return;
  }

  const slot = Number(rawId);
  if (!Number.isInteger(slot) || slot < 0) {
    player.sendClientMessage(Color.error, "Usage: /medcard [id]");
    return;
  }

  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target) || !isAuthenticated(target)) {
    player.sendClientMessage(Color.error, "Player not found.");
    return;
  }

  if (playerId(target) === playerId(player)) {
    showMedcard(player, account);
    return;
  }

  if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
    player.sendClientMessage(Color.error, "Player is too far away.");
    return;
  }

  showMedcard(target, account);
  const verb = byGender(account.gender, "showed", "showed");
  player.sendClientMessage(Color.gray, `You ${verb} your medical card to ${playerName(target)}.`);
  target.sendClientMessage(Color.gray, `${account.name} ${verb} you their medical card.`);
});

registerCommand(
  "givemedcard",
  "Issue a medical card (Hospital, rank 6+)",
  (player, args) => {
    const account = getAccount(player);
    const membership = account ? getMembership(account) : null;
    if (
      !account ||
      !membership ||
      membership.org.id !== ORG_HOSPITAL_ID ||
      membership.rank.id < ISSUE_MIN_RANK
    ) {
      player.sendClientMessage(
        Color.error,
        "Only hospital employees of rank 6 or higher can issue medical cards."
      );
      return;
    }

    if (!isInMedcardIssueZone(player)) {
      player.sendClientMessage(
        Color.error,
        "Medical cards can only be issued at the hospital."
      );
      return;
    }

    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      player.sendClientMessage(
        Color.error,
        `Usage: /givemedcard [id] [amount ${MIN_PRICE}-${MAX_PRICE}]`
      );
      return;
    }

    const slot = Number(parts[0]);
    const price = Math.floor(Number(parts[1]));
    if (!Number.isInteger(slot) || slot < 0) {
      player.sendClientMessage(Color.error, "Invalid player ID.");
      return;
    }

    if (
      !Number.isFinite(price) ||
      !Number.isSafeInteger(price) ||
      price < MIN_PRICE ||
      price > MAX_PRICE
    ) {
      player.sendClientMessage(
        Color.error,
        `Amount must be between $${MIN_PRICE} and $${MAX_PRICE}.`
      );
      return;
    }

    const target = omp.players.at(slot);
    if (!target || !isPlayerActive(target) || !isAuthenticated(target)) {
      player.sendClientMessage(Color.error, "Player not found.");
      return;
    }

    const issuerSlot = playerId(player);
    const targetSlot = playerId(target);
    if (issuerSlot === null || targetSlot === null) {
      return;
    }

    if (targetSlot === issuerSlot) {
      player.sendClientMessage(Color.error, "You cannot issue a medical card to yourself.");
      return;
    }

    if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
      player.sendClientMessage(Color.error, "Player is too far away.");
      return;
    }

    const targetAccount = getAccount(target);
    if (!targetAccount) {
      player.sendClientMessage(Color.error, "Player not found.");
      return;
    }

    if (targetAccount.medcard) {
      player.sendClientMessage(Color.error, "The player already has a medical card.");
      return;
    }

    if (targetAccount.money < price) {
      player.sendClientMessage(
        Color.error,
        `The player does not have enough money. $${price} required.`
      );
      return;
    }

    pendingOffers.set(targetSlot, {
      issuerId: issuerSlot,
      issuerUserId: account.id,
      price,
      expiresAt: Date.now() + OFFER_TTL_MS,
    });

    player.sendClientMessage(
      Color.info,
      `You offered a medical card to ${playerName(target)} for $${price}.`
    );
    target.sendClientMessage(
      Color.white,
      `${playerName(player)} offers you a medical card for $${price}.`
    );
    target.sendClientMessage(
      Color.white,
      "Press {00CC00}Y {FFFFFF}to view or {FF6600}N {FFFFFF}to decline"
    );
  }
);

export function bindMedcardOffers(): void {
  omp.on("playerKeyStateChange", (player, newKeys, oldKeys) => {
    const pressed = Number(newKeys) & ~Number(oldKeys);
    if ((pressed & KEY_YES) === 0 && (pressed & KEY_NO) === 0) {
      return;
    }

    const slot = playerId(player);
    if (slot === null) {
      return;
    }

    const offer = pendingOffers.get(slot);
    if (!offer) {
      return;
    }

    if (Date.now() > offer.expiresAt) {
      pendingOffers.delete(slot);
      player.sendClientMessage(Color.error, "The medical card offer has expired.");
      return;
    }

    if ((pressed & KEY_NO) !== 0) {
      refuseOffer(player, slot, offer);
      return;
    }

    if ((pressed & KEY_YES) !== 0) {
      acceptOffer(player, slot, offer);
    }
  });

  omp.on("playerDisconnect", (player) => {
    const slot = playerId(player);
    if (slot === null) {
      return;
    }

    pendingOffers.delete(slot);
    for (const [targetSlot, offer] of pendingOffers) {
      if (offer.issuerId === slot) {
        pendingOffers.delete(targetSlot);
      }
    }
  });
}

function acceptOffer(target: Player, targetSlot: number, offer: MedcardOffer): void {
  pendingOffers.delete(targetSlot);

  const targetAccount = getAccount(target);
  if (!targetAccount || !isAuthenticated(target)) {
    return;
  }

  if (targetAccount.medcard) {
    target.sendClientMessage(Color.error, "You already have a medical card.");
    return;
  }

  const issuer = omp.players.at(offer.issuerId);
  if (!issuer || !isPlayerActive(issuer) || !isAuthenticated(issuer)) {
    target.sendClientMessage(Color.error, "The doctor left the game. Transaction cancelled.");
    return;
  }

  const issuerAccount = getAccount(issuer);
  if (!issuerAccount || issuerAccount.id !== offer.issuerUserId) {
    target.sendClientMessage(Color.error, "The doctor left the game. Transaction cancelled.");
    return;
  }

  if (!arePlayersNearby(target, issuer, WHISPER_RADIUS)) {
    target.sendClientMessage(Color.error, "The doctor is too far away. Transaction cancelled.");
    issuer.sendClientMessage(Color.error, "The patient is too far away. Transaction cancelled.");
    return;
  }

  if (!isInMedcardIssueZone(issuer)) {
    target.sendClientMessage(Color.error, "The doctor must be at the hospital. Transaction cancelled.");
    issuer.sendClientMessage(Color.error, "Only issue medical cards at the hospital.");
    return;
  }

  const price = offer.price;
  if (targetAccount.money < price) {
    target.sendClientMessage(Color.error, `Not enough money. $${price} required.`);
    issuer.sendClientMessage(
      Color.error,
      `${playerName(target)} could not pay for the medical card ($${price}).`
    );
    return;
  }

  const nextTargetMoney = targetAccount.money - price;
  const nextIssuerMoney = issuerAccount.money + price;
  if (!Number.isSafeInteger(nextIssuerMoney)) {
    target.sendClientMessage(Color.error, "Payment failed.");
    return;
  }

  patchAccount(target, { money: nextTargetMoney, medcard: true });
  patchAccount(issuer, { money: nextIssuerMoney });

  const liveTarget = getAccount(target);
  const liveIssuer = getAccount(issuer);
  if (liveTarget) {
    applyWallet(target, liveTarget);
  }
  if (liveIssuer) {
    applyWallet(issuer, liveIssuer);
  }

  void Promise.all([
    saveUserMoney(targetAccount.id, nextTargetMoney, targetAccount.bank),
    saveUserMoney(issuerAccount.id, nextIssuerMoney, issuerAccount.bank),
    saveUserMedcard(targetAccount.id, true),
  ]).catch(() => {
    // Cache is already updated.
  });

  issuer.sendClientMessage(
    Color.info,
    `Player ${playerName(target)} bought a medical card for $${price}.`
  );
  target.sendClientMessage(
    Color.info,
    `You bought a medical card for $${price}. View it with: /medcard`
  );
  showMedcard(target, getAccount(target) ?? { ...targetAccount, medcard: true });
}

function refuseOffer(target: Player, targetSlot: number, offer: MedcardOffer): void {
  pendingOffers.delete(targetSlot);
  target.sendClientMessage(Color.gray, "You declined the medical card.");

  const issuer = omp.players.at(offer.issuerId);
  if (issuer && isPlayerActive(issuer)) {
    issuer.sendClientMessage(
      Color.gray,
      `${playerName(target)} declined the medical card.`
    );
  }
}

function isInMedcardIssueZone(player: Player): boolean {
  try {
    if (player.getVirtualWorld() !== HOSPITAL_WORLD || player.getInterior() !== 0) {
      return false;
    }

    const pos = player.getPos();
    return (
      Math.hypot(pos.x - ISSUE_POINT.x, pos.y - ISSUE_POINT.y, pos.z - ISSUE_POINT.z) <=
      ISSUE_RADIUS
    );
  } catch {
    return false;
  }
}

function showMedcard(viewer: Player, owner: Account): void {
  const body = [
    row("Name", owner.name),
    row("Status", "Medical card issued"),
    row("Fitness", "Fit"),
  ].join("\n");

  try {
    Dialog.show(
      viewer,
      MEDCARD_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}Medical card: ${owner.name}`,
      body,
      "Close",
      ""
    );
  } catch {
    viewer.sendClientMessage(Color.error, "Failed to open the medical card.");
  }
}

function row(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}
