import { showGpsMenu } from "../gps";
import { registerCommand } from "./registry";

registerCommand("gps", "Set route or disable GPS", (player) => {
  showGpsMenu(player);
});
