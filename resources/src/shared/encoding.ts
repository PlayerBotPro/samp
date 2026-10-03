import iconv from "iconv-lite";

/**
 * Prepares GBK text for the installed omp-node bridge, which converts JS
 * strings to Windows-1251 before sending them to the client. The client
 * must decode chat as GBK/CP936. Do not use with a UTF-8 bridge.
 */
export function toClientText(text: string): string {
  const bytes = iconv.encode(text, "gbk");
  const bridgeText = iconv.decode(bytes, "win1251");
  // Windows-1251 cannot represent every byte (notably 0x98).
  if (!iconv.encode(bridgeText, "win1251").equals(bytes)) {
    throw new Error("GBK text cannot be sent losslessly through the Windows-1251 bridge");
  }
  return bridgeText;
}
