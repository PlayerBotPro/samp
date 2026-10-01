import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { clipClientMessage, sanitizeChatText } from "../../shared/nearby";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { byGender, type Gender } from "../auth/gender";
import { saveUserMoney } from "../auth/repository";
import { applyWallet, getAccount, isAuthenticated, patchAccount } from "../auth/session";
import { getMembership, ORG_RADIO_ID, RADIO_INTERIOR, RADIO_WORLD } from "../org";
import { isRadioFleetVehicle } from "../vehicles/radio";
import { registerCommand } from "./registry";

export const AD_SUBMIT_DIALOG_ID = 37;
export const AD_EDIT_DIALOG_ID = 38;
export const AD_REJECT_DIALOG_ID = 39;

const DIALOG_STYLE_INPUT = 1;
const AD_FEE = 500;
const AD_MAX_LENGTH = 80;
const DESK_RADIUS = 5;
const PUBLISH_GAP_MS = 3 * 60 * 1000;
const TICK_MS = 1000;
const PLAYER_STATE_DRIVER = 2;
const PLAYER_STATE_PASSENGER = 3;

const DESK = {
  x: 1424.4587,
  y: 1056.6222,
  z: 1058.7816,
} as const;

const AD_HINT = [
  `Submit an advertisement. Cost: $${AD_FEE} cash.`,
  "",
  "Prohibited:",
  "- insults, excessive caps, off-topic messages",
  "- advertising third-party servers and cheats",
  "- NRP, threats, impersonating government agencies",
  "",
  "Enter the advertisement text:",
].join("\n");

type Ad = {
  authorId: number;
  authorName: string;
  authorGender: Gender;
  authorTag: string;
  text: string;
  editorName: string;
  editorGender: Gender;
  editorTag: string;
  publishAt: number;
};

const pending: Ad[] = [];
const publishQueue: Ad[] = [];
const editing = new Map<number, Ad>();
const rejecting = new Map<number, Ad>();
const submitting = new Set<number>();

let lastPublishAt = 0;
let started = false;

registerCommand("ad", "Submit an advertisement", (player) => {
  openSubmitDialog(player);
});

registerCommand("edit", "Review a radio center advertisement", (player) => {
  startEdit(player);
});

export function bindAds(): void {
  if (started) {
    return;
  }
  started = true;

  setInterval(tickPublish, TICK_MS);

  omp.on("dialogResponse", (player, dialogId, response, _listItem, inputText) => {
    const id = Number(dialogId);
    const text = String(inputText ?? "");

    if (id === AD_SUBMIT_DIALOG_ID) {
      if (Number(response) === 0 || !isAuthenticated(player)) {
        return;
      }
      void submitAd(player, text);
      return;
    }

    if (id === AD_EDIT_DIALOG_ID) {
      onEditResponse(player, Number(response) !== 0, text);
      return;
    }

    if (id === AD_REJECT_DIALOG_ID) {
      onRejectResponse(player, Number(response) !== 0, text);
    }
  });

  omp.on("playerDisconnect", (player) => {
    returnAdToQueue(player);
  });
}

function openSubmitDialog(player: Player, error?: string): void {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  if (hasAdInFlight(account.id)) {
    tell(player, Color.error, "You already have an advertisement in the queue.");
    return;
  }

  if (account.money < AD_FEE) {
    tell(player, Color.error, `An advertisement costs $${AD_FEE}. Not enough cash.`);
    return;
  }

  const prefix = error ? `${error}\n\n` : "";
  try {
    Dialog.show(
      player,
      AD_SUBMIT_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "Advertisement",
      `${prefix}${AD_HINT}`,
      "Send",
      "Cancel"
    );
  } catch {
    tell(player, Color.error, "Failed to open the advertisement dialog.");
  }
}

async function submitAd(player: Player, raw: string): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  if (submitting.has(account.id) || hasAdInFlight(account.id)) {
    tell(player, Color.error, "You already have an advertisement in the queue.");
    return;
  }

  const text = sanitizeAd(raw);
  if (!text) {
    openSubmitDialog(player, "Enter the advertisement text.");
    return;
  }

  if (account.money < AD_FEE) {
    tell(player, Color.error, `An advertisement costs $${AD_FEE}. Not enough cash.`);
    return;
  }

  const nextCash = account.money - AD_FEE;
  submitting.add(account.id);
  try {
    await saveUserMoney(account.id, nextCash, account.bank);
  } catch {
    submitting.delete(account.id);
    tell(player, Color.error, "Failed to charge the fee. Try again.");
    return;
  }

  const live = getAccount(player);
  if (live && live.id === account.id) {
    patchAccount(player, { money: nextCash });
    applyWallet(player, { ...live, money: nextCash });
  }

  const authorTag =
    isPlayerActive(player) && live?.id === account.id
      ? playerChatName(player)
      : account.name;
  pending.push({
    authorId: account.id,
    authorName: account.name,
    authorGender: account.gender,
    authorTag,
    text,
    editorName: "",
    editorGender: account.gender,
    editorTag: "",
    publishAt: 0,
  });
  submitting.delete(account.id);

  if (isPlayerActive(player) && live?.id === account.id) {
    tell(player, Color.info, `Advertisement sent for review. $${AD_FEE} charged.`);
  }
  notifyRadioStaff(
    Color.info,
    `New advertisement from ${authorTag}. Use /edit.`
  );
}

