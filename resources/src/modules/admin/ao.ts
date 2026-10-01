import { omp } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { CHAT_MAX_LENGTH, sanitizeChatText } from "../../shared/nearby";
import { isPlayerActive, playerChatName } from "../../shared/player";
import { registerCommand } from "../commands/registry";
import { hasAdminAccess } from "./session";

function broadcastAll(color: number, text: string): void {
  omp.players.forEach((other) => {
    if (!isPlayerActive(other)) {
      return;
    }

    try {
      other.sendClientMessage(color, text);
    } catch {
      // Slot is empty.
    }
  });
}

export function bindAdminAo(): void {
  registerCommand(
    "ao",
    "Announcement to all players",
    (player, args) => {
      if (!hasAdminAccess(player, 3)) {
        return;
      }

      const text = sanitizeChatText(args.trim()).slice(0, CHAT_MAX_LENGTH);
      if (!text) {
        player.sendClientMessage(Color.error, "Usage: /ao [text]");
        return;
      }

      broadcastAll(
        Color.info,
        `Administrator ${playerChatName(player)}: ${text}`
      );
    },
    true
  );
}
