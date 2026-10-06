import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
} from "three";

/**
 * Tensor grid shader. Each texel of `map` is one cell (colour already mapped
 * on the CPU; alpha 0 marks a masked cell). Up close every cell is drawn as a
 * bevelled tile with a gap; from far away the mip-mapped texture is used so
 * thousands of sub-pixel cells average smoothly instead of shimmering.
 */
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D map;
  uniform vec2 dims;
  uniform float dimAmt;
  uniform float gain;
  uniform vec2 hoverCell;
  uniform float laneRow;
  uniform float laneCol;
  uniform float selRow;
  uniform float selCol;
  uniform float pulse;
  uniform vec3 accent;
  varying vec2 vUv;

  void main() {
    vec2 g = vec2(vUv.x * dims.x, (1.0 - vUv.y) * dims.y);
    vec2 cell = min(floor(g), dims - 1.0);
    vec2 f = fract(g);
    vec4 nearC = textureLod(map, (cell + 0.5) / dims, 0.0);
    vec3 farC = texture(map, vec2(vUv.x, 1.0 - vUv.y)).rgb;

    vec2 fw = fwidth(g);
    float ppc = 1.0 / max(max(fw.x, fw.y), 1e-5);
    float nearW = smoothstep(1.6, 4.5, ppc);

    vec2 d = min(f, 1.0 - f);
    float edge = min(d.x, d.y);
    float aa = max(fw.x, fw.y) * 1.2;
    float inside = smoothstep(0.055, 0.055 + aa, edge);
    float bevel = 0.86 + 0.24 * (1.0 - f.y) * smoothstep(0.0, 0.2, edge);

    vec3 col = nearC.rgb;
    if (nearC.a < 0.5) {
      float hatch = step(0.5, fract((g.x - g.y) * 1.25));
      col = mix(vec3(0.028, 0.03, 0.038), vec3(0.07, 0.074, 0.088), hatch);
      farC = vec3(0.045, 0.048, 0.058);
    }
    vec3 tile = mix(vec3(0.012, 0.014, 0.02), col * bevel, inside);
    vec3 c = mix(farC, tile, nearW);

    float lane = 0.0;
    if (laneRow >= 0.0 && abs(cell.y - laneRow) < 0.5) lane = 1.0;
    if (laneCol >= 0.0 && abs(cell.x - laneCol) < 0.5) lane = 1.0;
    c = mix(c, c * 1.6 + accent * 0.12, lane);

    float sel = 0.0;
    if (selRow >= 0.0 && abs(cell.y - selRow) < 0.5) sel = 1.0;
    if (selCol >= 0.0 && abs(cell.x - selCol) < 0.5) sel = 1.0;
    float selEdge = sel * (1.0 - smoothstep(0.0, 0.08 + aa, edge));
    c = mix(c, c * 1.9 + vec3(0.06), sel);
    c = mix(c, vec3(0.95, 0.92, 1.0), selEdge * 0.55);

    float hov = step(abs(cell.x - hoverCell.x), 0.5) * step(abs(cell.y - hoverCell.y), 0.5);
    float ring = hov * (1.0 - smoothstep(0.0, 0.1 + aa, edge));
    c = mix(c, vec3(1.0), ring * 0.95);
    c += hov * 0.18;

    c *= mix(1.0, 0.13, dimAmt);
    c *= gain * (1.0 + pulse * 0.6);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function makeSlabMaterial() {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      map: { value: null },
      dims: { value: new Vector2(1, 1) },
      dimAmt: { value: 0 },
      gain: { value: 1.15 },
      hoverCell: { value: new Vector2(-10, -10) },
      laneRow: { value: -1 },
      laneCol: { value: -1 },
      selRow: { value: -1 },
      selCol: { value: -1 },
      pulse: { value: 0 },
      accent: { value: new Color("#a78bfa") },
    },
    toneMapped: false,
  });
}

/** RGBA8 sRGB data texture with mipmaps (rows × cols cells). */
export function makeCellTexture(rgba: Uint8Array, cols: number, rows: number) {
  const t = new DataTexture(rgba, cols, rows, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
