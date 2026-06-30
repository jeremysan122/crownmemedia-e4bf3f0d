// Module-level shared wallet store. Two channels:
//   - refresh listeners: triggered by `requestRefresh()` after balance-changing
//     actions (purchase, gift, daily reward, payout). useWallet() instances
//     respond by re-fetching once (deduped behind a module-level inflight).
//   - snapshot listeners: get the latest snapshot pushed to them whenever any
//     useWallet() instance fetches successfully. This lets every other mounted
//     instance update from cache instead of issuing its own DB read.
export interface WalletSnapshot {
  shekelBalance: number;
  totalEarned: number;
  totalSpent: number;
  loading: boolean;
}

type Listener = () => void;
type SnapshotListener = (s: WalletSnapshot) => void;

const refreshListeners = new Set<Listener>();
const snapshotListeners = new Set<SnapshotListener>();
let snapshot: WalletSnapshot | null = null;

export const walletStore = {
  getSnapshot(): WalletSnapshot | null {
    return snapshot;
  },
  setSnapshot(next: WalletSnapshot) {
    snapshot = next;
  },
  subscribe(listener: Listener): () => void {
    refreshListeners.add(listener);
    return () => { refreshListeners.delete(listener); };
  },
  subscribeSnapshot(listener: SnapshotListener): () => void {
    snapshotListeners.add(listener);
    return () => { snapshotListeners.delete(listener); };
  },
  /** Notify subscribers to refetch from server. Deduped by useWallet. */
  requestRefresh() {
    refreshListeners.forEach((l) => { try { l(); } catch { /* noop */ } });
  },
  /** Push a fresh snapshot to every mounted instance without an extra DB read. */
  broadcast(next: WalletSnapshot) {
    snapshotListeners.forEach((l) => { try { l(next); } catch { /* noop */ } });
  },
};
