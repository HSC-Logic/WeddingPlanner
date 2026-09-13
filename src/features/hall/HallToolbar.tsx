import type { Hall } from "./model";

export function HallToolbar({
  halls,
  active,
  mode,
  zoom,
  small,
  multiSelect,
  panMode,
  grid,
  snapping,
  clearance,
  guestNames,
  canUndo,
  canRedo,
  onSpace,
  onMode,
  onZoom,
  onReset,
  onMultiSelect,
  onPanMode,
  onGrid,
  onSnapping,
  onClearance,
  onGuestNames,
  onUndo,
  onRedo,
}: {
  halls: Hall[];
  active: string;
  mode: string;
  zoom: number;
  small: boolean;
  multiSelect: boolean;
  panMode: boolean;
  grid: boolean;
  snapping: boolean;
  clearance: boolean;
  guestNames: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSpace: (id: string) => void;
  onMode: (mode: string) => void;
  onZoom: (zoom: number) => void;
  onReset: () => void;
  onMultiSelect: () => void;
  onPanMode: () => void;
  onGrid: (value: boolean) => void;
  onSnapping: (value: boolean) => void;
  onClearance: (value: boolean) => void;
  onGuestNames: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="hall-toolbar">
      <label>
        Space
        <select
          value={active}
          onChange={(event) => onSpace(event.target.value)}
        >
          {halls.map((hall) => (
            <option key={hall.id} value={hall.id}>
              {hall.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        View
        <select value={mode} onChange={(event) => onMode(event.target.value)}>
          <option value="complete">Complete layout</option>
          <option value="seating">Seating only</option>
          <option value="flow">Flow View</option>
        </select>
      </label>
      <button
        aria-label="Zoom out"
        onClick={() => onZoom(Math.max(0.25, zoom / 1.2))}
      >
        −
      </button>
      <output>{Math.round(zoom * 100)}%</output>
      <button
        aria-label="Zoom in"
        onClick={() => onZoom(Math.min(5, zoom * 1.2))}
      >
        +
      </button>
      <button aria-label="Fit hall to screen and reset pan" onClick={onReset}>
        Fit to screen / Reset
      </button>
      {!small && (
        <button aria-pressed={multiSelect} onClick={onMultiSelect}>
          Multi-select
        </button>
      )}
      <button
        aria-label={`${panMode ? "Disable" : "Enable"} canvas pan mode`}
        aria-pressed={panMode}
        onClick={onPanMode}
      >
        Pan
      </button>
      {[
        ["Grid", grid, onGrid],
        ["Snap", snapping, onSnapping],
        ["Clearance", clearance, onClearance],
        ["Guest names", guestNames, onGuestNames],
      ].map(([label, checked, change]) => (
        <label className="check" key={String(label)}>
          <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(event) =>
              (change as (value: boolean) => void)(event.target.checked)
            }
          />
          {String(label)}
        </label>
      ))}
      {!small && (
        <>
          <button disabled={!canUndo} onClick={onUndo}>
            Undo
          </button>
          <button disabled={!canRedo} onClick={onRedo}>
            Redo
          </button>
        </>
      )}
    </div>
  );
}
