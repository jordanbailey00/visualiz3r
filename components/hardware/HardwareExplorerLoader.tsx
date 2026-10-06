"use client";

import dynamic from "next/dynamic";
import type { DeviceInfo } from "@/lib/hardware/types";
import { LoadingScreen } from "@/components/site/LoadingScreen";

const HardwareExplorer = dynamic(() => import("./HardwareExplorer"), {
  ssr: false,
  loading: () => <LoadingScreen label="Loading 3D workspace" />,
});

export function HardwareExplorerLoader({ device }: { device: DeviceInfo }) {
  return <HardwareExplorer device={device} />;
}
