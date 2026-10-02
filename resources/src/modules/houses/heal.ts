import type { Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { applyHealth, getAccount, MAX_HEALTH, patchAccount } from "../auth/session";
import { findOwnedHouseAtInterior } from "./interior";

export function tryHealInHouse(player: Player): void {
  const house = findOwnedHouseAtInterior(player);
  if (!house) {
    player.sendClientMessage(Color.error, "This command is only available inside your house.");
    return;
  }

  if (!house.hasMedkit) {
    player.sendClientMessage(Color.error, "There is no first-aid kit in this house.");
    return;
  }

  const account = getAccount(player);
  if (!account) {
    return;
  }

  patchAccount(player, { health: MAX_HEALTH });
  applyHealth(player, MAX_HEALTH);
  player.sendClientMessage(Color.info, "You restored your health.");
}
