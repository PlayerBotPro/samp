import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { WHISPER_RADIUS, arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerId, playerName } from "../../shared/player";
import { byGender } from "../auth/gender";
import { LICENSE_ROWS } from "../auth/licenses";
import { getAccount, type Account } from "../auth/session";
import { registerCommand } from "./registry";

export const LICENSES_DIALOG_ID = 28;

const DIALOG_STYLE_MSGBOX = 0;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("lic", "查看执照或按ID出示执照", (player, args) => {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "请先登录。");
    return;
  }

  const rawId = args.trim();
  if (!rawId) {
    showLicenses(player, account);
    return;
  }

  const slot = Number(rawId);
  if (!Number.isInteger(slot) || slot < 0) {
    player.sendClientMessage(Color.error, "用法：/lic [玩家ID]");
    return;
  }

  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target)) {
    player.sendClientMessage(Color.error, "未找到玩家。");
    return;
  }

  if (playerId(target) === playerId(player)) {
    showLicenses(player, account);
    return;
  }

  if (!getAccount(target)) {
    player.sendClientMessage(Color.error, "未找到玩家。");
    return;
  }

  if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
    player.sendClientMessage(Color.error, "玩家距离太远。");
    return;
  }

  showLicenses(target, account);
  const shownTo = playerName(target);
  const verb = byGender(account.gender, "出示", "出示");
  player.sendClientMessage(Color.gray, `你向${shownTo}${verb}了执照。`);
  target.sendClientMessage(Color.gray, `${account.name}向你${verb}了执照。`);
});

function licRow(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}

function showLicenses(viewer: Player, owner: Account): void {
  const body = LICENSE_ROWS.map((row) =>
    licRow(row.label, owner.licenses[row.key] ? "是" : "否")
  ).join("\n");

  try {
    Dialog.show(
      viewer,
      LICENSES_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${owner.name}的执照`,
      body,
      "关闭",
      ""
    );
  } catch {
    viewer.sendClientMessage(Color.error, "无法打开执照。");
  }
}
