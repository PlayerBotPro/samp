import type { Gender } from "./gender";

export type SkinOption = {
  id: number;
  label: string;
};

export const SKINS: Record<Gender, SkinOption[]> = {
  male: [
    { id: 78, label: "Homeless man" },
    { id: 79, label: "Homeless man 2" },
    { id: 134, label: "Homeless man 3" },
    { id: 136, label: "Regular guy" },
    { id: 137, label: "Homeless man 4" },
    { id: 160, label: "Countryman" },
    { id: 200, label: "Countryman 2" },
    { id: 212, label: "Homeless man 5" },
    { id: 213, label: "Odd old man" },
    { id: 230, label: "Homeless man 6" },
    { id: 239, label: "Homeless man 7" },
  ],
  female: [
    { id: 77, label: "Homeless woman" },
    { id: 90, label: "Runner" },
    { id: 93, label: "Regular woman" },
    { id: 131, label: "Farm woman" },
    { id: 151, label: "Regular woman 2" },
    { id: 157, label: "Countrywoman" },
    { id: 190, label: "Barbara" },
    { id: 192, label: "Michelle" },
    { id: 198, label: "Farm town" },
    { id: 201, label: "Farmer" },
    { id: 211, label: "Saleswoman" },
  ],
};

export function skinListBody(gender: Gender): string {
  return SKINS[gender].map((skin) => `${skin.label} (${skin.id})`).join("\n");
}

export function skinByIndex(gender: Gender, index: number): SkinOption | null {
  return SKINS[gender][index] ?? null;
}

export function hasSkin(gender: Gender, skinId: number): boolean {
  return SKINS[gender].some((skin) => skin.id === skinId);
}

export function wrapSkinIndex(gender: Gender, index: number): number {
  const total = SKINS[gender].length;
  if (total <= 0) {
    return 0;
  }
  return ((index % total) + total) % total;
}

export function skinIndexOf(gender: Gender, skinId: number): number {
  const index = SKINS[gender].findIndex((skin) => skin.id === skinId);
  return index >= 0 ? index : 0;
}
