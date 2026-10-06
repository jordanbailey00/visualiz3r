"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { ExtrudeGeometry, MeshPhysicalMaterial, Shape, type Group } from "three";
import { Part } from "../../Part";
import { explodeProgress } from "../../explode";
import { Chip } from "../../kit/Chip";
import { Screw } from "../../kit/Fasteners";
import { cached } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { SmdField, type SmdItem } from "../../kit/Passives";
import { FanCable, FanHousing, Heatsink, Impeller, PushPins, ThermalPads } from "./ActiveCooler";
import { DieDeepDive } from "./DieDeepDive";
import { PI_SURF, PiBoard } from "./PiBoard";
import { Crystals, Inductor, SocDie, SocLid, SocSubstrate, SocTim, WifiChip, WifiShield } from "./PiChips";
import {
  EthernetJack,
  FpcEdge,
  FpcVertical,
  JstSh,
  MicroHdmi,
  MicroSdCard,
  MicroSdSocket,
  PinHeader2,
  PowerButton,
  StatusLed,
  UsbCPort,
  UsbStack,
  brassMaterial,
  standoffGeometry,
} from "./PiConnectors";
import {
  ANTENNA_PARTS,
  ANTENNA_POLY,
  BAT_CONN,
  BOARD_TOP,
  BOOT_FLASH,
  CORE_INDUCTORS,
  ETH,
  FAN_CONN,
  GPIO,
  HDMI,
  HDMI_X,
  MICROSD,
  MIPI,
  MIPI_X,
  MOUNT_HOLES,
  PCB,
  PCIE_FPC,
  PHY,
  PMIC,
  POE,
  POWER_BUTTON,
  RAM,
  RP1,
  SOC,
  SOC_Y,
  STANDOFF_H,
  STATUS_LED,
  UART_CONN,
  USB2,
  USB3,
  USB_STACK,
  USB_SWITCH,
  USBC,
  WIFI,
  wx,
  wz,
} from "./layout";
import { BOTTOM_PASSIVES, TOP_PASSIVES, type PassiveSet } from "./passives";

type Vec3 = [number, number, number];

/** Drawing coordinates → board-local position (y = 0 is the board's top surface). */
const at = (x: number, z: number, y = 0): Vec3 => [wx(x), y, wz(z)];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * A second leg of exploded-view motion without adding a node to the parts
 * tree (e.g. the cooler first lifts straight up, then moves aside).
 */
function Motion({ offset, range, children }: { offset: Vec3; range: [number, number]; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = smoothstep(range[0], range[1], explodeProgress.value);
    g.position.set(offset[0] * t, offset[1] * t, offset[2] * t);
  });
  return <group ref={ref}>{children}</group>;
}

/** Drawing-coordinate passives → board-local instanced fields. */
function Passives({ set, bottom = false }: { set: PassiveSet; bottom?: boolean }) {
  const fields = useMemo(() => {
    // The underside group is flipped about X, so mirror z and rotation there.
    const map = (items: SmdItem[]): SmdItem[] => items.map(([x, z, r = 0]) => [wx(x), bottom ? -wz(z) : wz(z), bottom ? -r : r]);
    return {
      c0201: map(set.c0201),
      r0201: map(set.r0201),
      c0402: map(set.c0402),
      r0402: map(set.r0402),
      c0603: map(set.c0603),
      c0805: map(set.c0805),
    };
  }, [set, bottom]);
  const body = (
    <>
      <SmdField items={fields.c0201} size="0201" kind="cap" />
      <SmdField items={fields.r0201} size="0201" kind="res" />
      <SmdField items={fields.c0402} size="0402" kind="cap" />
      <SmdField items={fields.r0402} size="0402" kind="res" />
      <SmdField items={fields.c0603} size="0603" kind="cap" />
      <SmdField items={fields.c0805} size="0805" kind="cap" body={MAT.ceramicDark} />
    </>
  );
  // The underside is the top flipped about X (so z is mirrored above).
  return bottom ? (
    <group position-y={-PCB.t} rotation-x={Math.PI}>
      {body}
    </group>
  ) : (
    body
  );
}

