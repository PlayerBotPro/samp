import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { CHAT_MAX_LENGTH, clipClientMessage, sanitizeChatText } from "../../shared/nearby";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { byGender } from "../auth/gender";
import { getAccount, isAuthenticated } from "../auth/session";
import { hasAdminAccess } from "../admin/session";
import { registerCommand } from "./registry";

export const REPORT_DIALOG_ID = 20;

const DIALOG_STYLE_INPUT = 1;
const COOLDOWN_MS = 30_000;

const lastReportAt = new Map<number, number>();

registerCommand("report", "Contact administration", (player) => {
  showReportDialog(player);
});

export function bindReportDialogs(): void {
  omp.on("dialogResponse", (player, dialogId, response, _listItem, inputText) => {
    if (Number(dialogId) !== REPORT_DIALOG_ID) {
      return;
    }

    if (Number(response) === 0) {
      return;
    }

    if (!isAuthenticated(player)) {
      return;
    }

    sendReport(player, String(inputText ?? ""));
  });
}

export function showReportDialog(player: Player, error?: string): void {
  if (!getAccount(player)) {
    return;
  }

  const wait = reportWaitMs(player);
  if (wait > 0 && !error) {
    player.sendClientMessage(
      Color.error,
      `You can send another report in ${formatWait(wait)}.`
    );
    return;
  }

  const prefix = error ? `${error}\n\n` : "";
  try {
    Dialog.show(
      player,
      REPORT_DIALOG_ID,
      DIALOG_STYLE_INPUT,
      "Contact administration",
      `${prefix}Describe your question or complaint.`,
      "Send",
      "Cancel"
    );
  } catch {
    player.sendClientMessage(Color.error, "Failed to open the report dialog.");
  }
}

function sendReport(player: Player, raw: string): void {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  const wait = reportWaitMs(player);
  if (wait > 0) {
    player.sendClientMessage(
      Color.error,
      `You can send another report in ${formatWait(wait)}.`
    );
    return;
  }

  const text = sanitizeChatText(raw.trim()).slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    showReportDialog(player, "Enter a message.");
    return;
  }

  const verb = byGender(account.gender, "wrote", "wrote");
  const authorId = playerId(player);
  const authorLine = clipClientMessage(`${playerChatName(player)}: ${text}`);
  const adminLine = clipClientMessage(`Player ${playerChatName(player)} ${verb}: ${text}`);

  try {
    player.sendClientMessage(Color.info, authorLine);
  } catch {
    return;
  }

  lastReportAt.set(account.id, Date.now());

  omp.players.forEach((other) => {
    if (!isPlayerActive(other) || !hasAdminAccess(other, 1)) {
      return;
    }

    if (playerId(other) === authorId) {
      return;
    }

    try {
      other.sendClientMessage(Color.info, adminLine);
    } catch {
      // Player slot is empty.
    }
  });
}

function reportWaitMs(player: Player): number {
  const account = getAccount(player);
  if (!account) {
    return 0;
  }

  const last = lastReportAt.get(account.id) ?? 0;
  return Math.max(0, last + COOLDOWN_MS - Date.now());
}

function formatWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds} sec.`;
}
