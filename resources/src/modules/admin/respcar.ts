import { INVALID_VEHICLE_ID, omp, type Vehicle } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { isPlayerActive, playerChatName } from "../../shared/player";
import { registerCommand } from "../commands/registry";
import { hasAdminAccess } from "./session";

const DELAY_MS = 30_000;
const MIN_LEVEL = 4;

let pending: ReturnType<typeof setTimeout> | null = null;

function broadcastAll(color: number, text: string): void {
  omp.players.forEach((other) => {
    if (!isPlayerActive(other)) {
      return;
    }

    try {
      other.sendClientMessage(color, text);
    } catch {
      // Slot is empty.
    }
  });
}

function vehicleHasPlayer(vehicle: Vehicle): boolean {
  try {
    if (vehicle.getDriver()) {
      return true;
    }
    return vehicle.countOccupants() > 0;
  } catch {
    return true;
  }
}

function occupiedVehicleIds(): Set<number> {
  const ids = new Set<number>();
  omp.players.forEach((player) => {
    try {
      if (!player.isInAnyVehicle()) {
        return;
      }

      const id = player.getVehicleID();
      if (id > 0 && id !== INVALID_VEHICLE_ID) {
        ids.add(id);
      }
    } catch {
      // Slot is empty.
    }
  });
  return ids;
}

function respawnEmptyVehicles(): void {
  const busy = occupiedVehicleIds();
  for (const vehicle of omp.vehicles.all()) {
    try {
      const id = vehicle.getID();
      if (id !== null && busy.has(id)) {
        continue;
      }

      if (vehicleHasPlayer(vehicle)) {
        continue;
      }

      vehicle.setToRespawn();
    } catch {
      // Vehicle is already destroyed.
    }
  }
}

export function bindAdminRespcar(): void {
  registerCommand(
    "respcar",
    "Respawn all vehicles in 30 seconds",
    (player) => {
      if (!hasAdminAccess(player, MIN_LEVEL)) {
        return;
      }

      if (pending) {
        player.sendClientMessage(
          Color.error,
          "Vehicle respawn timer is already running."
        );
        return;
      }

      const tag = playerChatName(player);
      broadcastAll(
        Color.info,
        `Administrator ${tag} started a vehicle respawn. Unoccupied vehicles will return to their spawn points in 30 seconds.`
      );

      pending = setTimeout(() => {
        pending = null;
        respawnEmptyVehicles();
        broadcastAll(
          Color.info,
          `Administrator ${tag} respawned all unoccupied vehicles on the server.`
        );
      }, DELAY_MS);
    },
    true
  );
}
