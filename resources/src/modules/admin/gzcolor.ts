import type { Player } from "@omp-node/core";
import { Color } from "../../shared/colors";
import { GANGS, getOrganization } from "../org";
import { registerCommand } from "../commands/registry";
import { isZoneUnderCapture } from "../zones/capture";
import { findTurfAtPlayer, setGangZoneOwner } from "../zones/turf";
import { hasAdminAccess } from "./session";

const MIN_ADMIN_LEVEL = 5;

function usageLines(): string[] {
  return [
    "Usage: /gzcolor [id]",
    ...GANGS.map((gang) => `${gang.id} — ${gang.name}`),
  ];
}

function parseGangId(args: string): number | null {
  const raw = args.trim();
  if (!raw) {
    return null;
  }

  const orgId = Number(raw);
  if (!Number.isInteger(orgId)) {
    return null;
  }

  return GANGS.some((gang) => gang.id === orgId) ? orgId : null;
}

export function bindAdminGzcolor(): void {
  registerCommand(
    "gzcolor",
    "Change gang zone owner",
    (player, args) => {
      if (!hasAdminAccess(player, MIN_ADMIN_LEVEL)) {
        return;
      }

      const orgId = parseGangId(args);
      if (orgId === null) {
        for (const line of usageLines()) {
          player.sendClientMessage(Color.error, line);
        }
        return;
      }

      const turf = findTurfAtPlayer(player);
      if (!turf) {
        player.sendClientMessage(
          Color.error,
          "Stand in the gang zone you want to change."
        );
        return;
      }

      if (turf.orgId === orgId) {
        player.sendClientMessage(Color.error, "This territory already belongs to this gang.");
        return;
      }

      if (isZoneUnderCapture(turf.id)) {
        player.sendClientMessage(Color.error, "You cannot change the owner during a capture.");
        return;
      }

      void applyOwner(player, turf.id, orgId, turf.orgId);
    },
    true
  );
}

async function applyOwner(
  admin: Player,
  zoneId: number,
  orgId: number,
  previousOrgId: number
): Promise<void> {
  const saved = await setGangZoneOwner(zoneId, orgId);
  if (!saved) {
    admin.sendClientMessage(Color.error, "Failed to save the zone owner.");
    return;
  }

  const nextName = getOrganization(orgId)?.name ?? "the gang";
  const prevName = getOrganization(previousOrgId)?.name ?? "nobody";
  admin.sendClientMessage(Color.info, `Zone #${zoneId}: ${prevName} → ${nextName}.`);
}
