import type { DeviceInfo } from "../types";

export const hdd: DeviceInfo = {
  id: "hdd",
  name: "Hard Disk Drive",
  shortName: "HDD",
  model: "3.5-inch 7,200 RPM hard disk drive · 8 TB, five platters",
  tagline: "Spinning mirrors read by heads flying 3 nm above them.",
  intro: [
    "A hard disk drive stores data as tiny magnetised regions on spinning disks. This one has **five mirror-polished platters** turning at **7,200 RPM** — their outer edge moves at about 125 km/h — while ten read/write heads fly over them on a cushion of air only about **3 nanometres** thick.",
    "A voice-coil motor swings the heads across the disks in milliseconds, and the controller board underneath turns faint magnetic signals into data. Hard drives are far slower than SSDs to find data (milliseconds instead of microseconds), but they store much more per dollar — which is why data centres still buy them by the million.",
    "Use **X-ray** to see through the cover, then press **Explode** to take the drive apart. At the very end, a magnified view shows a head flying over the magnetic grains of a platter.",
  ],
  specs: [
    ["Capacity", "8 TB (5 platters × 1.6 TB)"],
    ["Spindle speed", "7,200 RPM (120 turns per second)"],
    ["Heads", "10 — one per platter surface"],
    ["Interface", "SATA 6 Gb/s"],
    ["Cache", "256 MB DRAM"],
    ["Sustained transfer", "≈250 MB/s"],
    ["Access time", "≈8 ms seek + ≈4.2 ms rotational latency"],
    ["Size", "147 × 101.6 × 26.1 mm (3.5-inch)"],
  ],
  camera: { position: [150, 135, 195], target: [0, 8, 0] },
  size: 150,
  parts: {
    // --- Enclosure -------------------------------------------------------------
    base: {
      name: "Base casting",
      category: "structure",
      summary: "The die-cast aluminium tub that holds every mechanical part with micrometre precision.",
      details: [
        "Everything inside the drive is mounted to this one rigid casting: the spindle motor, the actuator pivot, the magnets and the ramp. Its machined faces keep the heads aligned to tracks only tens of nanometres wide, even as the drive heats up and vibrates.",
        "The ribs and pockets are not decoration — they stiffen the floor and guide the airflow that the spinning platters drag around the inside of the drive.",
      ],
      specs: [["Material", "Die-cast aluminium, machined"]],
    },
    "mounting-holes": {
      name: "Mounting holes",
      category: "structure",
      summary: "Standard threaded holes on the sides and bottom for screwing the drive into a case.",
      details: [
        "3.5-inch drives follow the SFF-8301 standard, so every drive has its 6-32 UNC screw holes in the same places and fits any bay or caddy.",
      ],
    },
    ramp: {
      name: "Load/unload ramp",
      category: "mechanical",
      summary: "A plastic ramp at the platters' edge where the heads park when the drive stops.",
      details: [
        "When the drive spins down, the actuator swings the heads off the edge of the disks and slides small tabs on the suspensions up this ramp. The heads never touch the platters at rest, which protects both from damage and from sticking to the ultra-smooth surface.",
        "Drives are rated for hundreds of thousands of load/unload cycles.",
      ],
    },
    "recirc-filter": {
      name: "Recirculation filter",
      category: "structure",
      summary: "Catches microscopic particles carried by the air the platters stir up.",
      details: [
        "The spinning disks drive a constant flow of air around the inside of the drive. Placed in that stream, this filter traps any particles shed by the mechanism. At a fly height of a few nanometres, a single speck of dust is a boulder that could crash a head.",
      ],
    },
    "breather-filter": {
      name: "Breather filter",
      category: "structure",
      summary: "Lets air in and out to equalise pressure, while blocking dust and moisture.",
      details: [
        "Air-filled drives are not hermetically sealed: as the inside warms up, the air must be able to escape and return. The breather hole (the label warns you not to cover it) passes through a fine filter and an activated-carbon and desiccant pad.",
        "High-capacity **helium** drives are different — they are welded shut, because helium's low density reduces drag and turbulence enough to fit more, thinner platters.",
      ],
    },

    // --- Spindle and disks ----------------------------------------------------------
    "spindle-motor": {
      name: "Spindle motor",
      category: "mechanical",
      summary: "A brushless motor that spins the platters at exactly 7,200 RPM.",
      details: [
        "The motor runs on a **fluid dynamic bearing**: the shaft floats on a thin film of oil pressurised by tiny grooves, which is quieter and more precise than ball bearings. The controller keeps the speed constant to a fraction of a percent, because the disk's speed sets the timing of every bit read.",
      ],
      specs: [
        ["Speed", "7,200 RPM = 120 revolutions per second"],
        ["Type", "Three-phase brushless DC, fluid bearing"],
      ],
      howItWorks: [
        "Coils in the stator are energised in sequence, creating a rotating magnetic field.",
        "A ring magnet inside the hub follows that field, so the hub turns.",
        "The controller times each phase from the motor's back-EMF to hold the speed steady.",
      ],
    },
    "spindle-stator": {
      name: "Stator windings",
      category: "mechanical",
      summary: "The fixed copper coils that create the rotating magnetic field.",
      details: ["Copper windings on a laminated iron core, fixed to the base. Current switched through them in turn pulls the hub's magnet around."],
    },
    "spindle-hub": {
      name: "Spindle hub (rotor)",
      category: "mechanical",
      summary: "The spinning part of the motor that carries the platters.",
      details: [
        "The platters and spacers slide over this precision hub and are clamped onto its flange. A permanent-magnet ring inside it is what the stator's field pushes around.",
      ],
    },
    "disk-stack": {
      name: "Disk stack",
      category: "storage",
      summary: "Five platters separated by spacers and clamped to the hub.",
      details: [
        "The platters spin together as one unit. The gaps between them are just wide enough for the actuator's arms to slide in, each arm carrying two heads — one for the surface above, one for the surface below.",
      ],
      specs: [
        ["Platters", "5"],
        ["Recording surfaces", "10"],
      ],
    },
    platters: {
      name: "Platters (×5)",
      category: "storage",
      summary: "Mirror-polished disks coated with a magnetic film where the data lives.",
      details: [
        "Each 95 mm platter is an aluminium (or glass) substrate polished smoother than almost anything else humans make — surface roughness below a nanometre — then coated with layers of magnetic alloy, a protective carbon film and a molecule-thin lubricant.",
        "Data is written in concentric **tracks** only about 64 nm apart, divided into 4 KB sectors. Each platter surface holds about 800 GB.",
      ],
      specs: [
        ["Diameter", "95 mm"],
        ["Thickness", "1.27 mm"],
        ["Track pitch", "≈64 nm (≈400,000 tracks per inch)"],
        ["Capacity", "≈1.6 TB per platter"],
      ],
      didYouKnow:
        "At 7,200 RPM the outer edge of a platter moves at about 35 m/s. Scaled up so the head were the size of a jumbo jet, it would be flying at hundreds of times the speed of sound, a fraction of a millimetre above the ground.",
    },
    spacers: {
      name: "Spacer rings",
      category: "structure",
      summary: "Precision rings that set the gap between neighbouring platters.",
      details: ["Their thickness is controlled to micrometres so the arms, suspensions and heads fit between the disks without touching."],
    },
    clamp: {
      name: "Disk clamp",
      category: "structure",
      summary: "A spring-steel ring that presses the whole stack onto the hub.",
      details: [
        "The clamp must hold five platters firmly enough that they never slip — a shift of a few micrometres would misalign every track — while distributing the force evenly so it doesn't warp them.",
      ],
    },
    "clamp-screws": {
      name: "Clamp screws (×6)",
      category: "structure",
      summary: "Six evenly spaced screws that tighten the clamp.",
      details: ["They are torqued in a set pattern so the clamping force is even all the way around. The stack is also balanced after assembly to avoid vibration at speed."],
    },

    // --- Actuator ---------------------------------------------------------------------
    vcm: {
      name: "Voice-coil motor (VCM)",
      category: "mechanical",
      summary: "The magnet assembly that swings the heads across the disks.",
      details: [
        "Two powerful neodymium magnets on steel plates sandwich the flat coil at the tail of the actuator. Current through the coil produces a sideways force, rotating the arm about its pivot. Reverse the current and it swings back.",
        "The same principle moves a loudspeaker cone — hence the name. It can move the heads from the outer to the inner edge in a few milliseconds and hold them on a track to within a few nanometres.",
      ],
      howItWorks: [
        "The controller reads position information pre-written on the platters (servo wedges) through the heads.",
        "It compares the head's position with the target track thousands of times per second.",
        "It adjusts the coil current to correct any error — a precise feedback loop.",
      ],
    },
    "vcm-bottom": {
      name: "Lower magnet & plate",
      category: "mechanical",
      summary: "Neodymium magnet bonded to a steel plate under the coil.",
      details: ["The steel plates carry the magnetic flux around the circuit so the field across the coil gap is strong and uniform."],
    },
    "vcm-top": {
      name: "Upper magnet & plate",
      category: "mechanical",
      summary: "Neodymium magnet on a steel plate above the coil.",
      details: [
        "These magnets are strong enough to pinch fingers — a favourite part to salvage from old drives. Together with the lower magnet they create the field the voice coil pushes against.",
      ],
    },
    latch: {
      name: "Latch & crash stops",
      category: "mechanical",
      summary: "Holds the parked actuator still during shocks and limits how far the arm can swing.",
      details: [
        "A dropped drive can see accelerations of hundreds of g. The latch keeps the parked heads safely on the ramp, and rubber crash stops prevent the arm from overshooting the disk edge.",
      ],
    },
    hsa: {
      name: "Head stack assembly",
      category: "mechanical",
      summary: "The swinging arm stack that carries the ten read/write heads.",
      details: [
        "The head stack assembly (HSA) pivots as one piece: the arms (E-block), the steel suspensions with the heads at their tips, the voice coil at the back, the pivot bearing and the flex cable with its preamplifier.",
        "All ten heads move together, but only one reads or writes at a time.",
      ],
    },
    "e-block": {
      name: "Actuator arms (E-block)",
      category: "mechanical",
      summary: "The rigid aluminium comb that holds one arm per platter gap.",
      details: ["Named for its E-like profile. It has to be stiff and light: its resonances limit how fast the heads can move and settle on a track."],
    },
    suspensions: {
      name: "Suspensions (load beams)",
      category: "mechanical",
      summary: "Thin stainless-steel springs that press each head toward the disk.",
      details: [
        "Each suspension pushes its slider toward the platter with a force of about 2 grams, balanced by the air bearing that lifts it. At the tip, a gimbal lets the slider tilt freely to follow the disk's tiny undulations.",
      ],
    },
    heads: {
      name: "Read/write heads (×10)",
      category: "storage",
      summary: "Tiny ceramic sliders carrying the magnetic write element and read sensor.",
      details: [
        "Each head is a slider smaller than a grain of rice, with the actual read and write elements built on its trailing edge by the same photolithography used for chips. It writes by magnetising regions of the disk and reads by sensing their magnetic fields.",
        "See the deep dive at full explode for a close-up.",
      ],
      specs: [
        ["Slider size", "≈0.85 × 0.7 × 0.23 mm"],
        ["Fly height", "≈1–3 nm while reading/writing"],
      ],
    },
    "voice-coil": {
      name: "Voice coil",
      category: "mechanical",
      summary: "The flat copper coil at the back of the actuator, driven by the controller.",
      details: ["It sits in the magnetic gap of the VCM. The current through it — and therefore the force on the arm — is set by the servo controller on the board."],
    },
    "pivot-bearing": {
      name: "Pivot bearing",
      category: "mechanical",
      summary: "A precision ball-bearing cartridge the actuator rotates on.",
      details: ["It must have almost no friction or play: the heads are positioned to nanometres, and any stiction would make the servo loop jittery."],
    },
    "flex-cable": {
      name: "Flex cable",
      category: "signal",
      summary: "A flexible printed circuit that carries signals between the moving heads and the board.",
      details: ["It bends with every movement of the actuator — billions of times over the drive's life — so it is made from thin copper traces on polyimide film."],
    },
    preamp: {
      name: "Preamplifier",
      category: "signal",
      summary: "A chip on the actuator that amplifies the heads' faint read signals and drives the write current.",
      details: [
        "The read signal from a head is only a few millivolts and easily corrupted by noise, so it is amplified right next to the heads before travelling to the controller. The same chip switches the write current and powers the heads' fly-height heaters.",
      ],
    },
    "flex-bracket": {
      name: "Flex bracket",
      category: "structure",
      summary: "Anchors the flex cable where it passes through the base to the controller board.",
      details: ["A sealed connector carries the signals through the base casting, so the inside of the drive stays closed."],
    },

    // --- Cover --------------------------------------------------------------------------
    cover: {
      name: "Top cover",
      category: "structure",
      summary: "The stamped metal lid that seals the mechanism from dust.",
      details: [
        "Never open a hard drive outside a clean room: one particle of dust, a hair or a fingerprint on a platter is enough to cause a head crash. The cover's stiffening shapes also help damp vibration.",
        "Use **X-ray** to see through it.",
      ],
    },
    label: {
      name: "Label",
      category: "structure",
      summary: "Model, capacity, serial number, barcode and warnings.",
      details: ["The label often hides one of the cover screws, so removing it voids the warranty — and it warns not to cover the breather hole."],
    },
    gasket: {
      name: "Cover gasket",
      category: "structure",
      summary: "A rubber seal between the cover and the base casting.",
      details: ["It keeps particles out while the breather filter handles pressure changes."],
    },
    "cover-screws": {
      name: "Cover screws",
      category: "structure",
      summary: "Torx screws that clamp the cover to the base.",
      details: ["They include screws into the top of the spindle and pivot shafts, which stiffens the whole mechanism."],
    },

    // --- Controller board -----------------------------------------------------------------
    pcb: {
      name: "Controller board",
      category: "control",
      summary: "The circuit board on the underside that runs the drive and talks to the computer.",
      details: [
        "It controls the motors, turns the analogue signals from the heads into bits (with heavy error correction), manages the cache and speaks the SATA protocol to the computer.",
      ],
    },
    soc: {
      name: "Controller SoC",
      category: "compute",
      summary: "The drive's brain: processor cores, the read channel and the SATA interface on one chip.",
      details: [
        "The **read channel** is a signal processor that recovers bits from a noisy analogue waveform using maximum-likelihood detection and LDPC error correction. Embedded processor cores run the firmware: command queuing, caching, servo control and bad-sector remapping.",
      ],
      howItWorks: [
        "Commands arrive over SATA and are re-ordered to minimise head movement (native command queuing).",
        "The servo firmware moves the heads to the right track and waits for the right sector to come round.",
        "The read channel decodes the bits, error correction fixes any errors, and the data is sent from the cache to the computer.",
      ],
    },
    dram: {
      name: "DRAM cache",
      category: "memory",
      summary: "256 MB of memory used as a buffer between the slow platters and the fast interface.",
      details: ["Data read ahead from the disks waits here, and writes can be collected and re-ordered before being committed to the platters."],
      specs: [["Size", "256 MB"]],
    },
    "motor-driver": {
      name: "Motor & VCM driver",
      category: "power",
      summary: "Power chip that drives both the spindle motor and the voice-coil actuator.",
      details: [
        "It switches the current through the spindle motor's three phases and drives the voice coil. If power fails, it uses the spinning motor as a generator to push the heads safely onto the ramp.",
      ],
      didYouKnow: "During a sudden power cut, the energy stored in the spinning platters is enough to park the heads — the drive briefly becomes its own power station.",
    },
    "serial-flash": {
      name: "Firmware flash",
      category: "memory",
      summary: "Holds the code the controller boots from.",
      details: ["Most of the firmware actually lives on reserved tracks of the platters; this small chip holds the boot loader and the drive's unique calibration data."],
    },
    "shock-sensor": {
      name: "Shock sensor",
      category: "control",
      summary: "Detects bumps and vibration so the drive can pause writing.",
      details: ["If the drive is jolted while writing, the head could stray onto a neighbouring track and overwrite it. The shock sensor lets the firmware stop the write instantly and retry."],
    },
    crystal: {
      name: "Crystal oscillator",
      category: "control",
      summary: "Provides the stable clock for the controller.",
      details: ["A quartz crystal vibrating at a precise frequency keeps all the electronics in time."],
    },
    "power-protection": {
      name: "Power protection",
      category: "power",
      summary: "Fuses and surge-suppression diodes on the 5 V and 12 V inputs.",
      details: ["They protect the board from over-voltage — for example if a cable from the wrong power supply is plugged in."],
    },
    "hsa-connector": {
      name: "Head connector",
      category: "io",
      summary: "Contacts that link the board to the heads' flex cable through the base.",
      details: ["Spring contacts on the board press against a sealed connector in the base casting."],
    },
    "spindle-contacts": {
      name: "Spindle motor contacts",
      category: "power",
      summary: "Spring contacts that connect the board to the motor's windings.",
      details: ["Three phases (plus centre tap) carry the drive current from the motor driver to the stator."],
    },
    "sata-data": {
      name: "SATA data connector",
      category: "io",
      summary: "7-pin connector for the data cable to the computer.",
      details: [
        "Two differential pairs — one transmit, one receive — plus grounds. SATA III runs at 6 Gbit/s, roughly double what the platters can sustain, so the interface is rarely the bottleneck for a hard drive.",
      ],
      specs: [["Speed", "6 Gbit/s (≈600 MB/s)"]],
    },
    "sata-power": {
      name: "SATA power connector",
      category: "power",
      summary: "15-pin connector supplying 5 V for the electronics and 12 V for the motors.",
      details: ["The 12 V rail powers the spindle motor and actuator; the 5 V rail runs the logic. Several pins per rail share the current, and staggered pin lengths allow hot-plugging."],
    },
    "pcb-passives": {
      name: "Capacitors & resistors",
      category: "power",
      summary: "Small components that filter power and set signal levels.",
      details: ["Bulk capacitors smooth the motor's large current pulses so they don't disturb the sensitive read electronics."],
    },
    "pcb-screws": {
      name: "Board screws",
      category: "structure",
      summary: "Torx screws holding the controller board to the casting.",
      details: ["They also press the board's spring contacts against the motor and head connectors."],
    },

    // --- Deep dive ------------------------------------------------------------------------
    "deep-dive": {
      name: "Deep dive: the read/write head",
      category: "storage",
      summary: "Magnified views of a slider flying over a platter, and of its read and write elements.",
      details: [
        "At full explode a head and a patch of platter are magnified: first the slider at ×60, then the read/write elements at its trailing edge at roughly ×250,000, flying over individual magnetic grains.",
        "The head element view is a schematic: proportions are adjusted so each layer is visible.",
      ],
    },
    "dd-platter": {
      name: "Platter surface (×60)",
      category: "storage",
      summary: "The disk surface rushing under the head at up to 125 km/h.",
      details: ["At this magnification the platter still looks perfectly smooth: its roughness is well under a nanometre, about the size of a few atoms."],
    },
    "dd-slider": {
      name: "Slider (×60)",
      category: "storage",
      summary: "The ceramic block that flies over the disk, carrying the read and write elements.",
      details: [
        "Made of AlTiC (aluminium oxide–titanium carbide) ceramic, hard and stable. It is aerodynamically shaped so that the air dragged along by the disk lifts it to a precise height.",
      ],
      specs: [["Size", "≈0.85 × 0.7 × 0.23 mm (\"femto\" slider)"]],
    },
    "dd-gimbal": {
      name: "Gimbal & load beam",
      category: "mechanical",
      summary: "Lets the slider pitch and roll freely while the beam presses it toward the disk.",
      details: ["The disk surface is not perfectly flat at this scale; the gimbal lets the slider follow every undulation while flying at a constant height."],
    },
    "dd-abs": {
      name: "Air-bearing surface",
      category: "mechanical",
      summary: "The patterned underside of the slider that creates the cushion of air it flies on.",
      details: [
        "Rails and pockets etched to nanometre depths shape the air flow: some areas push the slider up, others create suction that pulls it down. The balance holds it at a stable height whatever the speed or air pressure.",
      ],
    },
    "dd-head": {
      name: "Read/write head (≈×250,000)",
      category: "storage",
      summary: "The layered magnetic elements built on the slider's trailing edge.",
      details: [
        "Reading and writing are done by different structures only a few micrometres apart: a magnetic **write pole** with its coil, and a **TMR read sensor** between two shields. They are built up layer by layer on the slider, like a chip.",
      ],
    },
    "dd-shields": {
      name: "Magnetic shields",
      category: "storage",
      summary: "Soft magnetic layers either side of the reader that block fields from neighbouring bits.",
      details: ["The gap between the shields is only tens of nanometres, so the sensor 'sees' one bit at a time even though the bits are about 12 nm long."],
    },
    "dd-reader": {
      name: "TMR read sensor",
      category: "storage",
      summary: "A tunnel-magnetoresistance sensor whose resistance changes with the field of the bit below.",
      details: [
        "The sensor is a sandwich: a **pinned** magnetic layer, an insulating barrier of magnesium oxide one nanometre thick, and a **free** layer whose magnetisation tilts with the field from the disk. Electrons tunnel through the barrier more easily when the two layers are aligned, so the resistance — and the read voltage — follows the bits.",
      ],
      specs: [["Width", "≈30 nm"]],
      didYouKnow: "Magnetoresistive heads build on giant magnetoresistance, whose discovery earned the 2007 Nobel Prize in Physics.",
    },
    "dd-heater": {
      name: "Fly-height heater",
      category: "control",
      summary: "A tiny heater that bulges the head toward the disk only while reading or writing.",
      details: [
        "Thermal expansion of just a few nanometres brings the read and write elements closer to the disk exactly when they are active, then lets them retreat to a safer height. The controller calibrates it for each head.",
      ],
    },
    "dd-writer": {
      name: "Write pole",
      category: "storage",
      summary: "Focuses the write field straight down into the recording layer (perpendicular recording).",
      details: [
        "The pole tip is a tiny trapezoid that concentrates the magnetic flux into a spot narrower than a track. The field passes vertically through the recording layer into the soft underlayer and returns through the **trailing shield**, which sharpens the field's edge so bits can be packed closely.",
      ],
    },
    "dd-coil": {
      name: "Write coil",
      category: "storage",
      summary: "Copper turns around the pole: current pulses magnetise the pole up or down.",
      details: ["Each reversal of the write current — every fraction of a nanosecond — flips the field from the pole and writes a magnetic transition on the disk."],
    },
    "dd-fly-height": {
      name: "Fly height ≈ 3 nm",
      category: "mechanical",
      summary: "The gap between head and disk: thinner than a virus, about 1/20,000 of a hair.",
      details: [
        "The closer the head, the smaller the bits it can write and read, so fly height has shrunk from millimetres in the 1950s to a few nanometres today. A fingerprint smudge would be a mountain at this scale.",
      ],
    },
    "dd-media": {
      name: "Recording media",
      category: "storage",
      summary: "The stack of thin films on the platter, built on a soft magnetic underlayer.",
      details: [
        "From the bottom: a **soft underlayer** that guides the write field back to the head, the magnetic **recording layer** of grains, then a protective **carbon overcoat** and lubricant. All of it is only tens of nanometres thick.",
      ],
    },
    "dd-grains": {
      name: "Magnetic grains",
      category: "storage",
      summary: "Columns of cobalt-chromium-platinum alloy about 8 nm wide, each magnetised up or down.",
      details: [
        "A bit is a cluster of grains magnetised the same way (shown red for up, blue for down). Data is stored in the **transitions** between up and down regions along a track.",
        "Smaller grains would allow smaller bits, but grains that are too small can flip spontaneously from heat — the main limit on hard-drive density, which newer techniques like heat-assisted recording (HAMR) work around.",
      ],
      specs: [
        ["Grain size", "≈8 nm"],
        ["Bit length", "≈12 nm"],
        ["Track pitch", "≈64 nm"],
      ],
    },
    "dd-overcoat": {
      name: "Carbon overcoat & lubricant",
      category: "structure",
      summary: "A diamond-like carbon film and a one-molecule-thick lubricant protecting the disk.",
      details: ["Together only about 3 nm thick, they protect the magnetic layer from corrosion and from the occasional touch of the head."],
    },
  },
};