/** The copper antenna element as a hair-thin mesh, so the antenna can be picked and outlined. */
function antennaGeometry() {
  return cached("pi5-antenna", () => {
    const s = new Shape();
    s.moveTo(wx(ANTENNA_POLY[0][0]), wz(ANTENNA_POLY[0][1]));
    for (const [x, z] of ANTENNA_POLY.slice(1)) s.lineTo(wx(x), wz(z));
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.012, 0);
    return g;
  });
}

const BOARD_PARTS_RANGE: [number, number] = [0.38, 0.74];

/**
 * Raspberry Pi 5 (8 GB) with the official Active Cooler, on four brass standoffs.
 *
 * Exploding the view peels it apart from the top down:
 *  1. (0 → 0.4) The Active Cooler lifts off: the blower separates from the
 *     heatsink, its impeller rises out of the housing, the push pins pop up and
 *     the thermal pads float down between the cooler and the chips they touch.
 *  2. (0.34 → 0.8) The cooler moves aside. Ports slide outward from the board
 *     edges, chips lift off their land patterns, the shield can comes off the
 *     radio, the SoC's lid and TIM peel away from the bare die and the microSD
 *     card slides out of its slot.
 *  3. (0.66 → 1) A 5.5× magnified, labelled floorplan of the BCM2712 die grows
 *     out of the silicon and floats above the board (see DieDeepDive).
 */
