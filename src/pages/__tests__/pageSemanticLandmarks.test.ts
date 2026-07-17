import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readPage = (name: string) =>
  readFileSync(resolve(process.cwd(), `src/pages/${name}.tsx`), "utf8");

describe("page semantic landmarks", () => {
  it.each(["Discover", "Rewards"])(
    "%s relies on AppShell for the single main landmark",
    (page) => {
      expect(readPage(page)).not.toMatch(/<\/?main(?:\s|>)/);
    },
  );

  it("gives the Royal Store a stable page heading on every tab", () => {
    expect(readPage("Store")).toContain('<h1 className="sr-only">Royal Store</h1>');
  });
});
