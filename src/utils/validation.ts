import { z } from "zod";
import { validateHalls } from "../features/hall/model";
import type { AppData } from "../types/models";

const MAX_RECORDS = 10_000;
const id = z.string().min(1).max(100);
const text = z.string().max(5_000);
const shortText = z.string().max(500);
const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const date = z
  .string()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !value || !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));
const time = z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/);
const stamp = z.string().max(100);
const base = { id, createdAt: stamp, updatedAt: stamp };

const weddingSchema = z
  .object({
    id: z.literal("profile"),
    partnerOne: shortText.min(1),
    partnerTwo: shortText.min(1),
    date: date.refine(Boolean),
    time: time.optional(),
    venue: shortText.optional(),
    expectedGuests: nonNegativeInteger.max(100_000),
    budgetCents: nonNegativeInteger,
    currency: z.enum(["LKR", "USD", "GBP", "EUR", "AUD", "INR", "SGD"]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  })
  .strict();
const taskSchema = z
  .object({
    ...base,
    title: shortText.min(1),
    category: shortText,
    notes: text,
    dueDate: date,
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["pending", "in-progress", "completed"]),
    completedAt: stamp.optional(),
  })
  .strict();
const expenseSchema = z
  .object({
    ...base,
    description: shortText.min(1),
    category: shortText,
    vendorId: id.optional(),
    estimatedCents: nonNegativeInteger,
    actualCents: nonNegativeInteger,
    paidCents: nonNegativeInteger,
    deadline: date,
    notes: text,
  })
  .strict()
  .refine((value) => value.paidCents <= value.actualCents, {
    message: "Expense payment exceeds actual cost.",
  });
const guestSchema = z
  .object({
    ...base,
    name: shortText.min(1),
    group: z.enum(["partner-one", "partner-two", "mutual"]),
    phone: shortText,
    email: shortText,
    attendees: z.number().int().min(1).max(1_000),
    invitation: z.enum(["not-sent", "sent"]),
    rsvp: z.enum(["pending", "confirmed", "declined"]),
    meal: shortText,
    table: shortText,
    notes: text,
  })
  .strict();
const vendorSchema = z
  .object({
    ...base,
    name: shortText.min(1),
    category: shortText,
    contact: shortText,
    phone: shortText,
    email: shortText,
    website: shortText,
    estimatedCents: nonNegativeInteger,
    finalCents: nonNegativeInteger,
    depositCents: nonNegativeInteger,
    deadline: date,
    status: z.enum([
      "researching",
      "contacted",
      "shortlisted",
      "booked",
      "cancelled",
    ]),
    notes: text,
    expenseId: id.optional(),
  })
  .strict()
  .refine((value) => value.depositCents <= value.finalCents, {
    message: "Vendor deposit exceeds final cost.",
  });
const timelineSchema = z
  .object({
    ...base,
    title: shortText.min(1),
    date: date.refine(Boolean),
    startTime: time.refine(Boolean),
    endTime: time,
    location: shortText,
    responsible: shortText,
    notes: text,
    order: z.number().int().min(-MAX_RECORDS).max(MAX_RECORDS),
  })
  .strict()
  .refine((value) => !value.endTime || value.endTime > value.startTime, {
    message: "Timeline end time must follow start time.",
  });
const noteSchema = z
  .object({
    ...base,
    title: shortText.min(1),
    content: text.min(1),
    category: shortText,
    pinned: z.boolean(),
  })
  .strict();
const tableSchema = z
  .object({
    ...base,
    name: shortText.min(1),
    group: shortText,
    capacity: z.number().int().min(1).max(1_000),
    reservedSeats: z.number().int().min(0).max(1_000),
    locked: z.boolean(),
    shape: z.enum(["round", "rectangle", "custom"]),
    notes: text,
    displayOrder: z.number().int().min(-MAX_RECORDS).max(MAX_RECORDS),
  })
  .strict()
  .refine((value) => value.reservedSeats <= value.capacity, {
    message: "Reserved seats exceed table capacity.",
  });
