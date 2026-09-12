import type { SeatingTable } from "../../types/models";
import type { Hall, Element } from "./model";
export interface Command {
  label: string;
  before: Hall;
  after: Hall;
  beforeTable?: SeatingTable;
  afterTable?: SeatingTable;
}
export interface History {
  past: Command[];
  future: Command[];
}
export const record = (h: History, c: Command): History => ({
  past: [...h.past, c].slice(-60),
  future: [],
});
export function travel(h: History, direction: "undo" | "redo") {
  const source = direction === "undo" ? h.past : h.future,
    c = source.at(-1);
  if (!c) return null;
  return {
    hall: direction === "undo" ? c.before : c.after,
    table: direction === "undo" ? c.beforeTable : c.afterTable,
    history:
      direction === "undo"
        ? { past: h.past.slice(0, -1), future: [...h.future, c] }
        : { past: [...h.past, c], future: h.future.slice(0, -1) },
  };
}
export const isLocked = (h: Hall, e: Element) =>
  e.locked || !!h.layers.find((l) => l.name === e.layer)?.locked;
export function moveElements(
  h: Hall,
  ids: string[],
  dx: number,
  dy: number,
): Hall {
  return {
    ...h,
    elements: h.elements.map((e) =>
      ids.includes(e.id) && !isLocked(h, e)
        ? { ...e, x: e.x + dx, y: e.y + dy }
        : e,
    ),
  };
}
