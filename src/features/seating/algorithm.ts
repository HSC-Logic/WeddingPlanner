import type {
  Guest,
  Household,
  SeatingAssignment,
  SeatingTable,
} from "../../types/models";

export type ConflictCode =
  | "INSUFFICIENT_TOTAL_CAPACITY"
  | "NO_COMPATIBLE_TABLE"
  | "HOUSEHOLD_TOO_LARGE"
  | "LOCKED_TABLE_MISSING"
  | "LOCKED_GROUP_MISMATCH"
  | "LOCKED_CAPACITY_EXCEEDED"
  | "DUPLICATE_ASSIGNMENT"
  | "DECLINED_ASSIGNED"
  | "RESERVED_EXCEEDS_CAPACITY"
  | "TABLE_OVERBOOKED";
export interface SeatingConflict {
  code: ConflictCode;
  message: string;
  subjectId: string;
  required: number;
  available: number;
  suggestion: string;
}
export interface SeatingResult {
  assignments: SeatingAssignment[];
  conflicts: SeatingConflict[];
  warnings: string[];
  utilization: {
    tableId: string;
    occupied: number;
    available: number;
    percent: number;
  }[];
}

export const effectiveCapacity = (table: SeatingTable) =>
  table.capacity - table.reservedSeats;
const conflict = (
  code: ConflictCode,
  message: string,
  subjectId: string,
  required: number,
  available: number,
  suggestion: string,
): SeatingConflict => ({
  code,
  message,
  subjectId,
  required,
  available,
  suggestion,
});

