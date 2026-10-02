import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import {
  CHAT_MAX_LENGTH,
  arePlayersNearby,
  clipClientMessage,
  sanitizeChatText,
} from "../../shared/nearby";
import { isPlayerActive, playerChatName, playerId } from "../../shared/player";
import { saveUserOrg } from "../auth/repository";
import { byGender } from "../auth/gender";
import { getAccount, patchAccount } from "../auth/session";
import {
  MIN_ORG_RANK,
  ORG_NONE,
  applyOrgVisuals,
  getMembership,
  getOrgRank,
  getOrganization,
} from "../org";
import { syncOrgVehicleAccess } from "../vehicles/access";
import { refreshCaptureView } from "../zones/capture";
import { registerCommand } from "./registry";

export const ORG_INVITE_DIALOG_ID = 21;

const DIALOG_STYLE_MSGBOX = 0;
const STAFF_MIN_RANK = 9;
const MANAGE_MAX_RANK = 9;
const INVITE_TTL_MS = 60_000;
const INVITE_RADIUS = 10;

type PendingInvite = {
  inviterSlot: number;
  inviterAccountId: number;
  targetAccountId: number;
  orgId: number;
  orgRank: number;
  timer: ReturnType<typeof setTimeout>;
};

const pendingInvite = new Map<number, PendingInvite>();

function tell(player: Player, color: number, text: string): void {
  try {
    if (isPlayerActive(player)) {
      player.sendClientMessage(color, text);
    }
  } catch {
    // Player slot is empty.
  }
}

function clearInvite(player: Player): void {
  const id = playerId(player);
  if (id === null) {
    return;
  }

  const pending = pendingInvite.get(id);
  if (pending) {
    clearTimeout(pending.timer);
    pendingInvite.delete(id);
  }
}

function expireInvite(slot: number, accountId: number): void {
  const pending = pendingInvite.get(slot);
  if (!pending || pending.targetAccountId !== accountId) {
    return;
  }

  pendingInvite.delete(slot);
  const target = findTarget(slot);
  if (target && getAccount(target)?.id === accountId) {
    tell(target, Color.error, "邀请已过期。");
  }

  const inviter = findTarget(pending.inviterSlot);
  if (inviter && getAccount(inviter)?.id === pending.inviterAccountId) {
    tell(inviter, Color.error, "邀请已过期。");
  }
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

  return getAccount(target) ? target : null;
}

function parseSlot(raw: string): number | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  const slot = Number(text);
  if (!Number.isInteger(slot) || slot < 0) {
    return null;
  }
  return slot;
}

function staffOf(player: Player) {
  const account = getAccount(player);
  const membership = account ? getMembership(account) : null;
  if (!account || !membership || membership.rank.id < STAFF_MIN_RANK) {
    return null;
  }
  return { account, membership };
}

function samePlayer(a: Player, b: Player): boolean {
  const left = playerId(a);
  const right = playerId(b);
  return left !== null && left === right;
}

function requireStaff(player: Player) {
  const staff = staffOf(player);
  if (!staff) {
    tell(player, Color.error, "此命令需要组织职位9级以上。");
    return null;
  }
  return staff;
}

function requireOtherTarget(actor: Player, args: string, usage: string): Player | null {
  const slot = parseSlot(args.trim().split(/\s+/).filter(Boolean)[0] ?? "");
  if (slot === null) {
    tell(actor, Color.error, usage);
    return null;
  }

  const target = findTarget(slot);
  if (!target) {
    tell(actor, Color.error, "未找到玩家。");
    return null;
  }

  if (samePlayer(actor, target)) {
    tell(actor, Color.error, "不能对自己使用此命令。");
    return null;
  }

  return target;
}

function canManage(targetRank: number): boolean {
  return targetRank >= MIN_ORG_RANK && targetRank <= MANAGE_MAX_RANK;
}

