import type { DeviceInfo } from "../types";

export const ram: DeviceInfo = {
  id: "ram",
  name: "Memory Module",
  shortName: "RAM",
  model: "32 GB DDR5-6000 desktop module (UDIMM), dual-rank, with heat spreader",
  tagline: "Sixteen DDR5 chips holding everything the CPU is working on.",
  intro: [
    "**RAM** is the computer's working memory: every program you have open, every browser tab and every frame of a game lives here while the processor uses it. It is about a thousand times faster than an SSD — but it forgets everything the moment the power goes off.",
    "This stick holds **32 GB** in sixteen DDR5 memory chips — eight on each side. Each chip stores 16 billion bits, and each bit is nothing more than a tiny electric charge in a capacitor smaller than a virus, refreshed every 32 milliseconds so it doesn't leak away. The module moves up to **48 GB/s** to and from the processor.",
    "Press **Explode** to open the heat spreader, lift the chips off the board — and, near the end, zoom inside one chip: first its silicon die, then one of its 32 banks, then the individual memory cells.",
  ],
  specs: [
    ["Capacity", "32 GB = 16 chips × 16 Gbit (2 ranks × 8 chips)"],
    ["Speed", "DDR5-6000 (XMP/EXPO profile); DDR5-4800 by default"],
    ["Timings", "CL30-38-38-96 at 1.35 V (JEDEC 4800: CL40 at 1.1 V)"],
    ["Bandwidth", "6,000 MT/s × 8 bytes = 48 GB/s"],
    ["Channels", "2 independent 32-bit sub-channels"],
    ["Form factor", "288-pin UDIMM, 133.35 × 31.25 mm board"],
    ["With heat spreader", "133.35 × 43.4 × 8.4 mm"],
    ["Power", "5 V in, ≈3–8 W, regulated on the module"],
  ],
  camera: { position: [112, 106, 212], target: [0, 21, 0] },
  size: 140,
  parts: {
    // --- Heat spreader & lighting --------------------------------------------
    "heat-spreader": {
      name: "Heat spreader",
      category: "cooling",
      summary: "Two aluminium plates clamped around the module that spread and shed the chips' heat.",
      details: [
        "A DDR5 module turns roughly **3–8 watts** into heat — far less than a CPU, but concentrated in sixteen small chips and the on-board power regulator. The aluminium halves spread that heat over a larger surface so it can be carried away by the air flowing through the case.",
        "On overclocked modules running at 1.35 V or more, the heat spreader keeps the chips below about **85 °C**. Above that, DRAM has to refresh its cells twice as often (every 16 ms instead of 32 ms), which costs performance.",
        "Use **X-ray** to look through it.",
      ],
      specs: [
        ["Material", "Anodised and brushed aluminium, ≈0.8 mm"],
        ["Total thickness", "≈8.4 mm"],
        ["Height", "43.4 mm including the light bar"],
      ],
      didYouKnow:
        "Tall heat spreaders like this one can collide with big CPU tower coolers — which is why low-profile modules (about 32 mm tall) exist for compact builds.",
    },
    "spreader-front": {
      name: "Front heat-spreader half",
      category: "cooling",
      summary: "Stamped aluminium plate with a brushed finish, pressed against the front row of chips.",
      details: [
        "Each half is a thin aluminium plate with a raised, anodised black band and diagonal ribs. The ribs and the bevelled edges add a little surface area — but mostly they make it look fast.",
        "The halves are held together by the thermal tape and small clips along the top. In the exploded view they swing open like a clamshell, the way you'd take them off on a workbench.",
      ],
      specs: [
        ["Finish", "Brushed silver + black anodised band"],
        ["Marking", "Laser-etched"],
      ],
    },
    "spreader-back": {
      name: "Back heat-spreader half",
      category: "cooling",
      summary: "The mirror-image plate covering the second rank of chips on the back of the board.",
      details: [
        "It is the same part as the front half, turned around — one design serves both sides. It carries the product label.",
      ],
    },
    "thermal-pad-front": {
      name: "Thermal pad (front)",
      category: "cooling",
      summary: "A soft, sticky strip that carries heat from the chips into the heat spreader.",
      details: [
        "The chips are not perfectly flat or level, so a hard metal plate would only touch a few high points. This **0.6 mm** strip of silicone filled with ceramic particles squeezes into the gaps and conducts heat about ten times better than the air it replaces.",
        "It is also the glue: the double-sided tape is what holds the heat spreader on, which is why removing one can tear chips' markings off.",
      ],
      specs: [
        ["Thickness", "≈0.6 mm"],
        ["Conductivity", "≈1–3 W/m·K"],
      ],
    },
    "thermal-pad-back": {
      name: "Thermal pad (back)",
      category: "cooling",
      summary: "The matching pad between the back rank of chips and the back half.",
      details: ["Identical to the front pad: it fills the uneven gap between the back row of chips and the aluminium plate."],
    },
    "module-label": {
      name: "Product label",
      category: "structure",
      summary: "Sticker with the capacity, speed, timings, voltage and serial number — the module's spec sheet.",
      details: [
        "**DDR5-6000** means 6,000 million transfers per second on every data pin. DDR stands for **double data rate**: the memory clock runs at 3,000 MHz and data moves on both the rising and the falling edge of each tick.",
        "**CL30-38-38-96** are the main timings in clock cycles: CAS latency, row-to-column delay (tRCD), precharge time (tRP) and minimum row-open time (tRAS). At 3,000 MHz one cycle is 0.333 ns, so CL30 is **10 ns** from a read command to the first data. The JEDEC default of CL40 at 2,400 MHz works out to 16.7 ns.",
        "**PC5-48000** is the same speed expressed as bandwidth (48,000 MB/s), **2Rx8** means two ranks of 8-bit-wide chips, and **1.35V** is the voltage the fast profile needs — up from the standard 1.1 V.",
      ],
      specs: [
        ["Data rate", "6,000 MT/s (clock 3,000 MHz)"],
        ["CAS latency", "30 cycles × 0.333 ns = 10 ns"],
        ["Bandwidth", "6,000 MT/s × 8 bytes = 48 GB/s"],
        ["Default (JEDEC)", "DDR5-4800 CL40, 1.1 V (16.7 ns)"],
      ],
      howItWorks: [
        "Each data pin carries one bit per transfer; a module has 64 data pins (2 × 32), so one transfer moves 8 bytes.",
        "6,000 million transfers per second × 8 bytes = 48,000 MB/s for the whole module, 24 GB/s per sub-channel.",
        "Latency is a time, not a speed: higher clocks need more cycles of CAS latency, which is why true latency has stayed around 10–15 ns for two decades while bandwidth has grown more than tenfold.",
      ],
      didYouKnow: "A desktop with two of these modules on a dual-channel board reaches about 96 GB/s — enough to read this whole 32 GB module in a third of a second.",
    },
    "light-bar": {
      name: "RGB light bar",
      category: "control",
      summary: "A frosted diffuser lit by a row of addressable RGB LEDs.",
      details: [
        "Purely decorative. The LEDs sit on a slim board resting on the module's top edge, and the frosted polycarbonate bar above blends their points of light into one smooth glow.",
        "Lighting software talks to the module's small RGB controller over the same management bus the motherboard uses to read the SPD chip.",
      ],
    },
    "rgb-leds": {
      name: "Addressable RGB LEDs",
      category: "control",
      summary: "Twelve tiny LED packages, each with red, green and blue emitters and its own driver chip.",
      details: [
        "Each 2 × 2 mm package contains three LEDs and a minute controller. A single data line runs from LED to LED: each one takes its own colour from the stream and passes the rest along, so any pattern can be shown with only three wires.",
      ],
      specs: [
        ["LEDs", "12 × RGB, 2 × 2 mm"],
        ["Colours", "24-bit (16.7 million)"],
      ],
    },
    diffuser: {
      name: "Light diffuser",
      category: "structure",
      summary: "Frosted plastic bar that turns twelve bright dots into one even band of light.",
      details: [
        "Tiny particles inside the polycarbonate scatter the light many times before it escapes, hiding the individual LEDs.",
      ],
    },

    // --- Board ------------------------------------------------------------------
    pcb: {
      name: "Printed circuit board",
      category: "structure",
      summary: "A 10-layer board that wires 16 memory chips to 288 gold contacts.",
      details: [
        "The board is a sandwich of about **10 copper layers** in 1.27 mm of fibreglass-epoxy. Inner layers are solid planes for power and ground; the outer and some inner layers carry the signals, which switch at up to **6 billion times a second**.",
        "Its outline is fixed by the JEDEC standard: **133.35 × 31.25 mm**, with the notches on both ends where the slot's latches click in, and the key notch in the contact edge.",
        "Look closely above the contacts: some traces snake back and forth. Those **serpentines** make every data line the same length, so all eight bits of a byte arrive at the same instant.",
      ],
      specs: [
        ["Size", "133.35 × 31.25 × 1.27 mm"],
        ["Layers", "≈8–10"],
        ["Raw card", "2Rx8, non-ECC"],
      ],
      didYouKnow:
        "At 6,000 MT/s one bit lasts only 167 picoseconds — in that time a signal travels about 2.5 cm along a trace, so a few millimetres of length mismatch would scramble the data.",
    },
    "edge-contacts": {
      name: "Edge connector (288 contacts)",
      category: "io",
      summary: "Gold-plated contacts — 144 per side — that plug into the motherboard's memory slot.",
      details: [
        "The contacts carry everything: 64 data bits, strobes, two command/address buses, clocks, the management bus, ground — and **5 volts of power**, which the module converts itself.",
        "The **key notch** is deliberately off-centre: 75 contacts on one side, 69 on the other. DDR4 has its notch in a different place, so a DDR5 module physically cannot go into a DDR4 slot (or in backwards).",
        "The bottom edge is slightly curved — the middle contacts reach 0.5 mm lower than the ends — so the module makes contact progressively and needs less force to insert. The edge is also chamfered to slide into the slot.",
      ],
      specs: [
        ["Contacts", "288 (144 per side)"],
        ["Pitch", "0.85 mm"],
        ["Plating", "Hard gold over nickel"],
        ["Key position", "1.425 mm off centre"],
      ],
    },
    "rank-0": {
      name: "Rank 0 — front chips (×8)",
      category: "memory",
      summary: "Eight DRAM chips that together form one 64-bit-wide rank: half the module's capacity.",
      details: [
        "Each chip is **8 bits wide (x8)**, so eight of them side by side make the 64-bit data path the processor expects. A set of chips that answers one command together is called a **rank**.",
        "This module has two ranks — one on each side. They share the same data wires; a chip-select signal decides which rank is listening at any moment. Two ranks can be slightly faster than one because the controller can prepare one rank while the other is transferring data.",
      ],
      specs: [
        ["Chips", "8 × 16 Gbit x8"],
        ["Capacity", "8 × 2 GB = 16 GB"],
        ["Width", "2 × 32 bits"],
      ],
    },
    "rank0-a": {
      name: "Sub-channel A chips (rank 0)",
      category: "memory",
      summary: "The four chips that make up 32-bit sub-channel A on the front.",
      details: [
        "DDR5 splits each module into **two independent 32-bit sub-channels**, A (left half) and B (right half). Each has its own command bus, so the processor can run two different requests at the same time.",
        "With a **burst length of 16**, one request moves 16 × 32 bits = **64 bytes** — exactly one CPU cache line — from just these four chips.",
      ],
      specs: [
        ["Chips", "4 × x8 = 32 bits"],
        ["Burst", "16 transfers = 64 bytes"],
      ],
    },
    "rank0-b": {
      name: "Sub-channel B chips (rank 0)",
      category: "memory",
      summary: "The four chips of 32-bit sub-channel B, working independently of sub-channel A.",
      details: [
        "DDR4 had one 64-bit channel per module. Splitting it into two narrower, independent sub-channels lets the memory controller keep more requests in flight, which matters more to modern many-core processors than raw width.",
      ],
    },
    "rank-1": {
      name: "Rank 1 — back chips (×8)",
      category: "memory",
      summary: "The second set of eight chips on the back, sharing the same wires as rank 0.",
      details: [
        "Each back chip sits directly behind a front chip and is wired to the same data lines. When the controller selects rank 1, the front chips go quiet and these answer instead.",
        "16 chips × 16 Gbit = 256 Gbit = **32 GB**.",
      ],
      specs: [
        ["Chips", "8 × 16 Gbit x8"],
        ["Capacity", "16 GB"],
      ],
    },
    "rank1-a": {
      name: "Sub-channel A chips (rank 1)",
      category: "memory",
      summary: "Four back-side chips on sub-channel A.",
      details: ["They share sub-channel A's data and command wires with the four front chips directly opposite."],
    },
    "rank1-b": {
      name: "Sub-channel B chips (rank 1)",
      category: "memory",
      summary: "Four back-side chips on sub-channel B.",
      details: ["They share sub-channel B's wires with the front chips opposite them."],
    },
    "dram-chip": {
      name: "DRAM chip (opened up)",
      category: "memory",
      summary: "One 16-gigabit DDR5 memory chip: a silicon die sealed in a 9 × 11 mm package.",
      details: [
        "Every memory chip on the module is identical. Inside the black epoxy is a single slab of silicon (the **die**) holding about **17 billion memory cells**, mounted face-down on a small circuit board (the substrate) with **82 solder balls** underneath.",
        "In the exploded view this one opens up: the mould cap lifts away and the die turns over to show its circuitry. The magnified views above grow out of it.",
      ],
      specs: [
        ["Capacity", "16 Gbit = 2 GB"],
        ["Organisation", "2 G × 8 bits, 32 banks"],
        ["Package", "82-ball FBGA, 9 × 11 mm, 0.8 mm pitch"],
        ["Supplies", "VDD = VDDQ = 1.1 V, VPP = 1.8 V"],
      ],
    },
    "dram-mold": {
      name: "Mould compound",
      category: "structure",
      summary: "The black epoxy body that seals and protects the die.",
      details: [
        "Silica-filled epoxy is moulded over the die and cured. It keeps out moisture and light and carries the laser-etched part number, date code and lot.",
      ],
    },
    "dram-die": {
      name: "DRAM die",
      category: "memory",
      summary: "The silicon itself: ≈67 mm² holding 17 billion capacitors and as many transistors.",
      details: [
        "Like most DRAM, the die is mounted **face down** over a slot in the substrate: its bond pads run down the middle, and gold wires pass through the slot to the ball side. That's why the chip's centre ball columns are missing.",
        "The die is only about 0.1 mm thick. Explode fully to see it magnified above.",
      ],
      specs: [
        ["Area", "≈7 × 9.6 mm (≈67 mm²)"],
        ["Process", "≈12–14 nm-class DRAM"],
      ],
    },
    pmic: {
      name: "Power management IC (PMIC)",
      category: "power",
      summary: "DDR5's on-module power supply: turns 5 V from the motherboard into the chips' 1.1 V and 1.8 V.",
      details: [
        "In DDR4 the motherboard regulated the memory voltage. DDR5 moved the regulator **onto the module**: the PMIC takes **5 V** and produces VDD and VDDQ (1.1 V, or 1.35 V for this module's fast profile) and VPP (1.8 V) right next to the chips.",
        "Short power paths mean cleaner voltage under fast load changes, and each module is responsible for its own supply. Inside are three switching (buck) regulators — one per inductor beside it — plus small linear regulators for the SPD hub.",
      ],
      specs: [
        ["Type", "PMIC5100 (JEDEC, for UDIMMs)"],
        ["Input", "5 V (4.25–5.5 V)"],
        ["Outputs", "VDD, VDDQ ≈1.1 V · VPP 1.8 V · 1.8 V / 1.0 V LDOs"],
        ["Efficiency", "≈90%"],
      ],
      howItWorks: [
        "A transistor switch inside the PMIC connects an inductor to 5 V for a fraction of each cycle, about a million times a second.",
        "The inductor resists changes in current, so its output is a smooth flow; capacitors iron out what ripple remains.",
        "The fraction of time the switch is on (≈22% for 1.1 V) sets the output voltage.",
        "The PMIC measures its outputs continuously and adjusts the timing to hold them steady as the chips' demand jumps.",
      ],
      didYouKnow:
        "The PMIC is often the hottest part of a DDR5 module — overclockers watch its temperature as closely as the memory chips'.",
    },
    inductors: {
      name: "Power inductors (×3)",
      category: "power",
      summary: "Three small coils, one per regulator, that store energy between switching pulses.",
      details: [
        "Each grey block hides a coil of copper wire in a core of compressed metal powder. The two larger ones (**R47** = 0.47 µH) serve the VDD and VDDQ rails, which carry several amps; the smaller one feeds VPP.",
      ],
      specs: [
        ["Values", "2 × 0.47 µH, 1 × 1.0 µH"],
        ["Size", "≈2.5 × 2.0 × 1.2 mm"],
      ],
    },
    "pmic-caps": {
      name: "PMIC capacitors",
      category: "power",
      summary: "Ceramic capacitors that steady the 5 V input and smooth the regulated outputs.",
      details: [
        "The bigger 0805 capacitors on the input absorb the current spikes drawn each time a regulator switches on, so they don't travel back down the contacts. Smaller ones on each output filter what's left of the switching ripple.",
      ],
      specs: [["Values", "10–22 µF (0805 / 0603)"]],
    },
    "spd-hub": {
      name: "SPD hub & temperature sensor",
      category: "control",
      summary: "A tiny memory chip that tells the motherboard what this module is and how fast it can run.",
      details: [
        "**SPD** (Serial Presence Detect) is a 1,024-byte EEPROM read by the motherboard at every boot over a slow management bus (I²C or I3C). It describes the module: capacity, ranks, chip organisation, and every timing parameter at each supported speed.",
        "It also stores **XMP / EXPO profiles** — tested overclocked settings such as DDR5-6000 CL30 at 1.35 V. Without enabling a profile in the BIOS, the board falls back to the safe JEDEC default (here DDR5-4800 CL40 at 1.1 V).",
        "DDR5's SPD is also a **hub**: it isolates the module's local management bus (to the PMIC and sensors) from the motherboard, and has a built-in temperature sensor the system can use to throttle or speed up refresh.",
      ],
      specs: [
        ["Type", "SPD5 hub (SPD5118)"],
        ["Storage", "1,024 bytes (bytes 0–639 locked)"],
        ["Bus", "I3C basic / I²C, up to 12.5 MHz"],
        ["Sensor", "Temperature, ≈±0.5–1 °C"],
      ],
      didYouKnow: "The first 640 bytes are write-protected at the factory; XMP and EXPO profiles live in the remaining user and vendor area.",
    },
    "rgb-controller": {
      name: "RGB controller",
      category: "control",
      summary: "A small microcontroller that drives the LEDs and listens to the lighting software.",
      details: [
        "It sits on the module's management bus next to the SPD hub, receives colour commands from software on the PC, and streams the colour data to the LEDs.",
      ],
    },
    decoupling: {
      name: "Decoupling capacitors",
      category: "power",
      summary: "Dozens of tiny ceramic capacitors beside every chip that supply sudden bursts of current.",
      details: [
        "When a chip starts a burst, its current demand jumps within nanoseconds — faster than the PMIC can react. Each **multilayer ceramic capacitor (MLCC)** is a local reservoir a millimetre away, keeping VDD, VDDQ and VPP steady.",
        "Each DRAM gets its own column of them; larger bulk capacitors sit behind the PMIC on the back.",
      ],
      specs: [
        ["Sizes", "0201 (0.6 × 0.3 mm) to 0805"],
        ["Typical values", "0.1–22 µF"],
      ],
    },
    resistors: {
      name: "ZQ calibration & other resistors",
      category: "signal",
      summary: "Precision 240 Ω resistors that each chip uses to tune its own drivers.",
      details: [
        "Every DDR5 chip has a **ZQ** pin connected to a 240 Ω ±1% resistor. The chip periodically compares its output drivers and termination against it and trims them, so signals stay clean as temperature and voltage drift.",
        "Unlike DDR4 modules, DDR5 UDIMMs need almost no termination resistors: the chips terminate the command, clock and data lines **on the die** (ODT). The remaining resistors are pull-ups on the management bus and set-points for the PMIC.",
      ],
      specs: [["ZQ reference", "240 Ω ±1%, one per chip"]],
    },

    // --- Deep dive ----------------------------------------------------------------
    "inside-dram": {
      name: "Inside a DRAM chip",
      category: "memory",
      summary: "Three magnified views: the die, one bank, and a handful of individual memory cells.",
      details: [
        "Each view zooms further into the one before it — the thin lines show where each magnified piece comes from.",
        "**DRAM vs SRAM.** The processor's caches use SRAM: six transistors per bit, wired as a latch that holds its value as long as power is on, and readable in about a nanosecond. DRAM uses **one transistor and one capacitor** per bit — roughly ten times denser and far cheaper per gigabyte, but slower (≈15 ns) and leaky, so every bit must be refreshed.",
      ],
      specs: [
        ["DRAM cell", "1 transistor + 1 capacitor (1T1C)"],
        ["SRAM cell", "6 transistors"],
        ["Bits per chip", "17,179,869,184"],
      ],
    },
    "die-view": {
      name: "DRAM die (magnified ×5)",
      category: "memory",
      summary: "The chip's floorplan: 32 banks of memory cells around a central strip of control logic.",
      details: [
        "About two-thirds of the silicon is memory array. It is divided into **32 banks** — independent arrays that can each have a row open — grouped into **8 bank groups** of 4 banks.",
        "Down the middle runs the **periphery**: the bond pads, the circuits that receive commands, the data path that turns 128 bits read in parallel into a 16-transfer burst on 8 pins (and back), and the on-die ECC engine.",
      ],
      specs: [
        ["Banks", "32 = 8 bank groups × 4"],
        ["Rows per bank", "65,536"],
        ["Row (page) size", "1 KB = 8,192 bits"],
        ["Capacity", "32 × 65,536 × 8,192 = 16 Gbit"],
      ],
    },
    "bank-groups": {
      name: "Bank groups (×8)",
      category: "memory",
      summary: "Banks are organised in eight groups of four that share some internal circuitry.",
      details: [
        "Banks in the same group share a slice of the internal data path, so back-to-back reads from one group must wait a little longer (**tCCD_L**) than reads that alternate between groups (**tCCD_S**). Memory controllers interleave requests across bank groups to stay on the fast path.",
        "DDR4 had 4 bank groups; DDR5 doubled that to 8 to keep up with the higher data rate.",
      ],
      specs: [
        ["Groups", "8 (DDR4: 4)"],
        ["Banks per group", "4"],
      ],
    },
    banks: {
      name: "Banks (×32)",
      category: "memory",
      summary: "Independent memory arrays; each can have one row open at a time.",
      details: [
        "A bank is a grid of **65,536 rows × 8,192 columns** of cells — 512 Mbit. To read, the chip first **activates** a row (copying all 8,192 bits into the bank's sense amplifiers), then **reads** columns from it in bursts, and finally **precharges** the bank to close the row.",
        "Because each bank works independently, the controller can open a row in one bank while reading from another, hiding much of the delay.",
      ],
      specs: [
        ["Size", "512 Mbit"],
        ["Rows × columns", "65,536 × 8,192 bits"],
      ],
      howItWorks: [
        "**ACTIVATE**: a row address selects one word line; its 8,192 cells dump their charge onto bit lines and the sense amplifiers latch the values (tRCD ≈ 13–16 ns).",
        "**READ**: a column address picks 128 of those bits, which stream out as a 16-transfer burst on the chip's 8 data pins (CAS latency ≈ 10–17 ns).",
        "**PRECHARGE**: the row is written back and the bit lines reset to half voltage, ready for the next row (tRP ≈ 13–16 ns).",
      ],
    },
    periphery: {
      name: "Peripheral logic",
      category: "control",
      summary: "The non-memory circuitry: command decoding, data path, I/O and error correction.",
      details: [
        "Although it covers only about a third of the die, the periphery is what makes the cells useful: it decodes commands, keeps track of open rows and refresh, moves data between the slow, wide arrays and the fast, narrow pins, and talks to the outside world.",
      ],
    },
    "cmd-logic": {
      name: "Command decoder & control",
      category: "control",
      summary: "Receives commands and addresses, tracks bank states, timing and refresh.",
      details: [
        "Commands arrive on a 14-bit command/address bus. This logic decodes them (activate, read, write, precharge, refresh…), holds the **mode registers** that configure latency and features, and runs the refresh counter that walks through every row.",
      ],
    },
    "io-pads": {
      name: "Bond pads & data I/O",
      category: "io",
      summary: "The row of pads down the centre and the circuits that drive and receive data at 6 GT/s.",
      details: [
        "Gold wires bond to these pads. Behind them, the data path converts between the array's wide, slow internal bus (128 bits at a time) and the 8 external data pins, which each run at 6 billion transfers per second — the **16n prefetch**.",
        "The input receivers include **decision-feedback equalisers**, a technique borrowed from networking to clean up the signal at these speeds.",
      ],
      specs: [
        ["Data pins", "8 DQ + strobe pair (x8)"],
        ["Prefetch", "16n (128 bits per access)"],
      ],
    },
    "ecc-engine": {
      name: "On-die ECC",
      category: "control",
      summary: "Error-correcting logic inside every DDR5 chip that silently fixes single-bit errors.",
      details: [
        "For every **128 data bits** the chip stores **8 extra check bits** in the array. On every read it recomputes them and corrects any single flipped bit before the data leaves the chip.",
        "It exists because cells this small occasionally lose or flip their charge. Note that it only protects data while stored inside the chip — servers still use ECC modules (with extra chips) to protect data on the wires as well.",
      ],
      specs: [
        ["Code", "128 + 8 bits, single-error correcting"],
        ["Overhead", "6.25% extra cells"],
      ],
    },
    "bank-view": {
      name: "One bank (magnified ×27)",
      category: "memory",
      summary: "A single bank: a grid of cell arrays with decoders and sense amplifiers woven between them.",
      details: [
        "A bank isn't one giant array — wires that long would be far too slow. It is tiled from small **mats** of about 512 × 1,024 cells, with strips of sense amplifiers and word-line drivers running between them. A real bank holds about a thousand mats; 48 are shown here.",
        "The **row decoder** on the left picks one word line out of 65,536; the **column decoder** at the bottom chooses which of the sensed bits go to the data path.",
      ],
    },
    mats: {
      name: "Mats (cell arrays)",
      category: "memory",
      summary: "Small tiles of memory cells — about half a million each — that make up a bank.",
      details: [
        "Each mat is a dense grid where every crossing of a word line and a bit line holds one cell. Keeping mats small keeps their wires short, so the tiny charge from one cell can still be detected.",
        "The highlighted mat is magnified again on the right, down to individual cells.",
      ],
      specs: [
        ["Cells per mat", "≈512 × 1,024"],
        ["Cell size", "≈0.002 µm² (≈6F²)"],
      ],
    },
    "sense-amps": {
      name: "Sense-amplifier strips",
      category: "signal",
      summary: "Rows of amplifiers that detect each cell's faint charge and turn it into a clean 0 or 1.",
      details: [
        "A cell's capacitor is tiny compared with its bit line, so connecting them shifts the bit line by only about **0.1 V**. The sense amplifier compares it with a reference, then snaps it to the full supply voltage.",
        "Each strip serves the mats on both sides of it. Together, the sense amplifiers of a bank hold the open row — 8,192 bits — which is why reading more columns from an already-open row is fast.",
      ],
    },
    "swd-strips": {
      name: "Sub-word-line drivers",
      category: "signal",
      summary: "Local drivers that turn on a word line inside each mat.",
      details: [
        "The row decoder's main word line runs across the whole bank; these local drivers repeat it into each mat, boosted to **VPP (1.8 V)** so the access transistors switch fully on.",
      ],
    },
    "row-decoder": {
      name: "Row decoder",
      category: "control",
      summary: "Turns a 16-bit row address into one word line out of 65,536.",
      details: [
        "When an ACTIVATE command arrives, the row decoder raises exactly one word line in the bank, connecting every cell in that row to its bit line at once.",
      ],
      specs: [["Address", "R0–R15 → 65,536 rows"]],
    },
    "column-decoder": {
      name: "Column decoder & bank control",
      category: "control",
      summary: "Selects which bits of the open row are read or written, and sequences the bank.",
      details: [
        "After a row is open, READ and WRITE commands carry a column address. The column decoder connects the chosen 128 sense amplifiers to the data path for one 16-transfer burst.",
        "The corner block holds the bank's control logic: its state (idle, active, precharging) and its timers.",
      ],
      specs: [["Address", "C0–C9 → 1,024 columns × 8 bits"]],
    },
    "cell-view": {
      name: "Memory cells (magnified ≈150,000×)",
      category: "memory",
      summary: "A patch of the array: each bit is one capacitor plus one transistor switch.",
      details: [
        "This is how a DRAM bit is actually built. Diagonal silicon islands each hold **two transistors** sharing one bit-line contact. Word lines cross the islands — where they do, they form the transistors' gates — and a tall **capacitor** stands on each end of every island.",
        "Glowing capacitors hold charge (a **1**); dark ones are empty (a **0**). The orange word line is the **open row**.",
        "Proportions are simplified: real capacitors are 40–60 times taller than they are wide.",
      ],
      specs: [
        ["Cell", "1 transistor + 1 capacitor"],
        ["Capacitance", "≈10 fF (femtofarads)"],
        ["Stored charge", "≈60,000 electrons"],
        ["Refresh", "every 32 ms (16 ms above 85 °C; DDR4: 64 ms)"],
      ],
      howItWorks: [
        "**Write**: the word line turns the transistors in its row on; each bit line drives its capacitor to 1.1 V (a 1) or 0 V (a 0).",
        "**Hold**: the word line turns off and the charge is trapped — but it leaks away through the transistor within a fraction of a second.",
        "**Read**: bit lines are pre-set to half voltage, the word line opens, and each cell nudges its bit line up or down by ≈0.1 V. The sense amplifier detects the nudge and amplifies it to a full 1 or 0.",
        "Reading drains the cell, so the sense amplifier immediately writes the value back. **Refresh** is just this read-and-restore: the chip receives 8,192 refresh commands every 32 ms (one every 3.9 µs), each renewing a batch of rows, so no cell goes longer than 32 ms without being topped up.",
      ],
      didYouKnow:
        "Refresh is not free: during each refresh command (every 3.9 µs) part of the chip is busy for about 0.3 µs. DDR5 can refresh one bank at a time so the rest keep working.",
    },
    "word-lines": {
      name: "Word lines",
      category: "signal",
      summary: "Wires that run along a row and act as the gates of every transistor they cross.",
      details: [
        "Raising a word line to VPP (1.8 V) switches on every access transistor in its row, connecting thousands of capacitors to their bit lines at once — that's what \"opening a row\" means.",
        "In modern DRAM the word line is buried in a trench in the silicon (a **buried-channel transistor**), which gives a longer channel in a tiny footprint and reduces leakage. Here they are drawn on the surface for clarity.",
      ],
      specs: [
        ["Material", "Titanium nitride / tungsten"],
        ["Pitch", "≈30 nm"],
      ],
    },
    "bit-lines": {
      name: "Bit lines",
      category: "signal",
      summary: "Wires running across the word lines that carry each cell's charge to the sense amplifier.",
      details: [
        "Every bit line connects (through a contact in the middle of each silicon island) to the cells in its column. Only the cell whose word line is on is connected at any time.",
        "A bit line is long and much bigger than a cell, so its capacitance is about ten times the cell's — which is why the signal from one cell is so faint.",
      ],
      specs: [
        ["Material", "Tungsten"],
        ["Pitch", "≈40–45 nm"],
      ],
    },
    "access-transistors": {
      name: "Access transistors",
      category: "compute",
      summary: "Silicon islands that form the switches between each capacitor and its bit line.",
      details: [
        "Each diagonal island is doped silicon with two transistors: where a word line crosses it, the voltage on the word line opens or closes a channel underneath, connecting a capacitor at the island's end to the bit-line contact in its middle.",
        "These transistors must leak as little as possible when off — leakage is what drains the capacitors and forces refresh.",
      ],
    },
    "storage-capacitors": {
      name: "Storage capacitors",
      category: "memory",
      summary: "Tall, thin capacitors — one per bit — whose charge is the stored 1 or 0.",
      details: [
        "To store enough charge in a footprint of a few hundredths of a micron, the capacitors are built **upward**: hollow cylinders of titanium nitride lined with a high-k dielectric, more than a micron tall but only about 30 nm wide.",
        "They connect to their transistors through the thin contacts below. All their outer electrodes join in a common plate held at half the supply voltage (not shown).",
      ],
      specs: [
        ["Capacitance", "≈10 fF"],
        ["Height : width", "≈50 : 1 in reality"],
      ],
      didYouKnow: "If a DRAM capacitor were scaled up to the width of a pencil, it would be as tall as a two-storey house.",
    },
    "sense-amp": {
      name: "Sense amplifier",
      category: "signal",
      summary: "Two cross-coupled inverters per bit line: the circuit that reads — and restores — each bit.",
      details: [
        "Each amplifier is a latch: two inverters feeding each other. Before a read, both of its inputs are set to half voltage. When the cell nudges one input slightly up or down, the latch tips over and drives it all the way — reading the bit and recharging the cell in the same motion.",
      ],
    },
    "wl-driver": {
      name: "Word-line driver",
      category: "control",
      summary: "The output stage of the row decoder that charges a word line up to 1.8 V.",
      details: [
        "Driving a long word line quickly takes a strong driver and a voltage above the 1.1 V supply, so that the access transistors switch fully on and the capacitors charge all the way. That higher voltage, **VPP**, comes from the PMIC.",
      ],
    },
  },
};
