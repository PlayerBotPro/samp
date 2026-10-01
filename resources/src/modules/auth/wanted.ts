import type { Player } from "@omp-node/core";
import { saveUserWantedLevel } from "./repository";
import {
  applyWantedLevel,
  getAccount,
  normalizeWantedLevel,
  patchAccount,
} from "./session";

/**
 * Set wanted level 0–6: cache, SA stars, database.
 * No police commands yet — for the system and future functionality.
 */
export function setPlayerWantedLevel(player: Player, level: number): void {
  const wanted = normalizeWantedLevel(level);
  const account = getAccount(player);
  if (!account) {
    return;
  }

  patchAccount(player, { wantedLevel: wanted });
  applyWantedLevel(player, wanted);
  void saveUserWantedLevel(account.id, wanted).catch(() => {
    // Cache and client are already updated.
  });
}
