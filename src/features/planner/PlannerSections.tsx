import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type React from "react";
import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Download,
  Heart,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { clearAll, replaceAll } from "../../database/db";
import type {
  AppData,
  Expense,
  Guest,
  Household,
  Note,
  SeatingTable,
  StoreName,
  Task,
  TimelineItem,
  Vendor,
} from "../../types/models";
import {
  effectiveCapacity,
  generateSeating,
  type SeatingConflict,
} from "../seating/algorithm";
import {
  budgetStats,
  cents,
  createBackup,
  dashboardTasks,
  daysUntil,
  displayDate,
  download,
  guestStats,
  localDate,
  localDateTimeMinute,
  money,
  now,
  parseBackup,
  paymentStatus,
  safeWebsite,
  seatingDashboardState,
  taskStats,
  toCsv,
  uid,
  validateEmail,
  vendorBalance,
} from "../../utils/domain";

const taskCategories = [
  "Venue",
  "Catering",
  "Photography and videography",
  "Clothing",
  "Jewellery",
  "Invitations",
  "Decorations",
  "Entertainment",
  "Transport",
  "Legal documents",
  "Ceremony",
  "Reception",
  "Honeymoon",
];
const budgetCategories = [
  "Venue",
  "Catering",
  "Photography",
  "Videography",
  "Clothing",
  "Jewellery",
  "Decorations",
  "Entertainment",
  "Invitations",
  "Transport",
  "Gifts",
  "Legal fees",
  "Honeymoon",
  "Other",
];

export function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    name: string;
  },
) {
  const { label, ...rest } = props;
  return (
    <label>
      {label}
      <input {...rest} />
    </label>
  );
}

export function MoneyField({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: number;
  required?: boolean;
}) {
  const [value, setValue] = useState(() =>
    defaultValue === undefined
      ? ""
      : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
          defaultValue,
        ),
  );
  const format = (input: string) => {
    const cleaned = input.replace(/[^\d.]/g, "");
    const [whole = "", ...decimalParts] = cleaned.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decimalParts.length
      ? `${grouped}.${decimalParts.join("").slice(0, 2)}`
      : grouped;
  };
  return (
    <label>
      {label}
      <input
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(format(event.target.value))}
        required={required}
      />
    </label>
  );
}
export function PageTitle({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog
      ?.querySelector<HTMLElement>(
        "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])",
      )
      ?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key !== "Tab") return;
          const controls = [
            ...dialogRef.current!.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
            ),
          ];
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon" onClick={close} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty">
      <Heart />
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

