import { omp } from "@omp-node/core";
import { Color } from "../../shared/colors";
import {
  CHAT_MAX_LENGTH,
  CHAT_RADIUS,
  clipClientMessage,
  sanitizeChatText,
} from "../../shared/nearby";
import { isPlayerActive, playerChatName } from "../../shared/player";
import { getAccount } from "../auth/session";
import { getMembership } from "../org";
import { registerCommand } from "./registry";

const BUBBLE_MS = 3000;
const BUBBLE_TEXT = "Radio message.";

registerCommand("r", "Organization radio", (player, args) => {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership) {
    player.sendClientMessage(Color.error, "You are not a member of an organization.");
    return;
  }

  if (membership.org.illegal || membership.org.mafia) {
    return;
  }

  const text = sanitizeChatText(args.trim()).slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    player.sendClientMessage(Color.error, "Usage: /r [text]");
    return;
  }

  const line = clipClientMessage(
    `[R] ${membership.rank.title} ${playerChatName(player)}: ${text}`
  );
  const orgId = membership.org.id;

  omp.players.forEach((other) => {
    if (!isPlayerActive(other)) {
      return;
    }

    try {
      if (other.isNPC()) {
        return;
      }
    } catch {
      return;
    }

    const otherAccount = getAccount(other);
    const otherOrg = otherAccount ? getMembership(otherAccount) : null;
    if (!otherOrg || otherOrg.org.id !== orgId) {
      return;
    }

    try {
      other.sendClientMessage(Color.radio, line);
    } catch {
      // Slot is empty.
    }
  });

  try {
    player.setChatBubble(BUBBLE_TEXT, Color.radio, CHAT_RADIUS, BUBBLE_MS);
  } catch {
    // Bubble is optional.
  }
});
