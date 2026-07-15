import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import CrownAvatar from "../CrownAvatar";
import { getCrownRenderConfig } from "../crownRenderConfig";

const crownSource = () => readFileSync(resolve(process.cwd(), "src/components/crowns/CrownAvatar.tsx"), "utf8");
const profileSource = () => readFileSync(resolve(process.cwd(), "src/pages/Profile.tsx"), "utf8");

describe("CrownAvatar positioning contract", () => {
  it("keeps the wrapper exactly avatar-sized and leaves overflow visible", () => {
    render(<CrownAvatar photoUrl="/avatar.jpg" crownAssetUrl="/crown.webp" size={160} />);
    const wrapper = screen.getByTestId("crown-avatar");

    expect(wrapper).toHaveStyle({ width: "160px", height: "160px", overflow: "visible" });
  });

  it("keeps the avatar circle fixed at absolute inset-0 with z-index 10", () => {
    render(<CrownAvatar photoUrl="/avatar.jpg" crownAssetUrl="/crown.webp" size={160} />);
    const circle = screen.getByTestId("crown-avatar-circle");

    expect(circle.className).toContain("absolute inset-0");
    expect(circle).toHaveStyle({ width: "160px", height: "160px", zIndex: "10" });
  });

  it("anchors the crown by bottom edge with shallow default overlap", () => {
    render(<CrownAvatar photoUrl="/avatar.jpg" crownAssetUrl="/crown.webp" size={160} />);
    const crown = screen.getByTestId("equipped-achievement-crown");

    expect(crown).toHaveStyle({ width: "168px", bottom: "144px", zIndex: "30" });
  });

  it("renders exactly one equipped wearable crown", () => {
    render(<CrownAvatar photoUrl="/avatar.jpg" crownAssetUrl="/crown.webp" size={160} />);

    expect(screen.getAllByTestId("equipped-achievement-crown")).toHaveLength(1);
  });

  it("uses the profile photo URL for the avatar image", () => {
    render(<CrownAvatar photoUrl="/profile-photo.jpg" crownAssetUrl="/wearable-crown.webp" size={160} />);
    const avatar = screen.getByAltText("") as HTMLImageElement;

    expect(avatar.getAttribute("src")).toBe("/profile-photo.jpg");
  });

  it("does not hide the avatar when the crown image fails", () => {
    render(<CrownAvatar photoUrl="/profile-photo.jpg" crownAssetUrl="/broken-crown.webp" size={160} alt="Royal profile" />);

    fireEvent.error(screen.getByTestId("equipped-achievement-crown"));

    expect(screen.queryByTestId("equipped-achievement-crown")).not.toBeInTheDocument();
    expect(screen.getByAltText("Royal profile")).toHaveAttribute("src", "/profile-photo.jpg");
  });

  it("resets crown failure when the equipped crown URL changes", () => {
    const { rerender } = render(
      <CrownAvatar photoUrl="/profile-photo.jpg" crownAssetUrl="/broken-crown.webp" size={160} />,
    );

    fireEvent.error(screen.getByTestId("equipped-achievement-crown"));
    expect(screen.queryByTestId("equipped-achievement-crown")).not.toBeInTheDocument();

    rerender(<CrownAvatar photoUrl="/profile-photo.jpg" crownAssetUrl="/new-crown.webp" size={160} />);

    expect(screen.getByTestId("equipped-achievement-crown")).toHaveAttribute("src", "/new-crown.webp");
  });

  it("renders the mobile 112px size with bottom anchoring", () => {
    render(<CrownAvatar photoUrl="/avatar.jpg" crownAssetUrl="/crown.webp" size={112} />);

    expect(screen.getByTestId("crown-avatar")).toHaveStyle({ width: "112px", height: "112px" });
    expect(screen.getByTestId("equipped-achievement-crown")).toHaveStyle({ bottom: "101px" });
  });

  it("renders the desktop 160px size with bottom anchoring", () => {
    render(<CrownAvatar photoUrl="/avatar.jpg" crownAssetUrl="/crown.webp" size={160} />);

    expect(screen.getByTestId("crown-avatar")).toHaveStyle({ width: "160px", height: "160px" });
    expect(screen.getByTestId("equipped-achievement-crown")).toHaveStyle({ bottom: "144px" });
  });
});

describe("Crown render config guardrails", () => {
  it("keeps configured crown overlap in the 7% to 13% range", () => {
    for (const crownNumber of [undefined, null, 1]) {
      const config = getCrownRenderConfig(crownNumber);
      expect(config.overlapScale).toBeGreaterThanOrEqual(0.07);
      expect(config.overlapScale).toBeLessThanOrEqual(0.13);
    }
  });

  it("starts crown #1 at the approved width and overlap values", () => {
    expect(getCrownRenderConfig(1)).toMatchObject({
      widthScale: 1.08,
      overlapScale: 0.09,
      translateX: 0,
      translateY: 0,
      visualScale: 1,
    });
  });
});

describe("CrownAvatar source regression guardrails", () => {
  it("does not contain the old avatar-pushing positioning model", () => {
    const source = crownSource();

    expect(source).not.toContain("const crownHeight");
    expect(source).not.toContain("const avatarTop");
    expect(source).not.toContain("wrapperHeight");
    expect(source).not.toContain("heightScale");
    expect(source).not.toContain("top: avatarTop");
    expect(source).not.toContain("height: avatarTop + size");
  });

  it("uses bottom anchoring rather than crown-height positioning", () => {
    const source = crownSource();

    expect(source).toContain("const crownBottom = size - crownOverlap");
    expect(source).toContain("bottom: crownBottom");
  });

  it("does not contain duplicate className or style props on a single JSX line", () => {
    const source = crownSource();

    for (const line of source.split("\n")) {
      expect((line.match(/className=/g) ?? [])).toHaveLength(Math.min((line.match(/className=/g) ?? []).length, 1));
      expect((line.match(/style=/g) ?? [])).toHaveLength(Math.min((line.match(/style=/g) ?? []).length, 1));
    }
  });
});

describe("Profile equipped crown data flow", () => {
  it("passes profile_photo_url to CrownAvatar as the avatar photo", () => {
    expect(profileSource()).toContain("photoUrl={prof.profile_photo_url}");
  });

  it("loads wearable_asset_url for the equipped crown", () => {
    const source = profileSource();

    expect(source).toContain('select("id, crown_number:sort_order, wearable_asset_url, is_active")');
    expect(source).toContain("setEquippedCrownAsset(crown?.wearable_asset_url ?? null)");
  });

  it("never falls back from wearable_asset_url to asset_url for profile wearables", () => {
    const source = profileSource();

    expect(source).not.toContain("wearable_asset_url ?? crown?.asset_url");
    expect(source).not.toContain("crown?.asset_url ??");
    expect(source).not.toContain("setEquippedCrownAsset((cr as any)?.asset_url");
  });

  it("shows the normal profile avatar when the equipped crown lacks a wearable asset", () => {
    const source = profileSource();

    expect(source).toContain("crownMissingWearable");
    expect(source).toContain("!!prof.equipped_achievement_crown_id && equippedCrownMissingWearable");
    expect(source).toContain("src={prof.profile_photo_url}");
  });
});