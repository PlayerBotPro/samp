import { tryStartCapture } from "../zones/capture";
import { registerCommand } from "./registry";

registerCommand("capture", "Capture gang territory", (player) => {
  tryStartCapture(player);
});
