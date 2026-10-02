import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { WHISPER_RADIUS, arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerId, playerName } from "../../shared/player";
import { byGender, genderLabel } from "../auth/gender";
import { getAccount, type Account } from "../auth/session";
import { ageFromBirthDate, formatBirthDate } from "../auth/validation";
import { residenceLabel } from "../houses/residence";
import { getMembership } from "../org";
import { registerCommand } from "./registry";

const PASSPORT_DIALOG_ID = 3;
const DIALOG_STYLE_MSGBOX = 0;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("pass", "Passport: view or show by ID", (player, args) => {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "Log in first.");
    return;
  }

  if (!account.passport) {
    player.sendClientMessage(
      Color.error,
      "You do not have a passport. Visit City Hall."
    );
    return;
  }

  const rawId = args.trim();
  if (!rawId) {
    showPassport(player, account);
    return;
  }

  const slot = Number(rawId);
  if (!Number.isInteger(slot) || slot < 0) {
    player.sendClientMessage(Color.error, "Usage: /pass [id]");
    return;
  }

  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target)) {
    player.sendClientMessage(Color.error, "Player not found.");
    return;
  }

  if (playerId(target) === playerId(player)) {
    showPassport(player, account);
    return;
  }

  if (!isAuthenticatedTarget(target)) {
    player.sendClientMessage(Color.error, "Player not found.");
    return;
  }

  if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
    player.sendClientMessage(Color.error, "Player is too far away.");
    return;
  }

  showPassport(target, account);
  const shownTo = playerName(target);
  const verb = byGender(account.gender, "showed", "showed");
  player.sendClientMessage(Color.gray, `You ${verb} your passport to ${shownTo}.`);
  target.sendClientMessage(Color.gray, `${account.name} ${verb} you their passport.`);
});

function isAuthenticatedTarget(player: Player): boolean {
  return getAccount(player) !== null;
}

function passRow(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}

function showPassport(viewer: Player, owner: Account): void {
  const membership = getMembership(owner);
  const body = [
    passRow("Name", owner.name),
    passRow("Residence", residenceLabel(owner.id)),
    passRow("Years in country", String(ageFromBirthDate(owner.birthDate))),
    passRow("Gender", genderLabel(owner.gender)),
    passRow("Date of birth", formatBirthDate(owner.birthDate)),
    passRow("Organization", membership?.org.name ?? "None"),
    passRow("Position", membership?.rank.title ?? "None"),
    passRow("Lawfulness", String(owner.lawfulness)),
  ].join("\n");

  try {
    Dialog.show(
      viewer,
      PASSPORT_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${owner.name}'s Passport`,
      body,
      "Close",
      ""
    );
  } catch {
    viewer.sendClientMessage(Color.error, "Unable to open passport.");
  }
}
