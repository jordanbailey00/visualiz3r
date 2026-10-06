import { ArrowRight, BrainCircuit, Cpu, Gpu, HardDrive, MemoryStick, Microchip, CircuitBoard } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/site/TopNav";
import { CATALOG } from "@/lib/hardware/catalog";

const DEVICE_ICONS = {
  gpu: Gpu,
  cpu: Cpu,
  ram: MemoryStick,
  ssd: Microchip,
  hdd: HardDrive,
  "raspberry-pi": CircuitBoard,
} as const;

const LLM_STEPS = [
  "Tokenize",
  "Embed",
  "Attention",
  "MLP",
  "× 4 layers",
  "Unembed",
  "Sample",
];

function Preview({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="-mx-7 -mt-7 mb-6 aspect-[16/9] overflow-hidden border-b border-white/[0.06] bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, rgba(56,189,248,0.13), transparent 70%), radial-gradient(50% 45% at 85% 20%, rgba(167,139,250,0.14), transparent 70%), radial-gradient(70% 60% at 50% 100%, rgba(30,41,59,0.6), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)",
        }}
      />

      <header className="relative mx-auto flex max-w-6xl items-center px-6 pt-6">
        <Logo />
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pt-24">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-sky-300/90">Interactive 3D explainers</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
          See what&apos;s really happening inside the machine.
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-300 sm:text-lg">
          Take apart the hardware in your computer down to the silicon, then follow a sentence through a real
          transformer language model — every number, every step. Drag to rotate, scroll to zoom, click anything to
          learn what it does.
        </p>
      </section>

      <section className="relative mx-auto grid max-w-6xl gap-5 px-6 pb-20 lg:grid-cols-2">
        <Link
          href="/hardware"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-b from-sky-400/[0.09] to-white/[0.02] p-7 ring-1 ring-white/10 transition hover:ring-sky-300/40"
        >
          <Preview src="/previews/gpu.webp" alt="3D graphics card with its cooler and fans" />
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-sky-400/15 text-sky-200 ring-1 ring-sky-300/30">
              <Cpu className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-white">Computer hardware</h2>
              <p className="text-[13px] text-ink-300">Six devices, hundreds of parts</p>
            </div>
          </div>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-200">
            Realistic 3D models you can explode layer by layer: the fans, heat pipes and power stages of a graphics
            card, the chiplets under a CPU&apos;s lid, the platters of a hard drive, the NAND inside an SSD.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {CATALOG.map((d) => {
              const Icon = DEVICE_ICONS[d.id];
              return (
                <span
                  key={d.id}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-white/[0.03] px-2 py-3 text-[11.5px] font-medium text-ink-200 ring-1 ring-white/[0.06]"
                >
                  <Icon className="size-4 text-sky-300" />
                  {d.shortName}
                </span>
              );
            })}
          </div>
          <span className="mt-7 inline-flex items-center gap-2 text-[14px] font-semibold text-sky-200 group-hover:text-white">
            Open the hardware lab <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </span>
        </Link>

        <Link
          href="/llm"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-b from-violet-400/[0.1] to-white/[0.02] p-7 ring-1 ring-white/10 transition hover:ring-violet-300/40"
        >
          <Preview src="/previews/llm.webp" alt="Attention heads of a transformer drawn as grids of glowing numbers" />
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-violet-400/15 text-violet-200 ring-1 ring-violet-300/30">
              <BrainCircuit className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-white">Large language models</h2>
              <p className="text-[13px] text-ink-300">A real transformer, running in your browser</p>
            </div>
          </div>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-200">
            Type a prompt and watch a small GPT-style model predict the next word. Every matrix multiply,
            attention pattern and probability is computed live and laid out in 3D, with a guided tour from tokens
            to text.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            {LLM_STEPS.map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-ink-200 ring-1 ring-white/[0.07]">
                  {s}
                </span>
                {i < LLM_STEPS.length - 1 && <ArrowRight className="size-3 text-violet-300/60" />}
              </span>
            ))}
          </div>
          <span className="mt-7 inline-flex items-center gap-2 text-[14px] font-semibold text-violet-200 group-hover:text-white">
            Step inside the model <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </span>
        </Link>
      </section>
    </main>
  );
}
