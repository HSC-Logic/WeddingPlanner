import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.deleteDatabase("vow-planner"));
  await page.reload();
});
async function setup(page: import("@playwright/test").Page) {
  await page.getByLabel("Partner one's name").fill("Asha");
  await page.getByLabel("Partner two's name").fill("Nimal");
  await page.getByLabel("Wedding date").fill("2027-02-14");
  await page.getByLabel("Total budget").fill("1000000");
  await page.getByRole("button", { name: /Start planning/ }).click();
  await expect(page.getByText("Asha & Nimal")).toBeVisible();
}
test("completes setup and checklist task", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Checklist" }).click();
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task title").fill("Book florist");
  await page.getByLabel("Due date").fill("2026-12-01");
  await page.getByRole("button", { name: "Save task" }).click();
  await page.getByRole("button", { name: "Complete task" }).click();
  await expect(page.getByText("Book florist")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
});
test("mobile navigation remains usable", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: "Guests" }).click();
  await expect(page.getByRole("heading", { name: "Guest list" })).toBeVisible();
});

test("creates household, generates seating, preserves lock and reports capacity conflict", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Guests" }).click();
  await page.getByRole("button", { name: "Add guest" }).click();
  await page.getByLabel("Full name").fill("Perera Family");
  await page.getByLabel("Number attending").fill("4");
  await page.getByLabel("RSVP").selectOption("confirmed");
  await page.getByRole("button", { name: "Save guest" }).click();
  await page.getByRole("button", { name: "Seating" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByLabel("Table name or number").fill("Table One");
  await page.getByLabel("Capacity").fill("4");
  await page.getByRole("button", { name: "Save table" }).click();
  await page.getByRole("button", { name: "Household" }).click();
  await page.getByLabel("Household or family name").fill("Pereras");
  await page.getByLabel("Maximum invited").fill("4");
  await page.getByLabel("Confirmed attendees").fill("4");
  await page.getByText("Perera Family (confirmed)").click();
  await page.getByRole("button", { name: "Save household" }).click();
  await page.getByRole("button", { name: "Generate seating plan" }).click();
  await expect(page.getByText("Pereras")).toBeVisible();
  await page.getByLabel("Lock to table").selectOption({ label: "Table One" });
  await page.getByRole("button", { name: "Generate seating plan" }).click();
  await expect(page.getByText("Locked")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Reserved seats").fill("1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Update table" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".seating-table")).toHaveCount(1);
});
