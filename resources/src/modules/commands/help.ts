import { Color } from "../../shared/colors";
import { listCommands, registerCommand } from "./registry";
import { toClientText } from "../../shared/encoding";

registerCommand("help", "命令列表", (player) => {
  player.sendClientMessage(Color.info, toClientText("CNTest命令："));

  for (const cmd of listCommands()) {
    player.sendClientMessage(Color.white, `/${cmd.name} - ${cmd.description}`);
  }
});
