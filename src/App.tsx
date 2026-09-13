import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArchiveRestore,
  Armchair,
  Banknote,
  CalendarDays,
  ClipboardCheck,
  Heart,
  LayoutDashboard,
  Menu,
  Moon,
  NotebookPen,
  Settings,
  Sun,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { loadAll, replaceAll, repository } from "./database/db";
import type {
  AppData,
  Guest,
  SeatingTable,
  StoreName,
  Task,
  Wedding,
} from "./types/models";
import {
  addCalendarDays,
  cents,
  emptyData,
  localDate,
  now,
  parseBackup,
  uid,
} from "./utils/domain";
import {
  Budget,
  Checklist,
  Dashboard,
  Field,
  Guests,
  MoneyField,
  Notes,
  Seating,
  SettingsPage,
  Timeline,
  Vendors,
} from "./features/planner/PlannerSections";

const HallDesigner = lazy(() =>
  import("./features/hall/HallDesigner").then((module) => ({
    default: module.HallDesigner,
  })),
);

type Section =
  | "dashboard"
  | "checklist"
  | "budget"
  | "guests"
  | "hall"
  | "seating"
  | "vendors"
  | "timeline"
  | "notes"
  | "settings";
const nav: { id: Section; label: string; icon: typeof Heart }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "checklist", label: "Checklist", icon: ClipboardCheck },
  { id: "budget", label: "Budget", icon: Banknote },
  { id: "guests", label: "Guests", icon: Users },
  { id: "hall", label: "Hall Designer", icon: LayoutDashboard },
  { id: "seating", label: "Seating", icon: Armchair },
  { id: "vendors", label: "Vendors", icon: Utensils },
  { id: "timeline", label: "Timeline", icon: CalendarDays },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "settings", label: "Settings & Backup", icon: Settings },
];
const defaults = [
  ["Book ceremony and reception venues", "Venue", -300],
  ["Choose caterer and menu", "Catering", -180],
  ["Book photographer", "Photography and videography", -240],
  ["Order wedding clothing", "Clothing", -150],
  ["Send invitations", "Invitations", -90],
  ["Confirm legal documents", "Legal documents", -45],
  ["Finalize ceremony details", "Ceremony", -21],
  ["Confirm reception schedule", "Reception", -14],
] as const;

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application error", error.message, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <Heart />
        <h1>Something went wrong</h1>
        <p>Your saved data remains on this device. Reload to try again.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}

