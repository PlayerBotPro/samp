import { Color } from "../../shared/colors";
import { CHAT_MAX_LENGTH, WHISPER_RADIUS, sanitizeChatText, sendNearby } from "../../shared/nearby";
import { playerChatName } from "../../shared/player";
import { playLocalSpeech } from "../chat/talk";
import { registerCommand } from "./registry";

registerCommand("w", "Whisper to nearby players", (player, args) => {
  const text = sanitizeChatText(args.trim()).slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    player.sendClientMessage(Color.error, "Usage: /w [text]");
    return;
  }

  sendNearby(
    player,
    WHISPER_RADIUS,
    Color.whisper,
    `${playerChatName(player)} whispers: ${text}`
  );
  playLocalSpeech(player, text, { radius: WHISPER_RADIUS, color: Color.whisper });
});
