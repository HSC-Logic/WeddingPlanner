import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("primary workflows have no automated WCAG A/AA violations", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "The mobile navigation test covers reflow.",
  );
  await page.goto("/");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("vow-planner");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
  await page.reload();
  await page.getByLabel("Partner one's name").fill("Accessible");
  await page.getByLabel("Partner two's name").fill("Planner");
  await page.getByLabel("Wedding date").fill("2027-06-20");
  await page.getByLabel("Total budget").fill("1000");
  await page.getByRole("button", { name: /Start planning/ }).click();

  for (const section of [
    "Dashboard",
    "Guests",
    "Seating",
    "Settings & Backup",
  ]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, section).toEqual([]);
  }

  await page.getByRole("switch", { name: "Dark theme" }).click();

  await page.getByRole("button", { name: "Guests", exact: true }).click();
  await page.getByRole("button", { name: "Add guest" }).click();
  const dialogResults = await new AxeBuilder({ page })
    .include("[role='dialog']")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(dialogResults.violations).toEqual([]);
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: "Hall Designer", exact: true })
    .click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const lockNames = await page
    .getByRole("button", { name: /layer$/ })
    .allTextContents();
  expect(lockNames.length).toBeGreaterThan(1);
  const hallResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(hallResults.violations, "Hall Designer").toEqual([]);
});
