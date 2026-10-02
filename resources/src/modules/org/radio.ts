import { defineGovOrg, defineRanks } from "./define";
import type { OrgGateDef } from "./types";

export const ORG_RADIO_ID = 8;
/** Custom Radio Center interior. Street and roof remain in VW 0. */
export const RADIO_WORLD = 8;
export const RADIO_INTERIOR = 0;

export const RADIOCENTR = defineGovOrg(
  ORG_RADIO_ID,
  "Radio Center",
  0xff8c00ff,
  {
    x: 1429.5406,
    y: 1071.8772,
    z: 1058.7916,
    angle: 154.0138,
    interior: RADIO_INTERIOR,
    world: RADIO_WORLD,
  },
  defineRanks([
    { title: "Editorial Assistant", male: 250, female: 93, pay: 1700 },
    { title: "News Layout Artist", male: 250, female: 93, pay: 2200 },
    { title: "Radio Technician", male: 60, female: 93, pay: 2800 },
    { title: "Journalist", male: 60, female: 93, pay: 3500 },
    { title: "Senior Journalist", male: 170, female: 211, pay: 4300 },
    { title: "Proofreader", male: 188, female: 211, pay: 5200 },
    { title: "Assistant Editor", male: 188, female: 211, pay: 6300 },
    { title: "Editor", male: 187, female: 211, pay: 7600 },
    { title: "Editor-in-Chief", male: 227, female: 211, pay: 9100 },
    { title: "Radio Center Director", male: 228, female: 150, pay: 11000 },
  ])
);

export const RADIO_GATES: OrgGateDef[] = [
  {
    orgId: ORG_RADIO_ID,
    model: 968,
    x: 1739.44507,
    y: -1309.9248,
    zClosed: 13.4962,
    zOpen: 13.4962,
    rx: 0,
    ry: 90,
    ryOpen: 0,
    rz: 11.4037,
    radius: 14,
    denyMessage: "You are not a member of the Radio Center.",
  },
];