async function setOrg(player: Player, orgId: number, orgRank: number): Promise<boolean> {
  const account = getAccount(player);
  if (!account) {
    return false;
  }

  try {
    await saveUserOrg(account.id, orgId, orgRank);
  } catch {
    return false;
  }

  if (!isPlayerActive(player) || getAccount(player)?.id !== account.id) {
    return false;
  }

  patchAccount(player, { orgId, orgRank });
  applyOrgVisuals(player);
  syncOrgVehicleAccess(player);
  refreshCaptureView(player);
  return true;
}

function parseRankDelta(args: string): { slot: number; delta: 1 | -1 } | null {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const slot = parseSlot(parts[0]);
  if (slot === null) {
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

registerCommand("invite", "邀请加入组织", (player, args) => {
  const staff = requireStaff(player);
  if (!staff) {
    return;
  }

  const target = requireOtherTarget(player, args, "用法：/invite [玩家ID]");
  if (!target) {
    return;
  }

  const targetAccount = getAccount(target);
  if (!targetAccount) {
    tell(player, Color.error, "未找到玩家。");
    return;
  }

  if (!targetAccount.passport) {
    tell(player, Color.error, "玩家没有护照。");
    return;
  }

  if (targetAccount.orgId !== ORG_NONE || getMembership(targetAccount)) {
    tell(player, Color.error, "玩家已加入组织。");
    return;
  }

  if (!arePlayersNearby(player, target, INVITE_RADIUS)) {
    tell(player, Color.error, "玩家距离太远。");
    return;
  }

  const targetId = playerId(target);
  const actorId = playerId(player);
  if (targetId === null || actorId === null) {
    return;
  }

  if (pendingInvite.has(targetId)) {
    const previous = pendingInvite.get(targetId);
    const oldInviter = previous ? findTarget(previous.inviterSlot) : null;
    clearInvite(target);
    if (oldInviter && previous && getAccount(oldInviter)?.id === previous.inviterAccountId) {
      tell(oldInviter, Color.info, `已取消向${playerChatName(target)}发出的邀请。`);
    }
  }

  const rank = getOrgRank(staff.membership.org, MIN_ORG_RANK);
  if (!rank) {
    tell(player, Color.error, "无法发送邀请。");
    return;
  }

  const body =
    `你收到加入${staff.membership.org.name}的邀请。\n` +
    `职位：${rank.title}。\n\n` +
    `接受邀请？`;

  try {
    Dialog.show(
      target,
      ORG_INVITE_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "邀请",
      body,
      "接受",
      "拒绝"
    );
  } catch {
    tell(player, Color.error, "无法发送邀请。");
    return;
  }

  pendingInvite.set(targetId, {
    inviterSlot: actorId,
    inviterAccountId: staff.account.id,
    targetAccountId: targetAccount.id,
    orgId: staff.membership.org.id,
    orgRank: rank.id,
    timer: setTimeout(() => {
      expireInvite(targetId, targetAccount.id);
    }, INVITE_TTL_MS),
  });

  tell(player, Color.info, `你向${playerChatName(target)}发送了邀请。`);
});

registerCommand("uninvite", "将成员移出组织", (player, args) => {
  const staff = requireStaff(player);
  if (!staff) {
    return;
  }

  const raw = args.trim();
  const space = raw.indexOf(" ");
  const idPart = (space === -1 ? raw : raw.slice(0, space)).trim();
  const reason = sanitizeChatText(space === -1 ? "" : raw.slice(space + 1).trim()).slice(
    0,
    CHAT_MAX_LENGTH
  );

  if (!idPart || !reason) {
    tell(player, Color.error, "用法：/uninvite [玩家ID] [原因]");
    return;
  }

  const target = requireOtherTarget(player, idPart, "用法：/uninvite [玩家ID] [原因]");
  if (!target) {
    return;
  }

  const targetAccount = getAccount(target);
  const targetOrg = targetAccount ? getMembership(targetAccount) : null;
  if (!targetAccount || !targetOrg || targetOrg.org.id !== staff.membership.org.id) {
    tell(player, Color.error, "玩家不是你的组织成员。");
    return;
  }

  if (!canManage(targetOrg.rank.id)) {
    tell(player, Color.error, "不能移除此玩家。");
    return;
  }

  void (async () => {
    const actor = staffOf(player);
    if (!actor || actor.membership.org.id !== staff.membership.org.id) {
      tell(player, Color.error, "此命令需要组织职位9级以上。");
      return;
    }

    const liveAccount = getAccount(target);
    const liveOrg = liveAccount ? getMembership(liveAccount) : null;
    if (!liveAccount || !liveOrg || liveOrg.org.id !== actor.membership.org.id) {
      tell(player, Color.error, "玩家不是你的组织成员。");
      return;
    }

    if (!canManage(liveOrg.rank.id)) {
      tell(player, Color.error, "不能移除此玩家。");
      return;
    }

    const ok = await setOrg(target, ORG_NONE, 0);
    if (!ok) {
      tell(player, Color.error, "无法保存至数据库。");
      return;
    }

    const tag = playerChatName(target);
    const orgName = actor.membership.org.name;
    tell(
      player,
      Color.info,
      clipClientMessage(`你将${tag}移出了${orgName}，原因：${reason}`)
    );
    tell(
      target,
      Color.info,
      clipClientMessage(`你被移出了${orgName}，原因：${reason}`)
    );
  })();
});

registerCommand("rang", "更改组织职位等级", (player, args) => {
  const staff = requireStaff(player);
  if (!staff) {
    return;
  }

  const parsed = parseRankDelta(args);
  if (!parsed) {
    tell(player, Color.error, "用法：/rang [玩家ID] [+/-]");
    return;
  }

  const target = findTarget(parsed.slot);
  if (!target) {
    tell(player, Color.error, "未找到玩家。");
    return;
  }

  if (samePlayer(player, target)) {
    tell(player, Color.error, "不能对自己使用此命令。");
    return;
  }

  const targetAccount = getAccount(target);
  const targetOrg = targetAccount ? getMembership(targetAccount) : null;
  if (!targetAccount || !targetOrg || targetOrg.org.id !== staff.membership.org.id) {
    tell(player, Color.error, "玩家不是你的组织成员。");
    return;
  }

  if (!canManage(targetOrg.rank.id)) {
    tell(player, Color.error, "不能更改此玩家的职位等级。");
    return;
  }

  const next = targetOrg.rank.id + parsed.delta;
  if (next < MIN_ORG_RANK || next > MANAGE_MAX_RANK) {
    tell(player, Color.error, "玩家职位等级必须在1至9之间。");
    return;
  }

  const nextRank = getOrgRank(targetOrg.org, next);
  if (!nextRank) {
    tell(player, Color.error, "无法更改职位等级。");
    return;
  }

  void (async () => {
    const actor = staffOf(player);
    if (!actor || actor.membership.org.id !== staff.membership.org.id) {
      tell(player, Color.error, "此命令需要组织职位9级以上。");
      return;
    }

    const liveAccount = getAccount(target);
    const liveOrg = liveAccount ? getMembership(liveAccount) : null;
    if (!liveAccount || !liveOrg || liveOrg.org.id !== actor.membership.org.id) {
      tell(player, Color.error, "玩家不是你的组织成员。");
      return;
    }

    if (!canManage(liveOrg.rank.id)) {
      tell(player, Color.error, "不能更改此玩家的职位等级。");
      return;
    }

    const liveNext = liveOrg.rank.id + parsed.delta;
    if (liveNext < MIN_ORG_RANK || liveNext > MANAGE_MAX_RANK) {
      tell(player, Color.error, "玩家职位等级必须在1至9之间。");
      return;
    }

    const liveNextRank = getOrgRank(liveOrg.org, liveNext);
    if (!liveNextRank) {
      tell(player, Color.error, "无法更改职位等级。");
      return;
    }

    const ok = await setOrg(target, liveOrg.org.id, liveNextRank.id);
    if (!ok) {
      tell(player, Color.error, "无法保存至数据库。");
      return;
    }

    const tag = playerChatName(target);
    const verbUp = parsed.delta > 0;
    tell(
      player,
      Color.info,
      verbUp
        ? `你晋升了${tag}：${liveNextRank.title}（${liveNextRank.id}）。`
        : `你降职了${tag}：${liveNextRank.title}（${liveNextRank.id}）。`
    );
    tell(
      target,
      Color.info,
      verbUp
        ? `你被晋升为${liveNextRank.title}（${liveNextRank.id}）。`
        : `你被降职为${liveNextRank.title}（${liveNextRank.id}）。`
    );
  })();
});

export function bindOrgStaff(): void {
  omp.on("dialogResponse", (player, dialogId, response) => {
    if (Number(dialogId) !== ORG_INVITE_DIALOG_ID) {
      return;
    }

    const targetId = playerId(player);
    const pending = targetId === null ? undefined : pendingInvite.get(targetId);
    if (pending) {
      clearTimeout(pending.timer);
    }
    if (targetId !== null) {
      pendingInvite.delete(targetId);
    }

    if (!pending) {
      tell(player, Color.error, "邀请已失效。");
      return;
    }

    if (!getAccount(player) || getAccount(player)?.id !== pending.targetAccountId) {
      return;
    }

    const inviter = findTarget(pending.inviterSlot);
    const inviterOk =
      !!inviter && getAccount(inviter)?.id === pending.inviterAccountId && isPlayerActive(inviter);
    const org = getOrganization(pending.orgId);
    const rank = org ? getOrgRank(org, pending.orgRank) : null;
    const targetTag = playerChatName(player);
    const accepted = Number(response) !== 0;
    const verb = byGender(
      getAccount(player)?.gender ?? null,
      accepted ? "接受" : "拒绝",
      accepted ? "接受" : "拒绝"
    );

    if (!accepted) {
      tell(player, Color.info, "你拒绝了邀请。");
      if (inviterOk && inviter) {
        tell(inviter, Color.info, `${targetTag}${verb}了邀请。`);
      }
      return;
    }

    const live = getAccount(player);
    if (!live || !org || !rank) {
      tell(player, Color.error, "邀请已失效。");
      return;
    }

    if (!live.passport) {
      tell(player, Color.error, "你没有护照。");
      if (inviterOk && inviter) {
        tell(inviter, Color.error, `${targetTag}无法加入：没有护照。`);
      }
      return;
    }

    if (live.orgId !== ORG_NONE || getMembership(live)) {
      tell(player, Color.error, "你已加入组织。");
      if (inviterOk && inviter) {
        tell(inviter, Color.error, `${targetTag}已加入组织。`);
      }
      return;
    }

    if (!inviterOk || !inviter) {
      tell(player, Color.error, "邀请已失效。");
      return;
    }

    if (!arePlayersNearby(player, inviter, INVITE_RADIUS)) {
      tell(player, Color.error, "你距离邀请人太远。");
      tell(inviter, Color.error, `${targetTag}无法接受邀请：距离太远。`);
      return;
    }

    void (async () => {
      if (!arePlayersNearby(player, inviter, INVITE_RADIUS)) {
        tell(player, Color.error, "你距离邀请人太远。");
        tell(inviter, Color.error, `${targetTag}无法接受邀请：距离太远。`);
        return;
      }

      const ok = await setOrg(player, pending.orgId, pending.orgRank);
      if (!ok) {
        tell(player, Color.error, "无法保存至数据库。");
        if (inviterOk && inviter) {
          tell(inviter, Color.error, "无法接纳此玩家。");
        }
        return;
      }

      tell(
        player,
        Color.info,
        `你加入了${org.name}，职位：${rank.title}。`
      );
      if (inviterOk && inviter) {
        tell(inviter, Color.info, `${targetTag}${verb}了加入${org.name}的邀请。`);
      }
    })();
  });

  omp.on("playerConnect", (player) => {
    clearInvite(player);
  });

  omp.on("playerDisconnect", (player) => {
    clearInvite(player);
  });
}
