import { Dialog, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, kickSamePlayer } from "../../shared/player";
import { DEFAULT_SPAWN, STREET_WORLD } from "../spawn/point";
import { GENDER_LIST_FEMALE, GENDER_LIST_MALE, type Gender } from "./gender";
import { RULES_TITLE, SERVER_RULES } from "./rules";
import { isAuthenticated } from "./session";
import { skinListBody } from "./skins";

export const AUTH_DIALOG_ID = 1;

export const DialogStyle = {
  msgbox: 0,
  input: 1,
  list: 2,
  password: 3,
} as const;

export function showAuthDialog(
  player: Player,
  style: number,
  title: string,
  body: string,
  button1: string,
  button2: string
): void {
  try {
    Dialog.show(player, AUTH_DIALOG_ID, style, title, body, button1, button2);
  } catch {
    // Player has already disconnected.
  }
}

export function prepareAuthView(player: Player): void {
  player.setInterior(0);
  player.setVirtualWorld(STREET_WORLD);
  player.setPos(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, DEFAULT_SPAWN.z);
  player.toggleSpectating(true);
  player.setCameraPos(1779.37, -1932.56, 22.0);
  player.setCameraLookAt(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, DEFAULT_SPAWN.z, 2);
}

export function refreshAuthViewSoon(player: Player): void {
  for (const delay of [80, 400]) {
    setTimeout(() => {
      if (!isPlayerActive(player) || isAuthenticated(player)) {
        return;
      }

      try {
        prepareAuthView(player);
      } catch {
        // Slot is not ready yet.
      }
    }, delay);
  }
}

export function kickLater(player: Player, reason: string): void {
  player.sendClientMessage(Color.error, reason);
  kickSamePlayer(player);
}

export function showRulesDialog(player: Player): void {
  showAuthDialog(
    player,
    DialogStyle.msgbox,
    RULES_TITLE,
    SERVER_RULES,
    "接受",
    "拒绝"
  );
}

export function showLoginDialog(player: Player, name: string, error?: string): void {
  const prefix = error ? `${error}\n\n` : "";
  showAuthDialog(
    player,
    DialogStyle.password,
    "登录",
    `${prefix}昵称${name}已注册。\n请输入密码：`,
    "登录",
    "退出"
  );
}

export function showEmailDialog(player: Player, name: string, error?: string): void {
  const prefix = error ? `${error}\n\n` : "";
  showAuthDialog(
    player,
    DialogStyle.input,
    "注册",
    `${prefix}昵称${name}可用。\n请输入邮箱：`,
    "下一步",
    "返回"
  );
}

export function showPasswordDialog(player: Player, error?: string): void {
  const prefix = error ? `${error}\n\n` : "";
  showAuthDialog(
    player,
    DialogStyle.password,
    "注册",
    `${prefix}请创建密码（至少6个字符）：`,
    "下一步",
    "返回"
  );
}

export function showPasswordConfirmDialog(player: Player, error?: string): void {
  const prefix = error ? `${error}\n\n` : "";
  showAuthDialog(
    player,
    DialogStyle.password,
    "注册",
    `${prefix}请再次输入密码：`,
    "下一步",
    "返回"
  );
}

export function showBirthDateDialog(player: Player, error?: string): void {
  const prefix = error ? `${error}\n\n` : "";
  showAuthDialog(
    player,
    DialogStyle.input,
    "注册",
    `${prefix}出生日期（日.月.年）：\n例如：15.04.1998`,
    "下一步",
    "返回"
  );
}

export function showGenderDialog(player: Player): void {
  showAuthDialog(
    player,
    DialogStyle.list,
    "角色性别",
    `${GENDER_LIST_MALE}\n${GENDER_LIST_FEMALE}`,
    "选择",
    "返回"
  );
}

export function showSkinDialog(player: Player, gender: Gender): void {
  showAuthDialog(
    player,
    DialogStyle.list,
    "外观选择",
    skinListBody(gender),
    "选择",
    "返回"
  );
}

export function showRegisterConfirmDialog(player: Player, body: string): void {
  showAuthDialog(
    player,
    DialogStyle.msgbox,
    "确认",
    body,
    "完成",
    "返回"
  );
}
