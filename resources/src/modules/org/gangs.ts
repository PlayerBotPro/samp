import type { SpawnPoint } from "../spawn/point";
import type { OrganizationDef, OrgRankDef } from "./types";
import { MAX_ORG_RANK } from "./types";

export const ORG_GROVE_ID = 9;
export const ORG_BALLAS_ID = 10;
export const ORG_VAGOS_ID = 11;
export const ORG_RIFA_ID = 12;
export const ORG_AZTECAS_ID = 13;

/** Gang houses - vanilla interiors, each with its own VW (= org id). */
export const GROVE_WORLD = 9;
export const BALLAS_WORLD = 10;
export const VAGOS_WORLD = 11;
export const RIFA_WORLD = 12;
export const AZTECAS_WORLD = 13;

const GANG_PAY = [800, 1100, 1500, 2000, 2600, 3300, 4100, 5000, 6000, 7200];

type GangRankRow = {
  title: string;
  male: number;
};

function hqSpawn(
  x: number,
  y: number,
  z: number,
  angle: number,
  interior: number,
  world: number
): SpawnPoint {
  return { x, y, z, angle, interior, world };
}

function gangRanks(female: number, rows: GangRankRow[]): OrgRankDef[] {
  return rows.map((row, index) => ({
    id: index + 1,
    title: row.title,
    pay: GANG_PAY[index] ?? 800,
    skins: { male: row.male, female },
  }));
}

function defineGang(
  id: number,
  name: string,
  color: number,
  spawn: SpawnPoint,
  female: number,
  rows: GangRankRow[]
): OrganizationDef {
  const org: OrganizationDef = {
    id,
    name,
    color,
    gov: false,
    illegal: true,
    spawn,
    ranks: gangRanks(female, rows),
  };

  if (org.ranks.length !== MAX_ORG_RANK) {
    throw new Error(`${name}: 10 ranks required`);
  }

  return org;
}

export const GROVE = defineGang(
  ORG_GROVE_ID,
  "格罗夫街帮",
  0x009900aa,
  hqSpawn(2449.4707, -1690.2758, 1013.5078, 179.8317, 2, GROVE_WORLD),
  195,
  [
    { title: "新人", male: 105 },
    { title: "混混", male: 105 },
    { title: "忠诚成员", male: 106 },
    { title: "帮派分子", male: 106 },
    { title: "战士", male: 106 },
    { title: "枪手", male: 107 },
    { title: "元老", male: 107 },
    { title: "大元老", male: 269 },
    { title: "传奇", male: 271 },
    { title: "老大", male: 207 },
  ]
);

export const BALLAS = defineGang(
  ORG_BALLAS_ID,
  "巴拉斯帮",
  0xcc00ffaa,
  hqSpawn(224.9616, 1158.2284, 1082.6094, 89.0343, 4, BALLAS_WORLD),
  195,
  [
    { title: "菜鸟", male: 103 },
    { title: "经历考验者", male: 103 },
    { title: "年轻成员", male: 103 },
    { title: "街头混混", male: 102 },
    { title: "帮派分子", male: 102 },
    { title: "枪手", male: 102 },
    { title: "打手", male: 104 },
    { title: "指挥者", male: 10 },
    { title: "明星", male: 104 },
    { title: "大老板", male: 104 },
  ]
);

export const VAGOS = defineGang(
  ORG_VAGOS_ID,
  "洛圣都瓦戈斯帮",
  0xffcd00aa,
  hqSpawn(323.8303, 1127.1255, 1083.8828, 178.9385, 5, VAGOS_WORLD),
  190,
  [
    { title: "新人", male: 108 },
    { title: "同伙", male: 108 },
    { title: "匪徒", male: 108 },
    { title: "疯汉", male: 108 },
    { title: "小子", male: 110 },
    { title: "亡命徒", male: 110 },
    { title: "老兵", male: 110 },
    { title: "士兵", male: 109 },
    { title: "荣耀成员", male: 109 },
    { title: "教父", male: 109 },
  ]
);

export const RIFA = defineGang(
  ORG_RIFA_ID,
  "里法帮",
  0x6666ffaa,
  hqSpawn(-60.6872, 1364.6147, 1080.2185, 90.2645, 6, RIFA_WORLD),
  226,
  [
    { title: "伙伴", male: 175 },
    { title: "硬汉", male: 175 },
    { title: "初级成员", male: 175 },
    { title: "士兵", male: 174 },
    { title: "匪徒", male: 174 },
    { title: "队长", male: 174 },
    { title: "副队长", male: 173 },
    { title: "老兵", male: 173 },
    { title: "首领", male: 173 },
    { title: "教父", male: 273 },
  ]
);

export const AZTECAS = defineGang(
  ORG_AZTECAS_ID,
  "阿兹特卡斯帮",
  0x00b4e1aa,
  hqSpawn(231.2349, 1246.6328, 1082.1406, 136.928, 2, AZTECAS_WORLD),
  193,
  [
    { title: "新人", male: 114 },
    { title: "伙伴", male: 114 },
    { title: "士兵", male: 114 },
    { title: "匪徒", male: 116 },
    { title: "街头小子", male: 116 },
    { title: "队长", male: 116 },
    { title: "副队长", male: 115 },
    { title: "老兵", male: 115 },
    { title: "首领", male: 115 },
    { title: "教父", male: 292 },
  ]
);

export const GANGS: readonly OrganizationDef[] = [GROVE, BALLAS, VAGOS, RIFA, AZTECAS];
