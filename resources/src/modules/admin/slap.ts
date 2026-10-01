import { omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerChatName } from "../../shared/player";
import { trustPosition } from "../anticheat/trust";
import { registerCommand } from "../commands/registry";
import { hasAdminAccess } from "./session";

const MIN_LEVEL = 1;
const SLAP_HEIGHT = 5;
const SLAP_VELOCITY = 0.85;

function broadcastAdmins(text: string): void {
  omp.players.forEach((other) => {
    if (!isPlayerActive(other) || !hasAdminAccess(other, 1)) {
      return;
    }

    try {
      other.sendClientMessage(Color.gray, text);
    } catch {
      // Slot is empty.
    }
  });
}

function slapPlayer(target: Player): boolean {
  try {
    if (target.isInAnyVehicle()) {
      target.removeFromVehicle();
    }
  } catch {
    // No longer in a vehicle.
  }

  try {
    const pos = target.getPos();
    target.setPos(pos.x, pos.y, pos.z + SLAP_HEIGHT);
    trustPosition(target, pos.x, pos.y, pos.z + SLAP_HEIGHT);
  } catch {
    return false;
  }

  try {
    target.setVelocity(0, 0, SLAP_VELOCITY);
  } catch {
    // Position is already moved up.
  }

  return true;
}

export function bindAdminSlap(): void {
  registerCommand(
    "slap",
    "Launch a player upward",
    (player, args) => {
      if (!hasAdminAccess(player, MIN_LEVEL)) {
        return;
      }

      const idPart = args.trim();
      if (!idPart) {
        player.sendClientMessage(Color.error, "Usage: /slap [id]");
        return;
      }

      const slot = Number(idPart);
      if (!Number.isInteger(slot) || slot < 0) {
        player.sendClientMessage(Color.error, "Usage: /slap [id]");
        return;
      }

      const target = omp.players.at(slot);
      if (!target || !isPlayerActive(target)) {
        player.sendClientMessage(Color.error, "Player not found.");
        return;
      }

      try {
        if (target.isNPC()) {
          player.sendClientMessage(Color.error, "Player not found.");
          return;
        }
      } catch {
        player.sendClientMessage(Color.error, "Player not found.");
        return;
      }

      if (!slapPlayer(target)) {
        player.sendClientMessage(Color.error, "Failed to launch the player.");
        return;
      }

      broadcastAdmins(
        `Administrator ${playerChatName(player)} launched ${playerChatName(target)}.`
      );
    },
    true
  );
}
