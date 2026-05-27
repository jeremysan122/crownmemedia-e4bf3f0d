// Module-level shared wallet store. Replaces the old
// `window.dispatchEvent("wallet:refresh")` hack so wallet balance updates
// stay consistent across every mounted useWallet() consumer without
// relying on global DOM events.
//
// Pattern: a tiny pub/sub. Any component (or non-React code) can call
// `walletStore.requestRefresh()` after an action that changes the balance
// — every subscribed useWallet() instance refetches in response.

export interface WalletSnapshot {
  shekelBalance: number;
  totalEarned: number;
  totalSpent: number;
  loading: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: WalletSnapshot | null = null;

export const walletStore = {
  /** Latest snapshot, or null when no useWallet() has loaded yet. */
  getSnapshot(): WalletSnapshot | null {
    return snapshot;
  },
  /** Persist a new snapshot (does not notify — useWallet owns its own state). */
  setSnapshot(next: WalletSnapshot) {
    snapshot = next;
  },
  /** Subscribe to refresh requests. Returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Notify every subscriber to refetch their wallet from the server. */
  requestRefresh() {
    listeners.forEach((l) => {
      try { l(); } catch { /* noop */ }
    });
  },
};
