import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HardwareExplorerLoader } from "@/components/hardware/HardwareExplorerLoader";
import { DEVICE_IDS } from "@/lib/hardware/catalog";
import { getDeviceInfo } from "@/lib/hardware/content";

export function generateStaticParams() {
  return DEVICE_IDS.map((device) => ({ device }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ device: string }>;
}): Promise<Metadata> {
  const { device } = await params;
  const info = getDeviceInfo(device);
  return info
    ? { title: `${info.name} in 3D`, description: info.tagline || info.intro[0] }
    : {};
}

export default async function DevicePage({
  params,
}: {
  params: Promise<{ device: string }>;
}) {
  const { device } = await params;
  const info = getDeviceInfo(device);
  if (!info) notFound();
  return <HardwareExplorerLoader device={info} />;
}
