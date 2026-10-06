import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

/**
 * Surface description used by the painter. Every shape is drawn into three
 * canvases at once so colour, roughness/metalness and height always line up.
 */
export interface Surface {
  /** CSS colour. */
  color: string;
  /** 0 (mirror) … 1 (matte). */
  rough: number;
  /** 0 (dielectric) … 1 (metal). */
  metal: number;
  /** 0 … 1 relative height used for the bump map. Omit to leave height untouched. */
  height?: number;
}

export interface PaintedMaps {
  map: Texture;
  /** Roughness in G, metalness in B: use as both roughnessMap and metalnessMap. */
  rmMap: Texture;
  bumpMap: Texture;
  /** Pixels per mm the maps were painted at. */
  ppm: number;
}

const cache = new Map<string, PaintedMaps>();

/** Seeded PRNG so procedural layouts are identical on every load. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const toByte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

export const FONT_SANS = `"Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif`;
export const FONT_MONO = `"DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace`;
export const FONT_COND = `"Arial Narrow", "Liberation Sans Narrow", "DejaVu Sans Condensed", Arial, sans-serif`;

/**
 * Paints into colour / roughness-metalness / height canvases using millimetre
 * coordinates with the origin at the top-left of the surface (x right, y down).
 */
export class Painter {
  readonly w: number;
  readonly h: number;
  readonly ppm: number;
  readonly c: CanvasRenderingContext2D;
  readonly m: CanvasRenderingContext2D;
  readonly hgt: CanvasRenderingContext2D;
  /** Set when painting a face seen from below, so text still reads correctly. */
  mirrorText = false;
  private canvases: HTMLCanvasElement[];

