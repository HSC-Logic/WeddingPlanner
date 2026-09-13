import type { AppData, SeatingTable } from "../../types/models";
import { library } from "./model";

export function HallLibrary({
  data,
  onAdd,
  onSuggest,
}: {
  data: AppData;
  onAdd: (type: string, table?: SeatingTable) => void;
  onSuggest: () => void;
}) {
  return (
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
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/plain", type)
                }
                onClick={() => onAdd(type)}
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
            (table) =>
              !data.halls.some((space) =>
                space.elements.some((element) => element.tableId === table.id),
              ),
          )
          .map((table) => (
            <button
              key={table.id}
              onClick={() =>
                onAdd(
                  table.shape === "round" ? "Round table" : "Rectangular table",
                  table,
                )
              }
            >
              {table.name} · {table.capacity} seats
            </button>
          ))}
      </details>
      <button onClick={onSuggest}>Suggest Table Layout</button>
    </aside>
  );
}
