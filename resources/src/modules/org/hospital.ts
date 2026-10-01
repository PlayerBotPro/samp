import { HOSPITAL_WORLD } from "../spawn/point";
import type { OrganizationDef, OrgGateDef, OrgRankDef } from "./types";
import { MAX_ORG_RANK } from "./types";

export const ORG_HOSPITAL_ID = 2;

const HOSPITAL_COLOR = 0xff7a8aff;
const FEMALE_SKIN = 170;

function hospitalRanks(): OrgRankDef[] {
  const rows: Array<{ title: string; male: number; pay: number }> = [
    { title: "Intern", male: 274, pay: 1800 },
    { title: "Junior Medical Worker", male: 274, pay: 2300 },
    { title: "Senior Medical Worker", male: 70, pay: 2900 },
    { title: "General Practitioner", male: 71, pay: 3600 },
    { title: "Therapist", male: 71, pay: 4400 },
    { title: "Surgeon", male: 276, pay: 5400 },
    { title: "Head of Department", male: 275, pay: 6500 },
    { title: "Senior Resident", male: 275, pay: 7700 },
    { title: "Deputy Chief Physician", male: 70, pay: 9000 },
    { title: "Chief Physician", male: 70, pay: 10800 },
  ];

  return rows.map((row, index) => ({
    id: index + 1,
    title: row.title,
    pay: row.pay,
    skins: { male: row.male, female: FEMALE_SKIN },
  }));
}

export const HOSPITAL: OrganizationDef = {
  id: ORG_HOSPITAL_ID,
  name: "Hospital",
  color: HOSPITAL_COLOR,
  gov: true,
  illegal: false,
  spawn: {
    x: 1158.3802,
    y: -1349.3069,
    z: 3001.0845,
    angle: 89.0324,
    interior: 0,
    world: HOSPITAL_WORLD,
  },
  ranks: hospitalRanks(),
};

if (HOSPITAL.ranks.length !== MAX_ORG_RANK) {
  throw new Error("Hospital: 10 ranks required");
}

export const HOSPITAL_GATES: OrgGateDef[] = [
  {
    orgId: ORG_HOSPITAL_ID,
    model: 19912,
    x: 1148.72375,
    y: -1290.95996,
    zClosed: 15.3248,
    zOpen: 9.7632,
    rx: 0,
    ry: 0,
    rz: 0,
    radius: 14,
    denyMessage: "You are not a member of the hospital.",
  },
];
