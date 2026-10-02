import { Color } from "../../shared/colors";
import { tryOccupyHospitalBed } from "../hospital";
import { registerCommand } from "./registry";

registerCommand("hospital", "Occupy a hospital bed", (player) => {
  tryOccupyHospitalBed(player);
});
