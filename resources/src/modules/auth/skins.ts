import type { Gender } from "./gender";

export type SkinOption = {
  id: number;
  label: string;
};

export const SKINS: Record<Gender, SkinOption[]> = {
  male: [
    { id: 78, label: "流浪汉" },
    { id: 79, label: "流浪汉2" },
    { id: 134, label: "流浪汉3" },
    { id: 136, label: "普通男子" },
    { id: 137, label: "流浪汉4" },
    { id: 160, label: "乡村男子" },
    { id: 200, label: "乡村男子2" },
    { id: 212, label: "流浪汉5" },
    { id: 213, label: "古怪老人" },
    { id: 230, label: "流浪汉6" },
    { id: 239, label: "流浪汉7" },
  ],
  female: [
    { id: 77, label: "流浪女子" },
    { id: 90, label: "跑步女子" },
    { id: 93, label: "普通女子" },
    { id: 131, label: "农场女子" },
    { id: 151, label: "普通女子2" },
    { id: 157, label: "乡村女子" },
    { id: 190, label: "芭芭拉" },
    { id: 192, label: "米歇尔" },
    { id: 198, label: "农镇女子" },
    { id: 201, label: "农民" },
    { id: 211, label: "女售货员" },
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