  constructor(widthMm: number, heightMm: number, ppm: number, base: Surface) {
    this.ppm = ppm;
    this.w = Math.max(4, Math.round(widthMm * ppm));
    this.h = Math.max(4, Math.round(heightMm * ppm));
    this.canvases = [makeCanvas(this.w, this.h), makeCanvas(this.w, this.h), makeCanvas(this.w, this.h)];
    const [c, m, h] = this.canvases.map((cv) => cv.getContext("2d", { willReadFrequently: false })!);
    this.c = c;
    this.m = m;
    this.hgt = h;
    for (const ctx of [c, m, h]) {
      ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    this.rect(0, 0, widthMm, heightMm, { ...base, height: base.height ?? 0 });
  }

  private styles(s: Surface) {
    return {
      color: s.color,
      rm: `rgb(255, ${toByte(s.rough)}, ${toByte(s.metal)})`,
      height: s.height === undefined ? null : `rgb(${toByte(s.height)}, ${toByte(s.height)}, ${toByte(s.height)})`,
    };
  }

  /** Run a path-building function on all three layers and fill/stroke it. */
  shape(build: (ctx: CanvasRenderingContext2D) => void, s: Surface, mode: "fill" | "stroke" = "fill", lineWidth = 0.2) {
    const st = this.styles(s);
    const layers: [CanvasRenderingContext2D, string | null][] = [
      [this.c, st.color],
      [this.m, st.rm],
      [this.hgt, st.height],
    ];
    for (const [ctx, style] of layers) {
      if (!style) continue;
      ctx.beginPath();
      build(ctx);
      if (mode === "fill") {
        ctx.fillStyle = style;
        ctx.fill();
      } else {
        ctx.strokeStyle = style;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, s: Surface) {
    this.shape((ctx) => ctx.rect(x, y, w, h), s);
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, s: Surface) {
    this.shape((ctx) => ctx.roundRect(x, y, w, h, r), s);
  }

  strokeRect(x: number, y: number, w: number, h: number, lineWidth: number, s: Surface) {
    this.shape((ctx) => ctx.rect(x, y, w, h), s, "stroke", lineWidth);
  }

  circle(x: number, y: number, r: number, s: Surface) {
    this.shape((ctx) => ctx.arc(x, y, r, 0, Math.PI * 2), s);
  }

  ring(x: number, y: number, r: number, lineWidth: number, s: Surface) {
    this.shape((ctx) => ctx.arc(x, y, r, 0, Math.PI * 2), s, "stroke", lineWidth);
  }

  polyline(points: [number, number][], lineWidth: number, s: Surface) {
    if (points.length < 2) return;
    this.shape(
      (ctx) => {
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      },
      s,
      "stroke",
      lineWidth,
    );
  }

  polygon(points: [number, number][], s: Surface) {
    this.shape((ctx) => {
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
    }, s);
  }

  /**
   * Text in mm units. `size` is the cap height-ish font size in mm.
   * Rotation is in degrees, about the anchor point.
   */
  text(
    str: string,
    x: number,
    y: number,
    size: number,
    s: Surface,
    opts: {
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      font?: string;
      weight?: number | string;
      rotate?: number;
      letterSpacing?: number;
      maxWidth?: number;
    } = {},
  ) {
    const st = this.styles(s);
    const font = `${opts.weight ?? 600} ${size}px ${opts.font ?? FONT_SANS}`;
    for (const [ctx, style] of [
      [this.c, st.color],
      [this.m, st.rm],
      [this.hgt, st.height],
    ] as [CanvasRenderingContext2D, string | null][]) {
      if (!style) continue;
      ctx.save();
      ctx.translate(x, y);
      if (this.mirrorText) ctx.scale(-1, 1);
      if (opts.rotate) ctx.rotate((opts.rotate * Math.PI) / 180);
      ctx.font = font;
      if (opts.letterSpacing !== undefined && "letterSpacing" in ctx) {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${opts.letterSpacing}px`;
      }
      ctx.textAlign = opts.align ?? "left";
      ctx.textBaseline = opts.baseline ?? "alphabetic";
      ctx.fillStyle = style;
      ctx.fillText(str, 0, 0, opts.maxWidth);
      ctx.restore();
    }
  }

  /** Low-amplitude noise on colour and height, for organic surfaces. */
  grain(amount: number, seed = 1, cell = 0.25) {
    const r = rng(seed);
    const step = Math.max(cell, 1 / this.ppm);
    const cols = Math.ceil(this.w / this.ppm / step);
    const rows = Math.ceil(this.h / this.ppm / step);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const v = r() - 0.5;
        if (Math.abs(v) < 0.3) continue;
        const a = Math.abs(v) * amount;
        this.c.fillStyle = v > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
        this.c.fillRect(i * step, j * step, step, step);
      }
    }
  }

  /** Direct access when a layer needs special treatment. */
  get canvasList() {
    return this.canvases;
  }

  toMaps(opts: { anisotropy?: number; repeat?: [number, number] } = {}): PaintedMaps {
    const [cc, mc, hc] = this.canvases;
    const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
      const t = new CanvasTexture(cv);
      t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
      t.anisotropy = opts.anisotropy ?? 8;
      t.minFilter = LinearMipmapLinearFilter;
      if (opts.repeat) {
        t.wrapS = t.wrapT = RepeatWrapping;
        t.repeat.set(opts.repeat[0], opts.repeat[1]);
      }
      t.needsUpdate = true;
      return t;
    };
    return { map: mk(cc, true), rmMap: mk(mc, false), bumpMap: mk(hc, false), ppm: this.ppm };
  }
}

/** Paint once per key; later calls reuse the textures. */
export function painted(
  key: string,
  widthMm: number,
  heightMm: number,
  ppm: number,
  base: Surface,
  paint: (p: Painter) => void,
  opts?: { anisotropy?: number },
): PaintedMaps {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Painter(widthMm, heightMm, ppm, base);
  paint(p);
  const maps = p.toMaps(opts);
  cache.set(key, maps);
  return maps;
}

/** Octilinear route (straight, 45°, straight) between two points. */
export function octilinear(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  horizontalFirst = Math.abs(bx - ax) >= Math.abs(by - ay),
): [number, number][] {
  const adx = Math.abs(bx - ax);
  const ady = Math.abs(by - ay);
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  const diag = Math.min(adx, ady);
  const pts: [number, number][] = [[ax, ay]];
  if (horizontalFirst) {
    const lead = (adx - diag) / 2;
    pts.push([ax + sx * lead, ay], [ax + sx * (lead + diag), ay + sy * diag], [bx, ay + sy * diag]);
    if (ady > diag) pts.push([bx, by]);
  } else {
    const lead = (ady - diag) / 2;
    pts.push([ax, ay + sy * lead], [ax + sx * diag, ay + sy * (lead + diag)], [ax + sx * diag, by]);
    if (adx > diag) pts.push([bx, by]);
  }
  return pts;
}
