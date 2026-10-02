import { showGpsMenu } from "../gps";
import { registerCommand } from "./registry";

registerCommand("gps", "设置路线或关闭导航", (player) => {
  showGpsMenu(player);
});
