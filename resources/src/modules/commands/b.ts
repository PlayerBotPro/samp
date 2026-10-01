import { Color } from "../../shared/colors";
import { CHAT_MAX_LENGTH, CHAT_RADIUS, sanitizeChatText, sendNearby } from "../../shared/nearby";
import { playerChatName } from "../../shared/player";
import { hasAdminAccess } from "../admin/session";
import { registerCommand } from "./registry";

registerCommand("b", "Nearby out-of-character chat (OOC)", (player, args) => {
  const text = sanitizeChatText(args.trim()).slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    player.sendClientMessage(Color.error, "Usage: /b [text]");
    return;
  }

  const prefix = hasAdminAccess(player, 1) ? "Administrator " : "";
  sendNearby(
    player,
    CHAT_RADIUS,
    Color.ooc,
    `(( ${prefix}${playerChatName(player)}: ${text} ))`
  );
});
