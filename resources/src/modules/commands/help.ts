import { Color } from "../../shared/colors";
import { listCommands, registerCommand } from "./registry";
import { toClientText } from "../../shared/encoding";

registerCommand("help", "命令列表", (player) => {
  // Compatibility test for the installed Windows-1251 bridge + GBK client.
  player.sendClientMessage(Color.info, toClientText("[GBK bridge] 中文测试 你好世界"));
  player.sendClientMessage(Color.info, toClientText("[CHN bridge] CNTest命令："));
  player.sendClientMessage(Color.info, ("[CHN] CNTest命令："));
  player.sendClientMessage(Color.info, ("[RUS] Министерство"));
  // 中文测试 你好世界 in GBK/CP936.
  player.sendClientMessage(Color.info, "\xD6\xD0\xCE\xC4\xB2\xE2\xCA\xD4\x20\xC4\xE3\xBA\xC3\xCA\xC0\xBD\xE7");
  // 中文測試 你好世界 in Big5/CP950.
  player.sendClientMessage(Color.info, "\xA4\xA4\xA4\xE5\xB4\xFA\xB8\xD5\x20\xA7\x41\xA6\x6E\xA5\x40\xAC\xC9");
  // 中文测试 你好世界 in UTF-8.
  player.sendClientMessage(Color.info, "\xE4\xB8\xAD\xE6\x96\x87\xE6\xB5\x8B\xE8\xAF\x95\x20\xE4\xBD\xA0\xE5\xA5\xBD\xE4\xB8\x96\xE7\x95\x8C");


  // for (const cmd of listCommands()) {
  //   player.sendClientMessage(Color.white, `/${cmd.name} - ${cmd.description}`);
  // }
});
