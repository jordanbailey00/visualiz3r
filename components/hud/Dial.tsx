import Link from "next/link";
import type { CSSProperties } from "react";

/** Tick marks around the bezel, as one SVG path (viewBox 0 0 400 400). */
function ticks(n: number, r0: number, r1: number, skipEvery = 0) {
  let d = "";
  for (let i = 0; i < n; i++) {
    if (skipEvery && i % skipEvery === 0) continue;
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a);
    const y = -Math.cos(a);
    d += `M${(200 + x * r0).toFixed(2)} ${(200 + y * r0).toFixed(2)}L${(200 + x * r1).toFixed(2)} ${(200 + y * r1).toFixed(2)}`;
  }
  return d;
}
const MINOR = ticks(120, 182, 190, 10);
const MAJOR = ticks(12, 175, 191);

/** Seconds each picture holds when a dial cycles through several. */
const HOLD = 3.5;

export interface DialProps {
  href: string;
  /** One picture, or six to cycle through. */
  images: string[];
  /** Caption inside the viewport (one per picture when cycling). */
  feed: string[];
  label: string;
  index?: string;
  sub?: string;
  /** Diameter as a CSS length. */
  size: string;
  labelSize?: string;
  zoom?: number;
  /** Which part of the picture to centre (CSS object-position). */
  aim?: string;
  /** Slow pan across a single picture. */
  drift?: boolean;
  delay?: number;
  ariaLabel: string;
}

/**
 * A selectable instrument: a ticked bezel around a circular viewport. The
 * picture sits dim and colourless until the dial is hovered or focused, then
 * powers up — the ring turns, an arc charges around the rim and the lamp lights.
 */
export function Dial({ href, images, feed, label, index, sub, size, labelSize, zoom = 1.05, aim, drift, delay = 0, ariaLabel }: DialProps) {
  const cycle = images.length > 1;
  const style = {
    "--d": size,
    "--zoom": zoom,
    "--cycle": `${HOLD * images.length}s`,
    "--delay": `${delay}ms`,
    ...(aim ? { "--pos": aim } : {}),
    ...(labelSize ? { "--label-size": labelSize } : {}),
  } as CSSProperties;
  const stagger = (i: number) => (cycle ? { animationDelay: `${i * HOLD}s` } : undefined);

  return (
    <Link href={href} className="dial" style={style} aria-label={ariaLabel}>
      <div className="dial-face">
        <div className="dial-viewport">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="dial-img"
              data-cycle={cycle}
              data-drift={!cycle && !!drift}
              style={stagger(i)}
              loading="lazy"
              decoding="async"
            />
          ))}
          <div className="dial-sweep" />
          <div className="dial-glass" />
          <div className="dial-feed" aria-hidden>
            {feed.map((f, i) => (
              <span key={f} data-cycle={cycle} style={stagger(i)}>
                {f}
              </span>
            ))}
          </div>
        </div>
        <svg className="dial-bezel" viewBox="0 0 400 400" aria-hidden>
          <circle className="ring" cx="200" cy="200" r="198" />
          <g className="ticks">
            <path className="minor" d={MINOR} />
            <path className="major" d={MAJOR} />
          </g>
          <circle className="arc" cx="200" cy="200" r="195" pathLength={100} transform="rotate(-90 200 200)" />
          <circle className="ring-inner" cx="200" cy="200" r="170" />
          <path className="pip" d="M200 37 L196.5 31 L203.5 31 Z" />
        </svg>
      </div>
      <div className="dial-label">
        <span className="hud-lamp" />
        {index && <span className="idx">{index}</span>}
        <span>{label}</span>
      </div>
      {sub && <div className="dial-sub">{sub}</div>}
    </Link>
  );
}
