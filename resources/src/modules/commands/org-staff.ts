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
    tell(target, Color.error, "Invitation expired.");
  }

  const inviter = findTarget(pending.inviterSlot);
  if (inviter && getAccount(inviter)?.id === pending.inviterAccountId) {
    tell(inviter, Color.error, "Invitation expired.");
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
    tell(player, Color.error, "This command is available from organization rank 9.");
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
    tell(actor, Color.error, "Player not found.");
    return null;
  }

  if (samePlayer(actor, target)) {
    tell(actor, Color.error, "You cannot use this on yourself.");
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

registerCommand("invite", "Invite to an organization", (player, args) => {
  const staff = requireStaff(player);
  if (!staff) {
    return;
  }

  const target = requireOtherTarget(player, args, "Usage: /invite [id]");
  if (!target) {
    return;
  }

  const targetAccount = getAccount(target);
  if (!targetAccount) {
    tell(player, Color.error, "Player not found.");
    return;
  }

  if (!targetAccount.passport) {
    tell(player, Color.error, "The player does not have a passport.");
    return;
  }

  if (targetAccount.orgId !== ORG_NONE || getMembership(targetAccount)) {
    tell(player, Color.error, "The player is already in an organization.");
    return;
  }

  if (!arePlayersNearby(player, target, INVITE_RADIUS)) {
    tell(player, Color.error, "Player is too far away.");
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
      tell(oldInviter, Color.info, `Invitation for ${playerChatName(target)} cancelled.`);
    }
  }

  const rank = getOrgRank(staff.membership.org, MIN_ORG_RANK);
  if (!rank) {
    tell(player, Color.error, "Failed to send the invitation.");
    return;
  }

  const body =
    `You are invited to join ${staff.membership.org.name}.\n` +
    `Position: ${rank.title}.\n\n` +
    `Accept the invitation?`;

  try {
    Dialog.show(
      target,
      ORG_INVITE_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      "Invitation",
      body,
      "Accept",
      "Decline"
    );
  } catch {
    tell(player, Color.error, "Failed to send the invitation.");
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

  tell(player, Color.info, `You sent an invitation to ${playerChatName(target)}.`);
});

registerCommand("uninvite", "Dismiss from an organization", (player, args) => {
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
    tell(player, Color.error, "Usage: /uninvite [id] [reason]");
    return;
  }

  const target = requireOtherTarget(player, idPart, "Usage: /uninvite [id] [reason]");
  if (!target) {
    return;
  }

  const targetAccount = getAccount(target);
  const targetOrg = targetAccount ? getMembership(targetAccount) : null;
  if (!targetAccount || !targetOrg || targetOrg.org.id !== staff.membership.org.id) {
    tell(player, Color.error, "The player is not in your organization.");
    return;
  }

  if (!canManage(targetOrg.rank.id)) {
    tell(player, Color.error, "You cannot dismiss this player.");
    return;
  }

  void (async () => {
    const actor = staffOf(player);
    if (!actor || actor.membership.org.id !== staff.membership.org.id) {
      tell(player, Color.error, "This command is available from organization rank 9.");
      return;
    }

    const liveAccount = getAccount(target);
    const liveOrg = liveAccount ? getMembership(liveAccount) : null;
    if (!liveAccount || !liveOrg || liveOrg.org.id !== actor.membership.org.id) {
      tell(player, Color.error, "The player is not in your organization.");
      return;
    }

    if (!canManage(liveOrg.rank.id)) {
      tell(player, Color.error, "You cannot dismiss this player.");
      return;
    }

    const ok = await setOrg(target, ORG_NONE, 0);
    if (!ok) {
      tell(player, Color.error, "Failed to save to the database.");
      return;
    }

    const tag = playerChatName(target);
    const orgName = actor.membership.org.name;
    tell(
      player,
      Color.info,
      clipClientMessage(`You dismissed ${tag} from ${orgName}. Reason: ${reason}`)
    );
    tell(
      target,
      Color.info,
      clipClientMessage(`You were dismissed from ${orgName}. Reason: ${reason}`)
    );
  })();
});

