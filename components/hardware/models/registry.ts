import { lazy, type ComponentType } from "react";
import type { DeviceId } from "@/lib/hardware/types";

export interface ModelEntry {
  Model: ComponentType;
  /** Has moving parts (fans, platters…) that the animate toggle controls. */
  animated: boolean;
}

/** Each device model is code-split and loaded only when its page opens. */
export const DEVICE_MODELS: Record<DeviceId, ModelEntry> = {
  gpu: { Model: lazy(() => import("./gpu/GpuModel")), animated: true },
  cpu: { Model: lazy(() => import("./cpu/CpuModel")), animated: false },
  ram: { Model: lazy(() => import("./ram/RamModel")), animated: false },
  ssd: { Model: lazy(() => import("./ssd/SsdModel")), animated: false },
  hdd: { Model: lazy(() => import("./hdd/HddModel")), animated: true },
  "raspberry-pi": { Model: lazy(() => import("./raspberry-pi/RaspberryPiModel")), animated: false },
};