export function Dashboard({ data }: { data: AppData }) {
  const wedding = data.wedding!,
    countdown = daysUntil(wedding.date),
    tasks = taskStats(data.tasks),
    budget = budgetStats(data.expenses, wedding.budgetCents),
    guests = guestStats(data.guests);
  const seating = generateSeating(
    data.tables,
    data.households,
    data.guests,
    data.assignments,
  );
  const seatingCapacity = data.tables.reduce(
    (sum, table) => sum + Math.max(0, effectiveCapacity(table)),
    0,
  );
  const seatingAssigned = data.assignments.reduce(
    (sum, item) => sum + item.seatCount,
    0,
  );
  const countdownText =
    countdown === 0
      ? "Today is the day"
      : countdown < 0
        ? `${Math.abs(countdown)} days since your wedding`
        : `${countdown} days to go`;
  const taskDates = dashboardTasks(data.tasks);
  const upcoming = taskDates.upcoming.slice(0, 4);
  const overdue = taskDates.overdue.slice(0, 4);
  const seatingState = seatingDashboardState({
    confirmed: guests.confirmed,
    tables: data.tables,
    assignments: data.assignments,
    conflicts: seating.conflicts.length,
  });
  const nextActivity = [...data.timeline]
    .filter((x) => `${x.date}T${x.startTime}` >= localDateTimeMinute())
    .sort((a, b) =>
      `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
    )[0];
  const chart = [
    { name: "Estimated", value: budget.estimated / 100 },
    { name: "Actual", value: budget.actual / 100 },
    { name: "Paid", value: budget.paid / 100 },
  ];
  return (
    <>
      <section
        className="hero-card"
        style={{ "--accent": wedding.color } as React.CSSProperties}
      >
        <div>
          <p>
            {displayDate(wedding.date)}
            {wedding.venue ? ` · ${wedding.venue}` : ""}
          </p>
          <h2>
            {wedding.partnerOne} <em>&</em> {wedding.partnerTwo}
          </h2>
          <span>{countdownText}</span>
        </div>
        <div
          className="ring"
          style={
            { "--progress": `${tasks.percent * 3.6}deg` } as React.CSSProperties
          }
        >
          <strong>{tasks.percent}%</strong>
          <small>planned</small>
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          label="Checklist"
          value={`${tasks.complete}/${data.tasks.length}`}
          sub={`${tasks.pending} tasks remaining`}
        />
        <Stat
          label="Remaining budget"
          value={money(budget.remaining, wedding.currency)}
          sub={`${money(budget.paid, wedding.currency)} paid`}
        />
        <Stat
          label="Invited guests"
          value={guests.total}
          sub={`${guests.confirmed} confirmed · ${guests.pending} pending`}
        />
        <Stat
          label="Actual expenses"
          value={money(budget.actual, wedding.currency)}
          sub={`${money(budget.outstanding, wedding.currency)} outstanding`}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h3>Budget at a glance</h3>
          {data.expenses.length ? (
            <div className="chart" aria-label="Budget comparison chart">
              {chart.map((item) => {
                const maximum = Math.max(
                  1,
                  ...chart.map((entry) => entry.value),
                );
                return (
                  <div className="chart-column" key={item.name}>
                    <span>{money(item.value * 100, wedding.currency)}</span>
                    <i
                      style={{
                        height: `${Math.max(2, (item.value / maximum) * 160)}px`,
                        background: wedding.color,
                      }}
                    />
                    <strong>{item.name}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="No expenses yet"
              copy="Add estimates to see budget progress here."
            />
          )}
        </section>
        <section className="panel">
          {overdue.length > 0 && (
            <>
              <h3 className="danger-text">Overdue</h3>
              <div className="compact-list overdue-list">
                {overdue.map((task) => (
                  <div key={task.id}>
                    <span className="priority high" />
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        Due {displayDate(task.dueDate)} · {task.category}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <h3>Coming up</h3>
          {upcoming.length ? (
            <div className="compact-list">
              {upcoming.map((task) => (
                <div key={task.id}>
                  <span className={`priority ${task.priority}`} />{" "}
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {displayDate(task.dueDate)} · {task.category}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Clear horizon"
              copy="No pending tasks with due dates."
            />
          )}
          {nextActivity && (
            <div className="next">
              <CalendarDays />
              <div>
                <small>Next activity</small>
                <strong>{nextActivity.title}</strong>
                <span>
                  {displayDate(nextActivity.date)} at {nextActivity.startTime}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
      <section className="panel seating-dashboard">
        <div>
          <p className="eyebrow">Reception seating</p>
          <h3>{seatingState.message}</h3>
          <p>
            {data.halls.length
              ? `${data.halls.length} hall ${data.halls.length === 1 ? "space" : "spaces"} · ${data.halls.reduce((sum, hall) => sum + hall.elements.filter((element) => element.tableId).length, 0)} tables placed`
              : "No hall layout created yet"}
          </p>
        </div>
        <div>
          <strong>{seatingCapacity}</strong>
          <small>capacity</small>
        </div>
        <div>
          <strong>{seatingAssigned}</strong>
          <small>assigned</small>
        </div>
        <div>
          <strong>{Math.max(0, seatingCapacity - seatingAssigned)}</strong>
          <small>remaining</small>
        </div>
        <div>
          <strong>{seating.conflicts.length}</strong>
          <small>conflicts</small>
        </div>
        <div>
          <strong>
            {seatingCapacity
              ? Math.round((seatingAssigned / seatingCapacity) * 100)
              : 0}
            %
          </strong>
          <small>utilized</small>
        </div>
      </section>
    </>
  );
}

type Save = <T extends { id: string }>(
  store: StoreName,
  item: T,
) => Promise<boolean>;
type Remove = (
  store: Exclude<StoreName, "wedding">,
  id: string,
) => Promise<void>;

export function Checklist({
  data,
  save,
  remove,
}: {
  data: AppData;
  save: Save;
  remove: Remove;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Task | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const stats = taskStats(data.tasks);
  const tasks = data.tasks
    .filter(
      (x) =>
        x.title.toLowerCase().includes(query.toLowerCase()) &&
        (status === "all" || x.status === status),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      stamp = now();
    const saved = await save("tasks", {
      id: editing?.id ?? uid(),
      title: String(f.get("title")).trim(),
      category: String(f.get("category")),
      notes: String(f.get("notes")),
      dueDate: String(f.get("dueDate")),
      priority: String(f.get("priority")) as Task["priority"],
      status: editing?.status ?? "pending",
      completedAt: editing?.completedAt,
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setOpen(false);
      setEditing(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Wedding checklist"
        copy={`${stats.percent}% complete · ${stats.pending} still to do`}
        action={
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Add task
          </button>
        }
      />
      <div className="progress">
        <span style={{ width: `${stats.percent}%` }} />
      </div>
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            placeholder="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {tasks.length ? (
        <div className="item-list">
          {tasks.map((task) => {
            const overdue =
              task.status !== "completed" && task.dueDate < localDate();
            return (
              <article
                className={task.status === "completed" ? "item done" : "item"}
                key={task.id}
              >
                <button
                  className="icon"
                  onClick={() => {
                    setEditing(task);
                    setOpen(true);
                  }}
                  aria-label={`Edit ${task.title}`}
                >
                  <Pencil />
                </button>
                <button
                  className="complete"
                  aria-label={
                    task.status === "completed"
                      ? "Reopen task"
                      : "Complete task"
                  }
                  onClick={() =>
                    save("tasks", {
                      ...task,
                      status:
                        task.status === "completed" ? "pending" : "completed",
                      completedAt:
                        task.status === "completed" ? undefined : now(),
                      updatedAt: now(),
                    })
                  }
                >
                  <CheckCircle2 />
                </button>
                <div className="item-main">
                  <div>
                    <span className={`pill ${task.priority}`}>
                      {task.priority}
                    </span>
                    <span className="pill">{task.category}</span>
                    {overdue && <span className="pill danger">Overdue</span>}
                  </div>
                  <h3>{task.title}</h3>
                  {task.notes && <p>{task.notes}</p>}
                  <small>Due {displayDate(task.dueDate)}</small>
                </div>
                <button
                  className="icon danger-button"
                  onClick={() => remove("tasks", task.id)}
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No matching tasks"
          copy="Add a task or change your filters."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit checklist task" : "Add checklist task"}
          close={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            <Field
              name="title"
              label="Task title"
              defaultValue={editing?.title}
              required
            />
            <label>
              Category
              <select name="category" defaultValue={editing?.category}>
                {taskCategories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <Field
              name="dueDate"
              label="Due date"
              type="date"
              defaultValue={editing?.dueDate}
              required
            />
            <label>
              Priority
              <select
                name="priority"
                defaultValue={editing?.priority ?? "medium"}
              >
                <option>low</option>
                <option>medium</option>
                <option>high</option>
              </select>
            </label>
            <label>
              Notes
              <textarea name="notes" defaultValue={editing?.notes} />
            </label>
            <button className="primary">
              {editing ? "Update task" : "Save task"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Budget({
  data,
  save,
  remove,
}: {
  data: AppData;
  save: Save;
  remove: Remove;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Expense | null>(null),
    stats = budgetStats(data.expenses, data.wedding!.budgetCents),
    currency = data.wedding!.currency;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      estimated = cents(f.get("estimated")),
      actual = cents(f.get("actual")),
      paid = cents(f.get("paid"));
    if (![estimated, actual, paid].every(Number.isSafeInteger))
      return alert("Enter valid monetary amounts within supported limits.");
    if (paid > actual) return alert("Amount paid cannot exceed actual cost.");
    const stamp = now();
    const saved = await save("expenses", {
      id: editing?.id ?? uid(),
      description: String(f.get("description")).trim(),
      category: String(f.get("category")),
      estimatedCents: estimated,
      actualCents: actual,
      paidCents: paid,
      deadline: String(f.get("deadline")),
      notes: String(f.get("notes")),
      vendorId: editing?.vendorId,
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setOpen(false);
      setEditing(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Budget planner"
        copy="Amounts use exact cents to avoid rounding surprises."
        action={
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Add expense
          </button>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Wedding budget"
          value={money(data.wedding!.budgetCents, currency)}
        />
        <Stat label="Estimated" value={money(stats.estimated, currency)} />
        <Stat label="Actual" value={money(stats.actual, currency)} />
        <Stat
          label="Remaining"
          value={money(stats.remaining, currency)}
          sub={
            stats.remaining < 0
              ? "Over budget"
              : `${money(stats.outstanding, currency)} outstanding`
          }
        />
      </div>
      {data.expenses.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Actual</th>
                <th>Paid</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong>{x.description}</strong>
                    <small>
                      {x.category} · due {displayDate(x.deadline)}
                    </small>
                  </td>
                  <td>{money(x.actualCents, currency)}</td>
                  <td>{money(x.paidCents, currency)}</td>
                  <td>
                    <span className={`pill ${paymentStatus(x)}`}>
                      {paymentStatus(x)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon"
                      onClick={() => {
                        setEditing(x);
                        setOpen(true);
                      }}
                      aria-label={`Edit ${x.description}`}
                    >
                      <Pencil />
                    </button>
                    <button
                      className="icon danger-button"
                      onClick={() => remove("expenses", x.id)}
                      aria-label={`Delete ${x.description}`}
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="A calm budget starts here"
          copy="Add your first estimate or confirmed expense."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit expense" : "Add expense"}
          close={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            <Field
              name="description"
              label="Description"
              defaultValue={editing?.description}
              required
            />
            <label>
              Category
              <select name="category" defaultValue={editing?.category}>
                {budgetCategories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <MoneyField
                name="estimated"
                label="Estimated cost"
                defaultValue={
                  editing ? editing.estimatedCents / 100 : undefined
                }
                required
              />
              <MoneyField
                name="actual"
                label="Actual cost"
                defaultValue={editing ? editing.actualCents / 100 : undefined}
                required
              />
              <MoneyField
                name="paid"
                label="Amount paid"
                defaultValue={editing ? editing.paidCents / 100 : undefined}
                required
              />
              <Field
                name="deadline"
                label="Payment deadline"
                type="date"
                defaultValue={editing?.deadline}
              />
            </div>
            <label>
              Notes
              <textarea name="notes" defaultValue={editing?.notes} />
            </label>
            <button className="primary">
              {editing ? "Update expense" : "Save expense"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Guests({
  data,
  save,
  remove,
}: {
  data: AppData;
  save: Save;
  remove: Remove;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Guest | null>(null),
    [query, setQuery] = useState(""),
    stats = guestStats(data.guests);
  const partnerOne = data.wedding?.partnerOne || "Partner one";
  const partnerTwo = data.wedding?.partnerTwo || "Partner two";
  const groupLabels: Record<Guest["group"], string> = {
    "partner-one": partnerOne,
    "partner-two": partnerTwo,
    mutual: `${partnerOne} & ${partnerTwo}`,
  };
  const guests = data.guests.filter((g) =>
    [g.name, g.phone, g.email].some((v) =>
      v.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")),
      attendees = Number(f.get("attendees"));
    if (!validateEmail(email)) return alert("Enter a valid email address.");
    if (!Number.isInteger(attendees) || attendees < 1 || attendees > 1_000)
      return alert("Attendees must be a whole number from 1 to 1,000.");
    const stamp = now();
    const saved = await save("guests", {
      id: editing?.id ?? uid(),
      name: String(f.get("name")).trim(),
      group: String(f.get("group")) as Guest["group"],
      phone: String(f.get("phone")),
      email,
      attendees,
      invitation: String(f.get("invitation")) as Guest["invitation"],
      rsvp: String(f.get("rsvp")) as Guest["rsvp"],
      meal: String(f.get("meal")),
      table: String(f.get("table")),
      notes: String(f.get("notes")),
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setOpen(false);
      setEditing(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Guest list"
        copy={`${stats.total} invited · ${stats.confirmed} confirmed · ${stats.pending} pending`}
        action={
          <div className="actions">
            <button
              onClick={() =>
                download("guests.csv", toCsv(data.guests), "text/csv")
              }
            >
              <Download /> CSV
            </button>
            <button
              className="primary"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus /> Add guest
            </button>
          </div>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            placeholder="Search name, phone or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {guests.length ? (
        <div className="card-grid">
          {guests.map((g) => (
            <article className="person-card" key={g.id}>
              <div className="avatar">{g.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <h3>{g.name}</h3>
                <p>
                  {g.attendees} attendee{g.attendees === 1 ? "" : "s"} ·{" "}
                  {groupLabels[g.group]}
                </p>
                <span className={`pill ${g.rsvp}`}>{g.rsvp}</span>
                <span className="pill">invite {g.invitation}</span>
                {g.email && <small>{g.email}</small>}
              </div>
              <div className="card-actions">
                <button
                  className="icon"
                  onClick={() => {
                    setEditing(g);
                    setOpen(true);
                  }}
                  aria-label={`Edit ${g.name}`}
                >
                  <Pencil />
                </button>
                <select
                  aria-label={`RSVP for ${g.name}`}
                  value={g.rsvp}
                  onChange={(e) =>
                    save("guests", {
                      ...g,
                      rsvp: e.target.value as Guest["rsvp"],
                      updatedAt: now(),
                    })
                  }
                >
                  <option>pending</option>
                  <option>confirmed</option>
                  <option>declined</option>
                </select>
                <button
                  className="icon danger-button"
                  onClick={() => remove("guests", g.id)}
                  aria-label={`Delete ${g.name}`}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Your guest list is ready"
          copy="Add households and plus-ones with attendee counts."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit guest" : "Add guest"}
          close={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            <Field
              name="name"
              label="Full name"
              defaultValue={editing?.name}
              required
            />
            <div className="form-grid">
              <label>
                Guest of
                <select name="group" defaultValue={editing?.group}>
                  <option value="partner-one">{partnerOne}</option>
                  <option value="partner-two">{partnerTwo}</option>
                  <option value="mutual">
                    {partnerOne} &amp; {partnerTwo}
                  </option>
                </select>
              </label>
              <Field
                name="attendees"
                label="Number attending"
                type="number"
                min="1"
                defaultValue={editing?.attendees ?? "1"}
                required
              />
              <Field
                name="phone"
                label="Phone (optional)"
                type="tel"
                defaultValue={editing?.phone}
              />
              <Field
                name="email"
                label="Email (optional)"
                type="email"
                defaultValue={editing?.email}
              />
              <label>
                Invitation
                <select name="invitation" defaultValue={editing?.invitation}>
                  <option value="not-sent">Not sent</option>
                  <option value="sent">Sent</option>
                </select>
              </label>
              <label>
                RSVP
                <select name="rsvp" defaultValue={editing?.rsvp}>
                  <option>pending</option>
                  <option>confirmed</option>
                  <option>declined</option>
                </select>
              </label>
              <Field
                name="meal"
                label="Meal preference"
                defaultValue={editing?.meal}
              />
              <Field
                name="table"
                label="Table name or number"
                defaultValue={editing?.table}
              />
            </div>
            <label>
              Notes
              <textarea name="notes" defaultValue={editing?.notes} />
            </label>
            <button className="primary">
              {editing ? "Update guest" : "Save guest"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Seating({
  data,
  setData,
  save,
}: {
  data: AppData;
  setData: (data: AppData) => void;
  save: Save;
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<SeatingTable | null>(null);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [includePending, setIncludePending] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [conflicts, setConflicts] = useState<SeatingConflict[]>([]);
  const occupied = (tableId: string) =>
    data.assignments
      .filter((item) => item.tableId === tableId)
      .reduce((sum, item) => sum + item.seatCount, 0);
  const householdGuestIds = new Set(
    data.households.flatMap((item) => item.guestIds),
  );
  const confirmed =
    data.households.reduce((sum, item) => sum + item.confirmedAttendees, 0) +
    data.guests
      .filter(
        (guest) =>
          guest.rsvp === "confirmed" && !householdGuestIds.has(guest.id),
      )
      .reduce((sum, guest) => sum + guest.attendees, 0);
  const assigned = data.assignments.reduce(
    (sum, item) => sum + item.seatCount,
    0,
  );
  const capacity = data.tables.reduce(
    (sum, item) => sum + Math.max(0, effectiveCapacity(item)),
    0,
  );
  const groups = [
    ...new Set(data.tables.map((item) => item.group).filter(Boolean)),
  ];
  const visibleTables = [...data.tables]
    .filter(
      (item) =>
        (group === "all" || item.group === group) &&
        item.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const addTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const capacityValue = Number(form.get("capacity"));
    const reservedSeats = Number(form.get("reservedSeats"));
    if (
      !Number.isInteger(capacityValue) ||
      capacityValue < 1 ||
      capacityValue > 1_000 ||
      !Number.isInteger(reservedSeats) ||
      reservedSeats < 0
    )
      return alert(
        "Capacity must be 1–1,000 and reserved seats must be a whole number.",
      );
    if (reservedSeats > capacityValue)
      return alert("Reserved seats cannot exceed table capacity.");
    if (
      editingTable &&
      capacityValue - reservedSeats < occupied(editingTable.id)
    )
      return alert(
        "Effective capacity cannot be lower than existing assignments.",
      );
    const stamp = now();
    const saved = await save("tables", {
      id: editingTable?.id ?? uid(),
      name: String(form.get("name")).trim(),
      group: String(form.get("group")).trim(),
      capacity: capacityValue,
      reservedSeats,
      locked: form.get("locked") === "on",
      shape: String(form.get("shape")) as SeatingTable["shape"],
      notes: String(form.get("notes")),
      displayOrder: editingTable?.displayOrder ?? data.tables.length,
      createdAt: editingTable?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setTableOpen(false);
      setEditingTable(null);
    }
  };
  const addHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const maximumInvited = Number(form.get("maximumInvited"));
    const confirmedAttendees = Number(form.get("confirmedAttendees"));
    if (
      !Number.isInteger(maximumInvited) ||
      maximumInvited < 0 ||
      maximumInvited > 1_000 ||
      !Number.isInteger(confirmedAttendees)
    )
      return alert("Household counts must be whole numbers from 0 to 1,000.");
    const guestIds = form.getAll("guestIds").map(String);
    const used = new Set(data.households.flatMap((item) => item.guestIds));
    if (guestIds.some((id) => used.has(id)))
      return alert("A selected guest already belongs to another household.");
    if (confirmedAttendees < 0 || confirmedAttendees > maximumInvited)
      return alert(
        "Confirmed attendees must be between zero and invitation limit.",
      );
    const stamp = now();
    const saved = await save("households", {
      id: uid(),
      name: String(form.get("name")).trim(),
      guestIds,
      maximumInvited,
      confirmedAttendees,
      preferredGroup: String(form.get("preferredGroup")).trim(),
      keepTogether: form.get("keepTogether") === "on",
      lockedTableId: undefined,
      notes: String(form.get("notes")),
      createdAt: stamp,
      updatedAt: stamp,
    });
    if (saved) setHouseholdOpen(false);
  };
  const replaceSeatingData = async (next: AppData) => {
    try {
      await replaceAll(next);
      setData(next);
      return true;
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Seating changes could not be saved.",
      );
      return false;
    }
  };
  const generate = async () => {
    const result = generateSeating(
      data.tables,
      data.households,
      data.guests,
      data.assignments,
      includePending,
    );
    const next = { ...data, assignments: result.assignments };
    if (await replaceSeatingData(next)) setConflicts(result.conflicts);
  };
  const resetAutomatic = async () => {
    const next = {
      ...data,
      assignments: data.assignments.filter(
        (item) => item.assignmentType !== "automatic",
      ),
    };
    if (await replaceSeatingData(next)) setConflicts([]);
  };
  const deleteTable = async (table: SeatingTable) => {
    if (!confirm(`Delete ${table.name} and remove its seating assignments?`))
      return;
    const next = {
      ...data,
      halls: data.halls.map((h) => ({
        ...h,
        elements: h.elements.filter((e) => e.tableId !== table.id),
        snapshots: h.snapshots.map((s) => ({
          ...s,
          layout: {
            ...s.layout,
            elements: s.layout.elements.filter((e) => e.tableId !== table.id),
          },
        })),
      })),
      tables: data.tables.filter((item) => item.id !== table.id),
      assignments: data.assignments.filter((item) => item.tableId !== table.id),
      households: data.households.map((item) =>
        item.lockedTableId === table.id
          ? { ...item, lockedTableId: undefined }
          : item,
      ),
    };
    await replaceSeatingData(next);
  };
  const deleteHousehold = async (household: Household) => {
    if (!confirm(`Delete ${household.name} and remove its seating assignment?`))
      return;
    const next = {
      ...data,
      households: data.households.filter((item) => item.id !== household.id),
      assignments: data.assignments.filter(
        (item) => item.householdId !== household.id,
      ),
    };
    await replaceSeatingData(next);
  };
  const lockHousehold = async (household: Household, tableId: string) => {
    const assignments = data.assignments.filter(
      (item) => item.householdId !== household.id,
    );
    const nextHousehold = { ...household, lockedTableId: tableId || undefined };
    if (tableId && household.confirmedAttendees > 0) {
      const available =
        effectiveCapacity(data.tables.find((item) => item.id === tableId)!) -
        assignments
          .filter((a) => a.tableId === tableId)
          .reduce((sum, a) => sum + a.seatCount, 0);
      if (household.confirmedAttendees > available)
        return alert(
          "Household does not fit. Resolve capacity before locking.",
        );
      assignments.push({
        id: `manual-${household.id}`,
        householdId: household.id,
        tableId,
        seatCount: household.confirmedAttendees,
        assignmentType: "manual",
        locked: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    const next = {
      ...data,
      households: data.households.map((item) =>
        item.id === household.id ? nextHousehold : item,
      ),
      assignments,
    };
    await replaceSeatingData(next);
  };
  const exportByTable = () =>
    download(
      "seating-by-table.csv",
      toCsv(
        data.assignments.map((item) => ({
          table: data.tables.find((table) => table.id === item.tableId)?.name,
          household:
            data.households.find(
              (household) => household.id === item.householdId,
            )?.name ?? "Individual guest",
          seats: item.seatCount,
          locked: item.locked ? "Yes" : "No",
        })),
      ),
      "text/csv",
    );
  const exportByGuest = () =>
    download(
      "seating-by-guest.csv",
      toCsv(
        data.guests.map((guest) => {
          const household = data.households.find((item) =>
            item.guestIds.includes(guest.id),
          );
          const assignment = data.assignments.find(
            (item) =>
              item.householdId === household?.id || item.guestId === guest.id,
          );
          return {
            guest: guest.name,
            rsvp: guest.rsvp,
            household: household?.name ?? "",
            table:
              data.tables.find((item) => item.id === assignment?.tableId)
                ?.name ?? "Unassigned",
          };
        }),
      ),
      "text/csv",
    );

  return (
    <div className="seating-page">
      <PageTitle
        title="Seating planner"
        copy="Deterministic best-fit seating that keeps households together."
        action={
          <div className="actions no-print">
            <button onClick={() => setHouseholdOpen(true)}>
              <Plus /> Household
            </button>
            <button onClick={() => setTableOpen(true)}>
              <Plus /> Table
            </button>
            <button className="primary" onClick={generate}>
              Generate seating plan
            </button>
          </div>
        }
      />
      {conflicts.length > 0 && (
        <div className="seating-conflicts" role="alert">
          <strong>
            {conflicts.length} seating conflict
            {conflicts.length === 1 ? "" : "s"}
          </strong>
          {conflicts.map((item) => (
            <p key={`${item.code}-${item.subjectId}`}>
              <b>{item.code.replaceAll("_", " ")}:</b> {item.message}{" "}
              {item.suggestion}
            </p>
          ))}
        </div>
      )}
      {confirmed > assigned && (
        <div className="alert">
          {confirmed - assigned} confirmed attendee
          {confirmed - assigned === 1 ? " is" : "s are"} still unassigned.
        </div>
      )}
      <div className="stats-grid seating-stats">
        <Stat label="Confirmed" value={confirmed} />
        <Stat label="Assigned" value={assigned} />
        <Stat label="Unassigned" value={Math.max(0, confirmed - assigned)} />
        <Stat
          label="Effective capacity"
          value={capacity}
          sub={`${Math.max(0, capacity - assigned)} seats remaining`}
        />
      </div>
      <div className="seating-toolbar no-print">
        <div className="search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tables"
          />
        </div>
        <select
          value={group}
          onChange={(event) => setGroup(event.target.value)}
          aria-label="Filter table group"
        >
          <option value="all">All groups</option>
          {groups.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={includePending}
            onChange={(event) => setIncludePending(event.target.checked)}
          />{" "}
          Include pending RSVPs
        </label>
        <button onClick={resetAutomatic}>Reset automatic</button>
        <button onClick={() => window.print()}>Print</button>
        <button onClick={exportByTable}>
          <Download /> By table
        </button>
        <button onClick={exportByGuest}>
          <Download /> By guest
        </button>
      </div>
      <div className="seating-layout">
        <section className="table-board">
          {visibleTables.length ? (
            visibleTables.map((table) => {
              const used = occupied(table.id),
                effective = effectiveCapacity(table);
              const tableAssignments = data.assignments.filter(
                (item) => item.tableId === table.id,
              );
              return (
                <article
                  className={`seating-table ${table.shape}`}
                  key={table.id}
                >
                  <header>
                    <div className="seating-table-heading">
                      <div className="seating-table-badges">
                        <span className="pill">
                          {table.group || "Any group"}
                        </span>
                        {table.locked && (
                          <span className="pill danger">Auto locked</span>
                        )}
                      </div>
                      <h3>{table.name}</h3>
                    </div>
                    <div className="seating-table-actions no-print">
                      <button
                        className="icon"
                        onClick={() => {
                          setEditingTable(table);
                          setTableOpen(true);
                        }}
                        aria-label={`Edit ${table.name}`}
                        title="Edit table"
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon danger-button"
                        onClick={() => deleteTable(table)}
                        aria-label={`Delete ${table.name}`}
                        title="Delete table"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </header>
                  <div
                    className="seat-meter"
                    role="progressbar"
                    aria-label={`${table.name} occupancy`}
                    aria-valuemin={0}
                    aria-valuemax={effective}
                    aria-valuenow={used}
                  >
                    <span
                      style={{
                        width: `${effective ? Math.min(100, (used / effective) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="seating-table-stats">
                    <span>
                      <strong>{used}</strong> occupied
                    </span>
                    <span>
                      <strong>{table.reservedSeats}</strong> reserved
                    </span>
                    <span>
                      <strong>{Math.max(0, effective - used)}</strong> available
                    </span>
                  </div>
                  <div className="seated-list">
                    {tableAssignments.length ? (
                      tableAssignments.map((assignment) => {
                        const household = data.households.find(
                          (item) => item.id === assignment.householdId,
                        );
                        return (
                          <div key={assignment.id}>
                            <span>
                              {household?.name ??
                                data.guests.find(
                                  (item) => item.id === assignment.guestId,
                                )?.name}
                            </span>
                            <strong>{assignment.seatCount}</strong>
                            {assignment.locked && <small>Locked</small>}
                          </div>
                        );
                      })
                    ) : (
                      <small>No assignments</small>
                    )}
                  </div>
                  <footer className="no-print">
                    <button
                      className="icon"
                      disabled={table.displayOrder === 0}
                      onClick={() =>
                        save("tables", {
                          ...table,
                          displayOrder: table.displayOrder - 2,
                          updatedAt: now(),
                        })
                      }
                      aria-label={`Move ${table.name} up`}
                      title="Move table up"
                    >
                      <ArrowUp />
                    </button>
                    <button
                      className="icon"
                      onClick={() =>
                        save("tables", {
                          ...table,
                          displayOrder: table.displayOrder + 2,
                          updatedAt: now(),
                        })
                      }
                      aria-label={`Move ${table.name} down`}
                      title="Move table down"
                    >
                      <ArrowDown />
                    </button>
                  </footer>
                </article>
              );
            })
          ) : (
            <Empty
              title="No reception tables"
              copy="Create tables with capacity, reserved seats and seating groups."
            />
          )}
        </section>
        <aside className="unassigned-panel">
          <h3>Households</h3>
          {data.households.length ? (
            data.households.map((household) => {
              const assignment = data.assignments.find(
                (item) => item.householdId === household.id,
              );
              return (
                <article key={household.id}>
                  <div>
                    <strong>{household.name}</strong>
                    <small>
                      {household.confirmedAttendees} confirmed ·{" "}
                      {household.preferredGroup || "any group"}
                    </small>
                  </div>
                  <span
                    className={
                      assignment ? "assigned-label" : "unassigned-label"
                    }
                  >
                    {assignment
                      ? data.tables.find(
                          (item) => item.id === assignment.tableId,
                        )?.name
                      : "Unassigned"}
                  </span>
                  <label className="no-print">
                    Lock to table
                    <select
                      value={household.lockedTableId ?? ""}
                      onChange={(event) =>
                        lockHousehold(household, event.target.value)
                      }
                    >
                      <option value="">Not locked</option>
                      {data.tables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="danger-button no-print"
                    onClick={() => deleteHousehold(household)}
                  >
                    Delete household
                  </button>
                </article>
              );
            })
          ) : (
            <Empty
              title="No households"
              copy="Create parties from existing guest records."
            />
          )}
        </aside>
      </div>
      {tableOpen && (
        <Modal
          title={editingTable ? "Edit table" : "Create table"}
          close={() => {
            setTableOpen(false);
            setEditingTable(null);
          }}
        >
          <form className="stack" onSubmit={addTable}>
            <div className="form-grid">
              <Field
                name="name"
                label="Table name or number"
                defaultValue={editingTable?.name}
                required
              />
              <Field
                name="group"
                label="Group or category"
                defaultValue={editingTable?.group}
              />
              <Field
                name="capacity"
                label="Capacity"
                type="number"
                min="1"
                defaultValue={editingTable?.capacity}
                required
              />
              <Field
                name="reservedSeats"
                label="Reserved seats"
                type="number"
                min="0"
                defaultValue={editingTable?.reservedSeats ?? 0}
                required
              />
              <label>
                Shape
                <select
                  name="shape"
                  defaultValue={editingTable?.shape ?? "round"}
                >
                  <option>round</option>
                  <option>rectangle</option>
                  <option>custom</option>
                </select>
              </label>
              <label className="check">
                <input
                  name="locked"
                  type="checkbox"
                  defaultChecked={editingTable?.locked}
                />{" "}
                Lock against automatic seating
              </label>
            </div>
            <label>
              Notes
              <textarea name="notes" defaultValue={editingTable?.notes} />
            </label>
            <button className="primary">
              {editingTable ? "Update table" : "Save table"}
            </button>
          </form>
        </Modal>
      )}
      {householdOpen && (
        <Modal title="Create household" close={() => setHouseholdOpen(false)}>
          <form className="stack" onSubmit={addHousehold}>
            <Field name="name" label="Household or family name" required />
            <div className="form-grid">
              <Field
                name="maximumInvited"
                label="Maximum invited"
                type="number"
                min="0"
                required
              />
              <Field
                name="confirmedAttendees"
                label="Confirmed attendees"
                type="number"
                min="0"
                required
              />
              <Field name="preferredGroup" label="Preferred seating group" />
              <label className="check">
                <input name="keepTogether" type="checkbox" defaultChecked />{" "}
                Keep together
              </label>
            </div>
            <fieldset>
              <legend>Household guests</legend>
              {data.guests
                .filter(
                  (guest) =>
                    !data.households.some((item) =>
                      item.guestIds.includes(guest.id),
                    ),
                )
                .map((guest) => (
                  <label className="check" key={guest.id}>
                    <input name="guestIds" value={guest.id} type="checkbox" />{" "}
                    {guest.name} ({guest.rsvp})
                  </label>
                ))}
            </fieldset>
            <label>
              Notes
              <textarea name="notes" />
            </label>
            <button className="primary">Save household</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Vendors({
  data,
  save,
  remove,
}: {
  data: AppData;
  save: Save;
  remove: Remove;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Vendor | null>(null),
    [query, setQuery] = useState("");
  const vendors = data.vendors.filter((v) =>
      v.name.toLowerCase().includes(query.toLowerCase()),
    ),
    currency = data.wedding!.currency;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")),
      website = String(f.get("website")),
      estimatedCents = cents(f.get("estimated")),
      finalCents = cents(f.get("final")),
      depositCents = cents(f.get("deposit"));
    if (!validateEmail(email)) return alert("Enter a valid email address.");
    if (website && !safeWebsite(website))
      return alert("Website must use http or https.");
    if (![estimatedCents, finalCents, depositCents].every(Number.isSafeInteger))
      return alert("Enter valid monetary amounts within supported limits.");
    if (depositCents > finalCents)
      return alert("Deposit paid cannot exceed the final cost.");
    const stamp = now();
    const saved = await save("vendors", {
      id: editing?.id ?? uid(),
      name: String(f.get("name")).trim(),
      category: String(f.get("category")),
      contact: String(f.get("contact")),
      phone: String(f.get("phone")),
      email,
      website,
      estimatedCents,
      finalCents,
      depositCents,
      deadline: String(f.get("deadline")),
      status: String(f.get("status")) as Vendor["status"],
      notes: String(f.get("notes")),
      expenseId: editing?.expenseId,
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setOpen(false);
      setEditing(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Vendor book"
        copy="Contacts, decisions and payment deadlines in one place."
        action={
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Add vendor
          </button>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            placeholder="Search vendors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {vendors.length ? (
        <div className="card-grid">
          {vendors.map((v) => {
            const overdue =
              v.deadline && v.deadline < localDate() && vendorBalance(v) > 0;
            return (
              <article className="vendor-card" key={v.id}>
                <div>
                  <span className="pill">{v.category}</span>
                  <span className={`pill ${v.status}`}>{v.status}</span>
                  {overdue && (
                    <span className="pill danger">Payment overdue</span>
                  )}
                  <h3>{v.name}</h3>
                  <p>{v.contact || "No contact person"}</p>
                </div>
                <div className="vendor-money">
                  <small>Remaining balance</small>
                  <strong>{money(vendorBalance(v), currency)}</strong>
                  <span>Due {displayDate(v.deadline)}</span>
                </div>
                <div className="contact-links">
                  <button
                    className="icon"
                    onClick={() => {
                      setEditing(v);
                      setOpen(true);
                    }}
                    aria-label={`Edit ${v.name}`}
                  >
                    <Pencil />
                  </button>
                  {v.phone && <a href={`tel:${v.phone}`}>Call</a>}
                  {v.email && <a href={`mailto:${v.email}`}>Email</a>}
                  {safeWebsite(v.website) && (
                    <a
                      href={safeWebsite(v.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Website
                    </a>
                  )}
                  <button
                    className="icon danger-button"
                    onClick={() => remove("vendors", v.id)}
                    aria-label={`Delete ${v.name}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Build your trusted team"
          copy="Add venues, caterers, photographers and other vendors."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit vendor" : "Add vendor"}
          close={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            <Field
              name="name"
              label="Business or vendor name"
              defaultValue={editing?.name}
              required
            />
            <div className="form-grid">
              <Field
                name="category"
                label="Service category"
                defaultValue={editing?.category}
                required
              />
              <Field
                name="contact"
                label="Contact person"
                defaultValue={editing?.contact}
              />
              <Field
                name="phone"
                label="Phone"
                type="tel"
                defaultValue={editing?.phone}
              />
              <Field
                name="email"
                label="Email"
                type="email"
                defaultValue={editing?.email}
              />
              <Field
                name="website"
                label="Website (https://…)"
                type="url"
                defaultValue={editing?.website}
              />
              <label>
                Booking status
                <select name="status" defaultValue={editing?.status}>
                  <option>researching</option>
                  <option>contacted</option>
                  <option>shortlisted</option>
                  <option>booked</option>
                  <option>cancelled</option>
                </select>
              </label>
              <MoneyField
                name="estimated"
                label="Estimated cost"
                defaultValue={
                  editing ? editing.estimatedCents / 100 : undefined
                }
              />
              <MoneyField
                name="final"
                label="Final cost"
                defaultValue={editing ? editing.finalCents / 100 : undefined}
              />
              <MoneyField
                name="deposit"
                label="Deposit paid"
                defaultValue={editing ? editing.depositCents / 100 : undefined}
              />
              <Field
                name="deadline"
                label="Payment deadline"
                type="date"
                defaultValue={editing?.deadline}
              />
            </div>
            <label>
              Notes
              <textarea name="notes" defaultValue={editing?.notes} />
            </label>
            <button className="primary">
              {editing ? "Update vendor" : "Save vendor"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Timeline({
  data,
  setData,
  save,
  remove,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  save: Save;
  remove: Remove;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TimelineItem | null>(null);
  const items = [...data.timeline].sort((a, b) =>
    `${a.date}${a.startTime}${a.order}`.localeCompare(
      `${b.date}${b.startTime}${b.order}`,
    ),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      start = String(f.get("startTime")),
      end = String(f.get("endTime"));
    if (end && end <= start) return alert("End time must be after start time.");
    const stamp = now();
    const saved = await save("timeline", {
      id: editing?.id ?? uid(),
      title: String(f.get("title")).trim(),
      date: String(f.get("date")),
      startTime: start,
      endTime: end,
      location: String(f.get("location")),
      responsible: String(f.get("responsible")),
      notes: String(f.get("notes")),
      order: editing?.order ?? data.timeline.length,
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setOpen(false);
      setEditing(null);
    }
  };
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    const timeline = reordered.map((item, order) => ({
      ...item,
      order,
      updatedAt: now(),
    }));
    const next = { ...data, timeline };
    try {
      await replaceAll(next);
      setData(next);
    } catch {
      alert("Timeline order could not be saved.");
    }
  };
  return (
    <>
      <PageTitle
        title="Wedding-day timeline"
        copy="A clear, printable run-of-show for everyone involved."
        action={
          <button
            className="primary no-print"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Add activity
          </button>
        }
      />
      {items.length ? (
        <div className="timeline">
          {items.map((x, index) => (
            <article key={x.id}>
              <time>
                {x.startTime}
                <small>{x.endTime && `–${x.endTime}`}</small>
              </time>
              <span className="timeline-dot" />
              <div>
                <span>{displayDate(x.date)}</span>
                <h3>{x.title}</h3>
                <p>
                  {x.location}
                  {x.responsible && ` · ${x.responsible}`}
                </p>
                {x.notes && <small>{x.notes}</small>}
              </div>
              <div className="reorder no-print">
                <button
                  aria-label={`Edit ${x.title}`}
                  onClick={() => {
                    setEditing(x);
                    setOpen(true);
                  }}
                >
                  <Pencil />
                </button>
                <button
                  aria-label={`Move ${x.title} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  disabled={index === items.length - 1}
                  aria-label={`Move ${x.title} later`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  className="icon danger-button"
                  onClick={() => remove("timeline", x.id)}
                  aria-label={`Delete ${x.title}`}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Shape the flow of your day"
          copy="Add preparation, ceremony, photos, reception and departure."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit timeline activity" : "Add timeline activity"}
          close={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            <Field
              name="title"
              label="Activity title"
              defaultValue={editing?.title}
              required
            />
            <div className="form-grid">
              <Field
                name="date"
                label="Date"
                type="date"
                defaultValue={editing?.date ?? data.wedding!.date}
                required
              />
              <Field
                name="startTime"
                label="Start time"
                type="time"
                defaultValue={editing?.startTime}
                required
              />
              <Field
                name="endTime"
                label="End time (optional)"
                type="time"
                defaultValue={editing?.endTime}
              />
              <Field
                name="location"
                label="Location"
                defaultValue={editing?.location}
              />
              <Field
                name="responsible"
                label="Responsible person"
                defaultValue={editing?.responsible}
              />
            </div>
            <label>
              Notes
              <textarea name="notes" defaultValue={editing?.notes} />
            </label>
            <button className="primary">
              {editing ? "Update activity" : "Save activity"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Notes({
  data,
  save,
  remove,
}: {
  data: AppData;
  save: Save;
  remove: Remove;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Note | null>(null),
    [query, setQuery] = useState("");
  const notes = data.notes
    .filter((n) =>
      `${n.title} ${n.content}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      stamp = now();
    const saved = await save("notes", {
      id: editing?.id ?? uid(),
      title: String(f.get("title")).trim(),
      content: String(f.get("content")).trim(),
      category: String(f.get("category")),
      pinned: f.get("pinned") === "on",
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (saved) {
      setOpen(false);
      setEditing(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Planning notes"
        copy="Ideas, decisions and questions—kept close at hand."
        action={
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Add note
          </button>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            placeholder="Search notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {notes.length ? (
        <div className="notes-grid">
          {notes.map((n) => (
            <article className={n.pinned ? "note pinned" : "note"} key={n.id}>
              <span className="pill">{n.category}</span>
              {n.pinned && <span className="pin">Pinned</span>}
              <h3>{n.title}</h3>
              <p>{n.content}</p>
              <footer>
                <small>Updated {displayDate(n.updatedAt.slice(0, 10))}</small>
                <div>
                  <button
                    onClick={() => {
                      setEditing(n);
                      setOpen(true);
                    }}
                    aria-label={`Edit ${n.title}`}
                  >
                    <Pencil /> Edit
                  </button>
                  <button
                    onClick={() =>
                      save("notes", {
                        ...n,
                        pinned: !n.pinned,
                        updatedAt: now(),
                      })
                    }
                  >
                    {n.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    className="icon danger-button"
                    onClick={() => remove("notes", n.id)}
                    aria-label={`Delete ${n.title}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="A place for every thought"
          copy="Capture ideas before they disappear."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit note" : "Add note"}
          close={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            <Field
              name="title"
              label="Title"
              defaultValue={editing?.title}
              required
            />
            <label>
              Category
              <select name="category" defaultValue={editing?.category}>
                {[
                  "Ideas",
                  "Decisions",
                  "Vendor questions",
                  "Shopping",
                  "Reminders",
                  "Other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Content
              <textarea
                name="content"
                rows={7}
                defaultValue={editing?.content}
                required
              />
            </label>
            <label className="check">
              <input
                name="pinned"
                type="checkbox"
                defaultChecked={editing?.pinned}
              />{" "}
              Pin this note
            </label>
            <button className="primary">
              {editing ? "Update note" : "Save note"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function SettingsPage({
  data,
  setData,
  save,
  dark,
  setDark,
}: {
  data: AppData;
  setData: (d: AppData) => void;
  save: Save;
  dark: boolean;
  setDark: (v: boolean) => void;
}) {
  const [preview, setPreview] = useState<AppData | null>(null),
    [phrase, setPhrase] = useState("");
  const profile = data.wedding!;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const expectedGuests = Number(f.get("guests"));
    const budgetCents = cents(f.get("budget"));
    if (
      !Number.isSafeInteger(expectedGuests) ||
      expectedGuests < 0 ||
      expectedGuests > 100_000 ||
      !Number.isSafeInteger(budgetCents) ||
      budgetCents < 0
    )
      return alert(
        "Enter valid guest and budget amounts within sensible limits.",
      );
    await save("wedding", {
      ...profile,
      partnerOne: String(f.get("partnerOne")),
      partnerTwo: String(f.get("partnerTwo")),
      date: String(f.get("date")),
      time: String(f.get("time")),
      venue: String(f.get("venue")),
      expectedGuests,
      budgetCents,
      currency: String(f.get("currency")),
      color: String(f.get("color")),
    });
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5_000_000)
      return alert("Backup is larger than the 5 MB limit.");
    try {
      setPreview(parseBackup(await file.text()).data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Invalid backup.");
    }
  };
  const restore = async () => {
    if (!preview || !confirm("Replace all current data with this backup?"))
      return;
    try {
      await replaceAll(preview);
      setData(preview);
      setPreview(null);
    } catch (restoreError) {
      alert(
        restoreError instanceof Error
          ? restoreError.message
          : "Restore failed.",
      );
    }
  };
  const clear = async () => {
    if (phrase !== "CLEAR MY WEDDING") return;
    if (!confirm("Permanently clear every wedding record on this device?"))
      return;
    try {
      await clearAll();
      location.reload();
    } catch (clearError) {
      alert(
        clearError instanceof Error
          ? clearError.message
          : "Clear operation failed.",
      );
    }
  };
  return (
    <>
      <PageTitle
        title="Settings & backup"
        copy="Protect your plan with regular local backups."
      />
      <div className="settings-grid">
        <section className="panel">
          <h3>Wedding details</h3>
          <form className="stack" onSubmit={submit}>
            <div className="form-grid">
              <Field
                name="partnerOne"
                label="Partner one"
                defaultValue={profile.partnerOne}
                required
              />
              <Field
                name="partnerTwo"
                label="Partner two"
                defaultValue={profile.partnerTwo}
                required
              />
              <Field
                name="date"
                label="Wedding date"
                type="date"
                defaultValue={profile.date}
                required
              />
              <Field
                name="time"
                label="Wedding time"
                type="time"
                defaultValue={profile.time}
              />
              <Field name="venue" label="Venue" defaultValue={profile.venue} />
              <Field
                name="guests"
                label="Expected guests"
                type="number"
                min="0"
                defaultValue={profile.expectedGuests}
              />
              <MoneyField
                name="budget"
                label="Total budget"
                defaultValue={profile.budgetCents / 100}
              />
              <label>
                Currency
                <select name="currency" defaultValue={profile.currency}>
                  {["LKR", "USD", "GBP", "EUR", "AUD", "INR", "SGD"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </label>
              <Field
                name="color"
                label="Primary colour"
                type="color"
                defaultValue={profile.color}
              />
            </div>
            <button className="primary">Save details</button>
          </form>
        </section>
        <section className="panel">
          <h3>Appearance</h3>
          <div className="setting-row">
            <div>
              <strong>Dark theme</strong>
              <p>Comfortable planning after sunset.</p>
            </div>
            <button
              role="switch"
              aria-checked={dark}
              aria-label="Dark theme"
              className={dark ? "toggle on" : "toggle"}
              onClick={() => setDark(!dark)}
            >
              <span />
            </button>
          </div>
          <h3>Backup & exports</h3>
          <p className="muted">
            Browser data can disappear after a reset, private-mode session, or
            device change. Export JSON regularly.
          </p>
          <div className="backup-actions">
            <button
              className="primary"
              onClick={() =>
                download(
                  `vow-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  JSON.stringify(createBackup(data), null, 2),
                  "application/json",
                )
              }
            >
              <Download /> Export full backup
            </button>
            <label className="button">
              <ArchiveRestore /> Import backup
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => importFile(e.target.files?.[0])}
                hidden
              />
            </label>
          </div>
          <div className="csv-grid">
            {(
              [
                "tasks",
                "expenses",
                "guests",
                "vendors",
                "timeline",
                "tables",
                "households",
                "assignments",
              ] as const
            ).map((key) => (
              <button
                key={key}
                onClick={() =>
                  download(`${key}.csv`, toCsv(data[key]), "text/csv")
                }
              >
                Export {key} CSV
              </button>
            ))}
          </div>
        </section>
        <section className="panel privacy-panel">
          <h3>Privacy by design</h3>
          <p>
            All wedding, guest, vendor and payment information stays in
            IndexedDB on this device. Vow has no accounts, analytics,
            advertising, servers or cloud synchronization. External vendor links
            open only when you choose them.
          </p>
          <p>
            Use device security, export backups, and avoid shared browser
            profiles when storing personal details.
          </p>
        </section>
        <section className="panel danger-zone">
          <h3>Clear all data</h3>
          <p>
            Type <strong>CLEAR MY WEDDING</strong> to permanently erase this
            planner.
          </p>
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            aria-label="Clear confirmation phrase"
          />
          <button
            className="danger-primary"
            disabled={phrase !== "CLEAR MY WEDDING"}
            onClick={clear}
          >
            Clear everything
          </button>
        </section>
      </div>
      {preview && (
        <Modal title="Restore preview" close={() => setPreview(null)}>
          <div className="preview">
            <p>Backup contains:</p>
            <ul>
              <li>{preview.tasks.length} tasks</li>
              <li>{preview.expenses.length} expenses</li>
              <li>{preview.guests.length} guests</li>
              <li>{preview.vendors.length} vendors</li>
              <li>{preview.timeline.length} timeline activities</li>
              <li>{preview.notes.length} notes</li>
              <li>{preview.halls.length} hall layouts</li>
              <li>{preview.tables.length} seating tables</li>
              <li>{preview.households.length} households</li>
              <li>{preview.assignments.length} seating assignments</li>
            </ul>
            <button className="primary" onClick={restore}>
              Replace current data
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
