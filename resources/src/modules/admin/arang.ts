import { omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { saveAdminLevel } from "../auth/repository";
import { getAccount, patchAccount } from "../auth/session";
import { registerCommand } from "../commands/registry";
import { hasAdminAccess } from "./session";

const MIN_ADMIN_LEVEL = 7;
const MIN_TARGET_LEVEL = 1;
const MAX_TARGET_LEVEL = 6;
const pending = new Set<number>();

function parseDelta(args: string): { slot: number; delta: 1 | -1 } | null {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const slot = Number(parts[0]);
  if (!Number.isInteger(slot) || slot < 0) {
    return null;
  }

  if (parts[1] === "+") {
    return { slot, delta: 1 };
  }
  if (parts[1] === "-") {
    return { slot, delta: -1 };
  }

  return null;
}

function findTarget(slot: number): Player | null {
  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target)) {
    return null;
  }

  try {
    if (target.isNPC()) {
      return null;
    }
  } catch {
    return null;
  }

  return target;
}

function isSamePlayer(a: Player, b: Player): boolean {
  const aId = playerId(a);
  const bId = playerId(b);
  return aId !== null && aId === bId;
}

export function bindAdminArang(): void {
  registerCommand(
    "arang",
    "Raise or lower an admin level",
    (player, args) => {
      if (!hasAdminAccess(player, MIN_ADMIN_LEVEL)) {
        return;
      }

      const parsed = parseDelta(args);
      if (!parsed) {
        player.sendClientMessage(
          Color.error,
          "Usage: /arang [id] [+/-]"
        );
        return;
      }

      const target = findTarget(parsed.slot);
      if (!target) {
        player.sendClientMessage(Color.error, "Player not found.");
        return;
      }

      if (isSamePlayer(player, target)) {
        player.sendClientMessage(
          Color.error,
          "You cannot change your own admin level."
        );
        return;
      }

      const account = getAccount(target);
      if (!account) {
        player.sendClientMessage(Color.error, "Player not found.");
        return;
      }

      if (account.adminLevel < MIN_TARGET_LEVEL) {
        player.sendClientMessage(
          Color.error,
          "The player is not an administrator."
        );
        return;
      }

      if (account.adminLevel > MAX_TARGET_LEVEL) {
        player.sendClientMessage(
          Color.error,
          "Level 7 can only be changed with /makeadmin."
        );
        return;
      }

      const next = account.adminLevel + parsed.delta;
      if (next < MIN_TARGET_LEVEL || next > MAX_TARGET_LEVEL) {
        player.sendClientMessage(
          Color.error,
          `Player admin level: ${MIN_TARGET_LEVEL}-${MAX_TARGET_LEVEL}.`
        );
        return;
      }

      void applyAdminRank(player, target, next);
    },
    true
  );
}

async function applyAdminRank(
  admin: Player,
  target: Player,
  nextLevel: number
): Promise<void> {
  const account = getAccount(target);
  if (!account) {
    return;
  }

  if (pending.has(account.id)) {
    admin.sendClientMessage(
      Color.error,
      "This player's admin level is already being changed. Please wait."
    );
    return;
  }

  pending.add(account.id);
  try {
    await saveAdminLevel(account.id, nextLevel);

    if (!isPlayerActive(target) || getAccount(target)?.id !== account.id) {
      admin.sendClientMessage(
        Color.info,
        `Admin level saved: ${nextLevel}. The player disconnected.`
      );
      return;
    }

    patchAccount(target, { adminLevel: nextLevel });

    const adminTag = playerChatName(admin);
    const targetTag = playerChatName(target);

    admin.sendClientMessage(
      Color.info,
      `You set ${targetTag}'s admin level to ${nextLevel}.`
    );
    target.sendClientMessage(
      Color.info,
      `Administrator ${adminTag} set your admin level to ${nextLevel}.`
    );
  } catch {
    admin.sendClientMessage(Color.error, "Failed to save the admin level.");
  } finally {
    pending.delete(account.id);
  }
}