function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [toast, setToast] = useState("");
  const [section, setSection] = useState<Section>("dashboard");
  const [menu, setMenu] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuWasOpen = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  useEffect(() => {
    loadAll()
      .then(setData)
      .catch((e: Error) => {
        setError(e.message);
        setLoadFailed(true);
      })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const update = () => setCompactNavigation(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (menu) {
      document.querySelector<HTMLElement>("#sidebar button")?.focus();
      menuWasOpen.current = true;
    } else if (menuWasOpen.current) {
      menuButtonRef.current?.focus();
      menuWasOpen.current = false;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu) setMenu(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menu]);
  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true);
    window.addEventListener("vow-update-available", showUpdate);
    return () => window.removeEventListener("vow-update-available", showUpdate);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const save = async <T extends { id: string }>(store: StoreName, item: T) => {
    try {
      if (
        store === "guests" &&
        (item as unknown as Guest).rsvp === "declined"
      ) {
        const next = {
          ...data,
          guests: [
            ...data.guests.filter((guest) => guest.id !== item.id),
            item as unknown as Guest,
          ],
          assignments: data.assignments.filter(
            (assignment) => assignment.guestId !== item.id,
          ),
        };
        await replaceAll(next);
        setData(next);
      } else if (store === "tables") {
        const table = item as unknown as SeatingTable;
        const previous = data.tables.find((entry) => entry.id === table.id);
        const next = {
          ...data,
          tables: [
            ...data.tables.filter((entry) => entry.id !== table.id),
            table,
          ],
          assignments:
            previous && previous.locked !== table.locked
              ? data.assignments.map((assignment) =>
                  assignment.tableId === table.id
                    ? { ...assignment, locked: table.locked }
                    : assignment,
                )
              : data.assignments,
        };
        await replaceAll(next);
        setData(next);
      } else {
        await repository.put(store, item);
        setData((old) =>
          store === "wedding"
            ? { ...old, wedding: item as unknown as Wedding }
            : {
                ...old,
                [store]: [
                  ...(old[store] as unknown as T[]).filter(
                    (entry) => entry.id !== item.id,
                  ),
                  item,
                ],
              },
        );
      }
      setToast("Saved on this device");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      return false;
    }
  };
  const remove = async (store: Exclude<StoreName, "wedding">, id: string) => {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    try {
      const next: AppData = {
        ...data,
        [store]: data[store].filter((item) => item.id !== id),
      };
      if (store === "guests") {
        next.households = next.households.map((household) => ({
          ...household,
          guestIds: household.guestIds.filter((guestId) => guestId !== id),
        }));
        next.assignments = next.assignments.filter(
          (assignment) => assignment.guestId !== id,
        );
      } else if (store === "vendors") {
        next.expenses = next.expenses.map((expense) =>
          expense.vendorId === id
            ? { ...expense, vendorId: undefined }
            : expense,
        );
      } else if (store === "expenses") {
        next.vendors = next.vendors.map((vendor) =>
          vendor.expenseId === id
            ? { ...vendor, expenseId: undefined }
            : vendor,
        );
      }
      await replaceAll(next);
      setData(next);
      setToast("Item deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };
  const loadSample = async (wedding: Wedding) => {
    const tasks: Task[] = defaults.map(([title, category, offset]) => {
      const stamp = now();
      return {
        id: uid(),
        title,
        category,
        notes: "",
        dueDate: addCalendarDays(wedding.date, offset),
        priority: offset > -30 ? "high" : "medium",
        status: "pending",
        createdAt: stamp,
        updatedAt: stamp,
      };
    });
    const sample: AppData = {
      wedding,
      tasks,
      expenses: [],
      guests: [],
      vendors: [],
      timeline: [],
      notes: [],
      halls: [],
      tables: [],
      households: [],
      assignments: [],
    };
    await replaceAll(sample);
    setData(sample);
    setToast("Sample checklist added");
    return true;
  };

  if (!ready)
    return (
      <div className="loading" aria-live="polite">
        <Heart className="pulse" />
        <p>Opening your private planner…</p>
      </div>
    );
  if (loadFailed)
    return (
      <main className="fatal" role="alert">
        <Heart />
        <h1>Your saved planner could not be opened</h1>
        <p>{error}</p>
        <p>No saved records were overwritten.</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (!data.wedding)
    return (
      <Setup
        onSave={async (wedding, sample) =>
          sample ? loadSample(wedding) : save("wedding", wedding)
        }
        onRestore={async (file) => {
          if (file.size > 5_000_000) {
            setError("Backup is larger than the 5 MB limit.");
            return;
          }
          try {
            const restored = parseBackup(await file.text()).data;
            await replaceAll(restored);
            setData(restored);
            setError("");
          } catch (restoreError) {
            setError(
              restoreError instanceof Error
                ? restoreError.message
                : "Invalid backup.",
            );
          }
        }}
        error={error}
      />
    );
  const page = {
    dashboard: <Dashboard data={data} />,
    checklist: <Checklist data={data} save={save} remove={remove} />,
    budget: <Budget data={data} save={save} remove={remove} />,
    guests: <Guests data={data} save={save} remove={remove} />,
    hall: (
      <Suspense fallback={<p className="loading">Loading Hall Designer…</p>}>
        <HallDesigner data={data} setData={setData} />
      </Suspense>
    ),
    seating: <Seating data={data} setData={setData} save={save} />,
    vendors: <Vendors data={data} save={save} remove={remove} />,
    timeline: (
      <Timeline data={data} setData={setData} save={save} remove={remove} />
    ),
    notes: <Notes data={data} save={save} remove={remove} />,
    settings: (
      <SettingsPage
        data={data}
        setData={setData}
        save={save}
        dark={dark}
        setDark={setDark}
      />
    ),
  }[section];

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <aside
          id="sidebar"
          className={menu ? "sidebar open" : "sidebar"}
          inert={compactNavigation && !menu ? true : undefined}
        >
          <div className="brand">
            <span>
              <Heart fill="currentColor" />
              Vow
            </span>
            <button
              className="icon mobile-only"
              onClick={() => setMenu(false)}
              aria-label="Close menu"
            >
              <X />
            </button>
          </div>
          <p className="couple">
            {data.wedding.partnerOne} & {data.wedding.partnerTwo}
          </p>
          <nav aria-label="Main navigation">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={section === id ? "active" : ""}
                onClick={() => {
                  if (
                    !window.dispatchEvent(
                      new Event("hall-navigation", { cancelable: true }),
                    )
                  )
                    return;
                  setSection(id);
                  setMenu(false);
                }}
              >
                <Icon />
                {label}
              </button>
            ))}
          </nav>
          <div className="privacy">
            <span className="status-dot" />
            Stored only on this device
          </div>
        </aside>
        <main className="main" id="main-content" tabIndex={-1}>
          <header>
            <button
              ref={menuButtonRef}
              className="icon mobile-only"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              aria-controls="sidebar"
              aria-expanded={menu}
            >
              <Menu />
            </button>
            <div>
              <p className="eyebrow">Wedding workspace</p>
              <h1>{nav.find((item) => item.id === section)?.label}</h1>
            </div>
            <div className="header-actions">
              <span className="offline" aria-live="polite">
                {online ? "Online" : "Offline ready"}
              </span>
              <button
                className="icon"
                onClick={() => setDark(!dark)}
                aria-label={`Use ${dark ? "light" : "dark"} theme`}
              >
                {dark ? <Sun /> : <Moon />}
              </button>
            </div>
          </header>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss">
                <X />
              </button>
            </div>
          )}
          {updateAvailable && (
            <div className="update-banner" role="status">
              <span>A new version of Vow is ready.</span>
              <button onClick={() => location.reload()}>
                Reload to update
              </button>
            </div>
          )}
          {page}
        </main>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function Setup({
  onSave,
  onRestore,
  error,
}: {
  onSave: (w: Wedding, sample: boolean) => Promise<boolean | void>;
  onRestore: (file: File) => Promise<void>;
  error: string;
}) {
  const [sample, setSample] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    if (date < localDate()) {
      setSubmitError("Wedding date cannot be in the past.");
      return;
    }
    const expectedGuests = Number(form.get("guests"));
    const budgetCents = cents(form.get("budget"));
    if (
      !Number.isSafeInteger(expectedGuests) ||
      expectedGuests < 0 ||
      expectedGuests > 100_000 ||
      !Number.isSafeInteger(budgetCents) ||
      budgetCents < 0
    ) {
      setSubmitError(
        "Enter valid guest and budget amounts within sensible limits.",
      );
      return;
    }
    try {
      const saved = await onSave(
        {
          id: "profile",
          partnerOne: String(form.get("partnerOne")).trim(),
          partnerTwo: String(form.get("partnerTwo")).trim(),
          date,
          time: String(form.get("time")),
          venue: String(form.get("venue")).trim(),
          expectedGuests,
          budgetCents,
          currency: String(form.get("currency")),
          color: String(form.get("color")),
        },
        sample,
      );
      if (saved === false) setSubmitError("The wedding could not be saved.");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The wedding could not be saved.",
      );
    }
  };
  return (
    <main className="setup">
      <section className="setup-copy">
        <div className="brand hero">
          <Heart fill="currentColor" /> Vow
        </div>
        <p className="eyebrow">Your day, calmly planned</p>
        <h1>
          Everything that matters.
          <br />
          Nothing leaves your device.
        </h1>
        <p>
          Checklist, budget, guests, vendors, timeline and notes—available
          offline, private by design.
        </p>
        <div className="privacy-card">
          <ArchiveRestore />
          <div>
            <strong>Private and local</strong>
            <span>No accounts, trackers, cloud sync or data transmission.</span>
          </div>
        </div>
      </section>
      <section className="setup-form">
        <p className="step">First, tell us about your day</p>
        <h2>Create your wedding</h2>
        {(error || submitError) && (
          <div className="alert" role="alert">
            {error || submitError}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Partner one's name" name="partnerOne" required />
            <Field label="Partner two's name" name="partnerTwo" required />
            <Field label="Wedding date" name="date" type="date" required />
            <Field label="Wedding time (optional)" name="time" type="time" />
            <Field label="Venue (optional)" name="venue" />
            <Field
              label="Expected guests"
              name="guests"
              type="number"
              min="0"
              required
              defaultValue="100"
            />
            <MoneyField label="Total budget" name="budget" required />
            <label>
              Currency
              <select name="currency" defaultValue="LKR">
                <option>LKR</option>
                <option>USD</option>
                <option>GBP</option>
                <option>EUR</option>
                <option>AUD</option>
                <option>INR</option>
                <option>SGD</option>
              </select>
            </label>
            <label>
              Primary colour
              <input name="color" type="color" defaultValue="#8c4f55" />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={sample}
              onChange={(e) => setSample(e.target.checked)}
            />{" "}
            Load a sensible starter checklist
          </label>
          <button className="primary" type="submit">
            Start planning <Heart size={18} />
          </button>
          <label className="button restore-button">
            <ArchiveRestore /> Restore a backup instead
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onRestore(file);
              }}
            />
          </label>
          <small>
            Your information stays in this browser. Export regular backups in
            Settings.
          </small>
        </form>
      </section>
    </main>
  );
}

export default App;
