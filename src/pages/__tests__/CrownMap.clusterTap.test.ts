import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level guards for Crown Map cluster-tap behavior:
 *
 *  Locked contract:
 *   - Cluster tap opens the PRIMARY marker's /post/:id (highest crown_score in
 *     the pixel bucket), never a user profile by default and never a fake
 *     coord.
 *   - The +N badge does NOT swallow the tap (pointer-events:none) so the
 *     click resolves to the underlying primary marker button.
 *   - Zooming re-runs the cluster pass so tapping the map's zoom-in control
 *     naturally splits the cluster on the next `zoomend`.
 *   - The primary marker still runs the `posts` existence check so a removed
 *     post falls back to the holder profile with a toast — never a 404.
 */
const CROWN = readFileSync(resolve(process.cwd(), "src/pages/CrownMap.tsx"), "utf8");

describe("Crown Map cluster tap — source contracts", () => {
  it("primary of a cluster is chosen by highest crown_score", () => {
    // The bucket-merge branch that promotes a new primary must compare crown_score.
    expect(CROWN).toMatch(
      /points\[i\]\.r\.crown_score\s*>\s*points\[cur\.primary\]\.r\.crown_score/,
    );
  });

  it("+N cluster badge is inert so the tap lands on the primary marker", () => {
    // Without pointer-events:none the badge would eat the click and cluster
    // tap would silently do nothing on mobile.
    expect(CROWN).toMatch(/data-cluster-badge[\s\S]*?pointer-events:none/);
  });

  it("primary marker click routes to /post/:id for crowned POSTS, not users", () => {
    // The click handler must prefer postTarget when markerMode is "posts"
    // and a post_id is present.
    expect(CROWN).toMatch(/const postTarget = p\.r\.post_id \? `\/post\/\$\{p\.r\.post_id\}` : null;/);
    expect(CROWN).toMatch(/markerMode === "posts" && postTarget && p\.r\.post_id/);
    expect(CROWN).toMatch(/navigate\(postTarget\)/);
  });

  it("verifies the crowned post still exists before navigating (no 404 dumps)", () => {
    // Guardrail: cluster tap on a stale primary must not dump the user on 404.
    expect(CROWN).toMatch(
      /from\("posts"\)[\s\S]{0,200}?\.select\("id"\)[\s\S]{0,200}?\.eq\("id", p\.r\.post_id\)[\s\S]{0,120}?\.eq\("is_removed", false\)/,
    );
    expect(CROWN).toMatch(/Post unavailable — opening holder's profile/);
  });

  it("cluster pass re-runs on zoomend so tapping zoom-in expands the cluster", () => {
    expect(CROWN).toMatch(/map\.on\("zoomend", runCluster\)/);
    expect(CROWN).toMatch(/map\.on\("moveend", runCluster\)/);
    // And cleans up its listeners on unmount so we don't leak between remounts.
    expect(CROWN).toMatch(/map\.off\("zoomend", runCluster\)/);
    expect(CROWN).toMatch(/map\.off\("moveend", runCluster\)/);
  });

  it("cluster reset restores extras to display:'' so zoom-out re-clusters cleanly", () => {
    // Previous-pass hidden markers must be un-hidden before the next bucket pass,
    // otherwise a marker that used to be an extra stays invisible after zoom-in
    // splits the cluster.
    expect(CROWN).toMatch(/el\.style\.display = "";/);
  });

  it("unmapped crowned posts are never clustered — they stay in their own section", () => {
    // Clustering only iterates `points` (post coord resolved), and the unmapped
    // section reads from the classifier — never from `points`.
    expect(CROWN).toMatch(/<UnmappedCrownedPosts\s+rows=\{filtered\}/);
    expect(CROWN).not.toMatch(/fallbackCoord\s*\(/);
  });
});
