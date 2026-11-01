const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

// 128 random bits as lowercase base32, so a code can't be guessed (#1073).
export function mintInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0;
  let value = 0;
  let code = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      code += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) code += ALPHABET[(value << (5 - bits)) & 31];
  return code;
}
