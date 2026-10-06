import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Zero-padded counter, e.g. 7 → "07". */
export const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function Lamp({ on, blink }: { on?: boolean; blink?: boolean }) {
  return <span aria-hidden className="hud-lamp" data-on={on ? "true" : undefined} data-blink={blink ? "true" : undefined} />;
}

/** Square "back" control in the top-left corner. */
export function ExitLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="hud-btn hud-btn-sq" aria-label={label} title={label}>
      <ChevronLeft className="size-3.5" />
    </Link>
  );
}

/** Top strip of an explorer: exit on the left, a selector in the middle, toggles on the right. */
export function HudBar({ exit, center, caption, right }: { exit: ReactNode; center: ReactNode; caption?: string; right?: ReactNode }) {
  return (
    <header className="ui-chrome pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 px-3 pt-3 sm:px-4 sm:pt-3.5">
      <div className="pointer-events-auto flex flex-1 items-center">{exit}</div>
      <div className="pointer-events-auto flex min-w-0 flex-col items-center">
        <div className="hud-panel max-w-full">{center}</div>
        {caption && <p className="hud-label mt-2 hidden text-[9px] text-hud-faint sm:block">{caption}</p>}
      </div>
      <div className="pointer-events-auto flex flex-1 items-center justify-end gap-2">{right}</div>
    </header>
  );
}

/** Faint line of control hints, shown until the user starts exploring. */
export function ControlHint({ items, className = "" }: { items: [string, string][]; className?: string }) {
  return (
    <div className={`ui-chrome pointer-events-none absolute inset-x-0 z-10 flex justify-center px-4 max-sm:hidden ${className}`}>
      <p className="hud-label flex flex-wrap justify-center gap-x-5 gap-y-1 text-[9.5px] text-hud-faint [animation:hud-fade_1.2s_ease_0.8s_both]">
        {items.map(([k, v]) => (
          <span key={k}>
            <span className="text-hud-dim">{k}</span> · {v}
          </span>
        ))}
      </p>
    </div>
  );
}

/** Collapsible section of a readout. */
export function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-hud-line last:border-b-0">
      <button className="group flex w-full items-center gap-2 py-2.5 text-left" onClick={onToggle} aria-expanded={open}>
        <ChevronRight className={`size-3 text-hud-faint transition-transform group-hover:text-hud-dim ${open ? "rotate-90" : ""}`} />
        <span className={`hud-label ${open ? "text-hud-text" : "group-hover:text-hud-text"}`}>{title}</span>
        {count !== undefined && <span className="hud-label ml-auto text-hud-faint">{pad(count)}</span>}
      </button>
      {open && <div className="pb-3.5 pl-5">{children}</div>}
    </section>
  );
}

/** Key ....... value row (use inside a <dl>). */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="hud-kv">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
