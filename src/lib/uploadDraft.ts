import type { CrownCategory } from "./crown";
import type { FilterId } from "./filters";

const KEY = "crownme:upload-draft:v1";
const DB_NAME = "crownme-upload-draft";
const STORE = "files";
const FILES_KEY = "current";

export interface DraftPhoto {
  id: string;
  alt: string;
  fileName: string;
  fileType: string;
  /** Stored separately in IndexedDB; not part of localStorage payload. */
}

export interface UploadDraft {
  caption: string;
  category: CrownCategory;
  city: string;
  state: string;
  country: string;
  filter: FilterId;
  photos: DraftPhoto[];
  /** Legacy index — kept for back-compat. Prefer coverId. */
  coverIndex: number;
  /** Stable id of the photo the user chose as cover. */
  coverId?: string | null;
  savedAt: number;
}

export function loadDraft(): UploadDraft | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UploadDraft;
    // Backward compat: previous shape had altTexts only.
    if (!Array.isArray(parsed.photos)) parsed.photos = [];
    if (typeof parsed.coverIndex !== "number") parsed.coverIndex = 0;
    // Validate coverId points at an existing photo, else fall back safely.
    const ids = new Set(parsed.photos.map((p) => p?.id).filter(Boolean));
    if (parsed.coverId && !ids.has(parsed.coverId)) parsed.coverId = null;
    if (!parsed.coverId && parsed.photos[parsed.coverIndex]) {
      parsed.coverId = parsed.photos[parsed.coverIndex].id;
    }
    if (!parsed.coverId && parsed.photos[0]) {
      parsed.coverId = parsed.photos[0].id;
      parsed.coverIndex = 0;
    }
    // Keep coverIndex consistent with coverId.
    if (parsed.coverId) {
      const i = parsed.photos.findIndex((p) => p.id === parsed.coverId);
      if (i >= 0) parsed.coverIndex = i;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: UploadDraft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch { /* noop */ }
}

export function clearDraft() {
  try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  void clearDraftFiles();
}

// ────────── IndexedDB for binary file blobs ──────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-idb"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraftFiles(files: { id: string; file: File }[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(files, FILES_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* noop */ }
}

export async function loadDraftFiles(): Promise<{ id: string; file: File }[]> {
  try {
    const db = await openDb();
    const out = await new Promise<{ id: string; file: File }[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(FILES_KEY);
      req.onsuccess = () => resolve((req.result as { id: string; file: File }[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out;
  } catch { return []; }
}

export async function clearDraftFiles() {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(FILES_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* noop */ }
}
