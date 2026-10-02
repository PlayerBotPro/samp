import { tryStartCapture } from "../zones/capture";
import { registerCommand } from "./registry";

registerCommand("capture", "争夺帮派领地", (player) => {
  tryStartCapture(player);
});
