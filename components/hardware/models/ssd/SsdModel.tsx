"use client";

import { Part } from "../../Part";
import { DEEP, DRIVE_LIFT, DRIVE_Y, LABEL, LABEL_Y, NANDS, STANDOFF_X, packagePath } from "./layout";
import { Motherboard, MountScrew } from "./Motherboard";
import { Stages } from "./motion";
import { NandDeepDive } from "./NandDeepDive";
import { SsdBoard } from "./SsdBoard";
import { NandPackage } from "./SsdChips";
import { SsdLabel } from "./SsdLabel";
import { ZoomGuide } from "./ZoomGuide";

const idx = [0, 1, 2, 3];

const PACKAGE_PATH = packagePath();

/**
 * M.2 2280 NVMe SSD installed in a motherboard slot.
 *
 * Exploding the view takes it apart the way you would by hand, then keeps
 * going: the retention screw spins out, the drive slides out of its socket
 * and lifts, the copper-backed label peels off, the chips rise off their
 * solder balls (the controller's lid lifts and its die flips over), and one
 * NAND package flies up and opens — its die stack is revealed, the top die
 * grows into a labelled floorplan, and an erase block opens into a 3D
 * cut-away of the memory array with one string of cells pulled out.
 */
export default function SsdModel() {
  return (
    <group>
      <Motherboard />

      <Stages position={[STANDOFF_X["2280"], DRIVE_Y, 0]} stages={[{ range: [0, 0.2], move: [0, 24, 0], rotate: [0, 7 * Math.PI, 0] }]}>
        <Part id="mount-screw">
          <MountScrew />
        </Part>
      </Stages>

      {/* The module: slides out of the socket, then lifts clear of the board. */}
      <Stages
        position={[0, DRIVE_Y, 0]}
        stages={[
          { range: [0.14, 0.28], move: [5, 0.6, 0] },
          { range: [0.24, 0.44], move: [-5, DRIVE_LIFT - 0.6, 0] },
        ]}
      >
        <Part id="pcb">
          <SsdBoard />
          <Part id="nand-1" position={[NANDS[0].x, 0, NANDS[0].z]} explode={[0, 6.5, 0]} explodeRange={[0.44, 0.66]}>
            <NandPackage marking={["NF3T8B1T", "TLC 8Tb  BGA152", "2431  KR  K9"]} />
          </Part>
          <Stages position={[NANDS[1].x, 0, NANDS[1].z]} stages={PACKAGE_PATH}>
            <Part id="nand-2">
              <NandPackage
                deep
                marking={["NF3T8B1T", "TLC 8Tb  BGA152", "2431  KR  K9"]}
                moldOpen={{ explode: DEEP.mold.explode, rotate: DEEP.mold.rotate, range: DEEP.mold.range, hinge: DEEP.mold.hinge }}
              />
            </Part>
          </Stages>
        </Part>

        {/* The label peels up from the far end, then lifts away flat. */}
        <Stages
          position={[LABEL.x0, LABEL_Y, 0]}
          stages={[
            { range: [0.28, 0.4], rotate: [0, 0, 0.3] },
            { range: [0.36, 0.58], move: [0, 30, 0], rotate: [0, 0, -0.3] },
          ]}
        >
          <group position={[-LABEL.x0, -LABEL_Y, 0]}>
            <Part id="label" cover>
              <SsdLabel y={LABEL_Y} />
            </Part>
          </group>
        </Stages>
      </Stages>

      <NandDeepDive />

      {/* Faint "zoom cone" lines tying each magnified view to its source. */}
      <ZoomGuide from={idx.map((i) => `stack-${i}`)} to={idx.map((i) => `die-${i}`)} range={[DEEP.die.range[1] - 0.06, DEEP.die.range[1] + 0.04]} />
      <ZoomGuide from={idx.map((i) => `eblock-${i}`)} to={idx.map((i) => `block-${i}`)} range={[DEEP.block.range[1] - 0.06, DEEP.block.range[1]]} />
    </group>
  );
}
