import { expect, test } from "@playwright/test";

const publicRoutes = ["/auth", "/legal", "/privacy"];

test.describe("public accessibility smoke", () => {
  for (const route of publicRoutes) {
    test(`${route} exposes named controls and document structure`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).not.toBeEmpty();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);

      const problems = await page.evaluate(() => {
        const visible = (element: Element) => {
          const node = element as HTMLElement;
          const style = window.getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
        };
        const named = (element: Element) => {
          const node = element as HTMLElement;
          const labelledBy = node.getAttribute("aria-labelledby");
          const labelledText = labelledBy
            ?.split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ");
          return Boolean(
            node.getAttribute("aria-label")?.trim()
            || labelledText?.trim()
            || node.getAttribute("title")?.trim()
            || node.textContent?.trim()
            || (node instanceof HTMLInputElement && node.labels && node.labels.length > 0),
          );
        };

        const issues: string[] = [];
        document.querySelectorAll("img").forEach((img) => {
          if (visible(img) && !img.hasAttribute("alt")) issues.push(`image without alt: ${img.src}`);
        });
        document.querySelectorAll("button, a[href], input, select, textarea").forEach((control) => {
          if (visible(control) && !named(control)) {
            issues.push(`unnamed ${control.tagName.toLowerCase()}: ${(control as HTMLElement).outerHTML.slice(0, 180)}`);
          }
        });
        return issues;
      });

      expect(problems).toEqual([]);
    });
  }
});
