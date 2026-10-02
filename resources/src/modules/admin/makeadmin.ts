import { omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { saveAdminAccess } from "../auth/repository";
import { getAccount, patchAccount } from "../auth/session";
import { registerCommand } from "../commands/registry";
import { promptAdminPasswordSetup, clearAloginDialog } from "./alogin";
import { MAX_ADMIN_LEVEL } from "./catalog";
import { hasAdminAccess } from "./session";

function parseArgs(args: string): { slot: number; level: number } | null {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const slot = Number(parts[0]);
  const level = Number(parts[1]);
  if (!Number.isInteger(slot) || slot < 0) {
    return null;
  }

  if (!Number.isInteger(level) || level < 0 || level > MAX_ADMIN_LEVEL) {
    return null;
  }

  return { slot, level };
}

function findTarget(slot: number) {
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

export function bindAdminMakeadmin(): void {
  registerCommand(
    "makeadmin",
    "Grant or revoke admin rights",
    (player, args) => {
      if (!hasAdminAccess(player, 7)) {
        return;
      }

      const parsed = parseArgs(args);
      if (!parsed) {
        player.sendClientMessage(
          Color.error,
          "Usage: /makeadmin [id] [lvl] (0-7)"
        );
        return;
      }

      const target = findTarget(parsed.slot);
      if (!target) {
        player.sendClientMessage(Color.error, "Player not found.");
        return;
      }

      if (playerId(player) === playerId(target)) {
        player.sendClientMessage(
          Color.error,
          "You cannot grant or revoke your own admin rights."
        );
        return;
      }

      const account = getAccount(target);
      if (!account) {
        player.sendClientMessage(Color.error, "Player not found.");
        return;
      }

      void grantAdmin(player, target, parsed.level);
    },
    true
  );
}

async function grantAdmin(
  admin: Player,
  target: Player,
  level: number
): Promise<void> {
  const account = getAccount(target);
  if (!account) {
    return;
  }

  try {
    await saveAdminAccess(account.id, level);
  } catch {
    admin.sendClientMessage(Color.error, "Failed to save admin rights.");
    return;
  }

  if (!isPlayerActive(target) || getAccount(target)?.id !== account.id) {
    admin.sendClientMessage(Color.error, "Player not found.");
    return;
  }

  patchAccount(target, { adminLevel: level });
  clearAloginDialog(target);

  const tag = playerChatName(target);

  if (level < 1) {
    admin.sendClientMessage(Color.info, `You revoked admin rights from ${tag}.`);
    target.sendClientMessage(Color.info, "Your admin rights have been revoked.");
    return;
  }

  admin.sendClientMessage(Color.info, `You granted ${tag} admin level ${level}.`);
  target.sendClientMessage(
    Color.info,
    `You have been granted admin access. Level: ${level}. Set an admin password.`
  );
  promptAdminPasswordSetup(target);
}
