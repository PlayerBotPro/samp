/** House VW offset to avoid overlap with the street (0), bank (2), organizations, etc. */
export const HOUSE_WORLD_OFFSET = 1000;

export function houseVirtualWorld(houseId: number): number {
  return HOUSE_WORLD_OFFSET + houseId;
}

export function isHouseVirtualWorld(world: number): boolean {
  return world >= HOUSE_WORLD_OFFSET;
}

export function houseIdFromVirtualWorld(world: number): number | null {
  if (!isHouseVirtualWorld(world)) {
    return null;
  }

  const houseId = world - HOUSE_WORLD_OFFSET;
  if (!Number.isInteger(houseId) || houseId < 1) {
    return null;
  }

  return houseId;
}
