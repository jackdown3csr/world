/**
 * Format a raw wei string (18 decimals) into human‑readable GNET balance.
 * e.g. "1234567890000000000000" → "1,234.56789 GNET"
 *
 * Shows up to 6 significant decimals, minimum 3.
 */
export function formatBalance(rawWei: string): string {
  if (!rawWei || rawWei === "0") return "0 GNET";

  // Manual formatting to avoid pulling in ethers on the client bundle.
  // rawWei is a decimal string (no 0x prefix).
  const wei = BigInt(rawWei);
  const DECIMALS = 18n;
  const UNIT = 10n ** DECIMALS;

  const whole = wei / UNIT;
  const frac = wei % UNIT;

  // Pad fraction to 18 chars
  const fracStr = frac.toString().padStart(18, "0");

  // Trim trailing zeros but keep at least 3 decimals
  let trimmed = fracStr.replace(/0+$/, "");
  if (trimmed.length < 3) trimmed = fracStr.slice(0, 3);
  // Cap at 6 decimals
  if (trimmed.length > 6) trimmed = trimmed.slice(0, 6);

  // Thousands separator for whole part
  const wholeFormatted = whole.toLocaleString("en-US");

  return `${wholeFormatted}.${trimmed} GNET`;
}
