"use client";

import { Part } from "../../Part";
import { Die, HeatSpreader, LgaLands, PackageCaps, SolderTim, Substrate } from "./CpuPackage";
import { CcdFloorplan, CoreFloorplan } from "./Floorplans";
import { BOARD_TOP, DIES, EX, LEVER, PLATE, SOCKET } from "./layout";
import {
  Backplate,
  BoardPassives,
  BoardSection,
  CoolerBrackets,
  VrmCaps,
  VrmChokes,
  VrmStages,
} from "./Motherboard";
import { LoadLever, LoadPlate, SocketContacts, SocketHousing, StiffenerFrame } from "./Socket";

/**
 * A 16-core chiplet desktop processor seated in its LGA socket on a square
 * section of motherboard.
 *
 * Exploding the view takes it apart the way a technician would: the load
 * lever swings up and the load plate opens, the processor lifts out of the
 * socket (revealing 1718 spring contacts), the heat spreader comes off, the
 * indium solder lifts from the dies, and the three dies rise and flip over to
 * show their circuitry. Finally a magnified, labelled floorplan of a compute
 * die grows out of the chip, followed by a close-up of a single core.
 */
export default function CpuModel() {
  return (
    <group>
      <Part id="backplate">
        <Backplate />
      </Part>

      <Part id="motherboard">
        <BoardSection />
        <Part id="board-capacitors">
          <BoardPassives />
        </Part>
        <Part id="vrm">
          <Part id="vrm-stages">
            <VrmStages />
          </Part>
          <Part id="vrm-chokes">
            <VrmChokes />
          </Part>
          <Part id="vrm-caps">
            <VrmCaps />
          </Part>
        </Part>
        <Part id="cooler-brackets">
          <CoolerBrackets />
        </Part>
      </Part>

      <Part id="socket" position={[0, BOARD_TOP, 0]}>
        <Part id="socket-housing">
          <SocketHousing />
          <Part id="socket-contacts">
            <SocketContacts />
          </Part>
        </Part>
        <Part id="retention-frame">
          <StiffenerFrame />
        </Part>
        <Part
          id="load-plate"
          position={[0, PLATE.hinge.y, PLATE.hinge.z]}
          explodeRotate={[EX.plate.rotate, 0, 0]}
          explodeRange={EX.plate.range}
        >
          <LoadPlate />
        </Part>
        <Part id="load-lever" position={[0, LEVER.y, LEVER.z]} explodeRotate={[EX.lever.rotate, 0, 0]} explodeRange={EX.lever.range}>
          <LoadLever />
        </Part>
      </Part>

      <Part id="cpu" position={[0, BOARD_TOP + SOCKET.seat, 0]} explode={[0, EX.cpu.lift, 0]} explodeRange={EX.cpu.range}>
        <Part id="ihs" cover explode={[0, EX.ihs.lift, 0]} explodeRange={EX.ihs.range}>
          <HeatSpreader />
        </Part>
        <Part id="solder-tim" explode={[0, EX.tim.lift, 0]} explodeRange={EX.tim.range}>
          <SolderTim />
        </Part>
        {DIES.map((d) => (
          <Die key={d.id} spec={d} />
        ))}
        <Part id="substrate">
          <Substrate />
          <Part id="package-caps">
            <PackageCaps />
          </Part>
          <Part id="lga-lands">
            <LgaLands />
          </Part>
        </Part>
      </Part>

      <CcdFloorplan />
      <CoreFloorplan />
    </group>
  );
}