function startEdit(player: Player): void {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || membership?.org.id !== ORG_RADIO_ID) {
    tell(player, Color.error, "You are not a member of the radio center.");
    return;
  }

  const slot = playerId(player);
  if (slot === null) {
    return;
  }

  if (editing.has(slot) || rejecting.has(slot)) {
    tell(player, Color.error, "Finish the current advertisement first.");
    return;
  }

  if (!canEditHere(player)) {
    tell(
      player,
      Color.error,
      "Advertisements can only be reviewed at the office or in a radio center vehicle."
    );
    return;
  }

  const ad = pending.shift();
  if (!ad) {
    tell(player, Color.error, "The advertisement queue is empty.");
    return;
  }

  editing.set(slot, ad);
  showEditDialog(player, ad);
}

function showEditDialog(player: Player, ad: Ad): void {
  try {
    Dialog.show(
      player,
      AD_EDIT_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "Advertisement review",
      `Player text:\n${ad.text}\n\nEdit the text below, or leave it empty to accept it as is.`,
      "Accept",
      "Reject"
    );
  } catch {
    returnAdFromStaff(player);
    tell(player, Color.error, "Failed to open the review dialog.");
  }
}

function onEditResponse(player: Player, accepted: boolean, raw: string): void {
  const slot = playerId(player);
  if (slot === null) {
    return;
  }

  const ad = editing.get(slot);
  if (!ad) {
    return;
  }

  if (!isRadioStaff(player)) {
    returnAdFromStaff(player);
    tell(player, Color.error, "You are not a member of the radio center.");
    return;
  }

  if (!accepted) {
    editing.delete(slot);
    rejecting.set(slot, ad);
    showRejectDialog(player);
    return;
  }

  const edited = sanitizeAd(raw);
  ad.text = edited || ad.text;
  if (!ad.text) {
    showEditDialog(player, ad);
    return;
  }

  const editor = getAccount(player);
  if (!editor) {
    returnAdFromStaff(player);
    return;
  }

  editing.delete(slot);
  ad.editorName = editor.name;
  ad.editorGender = editor.gender;
  ad.editorTag = playerChatName(player);
  ad.publishAt = nextPublishAt();
  publishQueue.push(ad);

  tell(player, Color.info, "Advertisement accepted and queued for broadcast.");
  notifyAuthor(ad.authorId, Color.info, "Your advertisement was reviewed and sent.");
}

function showRejectDialog(player: Player, error?: string): void {
  const prefix = error ? `${error}\n\n` : "";
  try {
    Dialog.show(
      player,
      AD_REJECT_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "Reject advertisement",
      `${prefix}Specify the reason for rejection.`,
      "Reject",
      "Cancel"
    );
  } catch {
    returnAdFromStaff(player);
    tell(player, Color.error, "Failed to open the rejection reason dialog.");
  }
}

function onRejectResponse(player: Player, confirmed: boolean, raw: string): void {
  const slot = playerId(player);
  if (slot === null) {
    return;
  }

  const ad = rejecting.get(slot);
  if (!ad) {
    return;
  }

  if (!isRadioStaff(player)) {
    returnAdFromStaff(player);
    tell(player, Color.error, "You are not a member of the radio center.");
    return;
  }

  if (!confirmed) {
    rejecting.delete(slot);
    pending.unshift(ad);
    tell(player, Color.gray, "Rejection cancelled. The advertisement returned to the queue.");
    return;
  }

  const reason = sanitizeAd(raw);
  if (!reason) {
    showRejectDialog(player, "Specify the reason for rejection.");
    return;
  }

  rejecting.delete(slot);
  const staff = getAccount(player);
  const verb = byGender(staff?.gender ?? null, "rejected", "rejected");
  const staffTag = playerChatName(player);
  const line = clipClientMessage(
    `Radio center employee ${staffTag} ${verb} the advertisement. Reason: ${reason}`
  );
  notifyAuthor(ad.authorId, Color.error, line);
  notifyRadioStaff(Color.error, line);
}

