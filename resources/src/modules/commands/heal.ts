import { tryHealInHouse } from "../houses/heal";
import { registerCommand } from "./registry";

registerCommand("heal", "在配备急救箱的房屋中治疗", (player) => {
  tryHealInHouse(player);
});
