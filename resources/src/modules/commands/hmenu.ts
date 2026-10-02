import { showHouseMenu } from "../houses/menu";
import { registerCommand } from "./registry";

registerCommand("hmenu", "House menu", (player) => {
  showHouseMenu(player);
});
