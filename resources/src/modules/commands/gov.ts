import { omp } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { CHAT_MAX_LENGTH, clipClientMessage, sanitizeChatText } from "../../shared/nearby";
import { isPlayerActive, playerChatName } from "../../shared/player";
import { getAccount } from "../auth/session";
import { MAX_ORG_RANK, getMembership } from "../org";
import { registerCommand } from "./registry";

registerCommand("gov", "Government news", (player, args) => {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership || !membership.org.gov) {
    player.sendClientMessage(
      Color.error,
      "You are not a member of a government organization."
    );
    return;
  }

  if (membership.rank.id !== MAX_ORG_RANK) {
    player.sendClientMessage(
      Color.error,
      "Government news are only available to the organization leader."
    );
    return;
  }

  const text = sanitizeChatText(args.trim()).slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    player.sendClientMessage(Color.error, "Usage: /gov [text]");
    return;
  }

  const line = clipClientMessage(`Government news ${playerChatName(player)}: ${text}`);

  omp.players.forEach((other) => {
    if (!isPlayerActive(other)) {
      return;
    }

    try {
      other.sendClientMessage(Color.govNews, line);
    } catch {
      // Slot is empty.
    }
  });
});
