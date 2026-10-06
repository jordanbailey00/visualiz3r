import { ArrowRight, BrainCircuit } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Logo } from "@/components/site/TopNav";
import { CATALOG } from "@/lib/hardware/catalog";
import { getDeviceInfo } from "@/lib/hardware/content";

export const metadata: Metadata = {
  title: "Hardware lab",
  description: "Realistic, explodable 3D models of a graphics card, processor, memory, SSD, hard drive and Raspberry Pi.",
};

function preview(id: string) {
  const rel = `/previews/${id}.webp`;
  return existsSync(join(process.cwd(), "public", rel)) ? rel : null;
}

export default function HardwareIndex() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 30% 0%, rgba(56,189,248,0.12), transparent 70%)" }}
      />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 pt-6">
        <Logo />
        <Link href="/llm" className="flex items-center gap-2 text-[13px] font-medium text-violet-200 hover:text-white">
          <BrainCircuit className="size-4" /> How LLMs work
        </Link>
      </header>
      <section className="relative mx-auto max-w-6xl px-6 pb-8 pt-14">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-sky-300/90">Hardware lab</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Take apart the parts inside your computer</h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-300">
          Each model is built from real dimensions and explodes layer by layer. Click any part to learn what it does — down to the
          floorplans of the silicon dies.
        </p>
      </section>
      <section className="relative mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG.map((d) => {
          const info = getDeviceInfo(d.id);
          const img = preview(d.id);
          const parts = info ? Object.keys(info.parts).length : 0;
          return (
            <Link
              key={d.id}
              href={`/hardware/${d.id}`}
              className="group overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-sky-300/40"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(70%_70%_at_50%_40%,#141b29,#07090d)]">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={`${d.name} 3D model`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid h-full place-items-center text-[40px] font-semibold text-white/10">{d.shortName}</div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-semibold text-white">{d.name}</h2>
                  {parts > 1 && <span className="text-[11.5px] text-ink-400">{parts} parts</span>}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-300">{d.tagline}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-sky-200 group-hover:text-white">
                  Explore <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
