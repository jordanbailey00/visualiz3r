import Link from "next/link";
import type { ReactNode } from "react";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 pr-2" aria-label="Inside the Machine — home">
      <span className="relative grid size-7 place-items-center rounded-lg bg-gradient-to-br from-sky-400/90 via-indigo-400/80 to-violet-500/90 shadow-[0_0_18px_-4px_rgba(56,189,248,0.7)]">
        <span className="size-3 rounded-[3px] border-[1.5px] border-white/90" />
      </span>
      <span className="hidden text-[13px] font-semibold tracking-tight text-ink-50 sm:block">
        Inside the Machine
      </span>
    </Link>
  );
}

/** Thin translucent bar shared by both explorers. */
export function TopNav({
  center,
  right,
}: {
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="ui-chrome pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-3 sm:px-4">
      <div className="pointer-events-auto panel flex h-10 items-center px-2.5">
        <Logo />
      </div>
      <div className="pointer-events-auto flex min-w-0 flex-1 justify-center">{center}</div>
      <div className="pointer-events-auto flex items-center gap-2">{right}</div>
    </header>
  );
}

export function SectionLink({
  href,
  children,
  accent = "hw",
}: {
  href: string;
  children: ReactNode;
  accent?: "hw" | "llm";
}) {
  return (
    <Link
      href={href}
      className={`panel flex h-10 items-center gap-2 px-3.5 text-[13px] font-medium transition-colors ${
        accent === "llm" ? "text-violet-200 hover:text-white" : "text-sky-200 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