function tickPublish(): void {
  const ad = publishQueue[0];
  if (!ad || Date.now() < ad.publishAt) {
    return;
  }

  publishQueue.shift();
  lastPublishAt = Date.now();

  const sent = byGender(ad.authorGender, "Submitted by", "Submitted by");
  const checked = byGender(ad.editorGender, "reviewed", "reviewed");
  const text = ad.text.endsWith(".") || ad.text.endsWith("!") || ad.text.endsWith("?")
    ? ad.text
    : `${ad.text}.`;
  const first = clipClientMessage(`LS | ${text} | ${sent} ${ad.authorTag}`);
  const second = clipClientMessage(
    ` Advertisement ${checked} by radio center employee ${ad.editorTag}`
  );

  broadcast(Color.ad, first);
  broadcast(Color.adChecked, second);
}

function nextPublishAt(): number {
  const soonest = Date.now() + PUBLISH_GAP_MS;
  const afterLast = lastPublishAt > 0 ? lastPublishAt + PUBLISH_GAP_MS : 0;
  const afterQueued = publishQueue.reduce(
    (latest, item) => Math.max(latest, item.publishAt + PUBLISH_GAP_MS),
    0
  );
  return Math.max(soonest, afterLast, afterQueued);
}

function isRadioStaff(player: Player): boolean {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  return membership?.org.id === ORG_RADIO_ID;
}

function canEditHere(player: Player): boolean {
  try {
    const state = player.getState();
    if (state === PLAYER_STATE_DRIVER || state === PLAYER_STATE_PASSENGER) {
      const vehicle = omp.vehicles.at(player.getVehicleID());
      return !!vehicle && isRadioFleetVehicle(vehicle);
    }

    if (
      player.getVirtualWorld() !== RADIO_WORLD ||
      player.getInterior() !== RADIO_INTERIOR
    ) {
      return false;
    }

    const pos = player.getPos();
    return (
      Math.hypot(pos.x - DESK.x, pos.y - DESK.y, pos.z - DESK.z) <= DESK_RADIUS
    );
  } catch {
    return false;
  }
}

function hasAdInFlight(authorId: number): boolean {
  if (submitting.has(authorId)) {
    return true;
  }
  if (pending.some((ad) => ad.authorId === authorId)) {
    return true;
  }
  if (publishQueue.some((ad) => ad.authorId === authorId)) {
    return true;
  }
  for (const ad of editing.values()) {
    if (ad.authorId === authorId) {
      return true;
    }
  }
  for (const ad of rejecting.values()) {
    if (ad.authorId === authorId) {
      return true;
    }
  }
  return false;
}

function returnAdFromStaff(player: Player): void {
  const slot = playerId(player);
  if (slot === null) {
    return;
  }

  const ad = editing.get(slot) ?? rejecting.get(slot);
  editing.delete(slot);
  rejecting.delete(slot);
  if (ad) {
    pending.unshift(ad);
  }
}

function returnAdToQueue(player: Player): void {
  returnAdFromStaff(player);
}

function notifyAuthor(authorId: number, color: number, text: string): void {
  const target = findByAccountId(authorId);
  if (target) {
    tell(target, color, text);
  }
}

function notifyRadioStaff(color: number, text: string): void {
  omp.players.forEach((other) => {
    if (!isPlayerActive(other) || isNpc(other)) {
      return;
    }

    const account = getAccount(other);
    const membership = account ? getMembership(account) : null;
    if (membership?.org.id !== ORG_RADIO_ID) {
      return;
    }

    tell(other, color, text);
  });
}

function broadcast(color: number, text: string): void {
  omp.players.forEach((other) => {
    if (!isPlayerActive(other) || isNpc(other)) {
      return;
    }

    tell(other, color, text);
  });
}

function findByAccountId(accountId: number): Player | null {
  for (const other of omp.players.all()) {
    if (!isPlayerActive(other) || getAccount(other)?.id !== accountId) {
      continue;
    }
    return other;
  }
  return null;
}

function sanitizeAd(raw: string): string {
  return sanitizeChatText(raw.trim()).slice(0, AD_MAX_LENGTH);
}

function isNpc(player: Player): boolean {
  try {
    return player.isNPC();
  } catch {
    return false;
  }
}

function tell(player: Player, color: number, text: string): void {
  try {
    player.sendClientMessage(color, clipClientMessage(text));
  } catch {
    // Player slot is empty.
  }
}
