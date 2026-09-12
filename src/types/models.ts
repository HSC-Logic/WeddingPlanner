export type Priority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "in-progress" | "completed";
export type RsvpStatus = "pending" | "confirmed" | "declined";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Wedding {
  id: "profile";
  partnerOne: string;
  partnerTwo: string;
  date: string;
  time?: string;
  venue?: string;
  expectedGuests: number;
  budgetCents: number;
  currency: string;
  color: string;
}

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface Task extends BaseRecord {
  title: string;
  category: string;
  notes: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  completedAt?: string;
}
export interface Expense extends BaseRecord {
  description: string;
  category: string;
  vendorId?: string;
  estimatedCents: number;
  actualCents: number;
  paidCents: number;
  deadline: string;
  notes: string;
}
export interface Guest extends BaseRecord {
  name: string;
  group: "partner-one" | "partner-two" | "mutual";
  phone: string;
  email: string;
  attendees: number;
  invitation: "not-sent" | "sent";
  rsvp: RsvpStatus;
  meal: string;
  table: string;
  notes: string;
}
export interface Vendor extends BaseRecord {
  name: string;
  category: string;
  contact: string;
  phone: string;
  email: string;
  website: string;
  estimatedCents: number;
  finalCents: number;
  depositCents: number;
  deadline: string;
  status: "researching" | "contacted" | "shortlisted" | "booked" | "cancelled";
  notes: string;
  expenseId?: string;
}
export interface TimelineItem extends BaseRecord {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  responsible: string;
  notes: string;
  order: number;
}
export interface Note extends BaseRecord {
  title: string;
  content: string;
  category: string;
  pinned: boolean;
}
export interface SeatingTable extends BaseRecord {
  name: string;
  group: string;
  capacity: number;
  reservedSeats: number;
  locked: boolean;
  shape: "round" | "rectangle" | "custom";
  notes: string;
  displayOrder: number;
}
export interface Household extends BaseRecord {
  name: string;
  guestIds: string[];
  maximumInvited: number;
  confirmedAttendees: number;
  preferredGroup: string;
  keepTogether: boolean;
  lockedTableId?: string;
  notes: string;
}
export interface SeatingAssignment extends BaseRecord {
  guestId?: string;
  householdId?: string;
  tableId: string;
  seatCount: number;
  assignmentType: "automatic" | "manual";
  locked: boolean;
}

export interface AppData {
  halls: import("../features/hall/model").Hall[];
  wedding?: Wedding;
  tasks: Task[];
  expenses: Expense[];
  guests: Guest[];
  vendors: Vendor[];
  timeline: TimelineItem[];
  notes: Note[];
  tables: SeatingTable[];
  households: Household[];
  assignments: SeatingAssignment[];
}

export type StoreName = Exclude<keyof AppData, "wedding"> | "wedding";
export interface Backup {
  version: 3;
  exportedAt: string;
  data: AppData;
}
