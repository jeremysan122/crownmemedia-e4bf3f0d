import { describe, expect, it } from "vitest";
import { validateUpload, videoExtensionForMime } from "@/lib/uploadValidation";

describe("video upload MIME normalization", () => {
  it.each([
    ["video/mp4", "mp4"],
    ["video/quicktime", "mov"],
    ["video/webm", "webm"],
    ["VIDEO/MP4", "mp4"],
  ])("maps %s to a server-safe extension", (mime, extension) => {
    expect(videoExtensionForMime(mime)).toBe(extension);
  });

  it("does not trust a filename extension when MIME is unsupported", () => {
    expect(videoExtensionForMime("application/octet-stream")).toBeNull();
    expect(validateUpload({ name: "looks-safe.mp4", type: "application/octet-stream", size: 10 }, "post_video").ok).toBe(false);
  });
});
