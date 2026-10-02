import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { WHISPER_RADIUS, arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerId, playerName } from "../../shared/player";
import { byGender } from "../auth/gender";
import { saveUserMilitaryId } from "../auth/repository";
import { getAccount, isAuthenticated, patchAccount, type Account } from "../auth/session";
import { ORG_ARMY_ID, getMembership } from "../org";
import { registerCommand } from "./registry";

export const VBILET_DIALOG_ID = 67;

const DIALOG_STYLE_MSGBOX = 0;
const ISSUE_MIN_RANK = 8;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("vbilet", "查看军人证或按ID出示军人证", (player, args) => {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "请先登录。");
    return;
  }

  if (!account.militaryId) {
    player.sendClientMessage(Color.error, "你没有军人证。");
    return;
  }

  const rawId = args.trim();
  if (!rawId) {
    showMilitaryId(player, account);
    return;
  }

  const slot = Number(rawId);
  if (!Number.isInteger(slot) || slot < 0) {
    player.sendClientMessage(Color.error, "用法：/vbilet [玩家ID]");
    return;
  }

  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target) || !isAuthenticated(target)) {
    player.sendClientMessage(Color.error, "未找到玩家。");
    return;
  }

  if (playerId(target) === playerId(player)) {
    showMilitaryId(player, account);
    return;
  }

  if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
    player.sendClientMessage(Color.error, "玩家距离太远。");
    return;
  }

  showMilitaryId(target, account);
  const verb = byGender(account.gender, "出示", "出示");
  player.sendClientMessage(Color.gray, `你向${playerName(target)}${verb}了军人证。`);
  target.sendClientMessage(Color.gray, `${account.name}向你${verb}了军人证。`);
});

registerCommand(
  "givevbilet",
  "签发军人证（军队职位8级以上）",
  (player, args) => {
    const account = getAccount(player);
    const membership = account ? getMembership(account) : null;
    if (
      !account ||
      !membership ||
      membership.org.id !== ORG_ARMY_ID ||
      membership.rank.id < ISSUE_MIN_RANK
    ) {
      player.sendClientMessage(
        Color.error,
        "只有职位8级以上的军队成员可以签发军人证。"
      );
      return;
    }

    const slot = Number(args.trim());
    if (!Number.isInteger(slot) || slot < 0) {
      player.sendClientMessage(Color.error, "用法：/givevbilet [玩家ID]");
      return;
    }

    const target = omp.players.at(slot);
    if (!target || !isPlayerActive(target) || !isAuthenticated(target)) {
      player.sendClientMessage(Color.error, "未找到玩家。");
      return;
    }

    if (playerId(target) === playerId(player)) {
      player.sendClientMessage(Color.error, "不能给自己签发军人证。");
      return;
    }

    const targetAccount = getAccount(target);
    if (!targetAccount) {
      player.sendClientMessage(Color.error, "未找到玩家。");
      return;
    }

    if (targetAccount.militaryId) {
      player.sendClientMessage(Color.error, "玩家已有军人证。");
      return;
    }

    patchAccount(target, { militaryId: true });
    void saveUserMilitaryId(targetAccount.id, true).catch(() => {
      // Cache is already updated.
    });

    player.sendClientMessage(
      Color.info,
      `你向${playerName(target)}签发了军人证。`
    );
    target.sendClientMessage(
      Color.info,
      `${playerName(player)}为你签发了军人证，输入/vbilet查看。`
    );
  }
);

function showMilitaryId(viewer: Player, owner: Account): void {
  const served = byGender(owner.gender, "已服役", "已服役");
  const body = [
    row("姓名", owner.name),
    row("状态", "已签发军人证"),
    row("服役状态", served),
  ].join("\n");

  try {
    Dialog.show(
      viewer,
      VBILET_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${owner.name}的军人证`,
      body,
      "关闭",
      ""
    );
  } catch {
    viewer.sendClientMessage(Color.error, "无法打开军人证。");
  }
}

function row(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}
