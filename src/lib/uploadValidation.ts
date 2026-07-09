/**
 * Client-side upload validation. Interim backup until server-side storage
 * bucket `file_size_limit` / `allowed_mime_types` are enforced in the
 * backend dashboard.
 *
 * These presets mirror the intended server-side bucket configuration.
 */

export type UploadPreset =
  | "avatar"
  | "banner"
  | "share_card"
  | "post_image"
  | "post_video"
  | "dm_attachment"
  | "verification_doc";

export interface UploadRule {
  maxBytes: number;
  mimeTypes: readonly string[];
  label: string;
}

const MB = 1024 * 1024;

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const UPLOAD_RULES: Record<UploadPreset, UploadRule> = {
  avatar:      { maxBytes: 5 * MB,   mimeTypes: IMAGE_MIMES, label: "avatar" },
  banner:      { maxBytes: 5 * MB,   mimeTypes: IMAGE_MIMES, label: "banner" },
  share_card:  { maxBytes: 5 * MB,   mimeTypes: IMAGE_MIMES, label: "share card" },
  post_image:  { maxBytes: 50 * MB,  mimeTypes: IMAGE_MIMES, label: "photo" },
  post_video:  { maxBytes: 200 * MB, mimeTypes: VIDEO_MIMES, label: "video" },
  dm_attachment: {
    // Launch scope: image-only DM attachments. Video support is disabled
    // until moderation/preview pipeline is fully vetted.
    maxBytes: 25 * MB,
    mimeTypes: IMAGE_MIMES,
    label: "attachment",
  },
  verification_doc: {
    maxBytes: 25 * MB,
    mimeTypes: [...IMAGE_MIMES, "application/pdf"] as const,
    label: "document",
  },
};

export interface UploadValidationResult {
  ok: boolean;
  /** Friendly, user-safe error message. Empty when ok. */
  message: string;
}

export function validateUpload(
  file: Pick<File, "size" | "type" | "name">,
  preset: UploadPreset,
): UploadValidationResult {
  const rule = UPLOAD_RULES[preset];
  if (!file) {
    return { ok: false, message: `Please choose a ${rule.label} to upload.` };
  }
  if (file.size <= 0) {
    return { ok: false, message: `That ${rule.label} looks empty. Try another file.` };
  }
  if (file.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / MB);
    return {
      ok: false,
      message: `That ${rule.label} is too large. Max ${mb} MB.`,
    };
  }
  const mime = (file.type || "").toLowerCase();
  if (!rule.mimeTypes.includes(mime as (typeof rule.mimeTypes)[number])) {
    const friendly = rule.mimeTypes
      .map((m) => m.split("/")[1].toUpperCase())
      .join(", ");
    return {
      ok: false,
      message: `Unsupported ${rule.label} format. Use ${friendly}.`,
    };
  }
  return { ok: true, message: "" };
}
