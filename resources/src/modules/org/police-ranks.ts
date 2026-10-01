import { defineRanks } from "./define";

export const POLICE_COLOR = 0x2641feff;

export const POLICE_RANKS = defineRanks([
  { title: "Private", male: 266, female: 307, pay: 2000 },
  { title: "Sergeant", male: 284, female: 307, pay: 2500 },
  { title: "Senior Sergeant", male: 267, female: 307, pay: 3100 },
  { title: "Lieutenant", male: 280, female: 307, pay: 3800 },
  { title: "Senior Lieutenant", male: 281, female: 306, pay: 4600 },
  { title: "Captain", male: 282, female: 306, pay: 5500 },
  { title: "Major", male: 311, female: 306, pay: 6500 },
  { title: "Lieutenant Colonel", male: 310, female: 306, pay: 7700 },
  { title: "Colonel", male: 283, female: 306, pay: 9000 },
  { title: "General", male: 288, female: 76, pay: 11000 },
]);
