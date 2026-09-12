import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
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
  await page.getByLabel("Partner one's name").fill("Audit Partner One");
  await page.getByLabel("Partner two's name").fill("Audit Partner Two");
  await page.getByLabel("Wedding date").fill("2027-06-20");
  await page.getByLabel("Total budget").fill("250000");
  await page.getByRole("button", { name: /Start planning/ }).click();
}

test("upgrades a version 2 database without losing the wedding profile", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Database behavior is viewport independent.",
  );
  await page.goto("/");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase("vow-planner");
        deletion.onerror = () => reject(deletion.error);
        deletion.onsuccess = () => {
          const request = indexedDB.open("vow-planner", 2);
          request.onupgradeneeded = () => {
            for (const store of [
              "wedding",
              "tasks",
              "expenses",
              "guests",
              "vendors",
              "timeline",
              "notes",
              "tables",
              "households",
              "assignments",
            ])
              request.result.createObjectStore(store, { keyPath: "id" });
            request.transaction!.objectStore("wedding").put({
              id: "profile",
              partnerOne: "Stored",
              partnerTwo: "Couple",
              date: "2027-01-01",
              expectedGuests: 10,
              budgetCents: 100,
              currency: "USD",
              color: "#8c4f55",
            });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Stored & Couple" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        new Promise<boolean>((resolve, reject) => {
          const request = indexedDB.open("vow-planner");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            resolve(request.result.objectStoreNames.contains("halls"));
            request.result.close();
          };
        }),
    ),
  ).toBe(true);
});

test("dialogs trap focus, close with Escape and restore focus", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Keyboard workflow is covered on desktop.",
  );
  await setup(page);
  const trigger = page.getByRole("button", { name: "Checklist" });
  await trigger.click();
  const add = page.getByRole("button", { name: "Add task" });
  await add.focus();
  await add.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Add checklist task" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Save task" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("a failed IndexedDB write keeps entered form data available", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Storage behavior is viewport independent.",
  );
  await setup(page);
  await page.getByRole("button", { name: "Checklist" }).click();
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task title").fill("Keep this text");
  await page.getByLabel("Due date").fill("2027-01-01");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "restoreIdbPut", {
      value: () => {
        IDBObjectStore.prototype.put = original;
      },
      configurable: true,
    });
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Simulated quota failure", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add checklist task" }),
  ).toBeVisible();
  await expect(page.getByLabel("Task title")).toHaveValue("Keep this text");
  await expect(page.getByRole("alert")).toContainText(
    "Simulated quota failure",
  );
  await page.evaluate(() =>
    (window as Window & { restoreIdbPut: () => void }).restoreIdbPut(),
  );
});

test("a declined individual guest no longer consumes a seat", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Covered by the desktop workflow.",
  );
  await setup(page);
  await page.getByRole("button", { name: "Guests" }).click();
  await page.getByRole("button", { name: "Add guest" }).click();
  await page.getByLabel("Full name").fill("Seat Holder");
  await page.getByLabel("Number attending").fill("2");
  await page.locator('select[name="rsvp"]').selectOption("confirmed");
  await page.getByRole("button", { name: "Save guest" }).click();
  await page.getByRole("button", { name: "Seating" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByLabel("Table name or number").fill("Audit Table");
  await page.getByLabel("Capacity").fill("4");
  await page.getByRole("button", { name: "Save table" }).click();
  await page.getByRole("button", { name: "Generate seating plan" }).click();
  await expect(page.getByText("2 occupied")).toBeVisible();
  await page.getByRole("button", { name: "Guests" }).click();
  await page.getByLabel("RSVP for Seat Holder").selectOption("declined");
  await page.getByRole("button", { name: "Seating" }).click();
  await expect(page.getByText("0 occupied")).toBeVisible();
});

test("deleting a guest removes orphan household references", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Covered by the desktop workflow.",
  );
  await setup(page);
  await page.getByRole("button", { name: "Guests" }).click();
  await page.getByRole("button", { name: "Add guest" }).click();
  await page.getByLabel("Full name").fill("Linked Guest");
  await page.getByRole("button", { name: "Save guest" }).click();
  await page.getByRole("button", { name: "Seating" }).click();
  await page.getByRole("button", { name: "Household" }).click();
  await page.getByLabel("Household or family name").fill("Linked Household");
  await page.getByLabel("Maximum invited").fill("1");
  await page.getByLabel("Confirmed attendees").fill("0");
  await page.getByText("Linked Guest (pending)").click();
  await page.getByRole("button", { name: "Save household" }).click();
  await page.getByRole("button", { name: "Guests" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Linked Guest" }).click();
  expect(
    await page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const request = indexedDB.open("vow-planner");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const get = request.result
              .transaction("households")
              .objectStore("households")
              .getAll();
            get.onerror = () => reject(get.error);
            get.onsuccess = () => {
              resolve(get.result[0].guestIds);
              request.result.close();
            };
          };
        }),
    ),
  ).toEqual([]);
});

test("exported backup can restore the planner after clearing all data", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Covered by the desktop workflow.",
  );
  await setup(page);
  await page.getByRole("button", { name: "Hall Designer" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create space" }).click();
  await page
    .getByRole("button", { name: "Wedding stage", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved locally" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings & Backup" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup" }).click();
  const backup = await download;
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  await page.getByLabel("Clear confirmation phrase").fill("CLEAR MY WEDDING");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear everything" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your wedding" }),
  ).toBeVisible();
  await page
    .locator('.restore-button input[type="file"]')
    .setInputFiles(backupPath!);
  await expect(
    page.getByRole("heading", {
      name: "Audit Partner One & Audit Partner Two",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hall Designer" }).click();
  await expect(page.locator("[data-element-id]")).toHaveCount(1);
});

test("critical screens reflow without horizontal page scrolling", async ({
  page,
}) => {
  await setup(page);
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${viewport.width}x${viewport.height}`,
    ).toBe(true);
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Settings & Backup" }).click();
  await page.getByRole("switch", { name: "Dark theme" }).click();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `dark ${viewport.width}x${viewport.height}`,
    ).toBe(true);
  }
});
