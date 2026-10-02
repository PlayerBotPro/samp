import { findOwnedHouse } from "./repository";

export function residenceLabel(userId: number): string {
  const house = findOwnedHouse(userId);
  if (!house) {
    return "Homeless";
  }

  return `House (No. ${house.id})`;
}
