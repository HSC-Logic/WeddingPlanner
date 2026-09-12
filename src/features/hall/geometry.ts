import type { Element, Hall, Point } from "./model";
import type { SeatingTable } from "../../types/models";
export const convert = (value: number, from: "m" | "ft", to: "m" | "ft") =>
  from === to ? value : from === "m" ? value / 0.3048 : value * 0.3048;
export const screenPoint = (p: Point, scale: number, pan: Point): Point => ({
  x: p.x * scale + pan.x,
  y: p.y * scale + pan.y,
});
export const worldPoint = (p: Point, scale: number, pan: Point): Point => ({
  x: (p.x - pan.x) / scale,
  y: (p.y - pan.y) / scale,
});
export const snap = (v: number, grid: number) => Math.round(v / grid) * grid;
export function corners(e: Element, clearance = 0): Point[] {
  const a = (e.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => ({
    x:
      e.x +
      e.width / 2 +
      x * (e.width / 2 + clearance) * c -
      y * (e.length / 2 + clearance) * s,
    y:
      e.y +
      e.length / 2 +
      x * (e.width / 2 + clearance) * s +
      y * (e.length / 2 + clearance) * c,
  }));
}
export function intersects(a: Element, b: Element, gap = 0) {
  const p = corners(a, gap / 2),
    q = corners(b, gap / 2);
  for (const shape of [p, q])
    for (let i = 0; i < 4; i++) {
      const v = shape[i],
        w = shape[(i + 1) % 4],
        axis = { x: -(w.y - v.y), y: w.x - v.x };
      const ap = p.map((t) => t.x * axis.x + t.y * axis.y),
        bp = q.map((t) => t.x * axis.x + t.y * axis.y);
      if (
        Math.max(...ap) <= Math.min(...bp) + 1e-8 ||
        Math.max(...bp) <= Math.min(...ap) + 1e-8
      )
        return false;
    }
  return true;
}
export const outside = (e: Element, h: Pick<Hall, "width" | "length">) =>
  corners(e).some((p) => p.x < 0 || p.y < 0 || p.x > h.width || p.y > h.length);
export function segmentHits(a: Point, b: Point, e: Element, gap = 0) {
  const angle = (-e.rotation * Math.PI) / 180;
  const local = (p: Point) => ({
    x:
      (p.x - e.x - e.width / 2) * Math.cos(angle) -
      (p.y - e.y - e.length / 2) * Math.sin(angle),
    y:
      (p.x - e.x - e.width / 2) * Math.sin(angle) +
      (p.y - e.y - e.length / 2) * Math.cos(angle),
  });
  const p = local(a),
    q = local(b);
  let lo = 0,
    hi = 1;
  for (const [start, delta, half] of [
    [p.x, q.x - p.x, e.width / 2 + gap],
    [p.y, q.y - p.y, e.length / 2 + gap],
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(start) > half) return false;
    } else {
      const v = (-half - start) / delta,
        w = (half - start) / delta;
      lo = Math.max(lo, Math.min(v, w));
      hi = Math.min(hi, Math.max(v, w));
      if (lo > hi) return false;
    }
  }
  return true;
}
export function effectiveDimensions(e: Element, t?: SeatingTable): Element {
  return t?.shape === "round" ? { ...e, length: e.width } : e;
}
export function chairs(e: Element, count: number, round: boolean): Point[] {
  return Array.from({ length: Math.min(200, count) }, (_, i) => {
    if (round) {
      const a = (i / count) * Math.PI * 2;
      return {
        x: e.width / 2 + (e.width / 2 + 0.3) * Math.cos(a),
        y: e.length / 2 + (e.length / 2 + 0.3) * Math.sin(a),
      };
    }
    const sides = [e.width, e.length, e.width, e.length],
      perimeter = 2 * (e.width + e.length);
    let d = ((i + 0.5) * perimeter) / count;
    for (let side = 0; side < 4; side++) {
      if (d <= sides[side])
        return side === 0
          ? { x: d, y: -0.3 }
          : side === 1
            ? { x: e.width + 0.3, y: d }
            : side === 2
              ? { x: e.width - d, y: e.length + 0.3 }
              : { x: -0.3, y: e.length - d };
      d -= sides[side];
    }
    return { x: 0, y: 0 };
  });
}
export function suggest(h: Hall, tables: SeatingTable[]) {
  const elements = [...h.elements],
    placed: Element[] = [],
    failed: string[] = [];
  for (const t of [...tables].sort((a, b) => a.group.localeCompare(b.group))) {
    if (elements.some((e) => e.tableId === t.id)) continue;
    let result: Element | undefined;
    const step = Math.max(0.5, h.grid),
      size = t.shape === "round" ? 1.8 : 2.4;
    for (let y = h.clearance; y < h.length && !result; y += step)
      for (let x = h.clearance; x < h.width && !result; x += step) {
        const e: Element = {
          id: crypto.randomUUID(),
          type: t.shape === "round" ? "Round table" : "Rectangular table",
          name: t.name,
          x,
          y,
          width: size,
          length: t.shape === "round" ? size : 1.2,
          rotation: 0,
          color: "#d4b89b",
          notes: "",
          locked: false,
          layer: "Tables and seating",
          tableId: t.id,
          clearance: 0,
          capacity: 0,
          serviceDirection: "",
          labelVisible: true,
        };
        if (
          !outside(
            {
              ...e,
              x: e.x - h.clearance / 2,
              y: e.y - h.clearance / 2,
              width: e.width + h.clearance,
              length: e.length + h.clearance,
            },
            h,
          ) &&
          !elements.some((a) =>
            intersects(a, e, Math.max(h.clearance, a.clearance)),
          )
        )
          result = e;
      }
    if (result) {
      elements.push(result);
      placed.push(result);
    } else
      failed.push(`${t.name}: no free space with the configured clearance.`);
  }
  return { placed, failed };
}

export function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}
