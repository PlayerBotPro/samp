import { Color } from "../../shared/colors";
import { listCommands, registerCommand } from "./registry";

registerCommand("help", "Command list", (player) => {
  player.sendClientMessage(Color.info, "Commands:");

  for (const cmd of listCommands()) {
    player.sendClientMessage(Color.white, `/${cmd.name} — ${cmd.description}`);
  }
});
