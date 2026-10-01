import { omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerId } from "../../shared/player";
import type { Account } from "../auth/session";
import { getAccount } from "../auth/session";
import { ARMY } from "./army";
import {
  ORG_AZTECAS_ID,
  ORG_BALLAS_ID,
  ORG_GROVE_ID,
  ORG_RIFA_ID,
  ORG_VAGOS_ID,
} from "./gangs";
import { getMembership } from "./membership";

const DISGUISE_SKIN_MALE = 287;
const DISGUISE_SKIN_FEMALE = 191;

const GHETTO_GANG_IDS: ReadonlySet<number> = new Set([
  ORG_GROVE_ID,
  ORG_BALLAS_ID,
  ORG_VAGOS_ID,
  ORG_RIFA_ID,
  ORG_AZTECAS_ID,
]);

/** Player slots using Army disguises (gangs at Smokey). */
const disguised = new Set<number>();

export function isArmyDisguised(player: Player): boolean {
  const id = playerId(player);
  return id !== null && disguised.has(id);
}

/** Uniform only applies to a ghetto gang member outside prison. */
export function canKeepArmyDisguise(player: Player): boolean {
  const account = getAccount(player);
  if (!account || account.jailSeconds > 0) {
    return false;
  }

  const membership = getMembership(account);
  return membership !== null && GHETTO_GANG_IDS.has(membership.org.id);
}

export function armyDisguiseSkin(account: Account): number {
  return account.gender === "female" ? DISGUISE_SKIN_FEMALE : DISGUISE_SKIN_MALE;
}

export function applyArmyDisguiseVisuals(player: Player, account: Account): void {
  try {
    player.setSkin(armyDisguiseSkin(account));
    player.setColor(ARMY.color);
  } catch {
    // Slot is not in-game yet.
  }
}

/** Enable disguise (Army skin + color). Gang does not change. */
export function startArmyDisguise(player: Player): boolean {
  const id = playerId(player);
  const account = getAccount(player);
  if (id === null || !account || !canKeepArmyDisguise(player)) {
    return false;
  }

  disguised.add(id);
  applyArmyDisguiseVisuals(player, account);
  return true;
}

/** Remove disguise. The caller restores visuals through applyOrgVisuals. */
export function clearArmyDisguise(player: Player): boolean {
  const id = playerId(player);
  if (id === null || !disguised.has(id)) {
    return false;
  }

  disguised.delete(id);
  return true;
}

/**
 * If the disguise is no longer valid (prison / removed from gang), clear the flag.
 * Returns true if the player should now look like Army personnel.
 */
export function syncArmyDisguise(player: Player): boolean {
  if (!isArmyDisguised(player)) {
    return false;
  }

  if (canKeepArmyDisguise(player)) {
    return true;
  }

  clearArmyDisguise(player);
  return false;
}

export function bindArmyDisguise(): void {
  omp.on("playerDeath", (player) => {
    if (!clearArmyDisguise(player)) {
      return;
    }

    if (isPlayerActive(player)) {
      player.sendClientMessage(Color.gray, "Army uniform removed.");
    }
  });

  omp.on("playerConnect", (player) => {
    const id = playerId(player);
    if (id !== null) {
      disguised.delete(id);
    }
  });

  omp.on("playerDisconnect", (player) => {
    clearArmyDisguise(player);
  });
}
