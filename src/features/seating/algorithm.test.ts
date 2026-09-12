import { describe, expect, it } from "vitest";
import type {
  Guest,
  Household,
  SeatingAssignment,
  SeatingTable,
} from "../../types/models";
import { effectiveCapacity, generateSeating } from "./algorithm";

const stamp = "2026-01-01T00:00:00.000Z";
const table = (
  id: string,
  capacity: number,
  group = "family",
  reservedSeats = 0,
): SeatingTable => ({
  id,
  name: id,
  group,
  capacity,
  reservedSeats,
  locked: false,
  shape: "round",
  notes: "",
  displayOrder: Number(id.replace(/\D/g, "")) || 0,
  createdAt: stamp,
  updatedAt: stamp,
});
const guest = (id: string, rsvp: Guest["rsvp"] = "confirmed"): Guest => ({
  id,
  name: id,
  group: "mutual",
  phone: "",
  email: "",
  attendees: 1,
  invitation: "sent",
  rsvp,
  meal: "",
  table: "",
  notes: "",
  createdAt: stamp,
  updatedAt: stamp,
});
const household = (
  id: string,
  seats: number,
  preferredGroup = "family",
  guestIds = [id],
): Household => ({
  id,
  name: id,
  guestIds,
  maximumInvited: seats,
  confirmedAttendees: seats,
  preferredGroup,
  keepTogether: true,
  notes: "",
  createdAt: stamp,
  updatedAt: stamp,
});

describe("seating algorithm", () => {
  it("subtracts reserved seats from capacity", () =>
    expect(effectiveCapacity(table("t1", 10, "family", 3))).toBe(7));
  it("places largest households first using best fit", () => {
    const result = generateSeating(
      [table("t1", 10), table("t2", 6)],
      [household("h1", 6), household("h2", 4)],
      [guest("h1"), guest("h2")],
      [],
    );
    expect(result.assignments.map((x) => [x.householdId, x.tableId])).toEqual([
      ["h1", "t2"],
      ["h2", "t1"],
    ]);
  });
  it("respects compatible groups", () => {
    const result = generateSeating(
      [table("t1", 8, "friends"), table("t2", 8, "family")],
      [household("h1", 4, "family")],
      [guest("h1")],
      [],
    );
    expect(result.assignments[0].tableId).toBe("t2");
  });
  it("preserves locked assignments", () => {
    const locked: SeatingAssignment = {
      id: "a1",
      householdId: "h1",
      tableId: "t1",
      seatCount: 4,
      assignmentType: "manual",
      locked: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const result = generateSeating(
      [table("t1", 6)],
      [household("h1", 4)],
      [guest("h1")],
      [locked],
    );
    expect(result.assignments).toEqual([locked]);
  });
  it("never partially seats an oversized household", () => {
    const result = generateSeating(
      [table("t1", 4)],
      [household("h1", 5)],
      [guest("h1")],
      [],
    );
    expect(result.assignments).toHaveLength(0);
    expect(result.conflicts.some((x) => x.code === "HOUSEHOLD_TOO_LARGE")).toBe(
      true,
    );
  });
  it("reports insufficient total capacity", () => {
    const result = generateSeating(
      [table("t1", 2)],
      [household("h1", 3)],
      [guest("h1")],
      [],
    );
    expect(
      result.conflicts.some((x) => x.code === "INSUFFICIENT_TOTAL_CAPACITY"),
    ).toBe(true);
  });
  it("excludes pending unless provisional and excludes declined", () => {
    const pending = household("h1", 2, "family", ["g1"]);
    expect(
      generateSeating([table("t1", 4)], [pending], [guest("g1", "pending")], [])
        .assignments,
    ).toHaveLength(0);
    expect(
      generateSeating(
        [table("t1", 4)],
        [pending],
        [guest("g1", "pending")],
        [],
        true,
      ).assignments,
    ).toHaveLength(1);
    expect(
      generateSeating(
        [table("t1", 4)],
        [pending],
        [guest("g1", "declined")],
        [],
        true,
      ).assignments,
    ).toHaveLength(0);
  });
  it("detects duplicate locked assignments", () => {
    const locked = (id: string): SeatingAssignment => ({
      id,
      householdId: "h1",
      tableId: "t1",
      seatCount: 1,
      assignmentType: "manual",
      locked: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const result = generateSeating(
      [table("t1", 4)],
      [household("h1", 1)],
      [guest("h1")],
      [locked("a1"), locked("a2")],
    );
    expect(
      result.conflicts.some((x) => x.code === "DUPLICATE_ASSIGNMENT"),
    ).toBe(true);
  });
  it("is deterministic and does not mutate inputs", () => {
    const tables = [table("t2", 8), table("t1", 8)],
      households = [household("h2", 2), household("h1", 3)],
      before = JSON.stringify({ tables, households });
    const first = generateSeating(
        tables,
        households,
        [guest("h1"), guest("h2")],
        [],
      ),
      second = generateSeating(
        tables,
        households,
        [guest("h1"), guest("h2")],
        [],
      );
    expect(first).toEqual(second);
    expect(JSON.stringify({ tables, households })).toBe(before);
  });
});
