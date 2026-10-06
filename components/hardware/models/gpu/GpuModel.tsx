"use client";

import { Part } from "../../Part";
import { GpuBoard } from "./GpuBoard";
import { GpuDeepDive } from "./GpuDeepDive";
import {
  Backplate,
  Fins,
  GpuFans,
  HeatPipes,
  IoBracket,
  LightBar,
  Midplate,
  ShroudFrame,
  ThermalPads,
  ThermalPaste,
  VaporChamber,
} from "./GpuCooler";
import { CARD } from "./layout";

/**
 * Triple-fan desktop graphics card. Exploding the view peels it apart top-down:
 * shroud and fans, heatsink, base plate, then lifts the circuit board off the
 * backplate and raises the chips off the board.
 */
export default function GpuModel() {
  return (
    <group>
      <Part id="backplate">
        <Backplate />
      </Part>

      <Part id="pcb" position={[0, CARD.pcbTop, 0]} explode={[0, 42, 0]} explodeRange={[0.35, 0.85]}>
        <GpuBoard />
      </Part>

      <Part id="io-bracket" explode={[-26, 42, 0]} explodeRange={[0.35, 0.85]}>
        <IoBracket />
      </Part>

      <Part id="cooler" explode={[0, 80, 0]} explodeRange={[0.2, 0.75]}>
        <Part id="base-plate">
          <Midplate />
          <Part id="thermal-pads" explode={[0, -7, 0]} explodeRange={[0.4, 0.9]}>
            <ThermalPads />
          </Part>
        </Part>
        <Part id="heatsink" explode={[0, 28, 0]} explodeRange={[0.15, 0.6]}>
          <Part id="vapor-chamber">
            <VaporChamber />
          </Part>
          <Part id="thermal-paste" explode={[0, -9, 0]} explodeRange={[0.4, 0.9]}>
            <ThermalPaste />
          </Part>
          <Part id="heat-pipes">
            <HeatPipes />
          </Part>
          <Part id="fin-stack">
            <Fins />
          </Part>
        </Part>
        <Part id="shroud" cover explode={[0, 60, 0]} explodeRange={[0, 0.5]}>
          <Part id="shroud-frame">
            <ShroudFrame />
          </Part>
          <Part id="fans" explode={[0, 22, 0]} explodeRange={[0, 0.45]}>
            <GpuFans />
          </Part>
          <Part id="light-bar">
            <LightBar />
          </Part>
        </Part>
      </Part>

      <GpuDeepDive />
    </group>
  );
}
