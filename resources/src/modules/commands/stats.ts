import { Dialog, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { formatBirthDate } from "../auth/validation";
import { genderLabel } from "../auth/gender";
import { getAccount } from "../auth/session";
import { residenceLabel } from "../houses/residence";
import { getMembership, resolvePlayerSkin } from "../org";
import { expForNextLevel } from "../payday/progress";
import { registerCommand } from "./registry";

const STATS_DIALOG_ID = 2;
const DIALOG_STYLE_MSGBOX = 0;
const TITLE = "{FFCC00}";
const LABEL = "{FFFFFF}";
const VALUE = "{33CCFF}";

registerCommand("stats", "角色统计", (player) => {
  showStatsDialog(player);
});

export function showStatsDialog(player: Player): void {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "请先登录。");
    return;
  }

  let health = Math.round(account.health);
  try {
    const live = player.getHealth();
    if (live > 0) {
      health = Math.round(live);
    }
  } catch {
    // World stats are unavailable - show account data.
  }

  const membership = getMembership(account);
  const rank = membership
    ? `${membership.rank.title} (${membership.rank.id})`
    : "无";
  const body = [
    statsRow("姓名", account.name),
    statsRow("住所", residenceLabel(account.id)),
    statsRow("性别", genderLabel(account.gender)),
    statsRow("等级", String(account.level)),
    statsRow("经验", `${account.exp}/${expForNextLevel(account.level)}`),
    statsRow("守法度", String(account.lawfulness)),
    statsRow("外观", String(resolvePlayerSkin(account))),
    statsRow("出生日期", formatBirthDate(account.birthDate)),
    statsRow("邮箱", account.email),
    statsRow("现金", `$${account.money}`),
    statsRow("银行", `$${account.bank}`),
    statsRow("捐赠余额", String(account.donate)),
    statsRow("毒品", `${account.drugs}份`),
    statsRow("弹药", `${account.ammo}份`),
    statsRow("金属", `${account.metal}份`),
    statsRow("通缉等级", String(account.wantedLevel)),
    statsRow("军人证", account.militaryId ? "是" : "否"),
    statsRow("医疗卡", account.medcard ? "是" : "否"),
    statsRow("生命值", String(health)),
    statsRow("组织", membership?.org.name ?? "无"),
    statsRow("职位", rank),
  ].join("\n");

  try {
    Dialog.show(
      player,
      STATS_DIALOG_ID,
      DIALOG_STYLE_MSGBOX,
      `${TITLE}${account.name}的统计`,
      body,
      "关闭",
      ""
    );
  } catch {
    player.sendClientMessage(Color.error, "无法打开统计。");
  }
}

function statsRow(label: string, value: string): string {
  return `${LABEL}${label}:\t\t${VALUE}${value}`;
}
