import Link from "next/link";
import { AsciiLogo } from "@/components/site/AsciiLogo";
import { SupernovaBackground } from "@/components/site/SupernovaBackground";
import { CATALOG } from "@/lib/hardware/catalog";

const OPTIONS = [
  ...CATALOG.map((d) => ({ href: `/hardware/${d.id}`, image: `/previews/${d.id}.webp`, name: d.name })),
  { href: "/llm", image: "/previews/llm.webp", name: "Language Model" },
];

/** The logo, then everything you can explore: a picture and a name each. */
export default function Home() {
  return (
    <main className="relative flex min-h-svh flex-col items-center px-5 pb-16 pt-[clamp(40px,9vh,110px)]">
      <SupernovaBackground />
      <h1 className="sr-only">visualiz3r</h1>
      <AsciiLogo className="w-[min(760px,92vw)] text-hud-text" />

      <nav aria-label="Explore" className="mt-[clamp(40px,8vh,96px)] flex max-w-[1080px] flex-wrap justify-center gap-x-4 gap-y-7">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="group w-[min(250px,calc(50vw-28px))]">
            <div className="aspect-[16/10] overflow-hidden border border-white/[0.14] bg-black transition-colors group-hover:border-white/50 group-focus-visible:border-hud-accent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </div>
            <p className="hud-label mt-3 text-center text-[10.5px] text-hud-dim transition-colors group-hover:text-hud-text">{o.name}</p>
          </Link>
        ))}
      </nav>
    </main>
  );
}
