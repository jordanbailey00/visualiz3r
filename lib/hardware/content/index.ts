import type { DeviceId, DeviceInfo } from "../types";
import { cpu } from "./cpu";
import { gpu } from "./gpu";
import { hdd } from "./hdd";
import { ram } from "./ram";
import { raspberryPi } from "./raspberry-pi";
import { ssd } from "./ssd";

const DEVICES: Record<DeviceId, DeviceInfo> = {
  gpu,
  cpu,
  ram,
  ssd,
  hdd,
  "raspberry-pi": raspberryPi,
};

export function getDeviceInfo(id: string): DeviceInfo | undefined {
  return (DEVICES as Record<string, DeviceInfo>)[id];
}
