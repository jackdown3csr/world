export function formatUsd(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0.00%";

  return `${value.toFixed(digits)}%`;
}
