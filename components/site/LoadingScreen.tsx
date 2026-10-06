/** Rotating tick ring with an engraved caption, shown while a workspace loads. */
export function HudLoader({ label }: { label: string }) {
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 34 : 38;
    return `M${(50 + Math.sin(a) * r0).toFixed(2)} ${(50 - Math.cos(a) * r0).toFixed(2)}L${(50 + Math.sin(a) * 42).toFixed(2)} ${(50 - Math.cos(a) * 42).toFixed(2)}`;
  }).join("");
  return (
    <div className="flex flex-col items-center gap-5" role="status">
      <svg viewBox="0 0 100 100" className="size-16 [animation:hud-spin_6s_linear_infinite]" aria-hidden>
        <path d={ticks} stroke="rgb(186 204 224 / 0.35)" strokeWidth="1" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="#38bdf8" strokeWidth="1.5" pathLength={100} strokeDasharray="18 82" />
      </svg>
      <p className="hud-label text-[9.5px] text-hud-dim">{label}</p>
    </div>
  );
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-hud-void">
      <HudLoader label={label} />
    </div>
  );
}
