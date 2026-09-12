import { starterLayout, templateNames as templates } from "./templates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, SeatingTable } from "../../types/models";
import { repository } from "../../database/db";
import {
  newHall,
  newElement,
  hallSchema,
  library,
  type Hall,
  type Element,
  type Flow,
  type Point,
} from "./model";
import {
  convert,
  snap,
  worldPoint,
  outside,
  suggest,
  effectiveDimensions,
} from "./geometry";
import {
  isLocked,
  moveElements,
  record,
  travel,
  type History,
} from "./commands";
import { validateLayout } from "./validation";
import { Plan, Rulers, assignmentNames } from "./Canvas";
import { disclaimer, exportPng, printPlan } from "./export";
import "./hall.css";
const flowKinds = [
  "Guest entrance",
  "Ceremony-to-reception movement",
  "Buffet queue",
  "Drinks station queue",
  "Restroom access",
  "Emergency exit",
  "Staff/service access",
  "Couple’s entrance",
  "Couple’s exit",
];

export function HallDesigner({
  data,
  setData,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const [active, setActive] = useState(data.halls[0]?.id ?? ""),
    [wizard, setWizard] = useState(!data.halls.length),
    [draft, setDraft] = useState<Hall>(newHall),
    [step, setStep] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [history, setHistory] = useState<History>({ past: [], future: [] }),
    [status, setStatus] = useState("Saved locally"),
    [error, setError] = useState(""),
    [grid, setGrid] = useState(true),
    [snapping, setSnapping] = useState(true),
    [clearance, setClearance] = useState(false),
    [guestNames, setGuestNames] = useState(false),
    [mode, setMode] = useState("complete"),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 }),
    [preview, setPreview] = useState<Hall | null>(null),
    [help, setHelp] = useState(false),
    [flowKind, setFlowKind] = useState(flowKinds[0]),
    [routing, setRouting] = useState<Point[] | null>(null),
    [suggestion, setSuggestion] = useState<ReturnType<typeof suggest> | null>(
      null,
    ),
    [paper, setPaper] = useState("A4"),
    [orientation, setOrientation] = useState("landscape"),
    [small, setSmall] = useState(window.innerWidth < 600),
    [panMode, setPanMode] = useState(false),
    [multiSelect, setMultiSelect] = useState(false);
  const hall = data.halls.find((h) => h.id === active),
    shown = preview ?? hall,
    svg = useRef<SVGSVGElement>(null),
    frame = useRef<HTMLDivElement>(null),
    [frameWidth, setFrameWidth] = useState(800),
    clipboard = useRef<Element[]>([]),
    pending = useRef<Hall | null>(null),
    lastSaved = useRef<Hall | null>(hall ?? null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    queue = useRef(Promise.resolve()),
    mounted = useRef(true);
  const drag = useRef<{
      start: Point;
      hall: Hall;
      ids: string[];
      pan?: Point;
      handle?: "resize" | "rotate";
    } | null>(null),
    pointers = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const scale = hall
    ? Math.min((frameWidth - 70) / hall.width, 480 / hall.length) * zoom
    : 20;
  const offset = { x: 45 + pan.x, y: 35 + pan.y };
  const issues = useMemo(
    () => (hall ? validateLayout(hall, data) : []),
    [hall, data.tables, data.assignments, data.guests, data.households],
  );
  const element = hall?.elements.find((e) => e.id === selected[0]);
  const table = data.tables.find((t) => t.id === element?.tableId);
  function persist(h: Hall) {
    pending.current = h;
    setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 450);
  }
  function flush() {
    const h = pending.current;
    if (!h) return;
    queue.current = queue.current.then(async () => {
      try {
        hallSchema.parse(h);
        await repository.put("halls", h);
        lastSaved.current = h;
        if (pending.current === h) {
          pending.current = null;
          if (mounted.current) setStatus("Saved locally");
        }
      } catch (e) {
        if (mounted.current) {
          setStatus("Save failed — changes retained");
          setError(String(e));
        }
      }
    });
  }
  function commit(next: Hall, label: string) {
    try {
      hallSchema.parse(next);
      if (hall && next.id === hall.id)
        setHistory((old) => record(old, { label, before: hall, after: next }));
      setData((old) => ({
        ...old,
        halls: old.halls.some((h) => h.id === next.id)
          ? old.halls.map((h) => (h.id === next.id ? next : h))
          : [...old.halls, next],
      }));
      if (hall && next.id !== hall.id) {
        flush();
        setHistory({ past: [], future: [] });
      }
      persist(next);
      setPreview(null);
      setError("");
    } catch (e) {
      setError(`Invalid layout: ${String(e)}`);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const resize = () => {
      setSmall(window.innerWidth < 600);
      if (frame.current) setFrameWidth(frame.current.clientWidth);
    };
    resize();
    const preventWheel = (event: WheelEvent) => event.preventDefault();
    const canvas = svg.current;
    canvas?.addEventListener("wheel", preventWheel, { passive: false });
    const ro = new ResizeObserver(resize);
    if (frame.current) ro.observe(frame.current);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      canvas?.removeEventListener("wheel", preventWheel);
      window.removeEventListener("resize", resize);
    };
  }, [hall?.id]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigate = (e: Event) => {
      if (
        pending.current &&
        !confirm("Changes are still saving. Leave this designer?")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("hall-navigation", navigate);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      flush();
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("hall-navigation", navigate);
    };
  }, []);
  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>(
      ".hall-designer [role='dialog']",
    );
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
      ),
    ];
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (suggestion) setSuggestion(null);
        else if (help) setHelp(false);
        else setWizard(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [wizard, help, suggestion]);
  async function undo(direction: "undo" | "redo") {
    const result = travel(history, direction);
    if (!result) return;
    if (result.table) {
      try {
        await repository.put("tables", result.table);
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    setHistory(result.history);
    setData((old) => ({
      ...old,
      halls: old.halls.map((h) => (h.id === active ? result.hall : h)),
      tables: result.table
        ? old.tables.map((t) => (t.id === result.table!.id ? result.table! : t))
        : old.tables,
    }));
    persist(result.hall);
    setSelected([]);
  }
  function point(clientX: number, clientY: number) {
    const r = svg.current!.getBoundingClientRect();
    return worldPoint(
      { x: clientX - r.left, y: clientY - r.top },
      scale,
      offset,
    );
  }
  function move(ids: string[], dx: number, dy: number) {
    if (!hall) return;
    const next = moveElements(hall, ids, dx, dy);
    if (
      next.elements.some(
        (e) =>
          ids.includes(e.id) &&
          (e.x + e.width < 0 ||
            e.y + e.length < 0 ||
            e.x > hall.width ||
            e.y > hall.length),
      )
    ) {
      setError(
        "Placement rejected: an element would be completely outside the hall.",
      );
      return;
    }
    commit(next, "Move elements");
  }
  function update(patch: Partial<Element>) {
    if (!hall || !element) return;
    if (isLocked(hall, element) && !("locked" in patch)) {
      setError("Unlock this object and its layer before editing.");
      return;
    }
    const next = { ...element, ...patch };
    if (table?.shape === "round" && patch.width) next.length = patch.width;
    commit(
      {
        ...hall,
        elements: hall.elements.map((e) => (e.id === element.id ? next : e)),
      },
      "Edit element",
    );
  }
  async function updateTable(patch: Partial<SeatingTable>) {
    if (!table || !hall || !element || isLocked(hall, element)) return;
    const next = { ...table, ...patch, updatedAt: new Date().toISOString() };
    if (
      !Number.isInteger(next.capacity) ||
      next.capacity < 1 ||
      next.capacity > 200 ||
      next.reservedSeats < 0 ||
      next.reservedSeats > next.capacity
    ) {
      setError(
        "Capacity must be 1–200; reserved seats cannot exceed capacity.",
      );
      return;
    }
    try {
      await repository.put("tables", next);
      const assignments =
        patch.locked === undefined
          ? data.assignments
          : data.assignments.map((assignment) =>
              assignment.tableId === next.id
                ? { ...assignment, locked: patch.locked! }
                : assignment,
            );
      if (patch.locked !== undefined)
        await Promise.all(
          assignments
            .filter((assignment) => assignment.tableId === next.id)
            .map((assignment) => repository.put("assignments", assignment)),
        );
      setHistory((old) =>
        record(old, {
          label: "Edit shared table",
          before: hall,
          after: hall,
          beforeTable: table,
          afterTable: next,
        }),
      );
      setData((old) => ({
        ...old,
        tables: old.tables.map((t) => (t.id === next.id ? next : t)),
        assignments,
      }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function add(
    type: string,
    p: Point = { x: hall ? hall.width / 2 : 2, y: hall ? hall.length / 2 : 2 },
    existing?: SeatingTable,
  ) {
    if (!hall || small) return;
    const e = newElement(
      type,
      snapping ? snap(p.x, hall.grid) : p.x,
      snapping ? snap(p.y, hall.grid) : p.y,
    );
    if (
      e.x > hall.width ||
      e.y > hall.length ||
      e.x + e.width < 0 ||
      e.y + e.length < 0
    ) {
      setError("Drop the element inside the hall.");
      return;
    }
    if (e.layer === "Tables and seating" && /table/i.test(type)) {
      let t = existing;
      if (!t) {
        const stamp = new Date().toISOString();
        t = {
          id: crypto.randomUUID(),
          createdAt: stamp,
          updatedAt: stamp,
          name: `Table ${data.tables.length + 1}`,
          group: "",
          capacity: type === "Cocktail table" ? 4 : 8,
          reservedSeats: 0,
          locked: false,
          shape:
            type === "Round table"
              ? "round"
              : type === "Square table"
                ? "custom"
                : "rectangle",
          notes: "",
          displayOrder: data.tables.length,
        };
        try {
          await repository.put("tables", t);
          setData((old) => ({ ...old, tables: [...old.tables, t!] }));
        } catch (err) {
          setError(String(err));
          return;
        }
      }
      e.tableId = t.id;
      e.name = t.name;
      if (t.shape === "rectangle") e.length = 1.2;
    }
    commit({ ...hall, elements: [...hall.elements, e] }, "Add element");
    setSelected([e.id]);
  }
  async function duplicate(
    items = hall?.elements.filter((e) => selected.includes(e.id)) ?? [],
  ) {
    if (!hall) return;
    const copies: Element[] = [];
    try {
      for (const e of items.filter((e) => !isLocked(hall, e))) {
        const copy = {
          ...e,
          id: crypto.randomUUID(),
          x: e.x + hall.grid,
          y: e.y + hall.grid,
        };
        if (copy.x > hall.width || copy.y > hall.length) {
          setError(
            "Duplicate would be outside the hall. Move the original inward first.",
          );
          return;
        }
        const t = data.tables.find((t) => t.id === e.tableId);
        if (t) {
          const next = {
            ...t,
            id: crypto.randomUUID(),
            name: `${t.name} copy`,
            locked: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await repository.put("tables", next);
          setData((old) => ({ ...old, tables: [...old.tables, next] }));
          copy.tableId = next.id;
          copy.name = next.name;
        }
        copies.push(copy);
      }
      if (copies.length) {
        commit(
          { ...hall, elements: [...hall.elements, ...copies] },
          "Duplicate elements",
        );
        setSelected(copies.map((e) => e.id));
      }
    } catch (e) {
      setError(String(e));
    }
  }
  function remove() {
    if (!hall) return;
    const unlocked = hall.elements.filter(
      (e) => selected.includes(e.id) && !isLocked(hall, e),
    );
    if (
      unlocked.some(
        (e) =>
          e.tableId && data.assignments.some((a) => a.tableId === e.tableId),
      ) &&
      !confirm(
        "Remove assigned tables from this floor plan? Their shared seating records and guests will remain.",
      )
    )
      return;
    commit(
      { ...hall, elements: hall.elements.filter((e) => !unlocked.includes(e)) },
      "Delete placements",
    );
    setSelected([]);
  }
  function onObjectDown(event: React.PointerEvent<SVGGElement>, e: Element) {
    if (!hall || small || routing || panMode) return;
    event.stopPropagation();
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
      setPreview(null);
      return;
    }
    const ids =
      event.shiftKey || multiSelect
        ? [...new Set([...selected, e.id])]
        : selected.includes(e.id)
          ? selected
          : [e.id];
    setSelected(ids);
    if (isLocked(hall, e)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: point(event.clientX, event.clientY), hall, ids };
  }
  const objectDownRef = useRef(onObjectDown);
  objectDownRef.current = onObjectDown;
  const stableObjectDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, e: Element) =>
      objectDownRef.current(event, e),
    [],
  );
  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoom(
        Math.max(
          0.25,
          Math.min(
            5,
            (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              pinch.current.distance,
          ),
        ),
      );
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.pan) {
      setPan({
        x: d.pan.x + event.clientX - d.start.x,
        y: d.pan.y + event.clientY - d.start.y,
      });
      return;
    }
    const p = point(event.clientX, event.clientY);
    if (d.handle) {
      const e = d.hall.elements.find((e) => e.id === d.ids[0])!;
      const angle = (e.rotation * Math.PI) / 180,
        dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      let next: Element;
      if (d.handle === "resize") {
        let width = Math.max(
          0.2,
          e.width + dx * Math.cos(angle) + dy * Math.sin(angle),
        );
        let length = Math.max(
          0.2,
          e.length - dx * Math.sin(angle) + dy * Math.cos(angle),
        );
        if (snapping && !event.altKey) {
          width = Math.max(0.2, snap(width, hall!.grid));
          length = Math.max(0.2, snap(length, hall!.grid));
        }
        if (data.tables.find((t) => t.id === e.tableId)?.shape === "round")
          length = width;
        next = { ...e, width, length };
      } else {
        const cx = e.x + e.width / 2,
          cy = e.y + e.length / 2;
        let rotation =
          e.rotation +
          ((Math.atan2(p.y - cy, p.x - cx) -
            Math.atan2(d.start.y - cy, d.start.x - cx)) *
            180) /
            Math.PI;
        if (!event.altKey) rotation = Math.round(rotation / 5) * 5;
        next = { ...e, rotation: ((rotation + 540) % 360) - 180 };
      }
      setPreview({
        ...d.hall,
        elements: d.hall.elements.map((a) => (a.id === e.id ? next : a)),
      });
      return;
    }
    let dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (snapping && !event.altKey) {
      dx = snap(dx, d.hall.grid);
      dy = snap(dy, d.hall.grid);
    }
    setPreview(moveElements(d.hall, d.ids, dx, dy));
  }
  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d && !d.pan && preview) {
      if (
        preview.elements.some(
          (e) =>
            d.ids.includes(e.id) &&
            (e.x > preview.width ||
              e.y > preview.length ||
              e.x + e.width < 0 ||
              e.y + e.length < 0),
        )
      ) {
        setPreview(null);
        setError("Move rejected: an element was completely outside the hall.");
      } else
        commit(
          preview,
          d.handle === "resize"
            ? "Resize element"
            : d.handle === "rotate"
              ? "Rotate element"
              : "Move elements",
        );
    }
  }
  function finishFlow() {
    if (!hall || !routing || routing.length < 2) return;
    const f: Flow = {
      id: crypto.randomUUID(),
      name: flowKind,
      kind: flowKind,
      color: "#497a91",
      style: "solid",
      visible: true,
      points: routing,
    };
    commit({ ...hall, flows: [...hall.flows, f] }, "Add flow path");
    setRouting(null);
  }
  const displayed = (v: number) =>
    Number(convert(v, "m", hall?.unit ?? "m").toFixed(3));
  function numberField(
    label: string,
    value: number,
    change: (v: number) => void,
    measure = true,
  ) {
    return (
      <label key={label}>
        {label}
        {measure ? ` (${hall?.unit ?? draft.unit})` : ""}
        <input
          key={`${active}-${label}-${value}`}
          type="number"
          step="any"
          defaultValue={measure ? displayed(value) : value}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (
              e.target.value !== "" &&
              Number.isFinite(n) &&
              n !== (measure ? displayed(value) : value)
            )
              change(measure ? convert(n, hall?.unit ?? draft.unit, "m") : n);
          }}
        />
      </label>
    );
  }
  return (
    <div
      className="hall-designer"
      onKeyDown={(e) => {
        if (
          small ||
          /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
        )
          return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key === "z") {
          e.preventDefault();
          undo(e.shiftKey ? "redo" : "undo");
        } else if (mod && e.key === "y") {
          e.preventDefault();
          undo("redo");
        } else if (mod && e.key === "c") {
          e.preventDefault();
          clipboard.current =
            hall?.elements.filter((x) => selected.includes(x.id)) ?? [];
        } else if (mod && e.key === "v") {
          e.preventDefault();
          duplicate(clipboard.current);
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          remove();
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          const d = (e.shiftKey ? 10 : 1) * (hall?.grid ?? 0.5);
          move(
            selected,
            e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0,
            e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0,
          );
        } else if (e.key === "Escape") {
          setRouting(null);
          setSelected([]);
        }
      }}
      tabIndex={0}
    >
      <div className="hall-heading">
        <div>
          <h2>A place for every moment</h2>
          <p>Arrange your space, seat your guests, and plan the flow.</p>
        </div>
        <span role="status">{status}</span>
        <button onClick={() => setHelp(true)}>Keyboard help</button>
        {!small && (
          <button
            className="primary"
            onClick={() => {
              setDraft(newHall());
              setStep(1);
              setWizard(true);
            }}
          >
            Create hall
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {small && (
        <p className="alert">
          Mobile view: browse, zoom, and export your plan. Use a tablet or
          desktop to edit.
        </p>
      )}
      {hall && shown && (
        <>
          <div className="hall-toolbar">
            <label>
              Space
              <select
                value={active}
                onChange={(e) => {
                  if (
                    pending.current &&
                    !confirm("Changes are saving. Switch spaces?")
                  )
                    return;
                  flush();
                  setActive(e.target.value);
                  setSelected([]);
                  setHistory({ past: [], future: [] });
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                {data.halls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              View
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="complete">Complete layout</option>
                <option value="seating">Seating only</option>
                <option value="flow">Flow View</option>
              </select>
            </label>
            <button onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}>
              −
            </button>
            <output>{Math.round(zoom * 100)}%</output>
            <button onClick={() => setZoom((z) => Math.min(5, z * 1.2))}>
              +
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Fit to screen / Reset
            </button>
            {!small && (
              <button
                aria-pressed={multiSelect}
                onClick={() => setMultiSelect(!multiSelect)}
              >
                Multi-select
              </button>
            )}
            <button aria-pressed={panMode} onClick={() => setPanMode(!panMode)}>
              Pan
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={grid}
                onChange={(e) => setGrid(e.target.checked)}
              />
              Grid
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={snapping}
                onChange={(e) => setSnapping(e.target.checked)}
              />
              Snap
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={clearance}
                onChange={(e) => setClearance(e.target.checked)}
              />
              Clearance
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={guestNames}
                onChange={(e) => setGuestNames(e.target.checked)}
              />
              Guest names
            </label>
            {!small && (
              <>
                <button
                  disabled={!history.past.length}
                  onClick={() => undo("undo")}
                >
                  Undo
                </button>
                <button
                  disabled={!history.future.length}
                  onClick={() => undo("redo")}
                >
                  Redo
                </button>
              </>
            )}
          </div>
          <div className="hall-workspace">
            {!small && (
              <aside className="hall-library">
                <h3>Element library</h3>
                <p>Drag into the hall, or tap to add.</p>
                {Object.entries(library).map(([group, items]) => (
                  <details key={group} open={group === "Wedding facilities"}>
                    <summary>{group}</summary>
                    <div className="library-grid">
                      {items.map((type) => (
                        <button
                          key={type}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", type)
                          }
                          onClick={() => add(type)}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
                <details open>
                  <summary>Unplaced seating tables</summary>
                  {data.tables
                    .filter(
                      (t) =>
                        !data.halls.some((h) =>
                          h.elements.some((e) => e.tableId === t.id),
                        ),
                    )
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() =>
                          add(
                            t.shape === "round"
                              ? "Round table"
                              : "Rectangular table",
                            undefined,
                            t,
                          )
                        }
                      >
                        {t.name} · {t.capacity} seats
                      </button>
                    ))}
                </details>
                <button
                  onClick={() =>
                    setSuggestion(
                      suggest(
                        hall,
                        data.tables.filter(
                          (t) =>
                            !data.halls.some(
                              (h) =>
                                h.id !== hall.id &&
                                h.elements.some((e) => e.tableId === t.id),
                            ),
                        ),
                      ),
                    )
                  }
                >
                  Suggest Table Layout
                </button>
              </aside>
            )}
            <div className="hall-stage" ref={frame}>
              <svg
                ref={svg}
                width="100%"
                height="560"
                aria-label="Wedding hall floor plan"
                role="application"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const type = e.dataTransfer.getData("text/plain");
                  if (
                    Object.values(library)
                      .flat()
                      .some((t) => t === type)
                  )
                    add(type, point(e.clientX, e.clientY));
                }}
                onWheel={(e) =>
                  setZoom((z) =>
                    Math.max(
                      0.25,
                      Math.min(5, z * Math.exp(-e.deltaY * 0.002)),
                    ),
                  )
                }
                onPointerDown={(e) => {
                  pointers.current.set(e.pointerId, {
                    x: e.clientX,
                    y: e.clientY,
                  });
                  e.currentTarget.setPointerCapture(e.pointerId);
                  if (pointers.current.size === 2) {
                    const [a, b] = [...pointers.current.values()];
                    pinch.current = {
                      distance: Math.hypot(a.x - b.x, a.y - b.y),
                      zoom,
                    };
                    drag.current = null;
                    setPreview(null);
                    return;
                  }
                  if (routing && !small) {
                    const p = point(e.clientX, e.clientY);
                    if (
                      p.x >= 0 &&
                      p.y >= 0 &&
                      p.x <= hall.width &&
                      p.y <= hall.length
                    )
                      setRouting([...routing, p]);
                    return;
                  }
                  if (panMode || e.button === 1 || small)
                    drag.current = {
                      start: { x: e.clientX, y: e.clientY },
                      hall,
                      ids: [],
                      pan,
                    };
                  else setSelected([]);
                }}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setPreview(null);
                  pointers.current.clear();
                }}
              >
                <rect width="100%" height="100%" fill="#eeeae3" />
                <g
                  transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}
                >
                  <Rulers hall={hall} />
                  <Plan
                    hall={shown}
                    data={data}
                    selected={selected}
                    grid={grid}
                    clearance={clearance}
                    guests={guestNames}
                    mode={mode}
                    onDown={stableObjectDown}
                  />
                  {!small &&
                    element &&
                    !isLocked(hall, element) &&
                    (() => {
                      const e = effectiveDimensions(
                        shown.elements.find((a) => a.id === element.id)!,
                        table,
                      );
                      const start = (
                        event: React.PointerEvent<SVGCircleElement>,
                        handle: "resize" | "rotate",
                      ) => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = {
                          start: point(event.clientX, event.clientY),
                          hall,
                          ids: [element.id],
                          handle,
                        };
                      };
                      return (
                        <g
                          transform={`translate(${e.x} ${e.y}) rotate(${e.rotation} ${e.width / 2} ${e.length / 2})`}
                        >
                          <line
                            x1={e.width / 2}
                            y1={0}
                            x2={e.width / 2}
                            y2={-0.8}
                            stroke="#2563eb"
                            strokeWidth=".04"
                          />
                          <circle
                            aria-label="Rotate selected element"
                            cx={e.width / 2}
                            cy={-0.8}
                            r={Math.max(0.2, 10 / scale)}
                            fill="#2563eb"
                            onPointerDown={(event) => start(event, "rotate")}
                          />
                          <circle
                            aria-label="Resize selected element"
                            cx={e.width}
                            cy={e.length}
                            r={Math.max(0.2, 10 / scale)}
                            fill="#2563eb"
                            onPointerDown={(event) => start(event, "resize")}
                          />
                        </g>
                      );
                    })()}
                  {routing && (
                    <polyline
                      points={routing.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth=".09"
                    />
                  )}
                  {preview &&
                    selected.length > 0 &&
                    preview.elements
                      .filter((e) => selected.includes(e.id))
                      .flatMap((e) =>
                        preview.elements
                          .filter(
                            (b) =>
                              b.id !== e.id &&
                              (Math.abs(b.x - e.x) < 0.05 ||
                                Math.abs(b.y - e.y) < 0.05),
                          )
                          .map((b) => (
                            <path
                              key={`${e.id}${b.id}`}
                              d={`M ${e.x} 0 V ${hall.length} M 0 ${e.y} H ${hall.width}`}
                              stroke="#2563eb"
                              strokeDasharray=".15 .1"
                              strokeWidth=".025"
                            />
                          )),
                      )}
                </g>
              </svg>
              <div className="hall-stage-caption">
                {displayed(hall.width)} × {displayed(hall.length)} {hall.unit} ·{" "}
                {hall.elements.length} elements ·{" "}
                {hall.elements.filter((e) => e.tableId).length} tables
              </div>
            </div>
            {!small && (
              <aside className="hall-properties">
                <h3>{element ? "Element properties" : "Hall settings"}</h3>
                {element ? (
                  <>
                    <label>
                      Name
                      <input
                        key={`${element.id}-${table?.name ?? element.name}`}
                        defaultValue={table?.name ?? element.name}
                        onBlur={(e) => {
                          if (e.target.value === (table?.name ?? element.name))
                            return;
                          if (table) updateTable({ name: e.target.value });
                          else update({ name: e.target.value });
                        }}
                        disabled={isLocked(hall, element)}
                      />
                    </label>
                    <p>{element.type}</p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={element.locked}
                        onChange={(e) => update({ locked: e.target.checked })}
                      />
                      Lock object
                    </label>
                    <fieldset disabled={isLocked(hall, element)}>
                      {numberField("X position", element.x, (v) =>
                        update({ x: v }),
                      )}
                      {numberField("Y position", element.y, (v) =>
                        update({ y: v }),
                      )}
                      {numberField(
                        table?.shape === "round" ? "Diameter" : "Width",
                        element.width,
                        (v) => update({ width: v }),
                      )}
                      {table?.shape !== "round" &&
                        numberField("Length", element.length, (v) =>
                          update({ length: v }),
                        )}
                      {numberField(
                        "Rotation",
                        element.rotation,
                        (v) => update({ rotation: v }),
                        false,
                      )}
                      <label>
                        Colour
                        <input
                          type="color"
                          value={element.color}
                          onChange={(e) => update({ color: e.target.value })}
                        />
                      </label>
                      <label>
                        Notes
                        <textarea
                          key={`${element.id}-${element.notes}`}
                          defaultValue={element.notes}
                          onBlur={(e) => {
                            if (e.target.value !== element.notes)
                              update({ notes: e.target.value });
                          }}
                        />
                      </label>
                      {numberField(
                        "Required clearance",
                        element.clearance,
                        (v) => update({ clearance: v }),
                      )}
                      <label>
                        Service direction
                        <input
                          key={`${element.id}-${element.serviceDirection}`}
                          defaultValue={element.serviceDirection}
                          onBlur={(e) => {
                            if (e.target.value !== element.serviceDirection)
                              update({ serviceDirection: e.target.value });
                          }}
                        />
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={element.labelVisible}
                          onChange={(e) =>
                            update({ labelVisible: e.target.checked })
                          }
                        />
                        Show label
                      </label>
                      {table ? (
                        <>
                          <label>
                            Shape
                            <select
                              value={table.shape}
                              onChange={(e) =>
                                updateTable({
                                  shape: e.target
                                    .value as SeatingTable["shape"],
                                })
                              }
                            >
                              <option value="round">Round</option>
                              <option value="rectangle">Rectangular</option>
                              <option value="custom">Custom</option>
                            </select>
                          </label>
                          {numberField(
                            "Seating capacity",
                            table.capacity,
                            (v) => updateTable({ capacity: v }),
                            false,
                          )}
                          {numberField(
                            "Reserved seats",
                            table.reservedSeats,
                            (v) => updateTable({ reservedSeats: v }),
                            false,
                          )}
                          <label>
                            Seating group
                            <input
                              key={`${table.id}-${table.group}`}
                              defaultValue={table.group}
                              onBlur={(e) => {
                                if (e.target.value !== table.group)
                                  updateTable({ group: e.target.value });
                              }}
                            />
                          </label>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={table.locked}
                              onChange={(e) =>
                                updateTable({ locked: e.target.checked })
                              }
                            />
                            Lock seating assignment
                          </label>
                          <h4>Assigned guests / households</h4>
                          <p>
                            {assignmentNames(data, table.id).join(", ") ||
                              "No assigned guests. Assign guests in Seating."}
                          </p>
                        </>
                      ) : (
                        numberField(
                          "Area capacity",
                          element.capacity,
                          (v) => update({ capacity: v }),
                          false,
                        )
                      )}
                      <div className="hall-actions">
                        <button onClick={() => duplicate()}>Duplicate</button>
                        <button
                          onClick={() => {
                            clipboard.current = hall.elements.filter((e) =>
                              selected.includes(e.id),
                            );
                          }}
                        >
                          Copy
                        </button>
                        <button onClick={() => duplicate(clipboard.current)}>
                          Paste
                        </button>
                        <button onClick={remove}>Delete placement</button>
                        <button
                          onClick={() =>
                            commit(
                              {
                                ...hall,
                                elements: [
                                  ...hall.elements.filter(
                                    (e) => e.id !== element.id,
                                  ),
                                  element,
                                ],
                              },
                              "Bring forward",
                            )
                          }
                        >
                          Bring forward
                        </button>
                        <button
                          onClick={() =>
                            commit(
                              {
                                ...hall,
                                elements: [
                                  element,
                                  ...hall.elements.filter(
                                    (e) => e.id !== element.id,
                                  ),
                                ],
                              },
                              "Send backward",
                            )
                          }
                        >
                          Send backward
                        </button>
                        {[
                          ["←", -1, 0],
                          ["→", 1, 0],
                          ["↑", 0, -1],
                          ["↓", 0, 1],
                        ].map(([label, x, y]) => (
                          <button
                            key={label}
                            aria-label={`Move ${label}`}
                            onClick={() =>
                              move(
                                selected,
                                Number(x) * hall.grid,
                                Number(y) * hall.grid,
                              )
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </>
                ) : (
                  <>
                    <label>
                      Hall name
                      <input
                        key={`${hall.id}-${hall.name}`}
                        defaultValue={hall.name}
                        onBlur={(e) => {
                          if (e.target.value !== hall.name)
                            commit(
                              { ...hall, name: e.target.value },
                              "Rename hall",
                            );
                        }}
                      />
                    </label>
                    <label>
                      Measurement unit
                      <select
                        value={hall.unit}
                        onChange={(e) =>
                          commit(
                            { ...hall, unit: e.target.value as Hall["unit"] },
                            "Convert units",
                          )
                        }
                      >
                        <option value="m">Metres</option>
                        <option value="ft">Feet</option>
                      </select>
                    </label>
                    {(["width", "length"] as const).map((key) =>
                      numberField(`Hall ${key}`, hall[key], (v) => {
                        const next = { ...hall, [key]: v };
                        if (
                          hall.elements.some((e) =>
                            outside(
                              effectiveDimensions(
                                e,
                                data.tables.find((t) => t.id === e.tableId),
                              ),
                              next,
                            ),
                          ) &&
                          !confirm(
                            "Some elements will extend outside the resized hall. Keep their positions and show warnings?",
                          )
                        )
                          return;
                        commit(next, "Resize hall");
                      }),
                    )}
                    {numberField("Grid size", hall.grid, (v) =>
                      commit({ ...hall, grid: v }, "Change grid"),
                    )}
                    {numberField(
                      "Preferred minimum clearance",
                      hall.clearance,
                      (v) =>
                        commit({ ...hall, clearance: v }, "Change clearance"),
                    )}
                    {numberField("Ceiling height", hall.ceiling ?? 3, (v) =>
                      commit({ ...hall, ceiling: v }, "Change ceiling"),
                    )}
                    <label>
                      Background colour
                      <input
                        type="color"
                        value={hall.background}
                        onChange={(e) =>
                          commit(
                            { ...hall, background: e.target.value },
                            "Background colour",
                          )
                        }
                      />
                    </label>
                    <label>
                      Hall notes
                      <textarea
                        key={`${hall.id}-${hall.notes}`}
                        defaultValue={hall.notes}
                        onBlur={(e) => {
                          if (e.target.value !== hall.notes)
                            commit(
                              { ...hall, notes: e.target.value },
                              "Hall notes",
                            );
                        }}
                      />
                    </label>
                  </>
                )}
              </aside>
            )}
          </div>
          <div className="hall-bottom">
            <section className="panel">
              <h3>Elements · accessible list</h3>
              <div className="hall-element-list">
                {hall.elements.map((e) => (
                  <button
                    key={e.id}
                    aria-pressed={selected.includes(e.id)}
                    onClick={(event) =>
                      setSelected(
                        event.shiftKey || multiSelect
                          ? [...new Set([...selected, e.id])]
                          : [e.id],
                      )
                    }
                  >
                    {data.tables.find((t) => t.id === e.tableId)?.name ??
                      e.name}{" "}
                    · {e.type} · {displayed(e.x)}, {displayed(e.y)} {hall.unit}
                    {isLocked(hall, e) ? " · Locked" : ""}
                    {issues.some((i) => i.ids.includes(e.id))
                      ? " · Placement issues"
                      : ""}
                  </button>
                ))}
              </div>
            </section>
            <section className="panel">
              <h3>Placement review ({issues.length})</h3>
              <div className="hall-issues">
                {issues.slice(0, 150).map((issue, i) => (
                  <button key={i} onClick={() => setSelected(issue.ids)}>
                    <strong>{issue.level}</strong> · {issue.message}
                  </button>
                ))}
                {issues.length > 150 && (
                  <p>
                    {issues.length - 150} additional issues. Resolve visible
                    issues to reduce conflicts.
                  </p>
                )}
                {!issues.length && <p>No placement issues detected.</p>}
              </div>
            </section>
            {!small && (
              <section className="panel">
                <h3>Layers & flow paths</h3>
                {hall.layers.map((l, i) => (
                  <div className="hall-layer" key={l.name}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={l.visible}
                        onChange={(e) =>
                          commit(
                            {
                              ...hall,
                              layers: hall.layers.map((a) =>
                                a === l
                                  ? { ...a, visible: e.target.checked }
                                  : a,
                              ),
                            },
                            "Layer visibility",
                          )
                        }
                      />
                      {l.name}
                    </label>
                    <button
                      onClick={() =>
                        commit(
                          {
                            ...hall,
                            layers: hall.layers.map((a) =>
                              a === l ? { ...a, locked: !a.locked } : a,
                            ),
                          },
                          "Layer lock",
                        )
                      }
                    >
                      {l.locked ? "Unlock" : "Lock"}
                    </button>
                    <button
                      aria-label={`Raise ${l.name}`}
                      disabled={i === hall.layers.length - 1}
                      onClick={() => {
                        const layers = [...hall.layers];
                        [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
                        commit({ ...hall, layers }, "Layer order");
                      }}
                    >
                      ↑
                    </button>
                  </div>
                ))}
                <label>
                  Flow category
                  <select
                    value={flowKind}
                    onChange={(e) => setFlowKind(e.target.value)}
                  >
                    {flowKinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={
                    !!hall.layers.find((l) => l.name === "Flow paths")?.locked
                  }
                  onClick={() => {
                    setMode("flow");
                    setRouting([]);
                  }}
                >
                  Draw flow path
                </button>
                {routing && (
                  <>
                    <p>
                      Tap the start, intermediate points, and end on the plan.
                    </p>
                    <button disabled={routing.length < 2} onClick={finishFlow}>
                      Finish path
                    </button>
                    <button onClick={() => setRouting(null)}>
                      Cancel path
                    </button>
                  </>
                )}
                {hall.flows.map((f) => (
                  <details key={f.id}>
                    <summary>{f.name}</summary>
                    <fieldset
                      disabled={
                        hall.layers.find((l) => l.name === "Flow paths")?.locked
                      }
                    >
                      <label>
                        Route label
                        <input
                          value={f.name}
                          onChange={(e) => {
                            commit(
                              {
                                ...hall,
                                flows: hall.flows.map((a) =>
                                  a === f ? { ...a, name: e.target.value } : a,
                                ),
                              },
                              "Flow label",
                            );
                          }}
                        />
                      </label>
                      <label>
                        Route colour
                        <input
                          type="color"
                          value={f.color}
                          onChange={(e) =>
                            commit(
                              {
                                ...hall,
                                flows: hall.flows.map((a) =>
                                  a === f ? { ...a, color: e.target.value } : a,
                                ),
                              },
                              "Flow colour",
                            )
                          }
                        />
                      </label>
                      <label>
                        Line style
                        <select
                          value={f.style}
                          onChange={(e) =>
                            commit(
                              {
                                ...hall,
                                flows: hall.flows.map((a) =>
                                  a === f
                                    ? {
                                        ...a,
                                        style: e.target.value as Flow["style"],
                                      }
                                    : a,
                                ),
                              },
                              "Flow style",
                            )
                          }
                        >
                          <option>solid</option>
                          <option>dashed</option>
                        </select>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={f.visible}
                          onChange={(e) =>
                            commit(
                              {
                                ...hall,
                                flows: hall.flows.map((a) =>
                                  a === f
                                    ? { ...a, visible: e.target.checked }
                                    : a,
                                ),
                              },
                              "Flow visibility",
                            )
                          }
                        />
                        Show route
                      </label>
                      {f.points.map((p, i) => (
                        <div key={i}>
                          {numberField(`Point ${i + 1} X`, p.x, (v) =>
                            commit(
                              {
                                ...hall,
                                flows: hall.flows.map((a) =>
                                  a === f
                                    ? {
                                        ...a,
                                        points: a.points.map((p, j) =>
                                          j === i ? { ...p, x: v } : p,
                                        ),
                                      }
                                    : a,
                                ),
                              },
                              "Edit flow point",
                            ),
                          )}
                          {numberField(`Point ${i + 1} Y`, p.y, (v) =>
                            commit(
                              {
                                ...hall,
                                flows: hall.flows.map((a) =>
                                  a === f
                                    ? {
                                        ...a,
                                        points: a.points.map((p, j) =>
                                          j === i ? { ...p, y: v } : p,
                                        ),
                                      }
                                    : a,
                                ),
                              },
                              "Edit flow point",
                            ),
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          commit(
                            {
                              ...hall,
                              flows: hall.flows.filter((a) => a !== f),
                            },
                            "Delete flow path",
                          )
                        }
                      >
                        Delete route
                      </button>
                    </fieldset>
                  </details>
                ))}
              </section>
            )}
            <section className="panel">
              <h3>Save & export</h3>
              <p>{disclaimer}</p>
              <label>
                Paper size
                <select
                  value={paper}
                  onChange={(e) => setPaper(e.target.value)}
                >
                  <option>A4</option>
                  <option>A3</option>
                </select>
              </label>
              <label>
                Orientation
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                >
                  <option>landscape</option>
                  <option>portrait</option>
                </select>
              </label>
              <button
                onClick={() =>
                  exportPng(hall, data, mode, paper, orientation).catch((e) =>
                    setError(String(e)),
                  )
                }
              >
                Export full plan PNG
              </button>
              <button
                onClick={() => {
                  try {
                    printPlan(hall, data, mode, paper, orientation);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Print / Export PDF & directories
              </button>
              {!small && (
                <>
                  <button
                    onClick={() => {
                      const { id: _id, snapshots, ...layout } = hall;
                      commit(
                        {
                          ...hall,
                          snapshots: [
                            ...snapshots,
                            {
                              id: crypto.randomUUID(),
                              date: new Date().toISOString(),
                              layout,
                            },
                          ].slice(-5),
                        },
                        "Save snapshot",
                      );
                    }}
                  >
                    Save snapshot
                  </button>
                  {hall.snapshots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (
                          confirm(
                            "Restore this local snapshot? You can undo this change.",
                          )
                        )
                          commit({ ...hall, ...s.layout }, "Restore snapshot");
                      }}
                    >
                      Restore {new Date(s.date).toLocaleString()}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      if (
                        lastSaved.current &&
                        lastSaved.current.id === active &&
                        confirm("Recover the last successfully saved layout?")
                      )
                        commit(lastSaved.current, "Recover saved layout");
                    }}
                  >
                    Recover last saved layout
                  </button>
                  <label>
                    Starter layout
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const name = e.target.value;
                        if (!name) return;
                        if (
                          hall.elements.length &&
                          !confirm(
                            "Replace current elements with this template? Shared seating tables remain available.",
                          )
                        )
                          return;
                        const target = e.target;
                        const template = starterLayout(hall, name);
                        Promise.all(
                          template.tables.map((t) =>
                            repository.put("tables", t),
                          ),
                        )
                          .then(() => {
                            setData((old) => ({
                              ...old,
                              tables: [...old.tables, ...template.tables],
                            }));
                            commit(template.hall, "Apply template");
                            if (template.failed.length)
                              setError(template.failed.join(" "));
                          })
                          .catch((error) => setError(String(error)));
                        target.value = "";
                        e.target.value = "";
                      }}
                    >
                      <option value="">Choose template…</option>
                      {templates.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {wizard && !small && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create wedding space"
          >
            <h2>Create wedding space · {step}/2</h2>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (step === 1) {
                  setStep(2);
                  return;
                }
                try {
                  hallSchema.parse(draft);
                  commit(draft, "Create hall");
                  setActive(draft.id);
                  setWizard(false);
                } catch {
                  setError(
                    "Use positive dimensions up to 150 m and a grid from 0.05 to 10 m.",
                  );
                }
              }}
            >
              {step === 1 ? (
                <>
                  <label>
                    Hall name
                    <input
                      required
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Measurement unit
                    <select
                      value={draft.unit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          unit: e.target.value as Hall["unit"],
                        })
                      }
                    >
                      <option value="m">Metres</option>
                      <option value="ft">Feet</option>
                    </select>
                  </label>
                  {(["width", "length"] as const).map((k) => (
                    <label key={k}>
                      Hall {k} ({draft.unit})
                      <input
                        required
                        type="number"
                        step="any"
                        min="0.01"
                        max={convert(150, "m", draft.unit)}
                        value={Number(
                          convert(draft[k], "m", draft.unit).toFixed(3),
                        )}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [k]: convert(
                              Number(e.target.value),
                              draft.unit,
                              "m",
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </>
              ) : (
                <>
                  <p>
                    {draft.name}:{" "}
                    {convert(draft.width, "m", draft.unit).toFixed(2)} ×{" "}
                    {convert(draft.length, "m", draft.unit).toFixed(2)}{" "}
                    {draft.unit}
                  </p>
                  <label>
                    Grid size ({draft.unit})
                    <input
                      type="number"
                      step="any"
                      min={convert(0.05, "m", draft.unit)}
                      max={convert(10, "m", draft.unit)}
                      value={Number(
                        convert(draft.grid, "m", draft.unit).toFixed(3),
                      )}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          grid: convert(
                            Number(e.target.value),
                            draft.unit,
                            "m",
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft({ ...draft, notes: e.target.value })
                      }
                    />
                  </label>
                  <button type="button" onClick={() => setStep(1)}>
                    Back
                  </button>
                </>
              )}
              <button className="primary">
                {step === 1 ? "Next" : "Create space"}
              </button>
              <button type="button" onClick={() => setWizard(false)}>
                Cancel
              </button>
            </form>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-label="Keyboard help"
            aria-modal="true"
          >
            <h2>Designer controls</h2>
            <p>
              Drag to move. Shift-click to select multiple elements. Arrow keys
              move one grid step; Shift + arrows moves ten. Alt temporarily
              bypasses snapping. Ctrl/⌘ + C and V copy and paste elements
              (duplicated tables start without guest assignments). Delete
              removes unlocked placements. Ctrl/⌘ + Z undoes; Shift + Z or Ctrl
              + Y redoes. Escape clears selection or cancels a route.
            </p>
            <p>
              Use Pan to drag the canvas. Scroll or pinch to zoom. Select items
              in the accessible list to edit exact measurements. Mobile provides
              a read-only plan.
            </p>
            <button onClick={() => setHelp(false)}>Close help</button>
          </section>
        </div>
      )}
      {suggestion && hall && (
        <div className="modal-backdrop">
          <section
            className="modal wide"
            role="dialog"
            aria-label="Suggested table layout"
            aria-modal="true"
          >
            <h2>Suggested table layout</h2>
            <p>
              {suggestion.placed.length} tables can be placed. Existing objects
              remain in position.
            </p>
            <svg
              viewBox={`-1 -1 ${hall.width + 2} ${hall.length + 2}`}
              width="100%"
              height="350"
            >
              <Plan
                hall={{
                  ...hall,
                  elements: [...hall.elements, ...suggestion.placed],
                }}
                data={data}
              />
            </svg>
            {suggestion.failed.map((s) => (
              <p key={s}>{s}</p>
            ))}
            <button
              onClick={() => {
                commit(
                  {
                    ...hall,
                    elements: [...hall.elements, ...suggestion.placed],
                  },
                  "Apply suggested layout",
                );
                setSuggestion(null);
              }}
            >
              Apply suggestion
            </button>
            <button onClick={() => setSuggestion(null)}>
              Cancel suggestion
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
