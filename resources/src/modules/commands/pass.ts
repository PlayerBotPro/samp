import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { WHISPER_RADIUS, arePlayersNearby } from "../../shared/nearby";
import { isPlayerActive, playerId, playerName } from "../../shared/player";
import { byGender, genderLabel } from "../auth/gender";
import { getAccount, type Account } from "../auth/session";
import { ageFromBirthDate, formatBirthDate } from "../auth/validation";
import { residenceLabel } from "../houses/residence";
import { getMembership } from "../org";
import { registerCommand } from "./registry";

const PASSPORT_DIALOG_ID = 3;
const DIALOG_STYLE_MSGBOX = 0;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("pass", "查看护照或按ID出示护照", (player, args) => {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "请先登录。");
    return;
  }

  if (!account.passport) {
    player.sendClientMessage(
      Color.error,
      "你没有护照，请前往市政厅办理。"
    );
    return;
  }

  const rawId = args.trim();
  if (!rawId) {
    showPassport(player, account);
    return;
  }

  const slot = Number(rawId);
  if (!Number.isInteger(slot) || slot < 0) {
    player.sendClientMessage(Color.error, "用法：/pass [玩家ID]");
    return;
  }

  const target = omp.players.at(slot);
  if (!target || !isPlayerActive(target)) {
    player.sendClientMessage(Color.error, "未找到玩家。");
    return;
  }

  if (playerId(target) === playerId(player)) {
    showPassport(player, account);
    return;
  }

  if (!isAuthenticatedTarget(target)) {
    player.sendClientMessage(Color.error, "未找到玩家。");
    return;
  }

  if (!arePlayersNearby(player, target, WHISPER_RADIUS)) {
    player.sendClientMessage(Color.error, "玩家距离太远。");
    return;
  }

  showPassport(target, account);
  const shownTo = playerName(target);
  const verb = byGender(account.gender, "出示", "出示");
  player.sendClientMessage(Color.gray, `你向${shownTo}${verb}了护照。`);
  target.sendClientMessage(Color.gray, `${account.name}向你${verb}了护照。`);
});

function isAuthenticatedTarget(player: Player): boolean {
  return getAccount(player) !== null;
}

function passRow(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}

function showPassport(viewer: Player, owner: Account): void {
  const membership = getMembership(owner);
  const body = [
    passRow("姓名", owner.name),
    passRow("住所", residenceLabel(owner.id)),
    passRow("在本国居住年数", String(ageFromBirthDate(owner.birthDate))),
    passRow("性别", genderLabel(owner.gender)),
    passRow("出生日期", formatBirthDate(owner.birthDate)),
    passRow("组织", membership?.org.name ?? "无"),
    passRow("职位", membership?.rank.title ?? "无"),
    passRow("守法度", String(owner.lawfulness)),
  ].join("\n");

  try {
    Dialog.show(
      viewer,
      PASSPORT_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${owner.name}的护照`,
      body,
      "关闭",
      ""
    );
  } catch {
    viewer.sendClientMessage(Color.error, "无法打开护照。");
  }
}
