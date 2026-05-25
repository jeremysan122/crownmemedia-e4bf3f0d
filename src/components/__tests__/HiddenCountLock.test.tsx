import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HiddenCountLock from "../HiddenCountLock";

describe("HiddenCountLock", () => {
  it("renders a lock with descriptive aria-label for likes", () => {
    render(<HiddenCountLock kind="likes" />);
    expect(screen.getByRole("img", { name: /like count hidden/i })).toBeInTheDocument();
  });
  it("renders comments variant", () => {
    render(<HiddenCountLock kind="comments" />);
    expect(screen.getByRole("img", { name: /comment count hidden/i })).toBeInTheDocument();
  });
  it("renders views variant", () => {
    render(<HiddenCountLock kind="views" />);
    expect(screen.getByRole("img", { name: /view count hidden/i })).toBeInTheDocument();
  });
});
