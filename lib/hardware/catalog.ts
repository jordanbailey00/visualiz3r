import type { DeviceId, PartCategory } from "./types";

/** Lightweight device list for navigation and galleries. */
export interface CatalogEntry {
  id: DeviceId;
  name: string;
  shortName: string;
  tagline: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: "gpu",
    name: "Graphics Card",
    shortName: "GPU",
    tagline: "Thousands of tiny cores, a wall of copper and three fans.",
  },
  {
    id: "cpu",
    name: "Processor",
    shortName: "CPU",
    tagline: "Billions of transistors under a nickel-plated lid.",
  },
  {
    id: "ram",
    name: "Memory Module",
    shortName: "RAM",
    tagline: "Sixteen DDR5 chips holding everything the CPU is working on.",
  },
  {
    id: "ssd",
    name: "Solid-State Drive",
    shortName: "SSD",
    tagline: "Terabytes of 3D NAND on a stick of gum.",
  },
  {
    id: "hdd",
    name: "Hard Disk Drive",
    shortName: "HDD",
    tagline: "Spinning mirrors read by heads flying 3 nm above them.",
  },
  {
    id: "raspberry-pi",
    name: "Raspberry Pi 5",
    shortName: "Pi 5",
    tagline: "A whole computer on a board the size of a credit card.",
  },
];

export const DEVICE_IDS = CATALOG.map((d) => d.id);

export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((d) => d.id === id);
}

export const CATEGORY_META: Record<PartCategory, { label: string; color: string }> = {
  compute: { label: "Compute", color: "#f472b6" },
  memory: { label: "Memory", color: "#a78bfa" },
  storage: { label: "Storage", color: "#34d399" },
  power: { label: "Power", color: "#fbbf24" },
  cooling: { label: "Cooling", color: "#38bdf8" },
  io: { label: "Connectivity", color: "#fb923c" },
  structure: { label: "Structure", color: "#94a3b8" },
  control: { label: "Control", color: "#2dd4bf" },
  mechanical: { label: "Mechanical", color: "#f87171" },
  signal: { label: "Signal", color: "#c084fc" },
};
