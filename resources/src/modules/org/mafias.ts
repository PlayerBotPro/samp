import type { SpawnPoint } from "../spawn/point";
import type { OrganizationDef, OrgGateDef, OrgRankDef } from "./types";
import { MAX_ORG_RANK } from "./types";

export const ORG_LCN_ID = 14;
export const ORG_YAKUZA_ID = 15;
export const ORG_RUSSIAN_MAFIA_ID = 16;

/** Madd Dogg's Mansion - shared family interior, different VWs. */
export const MAFIA_INTERIOR = 5;
export const LCN_WORLD = 14;
export const YAKUZA_WORLD = 15;
export const RUSSIAN_MAFIA_WORLD = 16;

const MAFIA_PAY = [1000, 1400, 1900, 2500, 3200, 4000, 4900, 5900, 7000, 8500];

type MafiaRankRow = {
  title: string;
  male: number;
};

function mafiaRanks(female: number, rows: MafiaRankRow[]): OrgRankDef[] {
  return rows.map((row, index) => ({
    id: index + 1,
    title: row.title,
    pay: MAFIA_PAY[index] ?? 1000,
    skins: { male: row.male, female },
  }));
}

function mafiaHqSpawn(world: number): SpawnPoint {
  return {
    x: 1291.5886,
    y: -833.188,
    z: 1085.6328,
    angle: 89.5906,
    interior: MAFIA_INTERIOR,
    world,
  };
}

function defineMafia(
  id: number,
  name: string,
  color: number,
  spawn: SpawnPoint,
  female: number,
  rows: MafiaRankRow[]
): OrganizationDef {
  const org: OrganizationDef = {
    id,
    name,
    color,
    gov: false,
    illegal: false,
    mafia: true,
    spawn,
    ranks: mafiaRanks(female, rows),
  };

  if (org.ranks.length !== MAX_ORG_RANK) {
    throw new Error(`${name}: 10 ranks required`);
  }

  return org;
}

export const LCN = defineMafia(
  ORG_LCN_ID,
  "科萨诺斯特拉",
  0xff8000ff,
  mafiaHqSpawn(LCN_WORLD),
  263,
  [
    { title: "新人", male: 119 },
    { title: "关联成员", male: 119 },
    { title: "跑腿", male: 43 },
    { title: "荣誉成员", male: 290 },
    { title: "士兵", male: 127 },
    { title: "十人队长", male: 127 },
    { title: "头目", male: 113 },
    { title: "顾问", male: 113 },
    { title: "副首领", male: 223 },
    { title: "教父", male: 223 },
  ]
);

export const YAKUZA = defineMafia(
  ORG_YAKUZA_ID,
  "山口组",
  0xcc0000ff,
  mafiaHqSpawn(YAKUZA_WORLD),
  56,
  [
    { title: "若众", male: 121 },
    { title: "舍弟", male: 122 },
    { title: "子分", male: 123 },
    { title: "舍弟头", male: 117 },
    { title: "若头", male: 118 },
    { title: "总本部成员", male: 124 },
    { title: "最高顾问", male: 208 },
    { title: "干部", male: 120 },
    { title: "亲父", male: 186 },
    { title: "组长", male: 294 },
  ]
);

export const RUSSIAN_MAFIA = defineMafia(
  ORG_RUSSIAN_MAFIA_ID,
  "俄罗斯黑手党",
  0x1a5c6eff,
  mafiaHqSpawn(RUSSIAN_MAFIA_WORLD),
  169,
  [
    { title: "跑步女子", male: 112 },
    { title: "混混", male: 112 },
    { title: "兄弟", male: 272 },
    { title: "打手", male: 272 },
    { title: "权威成员", male: 126 },
    { title: "副队长", male: 125 },
    { title: "队长", male: 111 },
    { title: "监督者", male: 98 },
    { title: "正式成员", male: 46 },
    { title: "律贼", male: 46 },
  ]
);

export const MAFIAS: readonly OrganizationDef[] = [LCN, YAKUZA, RUSSIAN_MAFIA];

export const LCN_GATES: OrgGateDef[] = [
  {
    orgId: ORG_LCN_ID,
    model: 19912,
    x: 1282.35217,
    y: -2050.71509,
    zClosed: 60.6006,
    zOpen: 55.0073,
    rx: 0,
    ry: 0,
    rz: 90,
    radius: 14,
    denyMessage: "你不是科萨诺斯特拉成员。",
  },
];

const YAKUZA_GATE = {
  orgId: ORG_YAKUZA_ID,
  model: 19912,
  rx: 0,
  ry: 0,
  radius: 14,
  denyMessage: "你不是山口组成员。",
} as const;

export const YAKUZA_GATES: OrgGateDef[] = [
  {
    ...YAKUZA_GATE,
    x: 670.69287,
    y: -1309.53784,
    zClosed: 15.2336,
    zOpen: 9.6836,
    rz: 0,
  },
  {
    ...YAKUZA_GATE,
    x: 661.96692,
    y: -1221.85962,
    zClosed: 17.9462,
    zOpen: 12.2892,
    rz: 61.51915,
  },
  {
    ...YAKUZA_GATE,
    x: 786.05829,
    y: -1158.20215,
    zClosed: 25.3149,
    zOpen: 19.8112,
    rz: -90,
  },
];

export const RUSSIAN_MAFIA_GATES: OrgGateDef[] = [
  {
    orgId: ORG_RUSSIAN_MAFIA_ID,
    model: 968,
    x: 965.55011,
    y: -942.06873,
    zClosed: 40.1682,
    zOpen: 40.1682,
    rx: 0,
    ry: -90,
    ryOpen: 0,
    rz: 0.7162,
    radius: 14,
    denyMessage: "你不是俄罗斯黑手党成员。",
  },
];
