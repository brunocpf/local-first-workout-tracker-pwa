import { expect, test } from "@playwright/test";

// Rows in a grouped list must stay flush with the list's leading edge; only the divider is inset.
for (const path of ["/exercises", "/dev/ui/layout"]) {
  test(`list group rows are aligned on ${path}`, async ({ page }) => {
    await page.goto(path);
    const rows = page.locator("ul.group:visible > li");
    await expect(rows.first()).toBeVisible();
    const boxes = await rows.evaluateAll((els) =>
      els.slice(0, 8).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width, list: el.parentElement!.getBoundingClientRect().x };
      }),
    );
    expect(boxes.length).toBeGreaterThan(1);
    for (const b of boxes) {
      expect(b.x).toBeCloseTo(boxes[0].x, 0);
      expect(b.width).toBeCloseTo(boxes[0].width, 0);
    }
  });
}
