/** Canonical conversation folder name (matches public.dm_pair_folder in DB). */
export function dmPairFolder(a: string, b: string) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function isImageType(t?: string | null) {
  return !!t && t.startsWith("image/");
}

export function formatBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
