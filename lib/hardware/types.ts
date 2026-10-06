/**
 * Shared types for the hardware explorer.
 *
 * World units are millimetres. Every device model is built around the origin
 * with +Y up; its main board (if any) lies in the XZ plane.
 */

export type DeviceId = "gpu" | "cpu" | "ram" | "ssd" | "hdd" | "raspberry-pi";

export type PartCategory =
  | "compute"
  | "memory"
  | "storage"
  | "power"
  | "cooling"
  | "io"
  | "structure"
  | "control"
  | "mechanical"
  | "signal";

export interface PartInfo {
  name: string;
  category: PartCategory;
  /** One plain-language sentence. Shown in tooltips, lists and as the panel lead. */
  summary: string;
  /** Main explanation: 1–3 short paragraphs. Supports **bold** and `code`. */
  details: string[];
  /** Key facts as [label, value] rows. */
  specs?: [string, string][];
  /** Optional ordered explanation of the mechanism. */
  howItWorks?: string[];
  /** Optional surprising fact. */
  didYouKnow?: string;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface DeviceInfo {
  id: DeviceId;
  /** e.g. "Graphics Card" */
  name: string;
  /** e.g. "GPU" */
  shortName: string;
  /** What exactly is modelled, e.g. "Triple-fan desktop graphics card". */
  model: string;
  /** One-line hook for galleries. */
  tagline: string;
  /** Shown in the info panel when nothing is selected. */
  intro: string[];
  /** Headline specifications for the device overview. */
  specs: [string, string][];
  /** Default camera framing. */
  camera: CameraPose;
  /**
   * Characteristic size of the device in mm (roughly its largest dimension).
   * Used to scale lighting, shadows, ambient occlusion and the floor grid.
   */
  size: number;
  /** Explanations for every <Part id> used by the model, keyed by part id. */
  parts: Record<string, PartInfo>;
}

/** A node of the part hierarchy, discovered from the rendered scene graph. */
export interface PartNode {
  id: string;
  parentId: string | null;
  children: string[];
  depth: number;
}
