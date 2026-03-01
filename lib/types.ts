/**
 * Shared TypeScript types for the wallet data payload.
 */
export interface WalletEntry {
  address: string;
  rawBalanceWei: string;
  balanceFormatted: string;
}

export interface WalletsPayload {
  updatedAt: number; // unix ms
  wallets: WalletEntry[];
}