export default function RaspberryPiModel() {
  const dieY = SOC_Y.dieBottom + SOC.die.t / 2;
  return (
    <group>
      {/* ------------------------------------------------------------------ */}
      <Part id="standoffs">
        {MOUNT_HOLES.map(([x, z]) => (
          <mesh key={`${x}:${z}`} geometry={standoffGeometry(STANDOFF_H)} material={brassMaterial()} position={[wx(x), 0, wz(z)]} castShadow receiveShadow />
        ))}
        <Motion offset={[0, 7, 0]} range={[0.3, 0.6]}>
          {MOUNT_HOLES.map(([x, z]) => (
            <Screw key={`${x}:${z}`} position={[wx(x), BOARD_TOP, wz(z)]} diameter={4.4} height={1.5} material={MAT.steel} />
          ))}
        </Motion>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="pcb" position={[0, BOARD_TOP, 0]}>
        <PiBoard />

        {/* BCM2712: package lifts off its BGA, lid and TIM peel away, die rises */}
        <Part id="soc" position={at(SOC.x, SOC.z)} explode={[0, 2.2, 0]} explodeRange={[0.42, 0.75]}>
          <Part id="soc-substrate">
            <SocSubstrate />
          </Part>
          <Part id="soc-die" position={[0, dieY, 0]} explode={[0, 2.6, 0]} explodeRange={[0.5, 0.82]}>
            <SocDie />
            <DieDeepDive />
          </Part>
          <Part id="soc-tim" position={[0, SOC_Y.dieTop + SOC.timT / 2, 0]} explode={[-3.5, 6, 0]} explodeRange={[0.45, 0.78]}>
            <SocTim />
          </Part>
          <Part id="soc-lid" cover explode={[-7, 10, 0]} explodeRange={[0.4, 0.74]}>
            <SocLid />
          </Part>
        </Part>

        <Part id="sdram" position={at(RAM.x, RAM.z)} explode={[0, 3.5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Chip size={[RAM.w, RAM.h, RAM.d]} standoff={0.22} balls={{ pitch: 0.65, inset: 0.75 }} marking={{ lines: ["LP4X 8GB x32", "4267  2341", "Q7RXM"], logo: "dot-ring", scale: 0.62, ink: "#6e6f73" }} />
        </Part>

        <Part id="rp1" position={at(RP1.x, RP1.z)} explode={[0, 3.5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Chip size={[RP1.size, RP1.h, RP1.size]} standoff={0.25} balls={{ pitch: 0.65, inset: 0.6 }} marking={{ lines: ["RP1-C0", "2337", "K4N21.00"], scale: 0.72, ink: "#717276" }} />
        </Part>

        <Part id="pmic" position={at(PMIC.x, PMIC.z)} explode={[0, 3, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Chip kind="qfn" size={[PMIC.size, PMIC.h, PMIC.size]} pins={12} marking={{ lines: ["PM9091", "2336", "AB1"], logo: "square", scale: 1.05 }} />
          <Part id="core-inductors" position={[-wx(PMIC.x), 0, -wz(PMIC.z)]} explode={[0, 2.5, 0]} explodeRange={[0.45, 0.78]}>
            {CORE_INDUCTORS.map(([x, z]) => (
              <Inductor key={x} position={at(x, z)} />
            ))}
          </Part>
        </Part>

        <Part id="ethernet-phy" position={at(PHY.x, PHY.z)} rotation={[0, Math.PI / 4, 0]} explode={[0, 3, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Chip kind="qfn" size={[PHY.size, PHY.h, PHY.size]} pins={12} marking={{ lines: ["GPHY54213", "2335", "MKP"], logo: "wave", scale: 1.0 }} />
        </Part>

        <Part id="wifi-module" position={at(WIFI.x, WIFI.z)}>
          <Part id="wifi-shield" cover explode={[0, 6.5, 0]} explodeRange={[0.38, 0.7]}>
            <WifiShield />
          </Part>
          <Part id="wifi-chip" explode={[0, 2.2, 0]} explodeRange={[0.5, 0.8]}>
            <WifiChip />
          </Part>
          <Part id="wifi-antenna" position={[-wx(WIFI.x), 0, -wz(WIFI.z)]}>
            <mesh geometry={antennaGeometry()} material={antennaMaterial()} />
            <SmdField items={ANTENNA_PARTS.map(([x, z, r]): SmdItem => [wx(x), wz(z), r])} size="0201" kind="cap" />
          </Part>
        </Part>

        <Part id="boot-flash" position={at(BOOT_FLASH.x, BOOT_FLASH.z)} explode={[0, 2.5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Chip kind="qfn" size={[2.0, BOOT_FLASH.h, 3.0]} pins={2} marking={{ lines: ["Q16", "JV"], pin1: true, scale: 1.2 }} />
        </Part>

        <Part id="crystals" explode={[0, 2.5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Crystals />
        </Part>

        <Part id="support-ics" explode={[0, 2.2, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <Chip kind="sot" size={[2.9, 1.0, 1.6]} position={at(USB_SWITCH.x - 0.2, USB_SWITCH.z - 1.6)} rotation={[0, Math.PI / 2, 0]} pins={3} marking={{ lines: ["5V1"], pin1: false, scale: 1.3 }} />
          <Chip kind="qfn" size={[2.0, 0.6, 2.0]} position={at(USB_SWITCH.x - 0.2, USB_SWITCH.z + 2.0)} pins={2} marking={{ lines: ["C3"], pin1: true, scale: 1.4 }} />
          {HDMI_X.map((x) => (
            <Chip key={x} kind="qfn" size={[2.5, 0.5, 1.0]} position={at(x, 46.65)} pins={3} marking={{ lines: ["ESD"], pin1: false, scale: 1.2 }} />
          ))}
        </Part>

        <Part id="passives">
          <Passives set={TOP_PASSIVES} />
        </Part>
        <Part id="underside-caps">
          <Passives set={BOTTOM_PASSIVES} bottom />
        </Part>

        {/* --- Connectors ------------------------------------------------ */}
        <Part id="gpio-header" position={at(GPIO.x, GPIO.z)} explode={[0, 9, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <PinHeader2 cols={GPIO.cols} rows={2} pitch={GPIO.pitch} />
        </Part>
        <Part id="poe-header" position={at(POE.x, POE.z)} explode={[0, 7, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <PinHeader2 cols={2} rows={2} pitch={2.54} />
        </Part>

        <Part id="usb2-ports" position={at(USB_STACK.front, USB2.z)} rotation={[0, Math.PI / 2, 0]} explode={[12, 0, 0]} explodeRange={[0.35, 0.7]}>
          <UsbStack usb3={false} />
        </Part>
        <Part id="usb3-ports" position={at(USB_STACK.front, USB3.z)} rotation={[0, Math.PI / 2, 0]} explode={[12, 0, 0]} explodeRange={[0.37, 0.72]}>
          <UsbStack usb3 />
        </Part>
        <Part id="ethernet-jack" position={at(ETH.front, ETH.z)} rotation={[0, Math.PI / 2, 0]} explode={[12, 0, 0]} explodeRange={[0.39, 0.74]}>
          <EthernetJack />
        </Part>

        <Part id="hdmi-ports" explode={[0, 0, 9]} explodeRange={[0.35, 0.7]}>
          {HDMI_X.map((x) => (
            <MicroHdmi key={x} position={at(x, HDMI.front)} />
          ))}
        </Part>
        <Part id="usb-c-power" position={at(USBC.x, USBC.front)} explode={[0, 0, 9]} explodeRange={[0.35, 0.7]}>
          <UsbCPort />
        </Part>

        <Part id="pcie-connector" position={at(PCIE_FPC.x - PCIE_FPC.w / 2, PCIE_FPC.z)} rotation={[0, -Math.PI / 2, 0]} explode={[-7, 0, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <FpcEdge width={PCIE_FPC.d} pins={16} />
        </Part>
        <Part id="mipi-connectors" explode={[0, 6, 0]} explodeRange={BOARD_PARTS_RANGE}>
          {MIPI_X.map((x) => (
            <FpcVertical key={x} length={MIPI.d} pins={22} position={at(x, MIPI.z)} />
          ))}
        </Part>

        <Part id="fan-connector" position={at(FAN_CONN.x, FAN_CONN.z)} rotation={[0, Math.PI / 2, 0]} explode={[0, 5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <JstSh pins={4} />
        </Part>
        <Part id="rtc-connector" position={at(BAT_CONN.x, BAT_CONN.z)} explode={[0, 5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <JstSh pins={2} />
        </Part>
        <Part id="uart-connector" position={at(UART_CONN.x, UART_CONN.z)} explode={[0, 5, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <JstSh pins={3} />
        </Part>

        <Part id="power-button" position={at(POWER_BUTTON.x, POWER_BUTTON.z)} explode={[-6, 0, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <PowerButton />
        </Part>
        <Part id="status-led" position={at(STATUS_LED.x, STATUS_LED.z)} explode={[-6, 0, 0]} explodeRange={BOARD_PARTS_RANGE}>
          <StatusLed />
        </Part>

        <Part id="microsd-slot" position={at(0, MICROSD.z)}>
          <MicroSdSocket width={MICROSD.socketW} depth={MICROSD.socketD} />
          <Part id="microsd-card" position={[-MICROSD.cardOut, -PCB.t - 0.7, 0]} explode={[-18, 0, 0]} explodeRange={[0.4, 0.8]}>
            <MicroSdCard />
          </Part>
        </Part>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="active-cooler" cover position={[0, BOARD_TOP, 0]} explode={[0, 28, 0]} explodeRange={[0, 0.4]}>
        <Motion offset={[-38, 8, -6]} range={[0.34, 0.72]}>
          <Part id="cooler-heatsink">
            <Heatsink />
          </Part>
          <Part id="cooler-push-pins" explode={[0, 5, 0]} explodeRange={[0.18, 0.5]}>
            <PushPins />
          </Part>
          <Part id="cooler-thermal-pads" explode={[0, -14, 0]} explodeRange={[0.1, 0.4]}>
            <Motion offset={[19, -4, 3]} range={[0.34, 0.72]}>
              <ThermalPads />
            </Motion>
          </Part>
          <Part id="cooler-fan" explode={[0, 12, 0]} explodeRange={[0.1, 0.42]}>
            <FanHousing />
            <Part id="fan-impeller" explode={[0, 7, 0]} explodeRange={[0.25, 0.6]}>
              <Impeller />
            </Part>
            <Part id="fan-cable">
              <FanCable />
            </Part>
          </Part>
        </Motion>
      </Part>
    </group>
  );
}

let antMat: MeshPhysicalMaterial | null = null;
/** Matches the painted trace colour so the overlay is invisible until outlined. */
function antennaMaterial() {
  return (antMat ??= new MeshPhysicalMaterial({ color: PI_SURF.copper.color, roughness: 0.3, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.32 }));
}