export function generateSeating(
  tables: readonly SeatingTable[],
  households: readonly Household[],
  guests: readonly Guest[],
  existing: readonly SeatingAssignment[],
  provisional = false,
): SeatingResult {
  const sortedTables = [...tables].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
  );
  const guestMap = new Map(guests.map((guest) => [guest.id, guest]));
  const tableMap = new Map(sortedTables.map((table) => [table.id, table]));
  const householdMap = new Map(households.map((item) => [item.id, item]));
  const conflicts: SeatingConflict[] = [];
  const warnings: string[] = [];
  const occupied = new Map(sortedTables.map((table) => [table.id, 0]));
  const assignments: SeatingAssignment[] = [];
  const assignedSubjects = new Set<string>();

  for (const table of sortedTables)
    if (table.reservedSeats > table.capacity)
      conflicts.push(
        conflict(
          "RESERVED_EXCEEDS_CAPACITY",
          `${table.name} reserves more seats than its capacity.`,
          table.id,
          table.reservedSeats,
          table.capacity,
          "Reduce reserved seats or increase capacity.",
        ),
      );

  const locked = existing
    .filter((item) => item.locked)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const item of locked) {
    const subject = item.householdId
      ? `h:${item.householdId}`
      : `g:${item.guestId}`;
    if (assignedSubjects.has(subject)) {
      conflicts.push(
        conflict(
          "DUPLICATE_ASSIGNMENT",
          "Guest or household has more than one locked assignment.",
          item.householdId ?? item.guestId ?? "",
          item.seatCount,
          0,
          "Remove duplicate assignments.",
        ),
      );
      continue;
    }
    const table = tableMap.get(item.tableId);
    if (!table) {
      conflicts.push(
        conflict(
          "LOCKED_TABLE_MISSING",
          "Locked assignment references a missing table.",
          item.householdId ?? item.guestId ?? "",
          item.seatCount,
          0,
          "Choose an existing table.",
        ),
      );
      continue;
    }
    const household = item.householdId
      ? householdMap.get(item.householdId)
      : undefined;
    if (
      household?.preferredGroup &&
      table.group &&
      household.preferredGroup !== table.group
    ) {
      conflicts.push(
        conflict(
          "LOCKED_GROUP_MISMATCH",
          `${household.name} is locked to an incompatible table group.`,
          household.id,
          item.seatCount,
          effectiveCapacity(table),
          "Unlock it or use a matching table.",
        ),
      );
      continue;
    }
    const guest = item.guestId ? guestMap.get(item.guestId) : undefined;
    if (guest?.rsvp === "declined") {
      conflicts.push(
        conflict(
          "DECLINED_ASSIGNED",
          `${guest.name} declined but has a seat.`,
          guest.id,
          item.seatCount,
          0,
          "Remove the assignment.",
        ),
      );
      continue;
    }
    const available = effectiveCapacity(table) - (occupied.get(table.id) ?? 0);
    if (item.seatCount > available) {
      conflicts.push(
        conflict(
          "LOCKED_CAPACITY_EXCEEDED",
          `Locked assignment overbooks ${table.name}.`,
          item.householdId ?? item.guestId ?? "",
          item.seatCount,
          available,
          "Increase capacity or unlock the assignment.",
        ),
      );
      continue;
    }
    assignments.push({ ...item });
    assignedSubjects.add(subject);
    occupied.set(table.id, (occupied.get(table.id) ?? 0) + item.seatCount);
  }

  const eligible = households
    .filter((household) => !assignedSubjects.has(`h:${household.id}`))
    .map((household) => {
      const members = household.guestIds
        .map((id) => guestMap.get(id))
        .filter(Boolean) as Guest[];
      const hasConfirmed = members.some((guest) => guest.rsvp === "confirmed");
      const hasPending = members.some((guest) => guest.rsvp === "pending");
      const seats = hasConfirmed
        ? household.confirmedAttendees
        : provisional && hasPending
          ? household.maximumInvited
          : 0;
      return { household, seats };
    })
    .filter((item) => item.seats > 0)
    .sort(
      (a, b) =>
        b.seats - a.seats ||
        a.household.preferredGroup.localeCompare(b.household.preferredGroup) ||
        a.household.id.localeCompare(b.household.id),
    );
  const householdGuestIds = new Set(
    households.flatMap((item) => item.guestIds),
  );
  const individualGuests = guests
    .filter(
      (guest) =>
        !householdGuestIds.has(guest.id) &&
        !assignedSubjects.has(`g:${guest.id}`) &&
        (guest.rsvp === "confirmed" ||
          (provisional && guest.rsvp === "pending")),
    )
    .sort((a, b) => b.attendees - a.attendees || a.id.localeCompare(b.id));

  const requiredTotal =
    eligible.reduce((sum, item) => sum + item.seats, 0) +
    individualGuests.reduce((sum, guest) => sum + guest.attendees, 0) +
    assignments.reduce((sum, item) => sum + item.seatCount, 0);
  const totalCapacity = sortedTables.reduce(
    (sum, table) => sum + Math.max(0, effectiveCapacity(table)),
    0,
  );
  if (requiredTotal > totalCapacity)
    conflicts.push(
      conflict(
        "INSUFFICIENT_TOTAL_CAPACITY",
        "Confirmed attendees exceed total effective seating capacity.",
        "all",
        requiredTotal,
        totalCapacity,
        "Add tables, increase capacity, or reduce reserved seats.",
      ),
    );

  for (const { household, seats } of eligible) {
    const compatible = sortedTables.filter(
      (table) =>
        !table.locked &&
        (!household.preferredGroup ||
          !table.group ||
          table.group === household.preferredGroup),
    );
    if (!compatible.length) {
      conflicts.push(
        conflict(
          "NO_COMPATIBLE_TABLE",
          `No table matches ${household.name}'s preferred group.`,
          household.id,
          seats,
          0,
          "Add a compatible table or change preferred group.",
        ),
      );
      continue;
    }
    const max = Math.max(
      ...compatible.map((table) => effectiveCapacity(table)),
    );
    if (seats > max) {
      conflicts.push(
        conflict(
          "HOUSEHOLD_TOO_LARGE",
          `${household.name} cannot fit together at any compatible table.`,
          household.id,
          seats,
          max,
          "Add a larger table or seat this household manually.",
        ),
      );
      continue;
    }
    const candidates = compatible
      .map((table) => ({
        table,
        remaining: effectiveCapacity(table) - (occupied.get(table.id) ?? 0),
      }))
      .filter((item) => item.remaining >= seats)
      .sort(
        (a, b) =>
          a.remaining - seats - (b.remaining - seats) ||
          a.table.displayOrder - b.table.displayOrder ||
          a.table.id.localeCompare(b.table.id),
      );
    const chosen = candidates[0];
    if (!chosen) {
      conflicts.push(
        conflict(
          "NO_COMPATIBLE_TABLE",
          `${household.name} cannot fit in remaining compatible seats.`,
          household.id,
          seats,
          Math.max(
            0,
            ...compatible.map(
              (table) =>
                effectiveCapacity(table) - (occupied.get(table.id) ?? 0),
            ),
          ),
          "Rearrange households or add capacity.",
        ),
      );
      continue;
    }
    assignments.push({
      id: `auto-${household.id}`,
      householdId: household.id,
      tableId: chosen.table.id,
      seatCount: seats,
      assignmentType: "automatic",
      locked: false,
      createdAt: "automatic",
      updatedAt: "automatic",
    });
    assignedSubjects.add(`h:${household.id}`);
    occupied.set(chosen.table.id, (occupied.get(chosen.table.id) ?? 0) + seats);
  }

  for (const guest of individualGuests) {
    const seats = guest.attendees;
    const candidates = sortedTables
      .filter(
        (table) =>
          !table.locked && (!table.group || table.group === guest.group),
      )
      .map((table) => ({
        table,
        remaining: effectiveCapacity(table) - (occupied.get(table.id) ?? 0),
      }))
      .filter((item) => item.remaining >= seats)
      .sort(
        (a, b) =>
          a.remaining - seats - (b.remaining - seats) ||
          a.table.displayOrder - b.table.displayOrder ||
          a.table.id.localeCompare(b.table.id),
      );
    const chosen = candidates[0];
    if (!chosen) {
      conflicts.push(
        conflict(
          "NO_COMPATIBLE_TABLE",
          `${guest.name} cannot fit in a compatible table.`,
          guest.id,
          seats,
          Math.max(
            0,
            ...sortedTables.map(
              (table) =>
                effectiveCapacity(table) - (occupied.get(table.id) ?? 0),
            ),
          ),
          "Add compatible capacity or assign this guest manually.",
        ),
      );
      continue;
    }
    assignments.push({
      id: `auto-guest-${guest.id}`,
      guestId: guest.id,
      tableId: chosen.table.id,
      seatCount: seats,
      assignmentType: "automatic",
      locked: false,
      createdAt: "automatic",
      updatedAt: "automatic",
    });
    occupied.set(chosen.table.id, (occupied.get(chosen.table.id) ?? 0) + seats);
  }

  const utilization = sortedTables.map((table) => {
    const available = Math.max(0, effectiveCapacity(table));
    const used = occupied.get(table.id) ?? 0;
    if (used > available)
      conflicts.push(
        conflict(
          "TABLE_OVERBOOKED",
          `${table.name} is overbooked.`,
          table.id,
          used,
          available,
          "Move an assignment or increase capacity.",
        ),
      );
    return {
      tableId: table.id,
      occupied: used,
      available,
      percent: available ? Math.round((used / available) * 100) : 0,
    };
  });
  if (!provisional && guests.some((guest) => guest.rsvp === "pending"))
    warnings.push("Pending RSVP guests were excluded.");
  return { assignments, conflicts, warnings, utilization };
}
