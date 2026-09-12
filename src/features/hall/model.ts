import { z } from "zod";
export const library = {
  "Tables and seating": [
    "Round table",
    "Rectangular table",
    "Square table",
    "Head table",
    "Couple’s table",
    "Family table",
    "Cocktail table",
    "Individual chair",
    "Sofa",
  ],
  "Wedding facilities": [
    "Wedding stage",
    "Ceremony platform",
    "Dance floor",
    "Band area",
    "DJ booth",
    "Podium",
    "Photo booth",
    "Cake table",
    "Registration desk",
    "Buffet station",
    "Dessert station",
    "Drinks Station",
    "Bar",
    "Coffee station",
    "Water station",
    "Service table",
    "Gift table",
    "Guest-book table",
  ],
  "Hall structure": [
    "Entrance",
    "Exit",
    "Emergency exit",
    "Door",
    "Window",
    "Wall or divider",
    "Pillar",
    "Staircase",
    "Restroom indicator",
    "Kitchen access",
    "Service entrance",
  ],
  Decorations: ["Decoration zone"],
  "Restricted areas": ["Reserved or restricted area", "Custom labelled area"],
} as const;
export const types = Object.values(library).flat() as string[];
export const layerNames = [
  "Hall structure",
  "Restricted areas",
  "Wedding facilities",
  "Tables and seating",
  "Decorations",
  "Flow paths",
  "Labels and measurements",
];
const num = z.number().finite();
const id = z.string().min(1).max(100);
const str = z.string().max(2000);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const elementSchema = z
  .object({
    id,
    type: z.string().refine((v) => types.includes(v)),
    name: str,
    x: num.min(-500).max(500),
    y: num.min(-500).max(500),
    width: num.positive().max(500),
    length: num.positive().max(500),
    rotation: num.min(-360).max(360),
    color,
    notes: str,
    locked: z.boolean(),
    layer: z.string().refine((v) => layerNames.includes(v)),
    tableId: id.optional(),
    clearance: num.min(0).max(20),
    capacity: num.int().min(0).max(10000),
    serviceDirection: str,
    labelVisible: z.boolean(),
  })
  .strict();
const pointSchema = z
  .object({ x: num.min(0).max(500), y: num.min(0).max(500) })
  .strict();
const flowSchema = z
  .object({
    id,
    name: str,
    kind: str,
    color,
    style: z.enum(["solid", "dashed"]),
    visible: z.boolean(),
    points: z.array(pointSchema).min(2).max(100),
  })
  .strict();
const layerSchema = z
  .object({
    name: z.string().refine((v) => layerNames.includes(v)),
    visible: z.boolean(),
    locked: z.boolean(),
  })
  .strict();
const layoutShape = {
  name: z.string().min(1).max(200),
  width: num.positive().max(150),
  length: num.positive().max(150),
  unit: z.enum(["m", "ft"]),
  ceiling: num.positive().max(50).optional(),
  grid: num.min(0.05).max(10),
  background: color,
  notes: str,
  clearance: num.min(0).max(10),
  elements: z.array(elementSchema).max(1000),
  flows: z.array(flowSchema).max(100),
  layers: z.array(layerSchema).length(7),
};
export const layoutSchema = z.object(layoutShape).strict();
export const hallSchema = z
  .object({
    id,
    ...layoutShape,
    snapshots: z
      .array(z.object({ id, date: str, layout: layoutSchema }).strict())
      .max(5),
  })
  .strict();
export type Element = z.infer<typeof elementSchema>;
export type Hall = z.infer<typeof hallSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type Flow = Hall["flows"][number];
export type Point = { x: number; y: number };
export const newHall = (): Hall => ({
  id: crypto.randomUUID(),
  name: "Main hall",
  width: 24,
  length: 18,
  unit: "m",
  grid: 0.5,
  background: "#fffdf8",
  notes: "",
  clearance: 1,
  elements: [],
  flows: [],
  layers: layerNames.map((name) => ({ name, visible: true, locked: false })),
  snapshots: [],
});
export function newElement(type: string, x = 2, y = 2): Element {
  return {
    id: crypto.randomUUID(),
    type,
    name: type,
    x,
    y,
    width: type === "Pillar" ? 0.6 : type.includes("stage") ? 6 : 2,
    length: type === "Pillar" ? 0.6 : type.includes("stage") ? 3 : 2,
    rotation: 0,
    color: "#d4b89b",
    notes: "",
    locked: false,
    layer:
      Object.entries(library).find(([, v]) =>
        (v as readonly string[]).includes(type),
      )?.[0] ?? "Wedding facilities",
    clearance: 0,
    capacity: 0,
    serviceDirection: "",
    labelVisible: true,
  };
}
export function validateHalls(value: unknown, tableIds: Set<string>): Hall[] {
  const halls = z.array(hallSchema).max(30).parse(value);
  const ids = new Set<string>();
  for (const h of halls) {
    for (const item of [h, ...h.elements, ...h.flows, ...h.snapshots]) {
      if (ids.has(item.id)) throw Error("Duplicate layout ID");
      ids.add(item.id);
    }
    for (const layout of [h, ...h.snapshots.map((s) => s.layout)]) {
      if (new Set(layout.layers.map((l) => l.name)).size !== 7)
        throw Error("Duplicate layers");
      const localIds=[...layout.elements,...layout.flows].map(e=>e.id);
      if(new Set(localIds).size!==localIds.length)throw Error("Duplicate snapshot object ID");
      for (const e of layout.elements)
        if (e.tableId && !tableIds.has(e.tableId))
          throw Error("Layout references a missing table");
    }
  }
  return halls;
}
