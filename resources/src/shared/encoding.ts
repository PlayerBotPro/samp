import iconv from "iconv-lite";

/**
 * Converts UTF-8 string to a binary string representation of GBK bytes
 * for the SA-MP 0.3.7 client.
 */
export function toClientText(text: string): string {
  return iconv.encode(text, "gbk").toString("binary");
}