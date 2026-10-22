import { expect, test, type Page } from "@playwright/test";

// The Push API is stubbed (no real push service in CI). The build is made with a fake relay URL and VAPID key.
type Stub = { permission?: "granted" | "denied"; supported?: boolean; standalone?: boolean };

async function stubPush(page: Page, { permission = "granted", supported = true, standalone = true }: Stub = {}) {
  await page.addInitScript(
    ({ permission, supported, standalone }) => {
      // The relay is faked at fetch level (WebKit's request interception doesn't cover the CORS preflight).
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) =>
        String(input).startsWith("https://relay.test/") ? Promise.resolve(new Response("{}", { status: 200 })) : realFetch(input, init);
      if (standalone) Object.defineProperty(navigator, "standalone", { value: true });
      if (!supported) {
        Object.defineProperty(window, "PushManager", { value: undefined, configurable: true });
        return;
      }
      Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: { permission: "default", requestPermission: async () => permission },
      });
      const registration = {
        pushManager: {
          subscribe: async () => ({ toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/stub", keys: { p256dh: "a", auth: "b" } }) }),
          getSubscription: async () => null,
        },
      };
      Object.defineProperty(navigator.serviceWorker, "ready", { value: Promise.resolve(registration), configurable: true });
    },
    { permission, supported, standalone },
  );
}

test("enabling notifications asks for permission and offers a test notification", async ({ page }) => {
  await stubPush(page);
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Rest timer notifications" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "Send test notification" }).click();
  await expect(page.getByText(/Test sent/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("switch", { name: "Rest timer notifications" })).toBeChecked();
  await page.getByRole("switch", { name: "Rest timer notifications" }).click();
  await expect(page.getByRole("switch", { name: "Rest timer notifications" })).not.toBeChecked();
});

test("denied permission leaves notifications off with an explanation", async ({ page }) => {
  await stubPush(page, { permission: "denied" });
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Rest timer notifications" }).click();
  await expect(page.getByText(/Notifications are blocked/)).toBeVisible();
  await expect(page.getByRole("switch", { name: "Rest timer notifications" })).not.toBeChecked();
});

test("unsupported browsers get an explanation instead of a switch", async ({ page }) => {
  await stubPush(page, { supported: false });
  await page.goto("/settings");
  await expect(page.getByText(/doesn't support push notifications/)).toBeVisible();
  await expect(page.getByRole("switch", { name: "Rest timer notifications" })).toHaveCount(0);
});

test.describe("iPhone, not installed", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });

  test("explains that the app must be installed", async ({ page }) => {
    await stubPush(page, { standalone: false });
    await page.goto("/settings");
    await expect(page.getByText("Install the app first")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Rest timer notifications" })).toHaveCount(0);
  });

  test("the timer keeps an install hint after the first-use note is dismissed", async ({ page }) => {
    await stubPush(page, { standalone: false });
    await page.goto("/");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.getByRole("button", { name: "Start rest" }).click();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("button", { name: "Got it" })).toHaveCount(0);
    await expect(page.getByTestId("rest-install-hint")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("rest-install-hint")).toBeVisible();
  });
});

test("no install hint beside the timer outside iOS", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "the Mobile Safari project uses an iPhone user agent");
  await stubPush(page, { standalone: false });
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Start rest" }).click();
  await expect(page.getByRole("button", { name: "Got it" })).toBeVisible();
  await expect(page.getByTestId("rest-install-hint")).toHaveCount(0);
});
