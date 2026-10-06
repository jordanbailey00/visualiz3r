"use client";

import { Part } from "../../Part";
import { DeepDive } from "./DeepDive";
import { RamBoard } from "./RamBoard";
import { HeatSpreader, LightBar } from "./RamHeatSpreader";

/**
 * 32 GB dual-rank DDR5 desktop memory module (UDIMM) with an aluminium heat
 * spreader and RGB light bar, standing on its edge connector as in a slot.
 *
 * Exploding it: the light bar lifts away, the heat-spreader halves swing open
 * like a clamshell and their thermal pads peel off, the 16 DRAM packages and
 * the power chips rise off the board, one chip opens (mould cap off, die
 * flipped over) — and near full explode three magnified views grow out of
 * that die: the die's floorplan, one of its 32 banks, and a patch of cells.
 */
export default function RamModel() {
  return (
    <group>
      <Part id="pcb">
        <RamBoard />
      </Part>
      <HeatSpreader />
      <LightBar />
      <DeepDive />
    </group>
  );
}