registerCommand("rang", "Change organization rank", (player, args) => {
  const staff = requireStaff(player);
  if (!staff) {
    return;
  }

  const parsed = parseRankDelta(args);
  if (!parsed) {
    tell(player, Color.error, "Usage: /rang [id] [+/-]");
    return;
  }

  const target = findTarget(parsed.slot);
  if (!target) {
    tell(player, Color.error, "Player not found.");
    return;
  }

  if (samePlayer(player, target)) {
    tell(player, Color.error, "You cannot use this on yourself.");
    return;
  }

  const targetAccount = getAccount(target);
  const targetOrg = targetAccount ? getMembership(targetAccount) : null;
  if (!targetAccount || !targetOrg || targetOrg.org.id !== staff.membership.org.id) {
    tell(player, Color.error, "The player is not in your organization.");
    return;
  }

  if (!canManage(targetOrg.rank.id)) {
    tell(player, Color.error, "You cannot change this player's rank.");
    return;
  }

  const next = targetOrg.rank.id + parsed.delta;
  if (next < MIN_ORG_RANK || next > MANAGE_MAX_RANK) {
    tell(player, Color.error, "Player rank must be between 1 and 9.");
    return;
  }

  const nextRank = getOrgRank(targetOrg.org, next);
  if (!nextRank) {
    tell(player, Color.error, "Failed to change rank.");
    return;
  }

  void (async () => {
    const actor = staffOf(player);
    if (!actor || actor.membership.org.id !== staff.membership.org.id) {
      tell(player, Color.error, "This command is available from organization rank 9.");
      return;
    }

    const liveAccount = getAccount(target);
    const liveOrg = liveAccount ? getMembership(liveAccount) : null;
    if (!liveAccount || !liveOrg || liveOrg.org.id !== actor.membership.org.id) {
      tell(player, Color.error, "The player is not in your organization.");
      return;
    }

    if (!canManage(liveOrg.rank.id)) {
      tell(player, Color.error, "You cannot change this player's rank.");
      return;
    }

    const liveNext = liveOrg.rank.id + parsed.delta;
    if (liveNext < MIN_ORG_RANK || liveNext > MANAGE_MAX_RANK) {
      tell(player, Color.error, "Player rank must be between 1 and 9.");
      return;
    }

    const liveNextRank = getOrgRank(liveOrg.org, liveNext);
    if (!liveNextRank) {
      tell(player, Color.error, "Failed to change rank.");
      return;
    }

    const ok = await setOrg(target, liveOrg.org.id, liveNextRank.id);
    if (!ok) {
      tell(player, Color.error, "Failed to save to the database.");
      return;
    }

    const tag = playerChatName(target);
    const verbUp = parsed.delta > 0;
    tell(
      player,
      Color.info,
      verbUp
        ? `You promoted ${tag}: ${liveNextRank.title} (${liveNextRank.id}).`
        : `You demoted ${tag}: ${liveNextRank.title} (${liveNextRank.id}).`
    );
    tell(
      target,
      Color.info,
      verbUp
        ? `You were promoted: ${liveNextRank.title} (${liveNextRank.id}).`
        : `You were demoted: ${liveNextRank.title} (${liveNextRank.id}).`
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
      tell(player, Color.error, "The invitation is no longer valid.");
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
      accepted ? "accepted" : "declined",
      accepted ? "accepted" : "declined"
    );

    if (!accepted) {
      tell(player, Color.info, "You declined the invitation.");
      if (inviterOk && inviter) {
        tell(inviter, Color.info, `${targetTag} ${verb} the invitation.`);
      }
      return;
    }

    const live = getAccount(player);
    if (!live || !org || !rank) {
      tell(player, Color.error, "The invitation is no longer valid.");
      return;
    }

    if (!live.passport) {
      tell(player, Color.error, "You do not have a passport.");
      if (inviterOk && inviter) {
        tell(inviter, Color.error, `${targetTag} cannot join: no passport.`);
      }
      return;
    }

    if (live.orgId !== ORG_NONE || getMembership(live)) {
      tell(player, Color.error, "You are already in an organization.");
      if (inviterOk && inviter) {
        tell(inviter, Color.error, `${targetTag} is already in an organization.`);
      }
      return;
    }

    if (!inviterOk || !inviter) {
      tell(player, Color.error, "The invitation is no longer valid.");
      return;
    }

    if (!arePlayersNearby(player, inviter, INVITE_RADIUS)) {
      tell(player, Color.error, "You are too far away from the inviter.");
      tell(inviter, Color.error, `${targetTag} could not accept: too far away.`);
      return;
    }

    void (async () => {
      if (!arePlayersNearby(player, inviter, INVITE_RADIUS)) {
        tell(player, Color.error, "You are too far away from the inviter.");
        tell(inviter, Color.error, `${targetTag} could not accept: too far away.`);
        return;
      }

      const ok = await setOrg(player, pending.orgId, pending.orgRank);
      if (!ok) {
        tell(player, Color.error, "Failed to save to the database.");
        if (inviterOk && inviter) {
          tell(inviter, Color.error, "Failed to accept the player.");
        }
        return;
      }

      tell(
        player,
        Color.info,
        `You joined ${org.name}. Position: ${rank.title}.`
      );
      if (inviterOk && inviter) {
        tell(inviter, Color.info, `${targetTag} ${verb} the invitation to ${org.name}.`);
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
