import { validateAppData } from "./validation";
import type {
  AppData,
  Backup,
  Expense,
  Guest,
  SeatingAssignment,
  SeatingTable,
  Task,
  Vendor,
} from "../types/models";

export const emptyData = (): AppData => ({
  halls: [],
  tasks: [],
  expenses: [],
  guests: [],
  vendors: [],
  timeline: [],
  notes: [],
  tables: [],
  households: [],
  assignments: [],
});
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const cents = (value: FormDataEntryValue | null) =>
  Math.round(Number(String(value || 0).replaceAll(",", "")) * 100);
export const money = (value: number, currency = "LKR") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    value / 100,
  );
export const displayDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(`${value}T12:00:00`),
      )
    : "Not set";

export const localDate = (value = new Date()) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
export const localDateTimeMinute = (value = new Date()) =>
  `${localDate(value)}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
export function addCalendarDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return result.toISOString().slice(0, 10);
}

export function daysUntil(date: string, today = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  return Math.ceil(
    (target -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86_400_000,
  );
}

export const taskStats = (tasks: Task[]) => ({
  complete: tasks.filter((task) => task.status === "completed").length,
  pending: tasks.filter((task) => task.status !== "completed").length,
  percent: tasks.length
    ? Math.round(
        (tasks.filter((task) => task.status === "completed").length /
          tasks.length) *
          100,
      )
    : 0,
});

export function dashboardTasks(tasks: Task[], today = localDate()) {
  const dated = tasks
    .filter((task) => task.status !== "completed" && task.dueDate)
    .sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
  return {
    overdue: dated.filter((task) => task.dueDate < today),
    upcoming: dated.filter((task) => task.dueDate >= today),
  };
}

export function seatingDashboardState({
  confirmed,
  tables,
  assignments,
  conflicts,
}: {
  confirmed: number;
  tables: SeatingTable[];
  assignments: SeatingAssignment[];
  conflicts: number;
}) {
  const capacity = tables.reduce(
    (sum, table) => sum + Math.max(0, table.capacity - table.reservedSeats),
    0,
  );
  const assigned = assignments.reduce(
    (sum, assignment) => sum + assignment.seatCount,
    0,
  );
  if (confirmed === 0)
    return {
      capacity,
      assigned,
      message: "Add confirmed guests to begin seating",
    };
  if (tables.length === 0)
    return { capacity, assigned, message: "Create reception tables to begin" };
  if (conflicts > 0)
    return {
      capacity,
      assigned,
      message: `${conflicts} seating ${conflicts === 1 ? "conflict needs" : "conflicts need"} attention`,
    };
  if (assigned < confirmed)
    return {
      capacity,
      assigned,
      message: `${confirmed - assigned} confirmed attendees need seats`,
    };
  return { capacity, assigned, message: "Confirmed guests are seated" };
}

export const budgetStats = (expenses: Expense[], budgetCents = 0) => {
  const estimated = expenses.reduce(
    (sum, item) => sum + item.estimatedCents,
    0,
  );
  const actual = expenses.reduce((sum, item) => sum + item.actualCents, 0);
  const paid = expenses.reduce((sum, item) => sum + item.paidCents, 0);
  return {
    estimated,
    actual,
    paid,
    outstanding: Math.max(0, actual - paid),
    remaining: budgetCents - actual,
  };
};

export const paymentStatus = (
  expense: Expense,
): "unpaid" | "partial" | "paid" =>
  expense.paidCents <= 0
    ? "unpaid"
    : expense.paidCents >= expense.actualCents
      ? "paid"
      : "partial";
export const vendorBalance = (vendor: Vendor) =>
  Math.max(0, vendor.finalCents - vendor.depositCents);
export const guestStats = (guests: Guest[]) => ({
  total: guests.reduce((sum, guest) => sum + guest.attendees, 0),
  confirmed: guests
    .filter((guest) => guest.rsvp === "confirmed")
    .reduce((sum, guest) => sum + guest.attendees, 0),
  declined: guests
    .filter((guest) => guest.rsvp === "declined")
    .reduce((sum, guest) => sum + guest.attendees, 0),
  pending: guests
    .filter((guest) => guest.rsvp === "pending")
    .reduce((sum, guest) => sum + guest.attendees, 0),
});

const dangerous = /^[=+\-@\t\r]/;
export const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (dangerous.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export const toCsv = (rows: readonly object[]) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [
    keys.map(csvCell).join(","),
    ...rows.map((row) =>
      keys
        .map((key) => csvCell((row as Record<string, unknown>)[key]))
        .join(","),
    ),
  ].join("\n");
};
export const download = (
  name: string,
  content: string,
  type = "text/plain",
) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
};

export const createBackup = (data: AppData): Backup => ({
  version: 3,
  exportedAt: now(),
  data,
});
export function parseBackup(text: string): Backup {
  if (text.length > 5_000_000)
    throw new Error("Backup exceeds the 5 MB limit.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object")
    throw new Error("Backup is not an object.");
  if (
    Object.keys(value).some(
      (key) => !["version", "exportedAt", "data"].includes(key),
    )
  )
    throw new Error("Backup contains unexpected properties.");
  const backup = value as Partial<Backup>;
  if (
    ![1, 2, 3].includes(Number(backup.version)) ||
    !backup.data ||
    typeof backup.data !== "object"
  )
    throw new Error("Unsupported or malformed backup.");
  const data = backup.data as Partial<AppData>;
  for (const key of [
    "tasks",
    "expenses",
    "guests",
    "vendors",
    "timeline",
    "notes",
  ] as const)
    if (!Array.isArray(data[key])) throw new Error(`Backup is missing ${key}.`);
  if (
    data.wedding &&
    (typeof data.wedding.partnerOne !== "string" ||
      typeof data.wedding.date !== "string")
  )
    throw new Error("Wedding profile is invalid.");
  const normalized = validateAppData({
    ...data,
    halls: data.halls ?? [],
    tables: data.tables ?? [],
    households: data.households ?? [],
    assignments: data.assignments ?? [],
  });
  validateSeatingReferences(normalized);
  return {
    version: 3,
    exportedAt: String(backup.exportedAt ?? now()),
    data: normalized,
  };
}

export function validateSeatingReferences(data: AppData) {
  const guests = new Set(data.guests.map((item) => item.id));
  const households = new Set(data.households.map((item) => item.id));
  const tables = new Map(data.tables.map((item) => [item.id, item]));
  const householdGuests = new Set<string>();
  for (const household of data.households) {
    for (const guestId of household.guestIds) {
      if (!guests.has(guestId))
        throw new Error("Household references a missing guest.");
      if (householdGuests.has(guestId))
        throw new Error("A guest belongs to multiple households.");
      householdGuests.add(guestId);
    }
    if (household.lockedTableId && !tables.has(household.lockedTableId))
      throw new Error("Household references a missing locked table.");
  }
  const subjects = new Set<string>();
  const occupied = new Map<string, number>();
  for (const assignment of data.assignments) {
    const table = tables.get(assignment.tableId);
    if (!table) throw new Error("Assignment references a missing table.");
    if (assignment.householdId && !households.has(assignment.householdId))
      throw new Error("Assignment references a missing household.");
    if (assignment.guestId && !guests.has(assignment.guestId))
      throw new Error("Assignment references a missing guest.");
    const subject = assignment.householdId
      ? `h:${assignment.householdId}`
      : `g:${assignment.guestId}`;
    if (subjects.has(subject))
      throw new Error("Guest or household is assigned more than once.");
    subjects.add(subject);
    occupied.set(
      table.id,
      (occupied.get(table.id) ?? 0) + assignment.seatCount,
    );
  }
  for (const [tableId, seats] of occupied) {
    const table = tables.get(tableId)!;
    if (table.reservedSeats > table.capacity)
      throw new Error("Reserved seats exceed table capacity.");
    if (seats > table.capacity - table.reservedSeats)
      throw new Error("Assignments exceed effective table capacity.");
  }
}

export function validateEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function safeWebsite(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
