import { STREET_WORLD } from "../spawn/point";
import { defineGovOrg, defineRanks } from "./define";

export const ORG_FBI_ID = 6;
export const FBI_INTERIOR = 3;

export const FBI = defineGovOrg(
  ORG_FBI_ID,
  "联邦调查局",
  0x000080ff,
  {
    x: 268.0897,
    y: 188.476,
    z: 1008.1719,
    angle: 356.89,
    interior: FBI_INTERIOR,
    world: STREET_WORLD,
  },
  defineRanks([
    { title: "实习生", male: 286, female: 306, pay: 2200 },
    { title: "初级探员", male: 286, female: 306, pay: 2800 },
    { title: "缉毒探员", male: 164, female: 306, pay: 3500 },
    { title: "特种行动探员", male: 163, female: 306, pay: 4300 },
    { title: "高级探员", male: 303, female: 306, pay: 5200 },
    { title: "缉毒主管", male: 304, female: 306, pay: 6200 },
    { title: "特种行动主管", male: 305, female: 306, pay: 7400 },
    { title: "联邦调查局督察", male: 166, female: 306, pay: 8800 },
    { title: "联邦调查局副局长", male: 165, female: 306, pay: 10500 },
    { title: "联邦调查局局长", male: 295, female: 76, pay: 13000 },
  ])
);
