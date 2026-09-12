import { describe, it, expect } from "vitest";
import { newHall, newElement, validateHalls } from "./model";
import {
  convert,
  screenPoint,
  worldPoint,
  chairs,
  intersects,
  outside,
  segmentHits,
  suggest,
  effectiveDimensions,
} from "./geometry";
import { moveElements, record, travel } from "./commands";
import { validateLayout } from "./validation";
import { emptyData, createBackup, parseBackup } from "../../utils/domain";
import type { SeatingTable } from "../../types/models";
const table = (id = "t"): SeatingTable => ({
  id,
  name: id,
  capacity: 8,
  reservedSeats: 0,
  locked: false,
  shape: "round",
  group: "",
  notes: "",
  displayOrder: 0,
  createdAt: "",
  updatedAt: "",
});
describe("hall measurements and geometry", () => {
  it("converts feet and metres without changing physical measurements", () => {
    expect(convert(1, "ft", "m")).toBe(0.3048);
    expect(convert(convert(23, "m", "ft"), "ft", "m")).toBeCloseTo(23);
  });
  it("round trips screen coordinates at any zoom and pan", () => {
    for (const zoom of [0.25, 1, 5]) {
      const p = { x: 3.21, y: 9.8 },
        pan = { x: -30, y: 77 };
      const q = worldPoint(screenPoint(p, zoom * 20, pan), zoom * 20, pan);
      expect(q.x).toBeCloseTo(p.x);
      expect(q.y).toBeCloseTo(p.y);
    }
  });
  it("uses a shared table shape for effective dimensions", () => {
    expect(
      effectiveDimensions(
        { ...newElement("Round table"), width: 3, length: 1 },
        table(),
      ).length,
    ).toBe(3);
  });
  it("distributes round chairs evenly", () => {
    const e = newElement("Round table");
    const c = chairs(e, 8, true);
    expect(c).toHaveLength(8);
    for (const p of c) expect(Math.hypot(p.x - 1, p.y - 1)).toBeCloseTo(1.3);
  });
  it("distributes rectangular chairs on all sides", () => {
    const c = chairs(newElement("Rectangular table"), 8, false);
    expect(c.some((p) => p.x === -0.3)).toBe(true);
    expect(c.some((p) => p.y === -0.3)).toBe(true);
    expect(c.some((p) => p.x === 2.3)).toBe(true);
    expect(c.some((p) => p.y === 2.3)).toBe(true);
  });
  it("detects boundaries including rotated corners", () => {
    const h = newHall(),
      e = newElement("Wedding stage", 0, 0);
    expect(outside(e, h)).toBe(false);
    expect(outside({ ...e, rotation: 45 }, h)).toBe(true);
  });
  it("detects rectangle collisions and permits touching edges", () => {
    const a = newElement("Pillar", 1, 1);
    expect(intersects(a, { ...a, x: 1.2 })).toBe(true);
    expect(intersects(a, { ...a, x: 1.6 })).toBe(false);
  });
  it("uses oriented geometry instead of only axis aligned boxes", () => {
    const a = {
      ...newElement("Wall or divider", 2, 2),
      width: 4,
      length: 0.2,
      rotation: 45,
    };
    expect(
      intersects(a, {
        ...newElement("Pillar", 3.8, 1.9),
        width: 0.3,
        length: 0.3,
      }),
    ).toBe(true);
    expect(
      intersects(a, { ...newElement("Pillar", 2, 3), width: 0.3, length: 0.3 }),
    ).toBe(false);
  });
  it("detects clearance conflicts deterministically", () => {
    const a = newElement("Pillar", 1, 1),
      b = newElement("Pillar", 2, 1);
    expect(intersects(a, b)).toBe(false);
    expect(intersects(a, b, 1)).toBe(true);
  });
  it("finds path intersections including rotated obstacles", () => {
    const e = { ...newElement("Wedding stage", 2, 2), rotation: 30 };
    expect(segmentHits({ x: 0, y: 3 }, { x: 12, y: 3 }, e)).toBe(true);
    expect(segmentHits({ x: 0, y: 0 }, { x: 12, y: 0 }, e)).toBe(false);
  });
});
describe("hall commands, seating and backup", () => {
  it("respects object and layer locks during multi movement", () => {
    const h = newHall(),
      a = { ...newElement("Pillar"), locked: true },
      b = newElement("Wedding stage");
    h.elements = [a, b];
    h.layers = h.layers.map((l) =>
      l.name === b.layer ? { ...l, locked: true } : l,
    );
    expect(moveElements(h, [a.id, b.id], 3, 3)).toEqual(h);
  });
  it("records bounded history and supports undo redo", () => {
    const before = newHall(),
      after = { ...before, width: 30 };
    let history = record(
      { past: [], future: [] },
      { label: "Resize", before, after },
    );
    expect(travel(history, "undo")?.hall.width).toBe(24);
    history = travel(history, "undo")!.history;
    expect(travel(history, "redo")?.hall.width).toBe(30);
    for (let i = 0; i < 100; i++)
      history = record(history, { label: "Resize", before, after });
    expect(history.past).toHaveLength(60);
  });
  it("places unplaced tables and respects obstacles and clearance", () => {
    const h = newHall();
    h.elements = [{ ...newElement("Wedding stage"), locked: true }];
    const result = suggest(h, [table("a"), table("b")]);
    expect(result.placed).toHaveLength(2);
    for (const e of result.placed) {
      expect(outside(e, h)).toBe(false);
      expect(intersects(e, h.elements[0], h.clearance)).toBe(false);
    }
    expect(intersects(result.placed[0], result.placed[1], h.clearance)).toBe(
      false,
    );
    expect(
      suggest({ ...h, elements: [...h.elements, ...result.placed] }, [
        table("a"),
        table("b"),
      ]).placed,
    ).toHaveLength(0);
  });
  it("places a representative 100-table plan without overlap", () => {
    const h = {
      ...newHall(),
      width: 100,
      length: 100,
      grid: 1,
      clearance: 0.5,
    };
    const tables = Array.from({ length: 100 }, (_, index) =>
      table(`table-${index}`),
    );
    const result = suggest(h, tables);
    expect(result.failed).toEqual([]);
    expect(result.placed).toHaveLength(100);
    expect(result.placed.every((element) => !outside(element, h))).toBe(true);
    for (let index = 0; index < result.placed.length; index++)
      for (let other = index + 1; other < result.placed.length; other++)
        expect(
          intersects(result.placed[index], result.placed[other], h.clearance),
        ).toBe(false);
  });
  it("reports unplaceable tables without modifying the hall", () => {
    const h = { ...newHall(), width: 1, length: 1 };
    const r = suggest(h, [table()]);
    expect(r.placed).toHaveLength(0);
    expect(r.failed[0]).toContain("no free space");
    expect(h.elements).toHaveLength(0);
  });
  it("shares seating references and reports occupancy and unplaced assignments", () => {
    const d = emptyData(),
      h = newHall();
    d.tables = [table()];
    d.assignments = [
      {
        id: "a",
        tableId: "t",
        guestId: "g",
        seatCount: 9,
        locked: false,
        assignmentType: "manual",
        createdAt: "",
        updatedAt: "",
      },
    ];
    expect(
      validateLayout(h, d).some((i) => i.message.includes("not placed")),
    ).toBe(true);
    expect(
      validateLayout(h, d).some((i) => i.message.includes("exceeds")),
    ).toBe(true);
    h.elements = [{ ...newElement("Round table"), tableId: "t" }];
    expect(
      validateLayout(h, d).some((i) => i.message.includes("not placed")),
    ).toBe(false);
  });
  it("detects flow obstructions", () => {
    const h = newHall();
    h.elements = [newElement("Wedding stage", 2, 2)];
    h.flows = [
      {
        id: "f",
        name: "Guest entrance",
        kind: "Guest entrance",
        color: "#000000",
        style: "solid",
        visible: true,
        points: [
          { x: 0, y: 3 },
          { x: 20, y: 3 },
        ],
      },
    ];
    expect(
      validateLayout(h, emptyData()).some((i) =>
        i.message.includes("obstructed"),
      ),
    ).toBe(true);
  });
  it("validates the representative large layout within an interaction budget", () => {
    const h = { ...newHall(), width: 100, length: 100 };
    h.elements = Array.from({ length: 100 }, (_, index) => ({
      ...newElement(
        "Pillar",
        (index % 10) * 9 + 1,
        Math.floor(index / 10) * 9 + 1,
      ),
      id: `element-${index}`,
    }));
    h.flows = Array.from({ length: 50 }, (_, index) => ({
      id: `flow-${index}`,
      name: `Flow ${index}`,
      kind: "Guest entrance",
      color: "#000000",
      style: "solid" as const,
      visible: true,
      points: [
        { x: 0, y: index + 0.5 },
        { x: 99, y: index + 0.5 },
      ],
    }));
    const data = emptyData();
    data.guests = Array.from({ length: 1_000 }, (_, index) => ({
      id: `guest-${index}`,
      createdAt: "",
      updatedAt: "",
      name: `Guest ${index}`,
      group: "mutual" as const,
      phone: "",
      email: "",
      attendees: 1,
      invitation: "sent" as const,
      rsvp: "confirmed" as const,
      meal: "",
      table: "",
      notes: "",
    }));
    const started = performance.now();
    const issues = validateLayout(h, data);
    const elapsed = performance.now() - started;
    expect(issues.length).toBeGreaterThanOrEqual(1_000);
    expect(elapsed).toBeLessThan(1_000);
  });
  it("serializes layouts and snapshots in version 3 backups", () => {
    const d = emptyData();
    d.halls = [newHall()];
    expect(parseBackup(JSON.stringify(createBackup(d))).data).toEqual(d);
  });
  it("rejects malformed and excessive imported layouts", () => {
    const h = newHall();
    for (const patch of [
      { width: 0 },
      { width: Infinity },
      { unexpected: true },
      { elements: [{ ...newElement("Pillar"), rotation: 900 }] },
      { elements: [{ ...newElement("Pillar"), type: "unknown" }] },
      { elements: [{ ...newElement("Pillar"), id: "" }] },
      { elements: [{ ...newElement("Round table"), tableId: "missing" }] },
    ])
      expect(() => validateHalls([{ ...h, ...patch }], new Set())).toThrow();
    expect(() =>
      validateHalls(
        Array.from({ length: 31 }, () => newHall()),
        new Set(),
      ),
    ).toThrow();
  });
  it("rejects duplicate ids and prototype pollution properties", () => {
    const h = newHall(),
      e = newElement("Pillar");
    expect(() =>
      validateHalls([{ ...h, elements: [e, e] }], new Set()),
    ).toThrow();
    const polluted = JSON.parse(
      JSON.stringify(h).replace(
        '"notes":""',
        '"notes":"","__proto__":{"polluted":true}',
      ),
    );
    expect(() => validateHalls([polluted], new Set())).toThrow();
  });
});
