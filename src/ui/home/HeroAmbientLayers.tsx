/**
 * Static, server-rendered CSS decoration behind the canvas network (T-717): a soft
 * accent-colored glow plus a faint technical grid. Purely presentational — `aria-hidden`
 * and zero JS cost.
 */
export function HeroAmbientLayers() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--accent-primary)_0%,_transparent_55%)] opacity-20" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}
