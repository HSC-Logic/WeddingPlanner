import { memo } from "react";
import type { AppData } from "../../types/models";
import type { Hall, Element, Point } from "./model";
import { chairs, effectiveDimensions } from "./geometry";
export function assignmentNames(data: AppData, tableId: string) {
  return data.assignments
    .filter((a) => a.tableId === tableId)
    .map(
      (a) =>
        data.guests.find((g) => g.id === a.guestId)?.name ??
        data.households.find((h) => h.id === a.householdId)?.name ??
        "Unknown guest",
    );
}
const ObjectNode = memo(function ObjectNode({
  e,
  data,
  selected,
  labels,
  guests,
  clearance,
  onDown,
}: {
  e: Element;
  data: AppData;
  selected: boolean;
  labels: boolean;
  guests: boolean;
  clearance: number;
  onDown?: (event: React.PointerEvent<SVGGElement>, e: Element) => void;
}) {
  const table = data.tables.find((t) => t.id === e.tableId),
    shape = effectiveDimensions(e, table),
    round =
      table?.shape === "round" ||
      e.type === "Cocktail table" ||
      e.type === "Pillar",
    used = data.assignments
      .filter((a) => a.tableId === e.tableId)
      .reduce((s, a) => s + a.seatCount, 0),
    status = table
      ? used + table.reservedSeats > table.capacity
        ? "Over capacity"
        : used === 0
          ? "Empty"
          : used + table.reservedSeats === table.capacity
            ? "Full"
            : "Partially filled"
      : "";
  const stroke = selected
    ? "#2563eb"
    : status === "Over capacity"
      ? "#b91c1c"
      : "#544639";
  return (
    <g
      data-element-id={e.id}
      role="img"
      aria-label={`${table?.name ?? e.name}, ${e.type}${table ? `, ${used}/${table.capacity}, ${status}` : ""}`}
      transform={`translate(${e.x} ${e.y}) rotate(${e.rotation} ${shape.width / 2} ${shape.length / 2})`}
      onPointerDown={(event) => onDown?.(event, e)}
      style={{ cursor: onDown ? "grab" : "default" }}
    >
      {clearance > 0 && (
        <rect
          x={-clearance / 2}
          y={-clearance / 2}
          width={shape.width + clearance}
          height={shape.length + clearance}
          fill="none"
          stroke="#c08438"
          strokeWidth=".025"
          strokeDasharray=".12 .08"
        />
      )}
      {table &&
        chairs(shape, table.capacity, round).map((p, i) => (
          <rect
            key={i}
            x={p.x - 0.13}
            y={p.y - 0.13}
            width=".26"
            height=".26"
            rx=".06"
            fill={i < used ? "#687f6d" : "#fff"}
            stroke="#687f6d"
            strokeWidth=".03"
          />
        ))}
      {round ? (
        <ellipse
          cx={shape.width / 2}
          cy={shape.length / 2}
          rx={shape.width / 2}
          ry={shape.length / 2}
          fill={e.color}
          stroke={stroke}
          strokeWidth={selected ? 0.08 : 0.04}
        />
      ) : (
        <rect
          width={shape.width}
          height={shape.length}
          rx={e.type === "Wall or divider" ? 0 : 0.08}
          fill={e.color}
          stroke={stroke}
          strokeWidth={selected ? 0.08 : 0.04}
        />
      )}
      {/exit|entrance|door/i.test(e.type) && (
        <path
          d={`M .2 ${shape.length * 0.65} H ${shape.width - 0.2} l -.25 -.2 m .25 .2 l -.25 .2`}
          fill="none"
          stroke="#334155"
          strokeWidth=".06"
        />
      )}
      {e.type === "Dance floor" && (
        <path
          d={`M 0 ${shape.length / 2} H ${shape.width} M ${shape.width / 2} 0 V ${shape.length}`}
          stroke="#fff"
          strokeWidth=".04"
        />
      )}
      {labels && e.labelVisible && (
        <text
          x={shape.width / 2}
          y={shape.length / 2 - 0.06}
          textAnchor="middle"
          fontSize=".22"
          fill="#242424"
        >
          <tspan x={shape.width / 2}>{table?.name ?? e.name}</tspan>
          <tspan x={shape.width / 2} dy=".3" fontSize=".17">
            {table ? `${used}/${table.capacity} · ${status}` : e.type}
          </tspan>
          {e.locked && (
            <tspan x={shape.width / 2} dy=".22">
              Locked
            </tspan>
          )}
        </text>
      )}
      {guests && table && (
        <text
          x={shape.width / 2}
          y={shape.length + 0.65}
          fontSize=".18"
          textAnchor="middle"
          fill="#242424"
        >
          {assignmentNames(data, table.id).map((name, i) => (
            <tspan key={i} x={shape.width / 2} dy={i ? 0.23 : 0}>
              {name}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
});
export function Plan({
  hall,
  data,
  selected = [],
  grid = false,
  clearance = false,
  guests = false,
  mode = "complete",
  onDown,
}: {
  hall: Hall;
  data: AppData;
  selected?: string[];
  grid?: boolean;
  clearance?: boolean;
  guests?: boolean;
  mode?: string;
  onDown?: (event: React.PointerEvent<SVGGElement>, e: Element) => void;
}) {
  const visible = (name: string) =>
      hall.layers.find((l) => l.name === name)?.visible,
    labels = visible("Labels and measurements");
  return (
    <>
      <defs>
        <pattern
          id="hall-grid"
          width={hall.grid}
          height={hall.grid}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${hall.grid} 0 H 0 V ${hall.grid}`}
            fill="none"
            stroke="#c5c5c5"
            strokeWidth=".018"
          />
        </pattern>
        <marker
          id="flow-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0 0 L6 3 L0 6" fill="context-stroke" />
        </marker>
      </defs>
      <rect
        width={hall.width}
        height={hall.length}
        fill={hall.background}
        stroke="#756855"
        strokeWidth=".05"
      />
      {grid && (
        <rect
          width={hall.width}
          height={hall.length}
          fill="url(#hall-grid)"
          pointerEvents="none"
        />
      )}
      {hall.layers
        .filter((l) => l.visible)
        .flatMap((l) =>
          hall.elements
            .filter(
              (e) =>
                e.layer === l.name &&
                (mode !== "seating" || e.tableId) &&
                (mode !== "flow" || !e.tableId),
            )
            .map((e) => (
              <ObjectNode
                key={e.id}
                e={e}
                data={data}
                selected={selected.includes(e.id)}
                labels={!!labels}
                guests={guests}
                clearance={
                  clearance ? Math.max(hall.clearance, e.clearance) : 0
                }
                onDown={onDown}
              />
            )),
        )}
      {mode !== "seating" &&
        visible("Flow paths") &&
        hall.flows
          .filter((f) => f.visible)
          .map((f) => (
            <g key={f.id}>
              <polyline
                points={f.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={f.color}
                strokeWidth=".09"
                strokeDasharray={f.style === "dashed" ? ".25 .15" : undefined}
                markerMid="url(#flow-arrow)"
                markerEnd="url(#flow-arrow)"
              />
              {labels && (
                <text
                  x={f.points[0].x}
                  y={f.points[0].y - 0.2}
                  fontSize=".25"
                  fill={f.color}
                >
                  {f.name}
                </text>
              )}
            </g>
          ))}
    </>
  );
}
export function Rulers({ hall }: { hall: Hall }) {
  const step = Math.max(
    hall.grid,
    Math.ceil(Math.max(hall.width, hall.length) / 20),
  );
  return (
    <g fill="#655f57" fontSize=".24" pointerEvents="none">
      {Array.from({ length: Math.floor(hall.width / step) + 1 }, (_, i) => (
        <text key={`x${i}`} x={i * step} y="-.25">
          {(i * step * (hall.unit === "ft" ? 1 / 0.3048 : 1)).toFixed(1)}
        </text>
      ))}
      {Array.from({ length: Math.floor(hall.length / step) + 1 }, (_, i) => (
        <text key={`y${i}`} x="-.25" y={i * step} textAnchor="end">
          {(i * step * (hall.unit === "ft" ? 1 / 0.3048 : 1)).toFixed(1)}
        </text>
      ))}
    </g>
  );
}
export const pointString = (points: Point[]) =>
  points.map((p) => `${p.x},${p.y}`).join(" ");
