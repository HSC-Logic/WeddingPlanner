import { renderToStaticMarkup } from "react-dom/server";
import type { AppData } from "../../types/models";
import type { Hall } from "./model";
import { Plan, assignmentNames } from "./Canvas";
import { convert } from "./geometry";
export const disclaimer =
  "Planning aid only. The venue and relevant professionals must check and approve the layout. This is not legal, fire-safety, building-code, or certified crowd-flow analysis.";
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function exportSvg(
  h: Hall,
  data: AppData,
  mode: string,
  paper = "A4",
  orientation = "landscape",
) {
  const legend = data.tables.filter((t) =>
    h.elements.some((e) => e.tableId === t.id),
  );
  const pixels = paper === "A3" ? [1754, 2480] : [1240, 1754];
  if (orientation === "landscape") pixels.reverse();
  const bottom = 3 + legend.length * 0.35;
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={pixels[0]}
      height={pixels[1]}
      viewBox={`-2 -3 ${h.width + 4} ${h.length + bottom + 3}`}
    >
      <rect
        x="-2"
        y="-3"
        width={h.width + 4}
        height={h.length + bottom + 3}
        fill="white"
      />
      <g fontFamily="Arial, sans-serif">
        <text x="0" y="-2" fontSize=".5">
          {data.wedding?.partnerOne} &amp; {data.wedding?.partnerTwo} ·{" "}
          {data.wedding?.date}
        </text>
        <text x="0" y="-1.2" fontSize=".35">
          {h.name} · {convert(h.width, "m", h.unit).toFixed(2)} ×{" "}
          {convert(h.length, "m", h.unit).toFixed(2)} {h.unit} · {mode}
        </text>
        <Plan hall={h} data={data} mode={mode} />
        <text x="0" y={h.length + 1} fontSize=".3">
          Legend · filled chairs: occupied · outline chairs: available · arrows:
          flow
        </text>
        {legend.map((t, i) => (
          <text key={t.id} x="0" y={h.length + 1.5 + i * 0.35} fontSize=".25">
            {t.name}: {t.capacity} seats ({t.reservedSeats} reserved)
          </text>
        ))}
        <text x="0" y={h.length + bottom - 0.7} fontSize=".18">
          Generated {new Date().toLocaleString()} · Venue and professional
          approval required.
        </text>
        <text x="0" y={h.length + bottom - 0.3} fontSize=".16">
          Planning aid only; not certified safety, building-code, or crowd-flow
          analysis.
        </text>
      </g>
    </svg>,
  );
}
export async function exportPng(
  h: Hall,
  data: AppData,
  mode: string,
  paper = "A4",
  orientation = "landscape",
) {
  const url = URL.createObjectURL(
    new Blob([exportSvg(h, data, mode, paper, orientation)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) =>
        b ? resolve(b) : reject(Error("Image export failed")),
      ),
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${h.name}-${mode}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function printPlan(
  h: Hall,
  data: AppData,
  mode: string,
  size: string,
  orientation: string,
) {
  const win = window.open("", "_blank");
  if (!win) throw Error("Allow a pop-up for the print document.");
  const directory = data.guests
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const a = data.assignments.find(
        (a) =>
          a.guestId === g.id ||
          data.households
            .find((h) => h.id === a.householdId)
            ?.guestIds.includes(g.id),
      );
      return `<tr><td>${esc(g.name)}</td><td>${esc(data.tables.find((t) => t.id === a?.tableId)?.name ?? "Unassigned")}</td></tr>`;
    })
    .join("");
  win.document.write(
    `<!doctype html><html><head><title>${esc(h.name)} — hall plan</title><style>@page{size:${size} ${orientation};margin:12mm}body{font:12px Arial}svg{width:100%;max-height:85vh}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ccc;padding:6px}.page{break-before:page}button{padding:12px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button>${exportSvg(h, data, mode, size, orientation)}<p>${disclaimer}</p><section class="page"><h1>Table assignment legend</h1>${data.tables.map((t) => `<h3>${esc(t.name)} · ${t.capacity} seats</h3><p>${assignmentNames(data, t.id).map(esc).join(", ") || "No assigned guests"}</p>`).join("")}</section><section class="page"><h1>Alphabetical guest-to-table directory</h1><table><thead><tr><th>Guest</th><th>Table</th></tr></thead><tbody>${directory}</tbody></table></section></body></html>`,
  );
  win.document.close();
}
