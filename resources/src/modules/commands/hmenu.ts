import { showHouseMenu } from "../houses/menu";
import { registerCommand } from "./registry";

registerCommand("hmenu", "房屋菜单", (player) => {
  showHouseMenu(player);
});
