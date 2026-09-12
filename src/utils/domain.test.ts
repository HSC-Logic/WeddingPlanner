import { describe, expect, it } from "vitest";
import {
  budgetStats,
  addCalendarDays,
  cents,
  createBackup,
  csvCell,
  daysUntil,
  emptyData,
  guestStats,
  localDate,
  money,
  parseBackup,
  paymentStatus,
  taskStats,
  vendorBalance,
} from "./domain";
import type { Expense, Guest, Task, Vendor } from "../types/models";

const base = { id: "1", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
describe("planning calculations", () => {
  it("calculates checklist completion", () =>
    expect(
      taskStats([
        {
          ...base,
          title: "",
          category: "",
          notes: "",
          dueDate: "",
          priority: "low",
          status: "completed",
        },
        {
          ...base,
          id: "2",
          title: "",
          category: "",
          notes: "",
          dueDate: "",
          priority: "high",
          status: "pending",
        },
      ] as Task[]),
    ).toEqual({ complete: 1, pending: 1, percent: 50 }));
  it("calculates budget and partial payments in cents", () => {
    const expense = {
      ...base,
      description: "",
      category: "",
      estimatedCents: 12000,
      actualCents: 10101,
      paidCents: 5050,
      deadline: "",
      notes: "",
    } as Expense;
    expect(budgetStats([expense], 20000)).toEqual({
      estimated: 12000,
      actual: 10101,
      paid: 5050,
      outstanding: 5051,
      remaining: 9899,
    });
    expect(paymentStatus(expense)).toBe("partial");
  });
  it("calculates vendor remaining balance", () =>
    expect(
      vendorBalance({ finalCents: 5000, depositCents: 1250 } as Vendor),
    ).toBe(3750));
  it("counts attendees rather than guest records", () =>
    expect(
      guestStats([
        { ...base, attendees: 3, rsvp: "confirmed" },
        { ...base, id: "2", attendees: 2, rsvp: "pending" },
      ] as Guest[]),
    ).toEqual({ total: 5, confirmed: 3, declined: 0, pending: 2 }));
  it("handles wedding today and past dates", () => {
    expect(daysUntil("2026-09-12", new Date(2026, 8, 12))).toBe(0);
    expect(daysUntil("2026-09-10", new Date(2026, 8, 12))).toBe(-2);
  });
  it("uses local calendar dates without UTC shifting", () => {
    expect(localDate(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
    expect(addCalendarDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("formats currency", () => expect(money(12345, "USD")).toMatch(/123\.45/));
  it("parses grouped currency input", () =>
    expect(cents("400,000,000.50")).toBe(40_000_000_050));
});
describe("safe interchange", () => {
  it("neutralizes CSV formulas and escapes quotes", () =>
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"'));
  it("rejects malformed backups", () =>
    expect(() => parseBackup('{"version":2}')).toThrow("Unsupported"));
  it("rejects seating backups with missing references", () => {
    const data = {
      tasks: [],
      expenses: [],
      guests: [],
      vendors: [],
      timeline: [],
      notes: [],
      tables: [],
      households: [],
      assignments: [
        {
          id: "a",
          guestId: "missing",
          tableId: "missing",
          seatCount: 1,
          assignmentType: "manual",
          locked: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    expect(() =>
      parseBackup(JSON.stringify({ version: 2, exportedAt: "", data })),
    ).toThrow("missing table");
  });
  it("rejects future versions, unexpected properties and excessive input", () => {
    const backup = createBackup(emptyData());
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, version: 99 })),
    ).toThrow("Unsupported");
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, surprise: true })),
    ).toThrow("unexpected");
    expect(() => parseBackup(" ".repeat(5_000_001))).toThrow("5 MB");
  });
  it("rejects duplicate IDs and unexpected nested properties", () => {
    const data = emptyData();
    const task: Task = {
      ...base,
      title: "Task",
      category: "Other",
      notes: "",
      dueDate: "2027-01-01",
      priority: "low",
      status: "pending",
    };
    data.tasks = [task, { ...task }];
    expect(() => parseBackup(JSON.stringify(createBackup(data)))).toThrow(
      "Duplicate ID",
    );
    const clean = createBackup(emptyData());
    const text = JSON.stringify(clean).replace(
      '"tasks":[]',
      '"tasks":[],"__proto__":{"polluted":true}',
    );
    expect(() => parseBackup(text)).toThrow();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it("rejects invalid money and broken vendor links before restore", () => {
    const data = emptyData();
    data.expenses = [
      {
        ...base,
        description: "Deposit",
        category: "Venue",
        vendorId: "missing",
        estimatedCents: 100,
        actualCents: 100,
        paidCents: 101,
        deadline: "",
        notes: "",
      },
    ];
    expect(() => parseBackup(JSON.stringify(createBackup(data)))).toThrow();
  });
});
