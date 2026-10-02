import { Color } from "../../shared/colors";
import { tryOccupyHospitalBed } from "../hospital";
import { registerCommand } from "./registry";

registerCommand("hospital", "占用医院病床", (player) => {
  tryOccupyHospitalBed(player);
});
