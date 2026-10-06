import type { CSSProperties } from "react";
import { Dial } from "@/components/hud/Dial";
import { Viewfinder, pad } from "@/components/hud/Hud";
import { CATALOG } from "@/lib/hardware/catalog";

/** Two instruments on a dark field — nothing else. */
export default function Home() {
  return (
    <main className="hud-screen grid place-items-center px-6 py-16">
      <Viewfinder />
      <div
        className="relative flex flex-col items-center gap-16 md:flex-row md:items-start md:gap-[clamp(56px,9vw,150px)]"
        style={{ "--dial": "clamp(230px, 30vw, 410px)" } as CSSProperties}
      >
        <div className="dial-rail max-md:hidden" style={{ top: "calc(var(--dial) / 2)", left: "calc(50% - 50vw)", right: "calc(50% - 50vw)" }} />
        <Dial
          href="/hardware"
          images={CATALOG.map((d) => `/previews/dial/${d.id}.webp`)}
          feed={CATALOG.map((d, i) => `${pad(i + 1)} · ${d.shortName}`)}
          index="01"
          label="Hardware"
          sub="Six devices · taken apart"
          size="var(--dial)"
          labelSize="12px"
          ariaLabel="Hardware: take apart a graphics card, processor, memory, SSD, hard drive and Raspberry Pi"
        />
        <Dial
          href="/llm"
          images={["/previews/dial/llm.webp"]}
          feed={["Block 1 · head 1"]}
          index="02"
          label="Language model"
          sub="A live transformer · 394k parameters"
          size="var(--dial)"
          labelSize="12px"
          zoom={1.08}
          drift
          delay={160}
          ariaLabel="Language model: follow a sentence through a real transformer running in your browser"
        />
      </div>
    </main>
  );
}
