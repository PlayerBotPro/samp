import { showSellHouseDialog } from "../houses/sell";
import { registerCommand } from "./registry";

registerCommand("sellhouse", "Sell a house to the state", (player) => {
  showSellHouseDialog(player);
});
