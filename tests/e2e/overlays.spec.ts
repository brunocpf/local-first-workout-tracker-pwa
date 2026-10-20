import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, name: string) => {
  const button = page.getByRole("button", { name, exact: true });
  await button.click();
  return button;
};

// Keyboard open: Safari doesn't focus buttons on click, so focus return is only observable this way.
const openWithKeyboard = async (page: Page, name: string) => {
  const button = page.getByRole("button", { name, exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  return button;
};

const settled = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/ui/overlays");
  await expect(page.getByRole("heading", { name: "Overlays" })).toBeVisible();
});

test("dialog: Tab stays inside, Escape closes, focus returns to the opener", async ({ page, browserName }) => {
  const opener = await openWithKeyboard(page, "Open dialog");
  const dialog = page.getByRole("dialog", { name: "About rest timers" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/keeps its end time/);

  // WebKit only tabs to buttons when "Press Tab to highlight each item" is on; Alt+Tab always does.
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(tab);
    const outside = await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a !== document.body && !a.closest("dialog");
    });
    expect(outside).toBe(false);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.getByTestId("last-close")).toHaveText("Last closed: dialog");
});

test("dialog: backdrop click closes a dismissible dialog but not a form dialog", async ({ page }) => {
  await open(page, "Open dialog");
  const dialog = page.getByRole("dialog", { name: "About rest timers" });
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  await open(page, "Open form dialog");
  const form = page.getByRole("dialog", { name: "Rename routine" });
  await expect(form).toBeVisible();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
});

test.describe(() => {
  // Playwright has no touch-scroll input and no wheel in mobile emulation: wheel with the same viewport instead.
  test.use({ isMobile: false, hasTouch: false });

test("dialog and sheet: page does not scroll underneath", async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Open dialog");
    button?.click();
  });
  const dialog = page.getByRole("dialog", { name: "About rest timers" });
  await expect(dialog).toBeVisible();
  await settled(page);

  const vp = page.viewportSize()!;
  // Over the backdrop, then over the dialog (whose content doesn't overflow).
  await page.mouse.move(8, vp.height / 2);
  await page.mouse.wheel(0, 600);
  const box = (await dialog.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(300);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Open full sheet" }).click();
  const sheet = page.getByRole("dialog", { name: "Add exercise" });
  await expect(sheet).toBeVisible();
  await settled(page);
  const y = await page.evaluate(() => window.scrollY);
  // Scroll the sheet's list past its end: it must not chain to the page.
  const sheetBox = (await sheet.boundingBox())!;
  await page.mouse.move(sheetBox.x + sheetBox.width / 2, sheetBox.y + sheetBox.height / 2);
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  // …while the sheet's own content still scrolls.
  expect(await sheet.locator(".body").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});
});

test("confirm: danger focuses Cancel; confirm and cancel resolve", async ({ page }) => {
  const opener = await openWithKeyboard(page, "Discard workout");
  const dialog = page.getByRole("dialog", { name: "Discard workout?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Discard workout" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("confirm-result")).toHaveText("Result: confirmed");
  await expect(opener).toBeFocused();

  await open(page, "Save past session");
  const save = page.getByRole("dialog", { name: "Save changes?" });
  await expect(save.getByRole("button", { name: "Save changes" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(save).toBeHidden();
  await expect(page.getByTestId("confirm-result")).toHaveText("Result: cancelled");
});

test("toast: announced region, Undo runs once", async ({ page }) => {
  const region = page.getByRole("region", { name: "Notifications" });
  await expect(region).toHaveAttribute("aria-live", "polite");

  await open(page, "Delete a set");
  await expect(page.getByTestId("sets")).toContainText("Sets: Set 1, Set 2 ·");
  await expect(region).toContainText("Set deleted");
  const undo = region.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(region.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.getByTestId("sets")).toHaveText("Sets: Set 1, Set 2, Set 3 · Undo ran 1×");
});

test("overlays page has no horizontal scroll at 320px with a sheet open", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, "Open action sheet");
  await expect(page.getByRole("dialog", { name: "Push day" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test("toast: keyboard Undo returns focus instead of dropping it on <body>", async ({ page, browserName }) => {
  const opener = await openWithKeyboard(page, "Delete a set");
  const region = page.getByRole("region", { name: "Notifications" });
  const undo = region.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  // Move into the toast with Tab, as a keyboard user would (WebKit needs Alt+Tab to reach buttons).
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await expect(opener).toBeFocused();
  for (let i = 0; i < 30 && !(await undo.evaluate((el) => el === document.activeElement)); i++) {
    await page.evaluate(() => document.activeElement?.setAttribute("data-was-focused", ""));
    await page.keyboard.press(tab);
    await page.evaluate(() => {
      const a = document.activeElement;
      if (a?.closest("[aria-label=Notifications]")) return;
      document.querySelectorAll("[data-was-focused]").forEach((el) => el.removeAttribute("data-was-focused"));
    });
  }
  await expect(undo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(undo).toHaveCount(0);
  await expect(page.getByTestId("sets")).toContainText("Undo ran 1×");
  // Focus is back on the element focused before Tab entered the toast region, not on <body>.
  await expect(page.locator("[data-was-focused]")).toBeFocused();
});

test("toast: a toast raised while a dialog is open waits, then is usable", async ({ page }) => {
  await open(page, "Restore backup");
  const dialog = page.getByRole("dialog", { name: "Replace all data?" });
  await dialog.getByRole("button", { name: "Export a backup first" }).click();
  const region = page.getByRole("region", { name: "Notifications" });
  // The export finishes while the dialog is open: nothing appears under the inert modal.
  await expect(dialog.getByRole("button", { name: "Export a backup first" })).not.toHaveAttribute("aria-busy");
  await expect(region).not.toContainText("Backup exported");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(region).toContainText("Backup exported");
  await region.getByRole("button", { name: "Dismiss" }).click();
  await expect(region).not.toContainText("Backup exported");
});
