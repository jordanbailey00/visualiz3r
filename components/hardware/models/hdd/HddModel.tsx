"use client";

import { Part } from "../../Part";
import { HeadStack, LatchAndStops, VcmBottom, VcmTop } from "./HddActuator";
import { BaseCasting, BreatherFilter, MountingHoles, Ramp, RecircFilter } from "./HddBase";
import { ControllerBoard } from "./HddBoard";
import { CoverAssembly } from "./HddCover";
import { DeepDive, Reveal } from "./HddDeepDive";
import { DiskStackParts, Hub, MotorBase, Spinner, Stator } from "./HddDisks";
import { ACT, ALPHA, PIVOT, SPINDLE, Y, fromPivot } from "./layout";

type Vec3 = [number, number, number];

/** Centre of the cover assembly (it tilts about this point as it lifts away). */
const COVER_Y = (Y.gasketTop + Y.coverTop) / 2;

/**
 * Exploded-view choreography. Ranges are fractions of the explode slider; the
 * order mirrors a real teardown: screws out, cover off (tipped towards the
 * viewer so its stamped face stays readable), top magnet off, heads
 * parked and the actuator lifted out, the disk stack lifted off the motor and
 * fanned apart, then the controller board slid out from underneath.
 */
const EXPLODE = {
  cover: { to: [0, 125, -62] as Vec3, rot: [0.3, 0, 0] as Vec3, range: [0.02, 0.4] as [number, number] },
  vcmTop: { to: [0, 26, 4] as Vec3, range: [0.14, 0.46] as [number, number] },
  hsa: { to: [16, 50, -8] as Vec3, range: [0.28, 0.68] as [number, number] },
  stack: { to: [0, 40, 0] as Vec3, range: [0.24, 0.62] as [number, number] },
  hub: { to: [0, 14, 0] as Vec3, range: [0.55, 0.85] as [number, number] },
  pcb: { to: [0, 0, 118] as Vec3, range: [0.3, 0.72] as [number, number] },
  ramp: { to: [0, 10, -6] as Vec3, range: [0.6, 0.88] as [number, number] },
  filters: { to: [0, 22, 0] as Vec3, range: [0.58, 0.88] as [number, number] },
  latch: { to: [0, 12, 0] as Vec3, range: [0.6, 0.9] as [number, number] },
};

/** The magnified views grow out of a parked head and settle in front of the drive. */
const DD_FROM: Vec3 = (() => {
  const [x, z] = fromPivot(ALPHA.park, ACT.reach);
  return [x, 20, z];
})();
const DD_AT: Vec3 = [-150, 6, 40];
/** Turn the deep dive to face the default camera direction. */
const DD_YAW = Math.atan2(150, 195);
const DD_SCALE = 0.8;
const DD_RANGE: [number, number] = [0.74, 1];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * 3.5-inch, 7,200 RPM hard disk drive (≈8 TB, five platters), modelled from
 * the SFF-8301 form factor: die-cast base, sealed cover, spindle motor and disk
 * stack, head stack assembly with its voice-coil motor, and the controller
 * board underneath. Exploding it peels the drive apart and, at the end, opens a
 * magnified view of a head flying over the magnetic grains of a platter.
 */
export default function HddModel() {
  return (
    <group>
      <Part id="base">
        <BaseCasting />
        <Part id="mounting-holes">
          <MountingHoles />
        </Part>
        <Part id="ramp" explode={EXPLODE.ramp.to} explodeRange={EXPLODE.ramp.range}>
          <Ramp />
        </Part>
        <Part id="recirc-filter" explode={EXPLODE.filters.to} explodeRange={EXPLODE.filters.range}>
          <RecircFilter />
        </Part>
        <Part id="breather-filter" explode={EXPLODE.filters.to} explodeRange={EXPLODE.filters.range}>
          <BreatherFilter />
        </Part>
      </Part>

      <Part id="spindle-motor" position={[SPINDLE.x, 0, SPINDLE.z]}>
        <MotorBase />
        <Part id="spindle-stator">
          <Stator />
        </Part>
        <Part id="spindle-hub" explode={EXPLODE.hub.to} explodeRange={EXPLODE.hub.range}>
          <Spinner>
            <Hub />
          </Spinner>
        </Part>
      </Part>

      <Part id="disk-stack" position={[SPINDLE.x, 0, SPINDLE.z]} explode={EXPLODE.stack.to} explodeRange={EXPLODE.stack.range}>
        <DiskStackParts />
      </Part>

      <Part id="vcm">
        <Part id="vcm-bottom">
          <VcmBottom />
        </Part>
        <Part id="vcm-top" explode={EXPLODE.vcmTop.to} explodeRange={EXPLODE.vcmTop.range}>
          <VcmTop />
        </Part>
        <Part id="latch" explode={EXPLODE.latch.to} explodeRange={EXPLODE.latch.range}>
          <LatchAndStops />
        </Part>
      </Part>

      <Part id="hsa" position={[PIVOT.x, 0, PIVOT.z]} explode={EXPLODE.hsa.to} explodeRange={EXPLODE.hsa.range}>
        <HeadStack />
      </Part>

      <Part
        id="cover"
        cover
        position={[0, COVER_Y, 0]}
        explode={EXPLODE.cover.to}
        explodeRotate={EXPLODE.cover.rot}
        explodeRange={EXPLODE.cover.range}
      >
        <CoverAssembly centerY={COVER_Y} />
      </Part>

      <Part id="pcb" position={[0, Y.pcbTop, 0]} explode={EXPLODE.pcb.to} explodeRange={EXPLODE.pcb.range}>
        <ControllerBoard />
      </Part>

      <Part id="deep-dive" position={DD_FROM} rotation={[0, DD_YAW, 0]} explode={sub(DD_AT, DD_FROM)} explodeRange={DD_RANGE}>
        <Reveal range={DD_RANGE}>
          <group scale={DD_SCALE}>
            <DeepDive />
          </group>
        </Reveal>
      </Part>
    </group>
  );
}
