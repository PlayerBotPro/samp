import { Dialog, omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, kickSamePlayer, playerId } from "../../shared/player";
import {
  findAdminCredentials,
  saveAdminPassword,
} from "../auth/repository";
import { hashPassword, verifyPassword } from "../auth/password";
import { getAccount, patchAccount } from "../auth/session";
import { passwordError } from "../auth/validation";
import { registerCommand } from "../commands/registry";
import {
  clearAdminSession,
  failAdminLogin,
  isAdminLoggedIn,
  markAdminLoggedIn,
  setPendingAdminPassword,
  takePendingAdminPassword,
} from "./session";

export const ALOGIN_DIALOG_ID = 11;

const DIALOG_STYLE_PASSWORD = 3;
const MAX_LOGIN_ATTEMPTS = 3;

type AloginMode = "login" | "set" | "confirm";

const dialogMode = new Map<number, AloginMode>();

function setMode(player: Player, mode: AloginMode): void {
  const id = playerId(player);
  if (id !== null) {
    dialogMode.set(id, mode);
  }
}

function takeMode(player: Player): AloginMode | null {
  const id = playerId(player);
  if (id === null) {
    return null;
  }

  const mode = dialogMode.get(id) ?? null;
  dialogMode.delete(id);
  return mode;
}

export function clearAloginDialog(player: Player): void {
  const id = playerId(player);
  if (id !== null) {
    dialogMode.delete(id);
  }
  clearAdminSession(player);
}

function showPasswordDialog(
  player: Player,
  mode: AloginMode,
  error?: string
): void {
  setMode(player, mode);
  const prefix = error ? `${error}\n\n` : "";
  const title = mode === "login" ? "Admin panel: login" : "Admin panel: password";
  const body =
    mode === "login"
      ? `${prefix}Enter the admin password:`
      : mode === "set"
        ? `${prefix}No admin password is set yet.\nCreate a password (at least 6 characters):`
        : `${prefix}Repeat the admin password:`;

  try {
    Dialog.show(
      player,
      ALOGIN_DIALOG_ID,
      DIALOG_STYLE_PASSWORD,
      title,
      body,
      "OK",
      "Cancel"
    );
  } catch {
    // Player already disconnected.
  }
}

export function promptAdminPasswordSetup(player: Player): void {
  showPasswordDialog(player, "set");
}

function kickAfterFails(player: Player): void {
  player.sendClientMessage(
    Color.error,
    "Three incorrect admin login attempts. Kicked."
  );
  kickSamePlayer(player);
}

async function startAlogin(player: Player): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    player.sendClientMessage(Color.error, "Log in to your account first.");
    return;
  }

  if (isAdminLoggedIn(player)) {
    player.sendClientMessage(Color.info, "You are already logged in to the admin panel.");
    return;
  }

  let creds;
  try {
    creds = await findAdminCredentials(account.id);
  } catch {
    player.sendClientMessage(Color.error, "Failed to verify the admin panel.");
    return;
  }

  const adminLevel = creds?.adminLevel ?? 0;
  patchAccount(player, { adminLevel });

  if (adminLevel < 1) {
    return;
  }

  if (!creds?.passwordHash) {
    showPasswordDialog(player, "set");
    return;
  }

  showPasswordDialog(player, "login");
}

async function finishSetPassword(
  player: Player,
  password: string
): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  try {
    const hash = await hashPassword(password);
    await saveAdminPassword(account.id, hash);
  } catch {
    player.sendClientMessage(Color.error, "Failed to save the admin password.");
    return;
  }

  markAdminLoggedIn(player);
  player.sendClientMessage(
    Color.info,
    `Admin password saved. Logged in (lvl ${account.adminLevel}).`
  );
}

async function tryLogin(player: Player, password: string): Promise<void> {
  const account = getAccount(player);
  if (!account) {
    return;
  }

  let creds;
  try {
    creds = await findAdminCredentials(account.id);
  } catch {
    player.sendClientMessage(Color.error, "Failed to verify the password.");
    return;
  }

  if (!creds?.passwordHash) {
    showPasswordDialog(player, "set");
    return;
  }

  const ok = await verifyPassword(password, creds.passwordHash);
  if (ok) {
    markAdminLoggedIn(player);
    player.sendClientMessage(
      Color.info,
      `Admin login successful (lvl ${creds.adminLevel}).`
    );
    return;
  }

  const used = failAdminLogin(account.id);
  const left = MAX_LOGIN_ATTEMPTS - used;
  if (left <= 0) {
    kickAfterFails(player);
    return;
  }

  showPasswordDialog(
    player,
    "login",
    `Incorrect password. Attempts remaining: ${left}`
  );
}

async function handleAloginDialog(
  player: Player,
  ok: boolean,
  raw: string
): Promise<void> {
  const mode = takeMode(player);
  if (!mode) {
    return;
  }

  if (!ok) {
    takePendingAdminPassword(player);
    return;
  }

  const account = getAccount(player);
  if (!account || account.adminLevel < 1) {
    takePendingAdminPassword(player);
    return;
  }

  const input = raw.trim();

  if (mode === "set") {
    const error = passwordError(input);
    if (error) {
      showPasswordDialog(player, "set", error);
      return;
    }

    setPendingAdminPassword(player, input);
    showPasswordDialog(player, "confirm");
    return;
  }

  if (mode === "confirm") {
    const pending = takePendingAdminPassword(player);
    if (!pending) {
      showPasswordDialog(player, "set", "Enter a password first.");
      return;
    }

    if (input !== pending) {
      showPasswordDialog(player, "set", "Passwords do not match.");
      return;
    }

    await finishSetPassword(player, pending);
    return;
  }

  if (!input) {
    showPasswordDialog(player, "login", "Enter the admin password.");
    return;
  }

  await tryLogin(player, input);
}

export function bindAlogin(): void {
  registerCommand(
    "alogin",
    "Admin login",
    (player) => {
      void startAlogin(player);
    },
    true
  );

  omp.on("dialogResponse", (player, dialogId, response, _listItem, inputText) => {
    if (Number(dialogId) !== ALOGIN_DIALOG_ID) {
      return;
    }

    void handleAloginDialog(player, Boolean(response), String(inputText ?? ""));
  });
}
