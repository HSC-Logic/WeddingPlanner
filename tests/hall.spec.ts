import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.deleteDatabase("vow-planner");
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      }),
  );
  await page.reload();
  await page.getByLabel("Partner one's name").fill("Asha");
  await page.getByLabel("Partner two's name").fill("Nimal");
  await page.getByLabel("Wedding date").fill("2027-02-14");
  await page.getByLabel("Total budget").fill("1000000");
  await page.getByRole("button", { name: /Start planning/ }).click();
  await page
    .getByRole("button", { name: "Hall Designer", exact: true })
    .click();
  await page.getByLabel("Hall width (m)", { exact: true }).fill("24");
  await page.getByLabel("Hall length (m)", { exact: true }).fill("18");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await expect(page.getByRole("application")).toBeVisible();
}
async function blurFill(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press("Tab");
}
test("hall designer end-to-end: geometry, locks, routes, recovery and export", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop editing workflow");
  await setup(page);
  const canvas = page.getByRole("application");
  const box = await canvas.boundingBox();
  await page
    .getByRole("button", { name: "Wedding stage", exact: true })
    .dragTo(canvas, { targetPosition: { x: 100, y: 100 } });
  await expect(page.locator("[data-element-id]")).toHaveCount(1);
  for (const name of ["Buffet station", "Drinks Station", "Dance floor"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByText("Tables and seating", { exact: true }).first().click();
  await page.getByRole("button", { name: "Round table", exact: true }).click();
  await page
    .getByRole("button", { name: "Rectangular table", exact: true })
    .click();
  await expect(page.locator("[data-element-id]")).toHaveCount(6);
  await expect(page.getByText(/overlaps/).first()).toBeVisible();
  await blurFill(page, "X position (m)", "8");
  await blurFill(page, "Width (m)", "3");
  await blurFill(page, "Rotation", "30");
  await page.getByLabel("Lock object", { exact: true }).check();
  await expect(page.getByLabel("X position (m)")).toBeDisabled();
  const item = page.locator("[data-element-id]").last();
  const transform = await item.getAttribute("transform");
  await item.dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
  await expect(item).toHaveAttribute("transform", transform!);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "Draw flow path", exact: true })
    .click();
  await canvas.click({ position: { x: 60, y: 60 } });
  await canvas.click({ position: { x: 150, y: 140 } });
  await page.getByRole("button", { name: "Finish path", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Guest entrance" }).click();
  await page.getByLabel("Route label").fill("Guest welcome");
  await expect(page.getByLabel("Route label")).toHaveValue("Guest welcome");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved locally" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Hall Designer", exact: true })
    .click();
  await expect(page.locator("[data-element-id]")).toHaveCount(6);
  await expect(
    page.locator("summary").filter({ hasText: "Guest welcome" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full plan PNG" }).click();
  expect((await download).suggestedFilename()).toContain(".png");
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Print / Export PDF & directories" })
    .click();
  await expect(
    (await popup).getByRole("heading", {
      name: "Alphabetical guest-to-table directory",
    }),
  ).toBeVisible();
  expect(box!.width).toBeGreaterThan(200);
  await page.screenshot({
    path: "/private/tmp/hall-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(
    page.getByRole("button", { name: "Wedding stage", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(/Mobile view:/)).toBeVisible();
  await expect(page.locator(".hall-library")).toHaveCount(0);
  await expect(canvas).toBeVisible();
});

test("seating assignments update the same hall table and survive regeneration", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await setup(page);
  await page
    .locator("summary")
    .filter({ hasText: "Tables and seating" })
    .click();
  await page.getByRole("button", { name: "Round table", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Family table");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved locally" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guests", exact: true }).click();
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  await page.getByLabel("Full name").fill("Perera family");
  await page.getByLabel("Number attending").fill("4");
  await page.locator('select[name="rsvp"]').selectOption("confirmed");
  await page.getByRole("button", { name: "Save guest", exact: true }).click();
  await page.getByRole("button", { name: "Seating", exact: true }).click();
  await expect(page.locator(".seating-table")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Generate seating plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hall Designer", exact: true })
    .click();
  await expect(page.locator("[data-element-id]")).toHaveAttribute(
    "aria-label",
    /4\/8/,
  );
  await page.locator("[data-element-id]").click();
  await expect(page.getByText("Perera family", { exact: true })).toBeVisible();
  await page.getByLabel("Lock seating assignment").click();
  await expect(page.getByLabel("Lock seating assignment")).toBeChecked();
  await page.getByRole("button", { name: "Seating", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate seating plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hall Designer", exact: true })
    .click();
  await expect(page.locator("[data-element-id]")).toHaveAttribute(
    "aria-label",
    /4\/8/,
  );
});
test("tablet touch selection and movement; mobile read-only view", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173");
  await setup(page);
  await page.getByRole("button", { name: "Wedding stage", exact: true }).tap();
  await page.setViewportSize({ width: 820, height: 1180 });
  const stage = page.locator("[data-element-id]");
  await stage.tap();
  await expect(page.getByLabel("X position (m)")).toBeVisible();
  const before = await stage.getAttribute("transform");
  await page.getByRole("button", { name: "Move →", exact: true }).tap();
  await expect(stage).not.toHaveAttribute("transform", before!);
  await page.screenshot({
    path: "/private/tmp/hall-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(/Mobile view:/)).toBeVisible();
  await stage.tap();
  await expect(page.locator(".hall-properties")).toHaveCount(0);
  await page.screenshot({
    path: "/private/tmp/hall-mobile.png",
    fullPage: true,
  });
  await context.close();
});
