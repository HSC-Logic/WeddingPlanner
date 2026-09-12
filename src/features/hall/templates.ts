import type { SeatingTable } from "../../types/models";
import { newElement, type Hall } from "./model";
import { suggest } from "./geometry";
export const templateNames = [
  "Small indoor wedding",
  "Medium banquet hall",
  "Large reception hall",
  "Outdoor wedding",
  "Ceremony and reception in one hall",
];
export function starterLayout(h: Hall, name: string) {
  const index = Math.max(0, templateNames.indexOf(name));
  const facility = (
    type: string,
    x: number,
    y: number,
    w: number,
    l: number,
  ) => ({
    ...newElement(type, h.width * x, h.length * y),
    width: h.width * w,
    length: h.length * l,
  });
  const elements = [
    facility("Entrance", 0.46, 0.95, 0.08, 0.05),
    facility("Emergency exit", 0.92, 0, 0.08, 0.05),
    facility("Buffet station", 0.03, 0.75, 0.1, 0.2),
  ];
  if (index === 3) {
    elements.push(
      facility("Ceremony platform", 0.35, 0.03, 0.3, 0.15),
      facility("Decoration zone", 0.8, 0.6, 0.15, 0.2),
    );
  } else {
    elements.push(
      facility("Wedding stage", 0.35, 0.03, 0.3, 0.15),
      facility("Dance floor", 0.38, 0.25, 0.25, 0.2),
    );
  }
  if (index > 0)
    elements.push(facility("Drinks Station", 0.86, 0.75, 0.1, 0.15));
  if (index === 2)
    elements.push(
      facility("Band area", 0.03, 0.03, 0.2, 0.15),
      facility("Photo booth", 0.8, 0.03, 0.15, 0.15),
    );
  if (index === 4)
    elements.push(facility("Ceremony platform", 0.02, 0.25, 0.2, 0.3));
  const stamp = new Date().toISOString();
  const tables: SeatingTable[] = Array.from(
    { length: [4, 8, 12, 10, 6][index] },
    (_, i) => ({
      id: crypto.randomUUID(),
      createdAt: stamp,
      updatedAt: stamp,
      name: `${name} · ${i + 1}`,
      group: "",
      capacity: 8,
      reservedSeats: 0,
      locked: false,
      shape: index === 1 ? "rectangle" : "round",
      notes: "Editable template table",
      displayOrder: i,
    }),
  );
  const result = suggest({ ...h, elements, flows: [] }, tables);
  return {
    hall: { ...h, elements: [...elements, ...result.placed], flows: [] },
    tables,
    failed: result.failed,
  };
}