const householdSchema = z
  .object({
    ...base,
    name: shortText.min(1),
    guestIds: z.array(id).max(1_000),
    maximumInvited: z.number().int().min(0).max(1_000),
    confirmedAttendees: z.number().int().min(0).max(1_000),
    preferredGroup: shortText,
    keepTogether: z.boolean(),
    lockedTableId: id.optional(),
    notes: text,
  })
  .strict()
  .refine((value) => value.confirmedAttendees <= value.maximumInvited, {
    message: "Household confirmations exceed its invitation limit.",
  });
const assignmentSchema = z
  .object({
    ...base,
    guestId: id.optional(),
    householdId: id.optional(),
    tableId: id,
    seatCount: z.number().int().min(1).max(1_000),
    assignmentType: z.enum(["automatic", "manual"]),
    locked: z.boolean(),
  })
  .strict()
  .refine((value) => Boolean(value.guestId) !== Boolean(value.householdId), {
    message: "Assignment must reference exactly one guest or household.",
  });

const list = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(MAX_RECORDS);
const dataSchema = z
  .object({
    wedding: weddingSchema.optional(),
    tasks: list(taskSchema),
    expenses: list(expenseSchema),
    guests: list(guestSchema),
    vendors: list(vendorSchema),
    timeline: list(timelineSchema),
    notes: list(noteSchema),
    tables: list(tableSchema),
    households: list(householdSchema),
    assignments: list(assignmentSchema),
    halls: z.unknown(),
  })
  .strict();

function assertUnique(data: AppData) {
  for (const [name, records] of Object.entries(data)) {
    if (!Array.isArray(records)) continue;
    const ids = records.map((record: { id: string }) => record.id);
    if (new Set(ids).size !== ids.length)
      throw new Error(`Duplicate ID in ${name}.`);
  }
}

export function validateAppData(input: unknown): AppData {
  const parsed = dataSchema.parse(input) as AppData;
  parsed.halls = validateHalls(
    parsed.halls,
    new Set(parsed.tables.map((table) => table.id)),
  );
  assertUnique(parsed);
  const vendorIds = new Set(parsed.vendors.map((vendor) => vendor.id));
  const expenseIds = new Set(parsed.expenses.map((expense) => expense.id));
  for (const expense of parsed.expenses)
    if (expense.vendorId && !vendorIds.has(expense.vendorId))
      throw new Error("Expense references a missing vendor.");
  for (const vendor of parsed.vendors)
    if (vendor.expenseId && !expenseIds.has(vendor.expenseId))
      throw new Error("Vendor references a missing expense.");
  const guests = new Map(parsed.guests.map((guest) => [guest.id, guest]));
  const households = new Map(
    parsed.households.map((household) => [household.id, household]),
  );
  const tables = new Map(parsed.tables.map((table) => [table.id, table]));
  const householdGuests = new Set<string>();
  for (const household of parsed.households) {
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
  const assignedSubjects = new Set<string>();
  const occupied = new Map<string, number>();
  for (const assignment of parsed.assignments) {
    const table = tables.get(assignment.tableId);
    const guest = assignment.guestId
      ? guests.get(assignment.guestId)
      : undefined;
    if (!table) throw new Error("Assignment references a missing table.");
    if (assignment.guestId && !guest)
      throw new Error("Assignment references a missing guest.");
    if (assignment.householdId && !households.has(assignment.householdId))
      throw new Error("Assignment references a missing household.");
    if (guest?.rsvp === "declined")
      throw new Error("Declined guest has a seating assignment.");
    const subject = assignment.householdId
      ? `h:${assignment.householdId}`
      : `g:${assignment.guestId}`;
    if (assignedSubjects.has(subject))
      throw new Error("Guest or household is assigned more than once.");
    assignedSubjects.add(subject);
    occupied.set(
      table.id,
      (occupied.get(table.id) ?? 0) + assignment.seatCount,
    );
  }
  for (const [tableId, seats] of occupied) {
    const table = tables.get(tableId)!;
    if (seats > table.capacity - table.reservedSeats)
      throw new Error("Assignments exceed effective table capacity.");
  }
  return parsed;
}
