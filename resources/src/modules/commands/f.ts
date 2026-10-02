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

registerCommand("f", "帮派或黑手党聊天", (player, args) => {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership || !(membership.org.illegal || membership.org.mafia)) {
    return;
  }

  const text = sanitizeChatText(args.trim()).slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    player.sendClientMessage(Color.error, "用法：/f [内容]");
    return;
  }

  const line = clipClientMessage(
    `[组织] ${membership.rank.title} ${playerChatName(player)}：${text}`
  );
  const orgId = membership.org.id;
  const bubble = membership.org.mafia ? "黑手党消息。" : "帮派消息。";

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
    player.setChatBubble(bubble, Color.radio, CHAT_RADIUS, BUBBLE_MS);
  } catch {
    // Bubble is optional.
  }
});
