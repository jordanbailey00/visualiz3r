import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Dial } from "@/components/hud/Dial";
import { ExitLink, Lamp, Viewfinder, pad } from "@/components/hud/Hud";
import { CATALOG } from "@/lib/hardware/catalog";

export const metadata: Metadata = {
  title: "Hardware lab",
  description: "Realistic, explodable 3D models of a graphics card, processor, memory, SSD, hard drive and Raspberry Pi.",
};

/** Unit select: six dials on one rail. */
export default function HardwareIndex() {
  return (
    <main className="hud-screen grid place-items-center px-6 py-24">
      <Viewfinder />
      <div className="absolute left-[30px] top-[30px] z-10">
        <ExitLink href="/" label="Home" />
      </div>
      <div className="relative" style={{ "--dial": "clamp(132px, 12.5vw, 188px)" } as CSSProperties}>
        <div className="dial-rail max-lg:hidden" style={{ top: "calc(var(--dial) / 2)", left: "calc(50% - 50vw)", right: "calc(50% - 50vw)" }} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 sm:gap-x-12 lg:flex lg:gap-[clamp(20px,2.4vw,44px)]">
          {CATALOG.map((d, i) => (
            <Dial
              key={d.id}
              href={`/hardware/${d.id}`}
              images={[`/previews/dial/${d.id}.webp`]}
              feed={[`Unit ${pad(i + 1)}`]}
              index={pad(i + 1)}
              label={d.shortName}
              sub={d.name}
              size="var(--dial)"
              zoom={1.18}
              delay={i * 90}
              ariaLabel={`${d.name}: ${d.tagline}`}
            />
          ))}
        </div>
      </div>
      <p className="hud-label absolute inset-x-0 bottom-9 flex items-center justify-center gap-2.5 text-[9.5px] text-hud-faint">
        <Lamp blink /> Select unit
      </p>
    </main>
  );
}
