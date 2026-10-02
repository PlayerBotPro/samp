import { Dialog, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { formatBirthDate } from "../auth/validation";
import { genderLabel } from "../auth/gender";
import { getAccount } from "../auth/session";
import { residenceLabel } from "../houses/residence";
import { getMembership, resolvePlayerSkin } from "../org";
import { expForNextLevel } from "../payday/progress";
import { registerCommand } from "./registry";

const STATS_DIALOG_ID = 2;
const DIALOG_STYLE_MSGBOX = 0;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("stats", "Character statistics", (player) => {
  showStatsDialog(player);
});

export function showStatsDialog(player: Player): void {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "Log in first.");
    return;
  }

  let health = Math.round(account.health);
  try {
    const live = player.getHealth();
    if (live > 0) {
      health = Math.round(live);
    }
  } catch {
    // World stats are unavailable — show account data.
  }

  const membership = getMembership(account);
  const rank = membership
    ? `${membership.rank.title} (${membership.rank.id})`
    : "None";
  const body = [
    statsRow("Name", account.name),
    statsRow("Residence", residenceLabel(account.id)),
    statsRow("Gender", genderLabel(account.gender)),
    statsRow("Level", String(account.level)),
    statsRow("Experience", `${account.exp}/${expForNextLevel(account.level)}`),
    statsRow("Lawfulness", String(account.lawfulness)),
    statsRow("Skin", String(resolvePlayerSkin(account))),
    statsRow("Date of birth", formatBirthDate(account.birthDate)),
    statsRow("Email", account.email),
    statsRow("Cash", `$${account.money}`),
    statsRow("Bank", `$${account.bank}`),
    statsRow("Donation balance", String(account.donate)),
    statsRow("Drugs", `${account.drugs} pcs.`),
    statsRow("Ammunition", `${account.ammo} pcs.`),
    statsRow("Metal", `${account.metal} pcs.`),
    statsRow("Wanted level", String(account.wantedLevel)),
    statsRow("Military ID", account.militaryId ? "Yes" : "No"),
    statsRow("Medical card", account.medcard ? "Yes" : "No"),
    statsRow("Health", String(health)),
    statsRow("Organization", membership?.org.name ?? "None"),
    statsRow("Position", rank),
  ].join("\n");

  try {
    Dialog.show(
      player,
      STATS_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${account.name}'s Statistics`,
      body,
      "Close",
      ""
    );
  } catch {
    player.sendClientMessage(Color.error, "Unable to open statistics.");
  }
}

function statsRow(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}
