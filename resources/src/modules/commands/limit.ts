import { omp } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { registerCommand } from "./registry";
import {
  MAX_SPEED_LIMIT,
  MIN_SPEED_LIMIT,
  clearVehicleLimit,
  getVehicleLimit,
  setVehicleLimit,
} from "../vehicles/limit";

const PLAYER_STATE_DRIVER = 2;

registerCommand("limit", "车辆限速器", (player, args) => {
  let vehicle;
  try {
    if (player.getState() !== PLAYER_STATE_DRIVER) {
      player.sendClientMessage(Color.error, "你必须正在驾驶。");
      return;
    }

    vehicle = omp.vehicles.at(player.getVehicleID());
  } catch {
    player.sendClientMessage(Color.error, "你必须正在驾驶。");
    return;
  }

  if (!vehicle) {
    player.sendClientMessage(Color.error, "你必须正在驾驶。");
    return;
  }

  const raw = args.trim();
  if (!raw) {
    const current = getVehicleLimit(vehicle);
    player.sendClientMessage(
      Color.info,
      current
        ? `此车辆限速：${current}公里/小时。`
        : `用法：/limit [公里/小时]（${MIN_SPEED_LIMIT}-${MAX_SPEED_LIMIT}，0关闭）`
    );
    return;
  }

  const kmh = Number(raw);
  if (!Number.isInteger(kmh) || kmh < 0) {
    player.sendClientMessage(
      Color.error,
      `用法：/limit [公里/小时]（${MIN_SPEED_LIMIT}-${MAX_SPEED_LIMIT}，0关闭）`
    );
    return;
  }

  if (kmh === 0) {
    clearVehicleLimit(vehicle);
    player.sendClientMessage(Color.info, "限速已解除。");
    return;
  }

  if (kmh < MIN_SPEED_LIMIT || kmh > MAX_SPEED_LIMIT) {
    player.sendClientMessage(
      Color.error,
      `用法：/limit [公里/小时]（${MIN_SPEED_LIMIT}-${MAX_SPEED_LIMIT}，0关闭）`
    );
    return;
  }

  const applied = setVehicleLimit(vehicle, kmh);
  if (applied === null) {
    player.sendClientMessage(Color.error, "无法设置限速。");
    return;
  }

  player.sendClientMessage(Color.info, `限速：${applied}公里/小时。`);
});
