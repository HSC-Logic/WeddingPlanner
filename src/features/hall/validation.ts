import type { AppData } from "../../types/models";
import type { Hall } from "./model";
import {
  effectiveDimensions,
  intersects,
  outside,
  segmentHits,
  segmentsCross,
} from "./geometry";
export interface Issue {
  level: "Error" | "Warning" | "Recommendation";
  message: string;
  ids: string[];
}
export function validateLayout(h: Hall, data: AppData): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], message: string, ...ids: string[]) =>
    issues.push({ level, message, ids });
  const elements = h.elements.map((e) =>
    effectiveDimensions(
      e,
      data.tables.find((t) => t.id === e.tableId),
    ),
  );
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i];
    if (outside(e, h))
      add("Error", `${e.name} extends outside the hall.`, e.id);
    if (e.tableId && !data.tables.some((t) => t.id === e.tableId))
      add("Error", `${e.name}: seating table no longer exists.`, e.id);
    for (let j = i + 1; j < elements.length; j++) {
      const b = elements[j];
      if (e.tableId && e.tableId === b.tableId)
        add("Error", `Duplicate placement: ${e.name}`, e.id, b.id);
      if (intersects(e, b))
        add(
          /exit|entrance/i.test(e.type + b.type) ? "Error" : "Warning",
          `${e.name} overlaps ${b.name}${/exit|entrance/i.test(e.type + b.type) ? " — access blocked" : ""}.`,
          e.id,
          b.id,
        );
      else if (
        intersects(e, b, Math.max(h.clearance, e.clearance, b.clearance))
      )
        add(
          "Recommendation",
          `Insufficient clearance: ${e.name} / ${b.name}.`,
          e.id,
          b.id,
        );
    }
  }
  for (const t of data.tables) {
    const e = elements.find((e) => e.tableId === t.id),
      used = data.assignments
        .filter((a) => a.tableId === t.id)
        .reduce((s, a) => s + a.seatCount, 0);
    if (!e)
      add(
        used ? "Warning" : "Recommendation",
        `${t.name} is not placed${used ? " but has assigned guests" : ""}.`,
      );
    if (used + t.reservedSeats > t.capacity)
      add("Error", `${t.name} exceeds seating capacity.`, ...(e ? [e.id] : []));
  }
  for (const g of data.guests.filter((g) => g.rsvp === "confirmed"))
    if (
      !data.assignments.some(
        (a) =>
          a.guestId === g.id ||
          data.households
            .find((h) => h.id === a.householdId)
            ?.guestIds.includes(g.id),
      )
    )
      add("Warning", `${g.name} has no seating assignment.`);
  for (const f of h.flows)
    for (const e of elements)
      if (
        f.points
          .slice(1)
          .some((p, i) => segmentHits(f.points[i], p, e, h.clearance / 2))
      )
        add(
          "Warning",
          `${f.name} is obstructed or narrow near ${e.name}.`,
          e.id,
          f.id,
        );
  for (let i = 0; i < h.flows.length; i++)
    for (let j = i + 1; j < h.flows.length; j++) {
      const a = h.flows[i],
        b = h.flows[j];
      if (
        a.points
          .slice(1)
          .some((p, k) =>
            b.points
              .slice(1)
              .some((q, l) => segmentsCross(a.points[k], p, b.points[l], q)),
          )
      ) {
        const service = /service|staff/i.test(a.kind + b.kind),
          queue = /queue/i.test(a.kind + b.kind);
        add(
          "Warning",
          `${a.name} crosses ${b.name}${service ? " — guest/service conflict" : queue ? " — queue crosses a walkway" : ""}.`,
          a.id,
          b.id,
        );
      }
    }
  for (const e of elements.filter((e) => /entrance/i.test(e.type)))
    for (const exit of elements.filter((e) => /exit/i.test(e.type))) {
      const a = { x: e.x + e.width / 2, y: e.y + e.length / 2 },
        b = { x: exit.x + exit.width / 2, y: exit.y + exit.length / 2 };
      if (
        elements.some(
          (o) =>
            o.id !== e.id &&
            o.id !== exit.id &&
            segmentHits(a, b, o, h.clearance / 2),
        )
      )
        add(
          "Recommendation",
          `Direct ${e.name}-to-${exit.name} route is obstructed; draw and review an alternative route.`,
          e.id,
          exit.id,
        );
    }
  return issues;
}
