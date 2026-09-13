import type { ReactNode } from "react";

export function HallPropertiesPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="hall-properties">
      <h3>{title}</h3>
      {children}
    </aside>
  );
}

export function HallValidationPanel({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h3>Placement review ({count})</h3>
      {children}
    </section>
  );
}

export function HallLayersPanel({ children }: { children: ReactNode }) {
  return (
    <section className="panel">
      <h3>Layers &amp; flow paths</h3>
      {children}
    </section>
  );
}

export function HallExportPanel({ children }: { children: ReactNode }) {
  return (
    <section className="panel">
      <h3>Save &amp; export</h3>
      {children}
    </section>
  );
}
