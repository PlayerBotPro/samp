import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { WHISPER_RADIUS, arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerId, playerName } from "../../shared/player";
import { byGender } from "../auth/gender";
import { saveUserMilitaryId } from "../auth/repository";
import { getAccount, isAuthenticated, patchAccount, type Account } from "../auth/session";
import { ORG_ARMY_ID, getMembership } from "../org";
import { registerCommand } from "./registry";

export const VBILET_DIALOG_ID = 67;

const DIALOG_STYLE_MSGBOX = 0;
const ISSUE_MIN_RANK = 8;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("vbilet", "Military ID: view or show by ID", (player, args) => {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "Log in first.");
    return;
  }

  if (!account.militaryId) {
    player.sendClientMessage(Color.error, "You do not have a military ID.");
    return;
  }

  const rawId = args.trim();
  if (!rawId) {
    showMilitaryId(player, account);
    return;
  }

  const slot = Number(rawId);
  if (!Number.isInteger(slot) || slot < 0) {
    player.sendClientMessage(Color.error, "Usage: /vbilet [id]");
    return;
  }

  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target) || !isAuthenticated(target)) {
    player.sendClientMessage(Color.error, "Player not found.");
    return;
  }

  if (playerId(target) === playerId(player)) {
    showMilitaryId(player, account);
    return;
  }

  if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
    player.sendClientMessage(Color.error, "Player is too far away.");
    return;
  }

  showMilitaryId(target, account);
  const verb = byGender(account.gender, "showed", "showed");
  player.sendClientMessage(Color.gray, `You ${verb} your military ID to ${playerName(target)}.`);
  target.sendClientMessage(Color.gray, `${account.name} ${verb} you their military ID.`);
});

registerCommand(
  "givevbilet",
  "Issue military ID (Army, rank 8+)",
  (player, args) => {
    const account = getAccount(player);
    const membership = account ? getMembership(account) : null;
    if (
      !account ||
      !membership ||
      membership.org.id !== ORG_ARMY_ID ||
      membership.rank.id < ISSUE_MIN_RANK
    ) {
      player.sendClientMessage(
        Color.error,
        "Only Army staff of rank 8 or higher may issue military IDs."
      );
      return;
    }

    const slot = Number(args.trim());
    if (!Number.isInteger(slot) || slot < 0) {
      player.sendClientMessage(Color.error, "Usage: /givevbilet [id]");
      return;
    }

    const target = omp.players.at(slot);
    if (!target || !isPlayerActive(target) || !isAuthenticated(target)) {
      player.sendClientMessage(Color.error, "Player not found.");
      return;
    }

    if (playerId(target) === playerId(player)) {
      player.sendClientMessage(Color.error, "You cannot issue yourself a military ID.");
      return;
    }

    const targetAccount = getAccount(target);
    if (!targetAccount) {
      player.sendClientMessage(Color.error, "Player not found.");
      return;
    }

    if (targetAccount.militaryId) {
      player.sendClientMessage(Color.error, "The player already has a military ID.");
      return;
    }

    patchAccount(target, { militaryId: true });
    void saveUserMilitaryId(targetAccount.id, true).catch(() => {
      // Cache is already updated.
    });

    player.sendClientMessage(
      Color.info,
      `You issued a military ID to ${playerName(target)}.`
    );
    target.sendClientMessage(
      Color.info,
      `${playerName(player)} issued you a military ID. View it: /vbilet`
    );
  }
);

function showMilitaryId(viewer: Player, owner: Account): void {
  const served = byGender(owner.gender, "Served", "Served");
  const body = [
    row("Name", owner.name),
    row("Status", "Military ID issued"),
    row("Service", served),
  ].join("\n");

  try {
    Dialog.show(
      viewer,
      VBILET_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${owner.name}'s Military ID`,
      body,
      "Close",
      ""
    );
  } catch {
    viewer.sendClientMessage(Color.error, "Unable to open military ID.");
  }
}

function row(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}
