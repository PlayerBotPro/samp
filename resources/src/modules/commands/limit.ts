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

registerCommand("limit", "Vehicle speed limiter", (player, args) => {
  let vehicle;
  try {
    if (player.getState() !== PLAYER_STATE_DRIVER) {
      player.sendClientMessage(Color.error, "You must be driving.");
      return;
    }

    vehicle = omp.vehicles.at(player.getVehicleID());
  } catch {
    player.sendClientMessage(Color.error, "You must be driving.");
    return;
  }

  if (!vehicle) {
    player.sendClientMessage(Color.error, "You must be driving.");
    return;
  }

  const raw = args.trim();
  if (!raw) {
    const current = getVehicleLimit(vehicle);
    player.sendClientMessage(
      Color.info,
      current
        ? `This vehicle's limit: ${current} km/h.`
        : `Usage: /limit [kmh] (${MIN_SPEED_LIMIT}-${MAX_SPEED_LIMIT}, 0 - disable)`
    );
    return;
  }

  const kmh = Number(raw);
  if (!Number.isInteger(kmh) || kmh < 0) {
    player.sendClientMessage(
      Color.error,
      `Usage: /limit [kmh] (${MIN_SPEED_LIMIT}-${MAX_SPEED_LIMIT}, 0 - disable)`
    );
    return;
  }

  if (kmh === 0) {
    clearVehicleLimit(vehicle);
    player.sendClientMessage(Color.info, "Speed limit removed.");
    return;
  }

  if (kmh < MIN_SPEED_LIMIT || kmh > MAX_SPEED_LIMIT) {
    player.sendClientMessage(
      Color.error,
      `Usage: /limit [kmh] (${MIN_SPEED_LIMIT}-${MAX_SPEED_LIMIT}, 0 - disable)`
    );
    return;
  }

  const applied = setVehicleLimit(vehicle, kmh);
  if (applied === null) {
    player.sendClientMessage(Color.error, "Could not set speed limit.");
    return;
  }

  player.sendClientMessage(Color.info, `Speed limit: ${applied} km/h.`);
});
