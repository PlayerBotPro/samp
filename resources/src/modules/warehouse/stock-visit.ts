import type { Player } from "@omp-node/core";
import { playerId } from "../../shared/player";

/** Menu already shown during this entry into the marker. */
const stockVisitByPlayer = new Set<number>();
/** A warehouse dialog is currently open — do not interrupt it. */
const stockDialogBusy = new Set<number>();

export function isOrgStockDialogBusy(player: Player): boolean {
  const id = playerId(player);
  return id !== null && stockDialogBusy.has(id);
}

export function setOrgStockDialogBusy(player: Player, busy: boolean): void {
  const id = playerId(player);
  if (id === null) {
    return;
  }

  if (busy) {
    stockDialogBusy.add(id);
  } else {
    stockDialogBusy.delete(id);
  }
}

/** @returns false — the menu was already shown during this entry. */
export function markOrgStockVisit(player: Player): boolean {
  const id = playerId(player);
  if (id === null) {
    return false;
  }

  if (stockVisitByPlayer.has(id)) {
    return false;
  }

  stockVisitByPlayer.add(id);
  return true;
}

/** Left the marker — it can be opened again on the next entry. */
export function clearOrgStockVisit(player: Player): void {
  const id = playerId(player);
  if (id !== null) {
    stockVisitByPlayer.delete(id);
  }
}

export function clearOrgStockVisitById(id: number): void {
  stockVisitByPlayer.delete(id);
  stockDialogBusy.delete(id);
}
