import { tryHealInHouse } from "../houses/heal";
import { registerCommand } from "./registry";

registerCommand("heal", "Treatment in a house with a first-aid kit", (player) => {
  tryHealInHouse(player);
});
