import { omp, type Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { SERVER_TAG } from "../../shared/brand";
import { playerChatName } from "../../shared/player";
import { registerCommand } from "../commands/registry";
import { applyAdminVacatedHouse } from "../houses/rent";
import { adminVacateHouse, getHouse } from "../houses/repository";
import { getAccount } from "../auth/session";
import { hasAdminAccess } from "./session";

const MIN_ADMIN_LEVEL = 5;

function parseHouseId(args: string): number | null {
  const raw = args.trim();
  if (!/^\d+$/.test(raw) || raw.length > 5) {
    return null;
  }

  const houseId = Number(raw);
  if (!Number.isInteger(houseId) || houseId < 1) {
    return null;
  }

  return houseId;
}

export function bindAdminAsellhouse(): void {
  registerCommand(
    "asellhouse",
    "收回房屋（无偿出售给政府）",
    (player, args) => {
      if (!hasAdminAccess(player, MIN_ADMIN_LEVEL)) {
        return;
      }

      const houseId = parseHouseId(args);
      if (houseId === null) {
        player.sendClientMessage(Color.error, "用法：/asellhouse [房屋ID]");
        return;
      }

      if (!getHouse(houseId)) {
        player.sendClientMessage(Color.error, "未找到该ID的房屋。");
        return;
      }

      void vacateHouse(player, houseId);
    },
    true
  );
}

async function vacateHouse(admin: Player, houseId: number): Promise<void> {
  const account = getAccount(admin);
  if (!account) {
    return;
  }

  let result;
  try {
    result = await adminVacateHouse(houseId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    omp.log(`[${SERVER_TAG}] asellhouse ${account.name} house ${houseId}: ${message}`);
    admin.sendClientMessage(Color.error, "无法收回房屋。");
    return;
  }

  if (!result.ok) {
    if (result.reason === "not_found") {
      admin.sendClientMessage(Color.error, "未找到该ID的房屋。");
      return;
    }
    admin.sendClientMessage(Color.error, "无法收回房屋。");
    return;
  }

  applyAdminVacatedHouse(houseId);

  const label = playerChatName(admin);
  omp.log(`[${SERVER_TAG}] asellhouse ${label} released house #${houseId}`);

  if (result.wasOccupied) {
    admin.sendClientMessage(
      Color.info,
      `已收回${houseId}号房屋，原房主ID：${result.previousOwnerId}。`
    );
    return;
  }

  admin.sendClientMessage(Color.info, `${houseId}号房屋已可购买，状态已更新。`);
}
