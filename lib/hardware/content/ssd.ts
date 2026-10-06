import type { DeviceInfo } from "../types";

export const ssd: DeviceInfo = {
  id: "ssd",
  name: "Solid-State Drive",
  shortName: "SSD",
  model: "M.2 2280 NVMe SSD · PCIe 4.0 ×4 · 2 TB 3D TLC with DRAM cache",
  tagline: "Terabytes of 3D NAND on a stick of gum.",
  intro: [
    "An SSD stores data as tiny packets of electric charge trapped inside billions of **flash memory cells** — no spinning disks, no moving parts. This 80 × 22 mm stick holds **2 terabytes** in just two chips, each a stack of eight silicon dies built from more than 200 layers of cells.",
    "Flash memory has awkward rules: a cell can't simply be overwritten, it can only be erased in huge blocks, and every erase wears it out a little. The **controller** — a multi-core processor in its own right — hides all of that behind a simple, fast disk. It talks to the computer over **PCIe 4.0 ×4** at up to ~7 GB/s, keeps a map of where every piece of data really lives in its **DRAM cache**, and constantly reshuffles data in the background.",
    "Press **Explode** to take it apart: the screw spins out, the drive leaves its slot, the label peels off and the chips lift off the board. Then it keeps going — one flash chip opens to show its stack of dies, a die grows into a labelled floorplan, and a slice of the memory array opens up to show the vertical strings of cells where your bits actually live.",
  ],
  specs: [
    ["Form factor", "M.2 2280 (22 × 80 mm), single-sided, M key"],
    ["Interface", "PCIe 4.0 ×4 · NVMe 2.0"],
    ["Capacity", "2 TB · 2 packages × 8 dies × 1 Tb"],
    ["Flash", "3D TLC NAND, 200+ layers, 3 bits per cell"],
    ["Cache", "2 GB LPDDR4 DRAM + dynamic SLC cache"],
    ["Sequential read / write", "≈7,000 / 6,500 MB/s"],
    ["Random 4 KB", "≈1,000,000 IOPS"],
    ["Endurance", "1,200 TBW (≈0.33 drive writes per day for 5 years)"],
    ["Power", "≈7 W busy · <5 mW in deepest sleep"],
  ],
  camera: { position: [95, 110, 165], target: [0, 2, 0] },
  size: 110,
  parts: {
    // --- Motherboard ----------------------------------------------------------
    motherboard: {
      name: "Motherboard (M.2 slot)",
      category: "structure",
      summary: "The patch of motherboard around the M.2 slot: the socket, the mounting posts and the PCIe lanes to the processor.",
      details: [
        "An M.2 slot is wired straight to four **PCI Express lanes** — on most desktops directly to the CPU, so the drive sits as close to the processor as the graphics card does. The pairs of traces leaving the back of the socket are those lanes.",
        "The board has mounting holes at several distances from the socket, marked **2242**, **2260** and **2280**: the last two digits of the size are the module length in millimetres. You move the standoff to match your drive.",
      ],
      specs: [
        ["Slot", "M.2 Socket 3, key M"],
        ["Lanes", "PCIe 4.0 ×4 (≈7.9 GB/s each way)"],
        ["Supply", "3.3 V only"],
      ],
    },
    "m2-socket": {
      name: "M.2 socket (key M)",
      category: "io",
      summary: "The edge-card connector the drive plugs into: 67 spring contacts in two staggered rows.",
      details: [
        "The socket has **75 contact positions** at a 0.5 mm pitch; the bottom row is offset from the top row by a quarter of a millimetre so the contacts interleave. Eight positions are replaced by a plastic **key** rib, leaving 67 contacts.",
        "The key's position defines the slot type. Key **M** (pins 59–66) carries four PCIe lanes; key **B** sits on the other side and carries SATA or two lanes. A drive whose notch doesn't line up with the rib simply can't be inserted.",
        "You insert the module at an angle of about 20°, then press it down flat and screw it to the standoff. The contacts are only rated for a few dozen insertions — it's meant to be installed once.",
      ],
      specs: [
        ["Positions / contacts", "75 / 67"],
        ["Pitch", "0.5 mm per row, rows offset 0.25 mm"],
        ["Contact rating", "0.5 A each, 25–60 mating cycles"],
        ["Housing", "Glass-filled LCP plastic"],
      ],
    },
    standoff: {
      name: "Standoff",
      category: "structure",
      summary: "A brass post soldered into the motherboard that holds the far end of the drive at the right height.",
      details: [
        "The standoff sets the gap under the module — here about 2.4 mm, enough for parts on the back of double-sided drives — so the drive lies flat and isn't bent by the screw.",
        "It is also part of the drive's **ground path**: the M.2 specification requires the standoff and screw to connect the module's half-moon pad to the motherboard's ground plane, and to conduct some heat away.",
      ],
      specs: [
        ["Thread", "M2 × 0.4"],
        ["Height", "≈2.4 mm"],
      ],
    },
    "mount-screw": {
      name: "M.2 retention screw",
      category: "mechanical",
      summary: "A tiny M2 screw that clamps the half-moon notch at the end of the drive onto the standoff.",
      details: [
        "The head presses on the gold **ground pad** around the notch, holding the module flat against the spring of the socket contacts and grounding it.",
        "In the exploded view it spins out first — exactly what you'd do when removing the drive.",
      ],
      specs: [
        ["Size", "M2 × 0.4 thread, ≈4.4 mm head"],
        ["Max head height (spec)", "1.2 mm"],
      ],
      didYouKnow: "These screws are notoriously easy to lose, so many newer motherboards replace them with a tool-less rotating latch or a spring clip.",
    },

    // --- The drive's circuit board ---------------------------------------------
    pcb: {
      name: "SSD circuit board",
      category: "structure",
      summary: "An 80 × 22 mm, 0.8 mm-thick board with about eight copper layers that wires the controller, cache and flash together.",
      details: [
        "M.2 boards are thin — **0.8 mm**, half a normal PCB — yet pack eight or more copper layers. Inner layers carry ground and power planes; the outer layers carry the high-speed signals you can see as fine traces under the black solder mask.",
        "The **PCIe pairs** running from the gold fingers to the controller are routed as tightly coupled differential pairs with a controlled impedance (85 Ω), because at 16 GT/s each bit lasts just 62 picoseconds and any reflection would corrupt it.",
        "Everything sits on one side (\"single-sided\", 1.5 mm max height) so the drive fits in thin laptops. All exposed pads are gold-plated (ENIG) for reliable soldering of the fine-pitch chips.",
      ],
      specs: [
        ["Size", "22 × 80 mm"],
        ["Thickness", "0.8 mm ± 0.08"],
        ["Layers", "≈8 (HDI with micro-vias)"],
        ["Finish", "Black solder mask, ENIG gold pads"],
      ],
      didYouKnow: "Look for the small silkscreen **M** next to the notch in the connector: the M.2 standard requires the key letter to be printed there, at least 1 mm tall.",
    },
    "edge-connector": {
      name: "M-key edge connector",
      category: "io",
      summary: "67 gold fingers that carry four PCIe lanes, 3.3 V power and a handful of control signals.",
      details: [
        "The fingers are 0.35 mm wide at a 0.5 mm pitch: **34 on the top** (odd pins) and **33 underneath** (even pins), offset so they interleave. The notch between pins 58 and 67 is the **M key**, 6.1 mm from the centre line.",
        "Sixteen fingers are the four PCIe lanes — each lane is one differential pair in each direction — flanked by ground fingers that shield them. Two more carry the 100 MHz **reference clock** from the motherboard. Power arrives at **3.3 V** on nine fingers on the underside; there is no 12 V or 5 V on M.2.",
        "The leading edge is bevelled at 20° so the card slides into the socket contacts smoothly instead of gouging them.",
      ],
      specs: [
        ["Contacts", "67 (34 top + 33 bottom)"],
        ["Lanes", "PCIe ×4: 16 GT/s per lane"],
        ["Bandwidth", "4 × 16 GT/s × 128/130 ÷ 8 ≈ 7.9 GB/s each way"],
        ["Power", "3.3 V on 9 contacts (0.5 A each)"],
        ["Sideband", "PERST#, CLKREQ#, PEWAKE#, SMBus, SUSCLK, LED"],
      ],
      howItWorks: [
        "Each lane sends bits as the **difference** between two wires, so noise that hits both wires equally cancels out.",
        "Data is scrambled and packed with **128b/130b** encoding: every 128 bits of payload travel with 2 bits of framing.",
        "The four lanes run in parallel and the controller stripes packets across them, giving ≈7.9 GB/s per direction — about 7 GB/s of real data after protocol overhead.",
      ],
    },
    "ac-caps": {
      name: "PCIe AC-coupling capacitors",
      category: "signal",
      summary: "Eight tiny capacitors placed in series in the drive's transmit lanes.",
      details: [
        "The drive and the motherboard bias their PCIe signals at slightly different DC voltages. A capacitor in each transmit wire blocks that DC offset while letting the fast data edges straight through — this is required by the PCIe specification.",
        "They come in staggered pairs, one for each wire of the four transmit lanes, as close to the connector as possible. The receive lanes' capacitors are on the motherboard.",
      ],
      specs: [
        ["Count", "8 (4 lanes × 2 wires)"],
        ["Value", "≈220 nF (PCIe 4.0 allows 176–265 nF)"],
        ["Size", "0201 (0.6 × 0.3 mm)"],
      ],
    },
    controller: {
      name: "NVMe controller",
      category: "compute",
      summary: "The drive's brain: a multi-core processor that turns raw flash into a fast, reliable disk.",
      details: [
        "The computer asks for data by **logical block address** — \"give me block 1,000,000\". The controller's firmware, the **flash translation layer (FTL)**, looks up where that block physically lives (which channel, die, plane, block and page), fetches it, checks and corrects it, and streams it back over PCIe.",
        "It runs **eight NAND channels** in parallel — each an 8-bit bus at up to 2,400 MT/s — and keeps all sixteen dies busy at once. That parallelism, not any single chip, is what makes an SSD fast.",
        "In the background it never stops working: spreading wear evenly, cleaning up blocks full of stale data, refreshing data that's getting weak, and throttling itself if it gets too hot. In the exploded view its nickel lid lifts off and the silicon die flips over to show its floorplan.",
      ],
      specs: [
        ["Host interface", "PCIe 4.0 ×4, NVMe 2.0"],
        ["NAND interface", "8 channels × 2,400 MT/s"],
        ["CPU", "Several 32-bit real-time cores"],
        ["Error correction", "LDPC with soft-decision decoding"],
        ["Process / package", "≈12 nm · 12 × 12 mm FCBGA with lid"],
        ["Power", "≈3–5 W at full load"],
      ],
      howItWorks: [
        "The host writes a command into one of up to 65,535 **NVMe submission queues** in system memory and rings a doorbell register on the drive.",
        "The controller fetches the command and looks up the logical address in its mapping table (kept in DRAM) to find the physical page.",
        "It issues a page read to the right die on the right channel; ~50 µs later the data streams out of the die's page buffer.",
        "The **LDPC** engine checks the data against its parity bits and corrects any flipped bits; the drive then copies the result into host memory over PCIe and posts a completion entry.",
        "Writes go the other way — but always to **fresh, erased pages**: the old copy is just marked stale in the map, to be cleaned up later by garbage collection.",
      ],
      didYouKnow: "When you delete a file, the operating system sends a **TRIM** (deallocate) command so the controller knows those pages hold garbage and can skip copying them during clean-up — one reason an SSD stays fast when it isn't nearly full.",
    },
    "controller-lid": {
      name: "Heat-spreader lid",
      category: "cooling",
      summary: "A nickel-plated copper cap that protects the controller die and spreads its heat.",
      details: [
        "The controller is the hottest part of the drive, concentrating several watts in a few square millimetres. The lid spreads that heat over 10 × 10 mm so the label's copper foil, or a motherboard heatsink, can carry it away.",
        "Between the die and the lid is a thin layer of **thermal interface material**; a bead of black sealant bonds the lid's flange to the package substrate. The part number is laser-etched into the nickel.",
      ],
      specs: [
        ["Material", "Nickel-plated copper"],
        ["Size", "10.6 × 10.6 mm"],
      ],
    },
    "controller-die": {
      name: "Controller die",
      category: "compute",
      summary: "The controller's silicon: CPU cores, SRAM, error-correction engines and the PHYs for PCIe, DRAM and flash.",
      details: [
        "The die is mounted upside down (\"flip-chip\") on thousands of tiny solder bumps; in the exploded view it turns over to show its circuit side, here drawn as a labelled floorplan.",
        "The **PCIe PHY** along one edge drives the link to the computer; the **NAND channel** PHYs along two others talk to the flash; the **LPDDR4 PHY** faces the DRAM chip. In the middle are the **CPU cores** that run the firmware, a large **SRAM** buffer, and the **LDPC ECC** engines — often the biggest logic block, because modern TLC flash needs heavy error correction.",
      ],
      specs: [
        ["Area", "≈5.5 × 4.9 mm"],
        ["Process", "≈12 nm FinFET"],
        ["ECC", "LDPC, hard + soft decoding"],
        ["Encryption", "AES-256 engine (self-encrypting drive)"],
      ],
      didYouKnow: "Raw TLC flash can return pages with dozens of flipped bits per kilobyte late in its life. LDPC can usually still recover them; when it can't, the controller re-reads the page with slightly shifted read voltages (\"read retry\") before giving up.",
    },
    "controller-substrate": {
      name: "Controller package substrate",
      category: "signal",
      summary: "A tiny multilayer board that fans the die's microscopic bumps out to 289 solder balls.",
      details: [
        "The die's connections are only about 0.15 mm apart — far too fine for a PCB. The substrate's thin build-up layers route them outward to a 17 × 17 grid of solder balls at 0.65 mm pitch, which are soldered to the SSD board.",
        "An epoxy **underfill** fills the gap under the die so the bumps don't crack as the chip heats and cools.",
      ],
      specs: [
        ["Size", "12 × 12 mm"],
        ["Balls", "≈289 at 0.65 mm pitch"],
      ],
    },
    dram: {
      name: "DRAM cache (LPDDR4)",
      category: "memory",
      summary: "2 GB of fast memory that holds the drive's map of where every piece of data physically lives.",
      details: [
        "Because flash pages can't be overwritten, data constantly moves, and the controller must keep a **mapping table** from every logical 4 KB block to its current physical page. At 4 bytes per entry that's about **1 GB of map per TB** of flash — 2 GB here.",
        "Looking an address up in DRAM takes about 0.1 µs; looking it up in flash would cost another ~50 µs read. Keeping the whole map in DRAM is what lets this drive serve a million random reads per second.",
        "Cheaper **DRAM-less** drives cache only part of the map in on-chip SRAM, or borrow a few tens of megabytes of the PC's own RAM over PCIe (**Host Memory Buffer**).",
      ],
      specs: [
        ["Capacity", "16 Gbit = 2 GB"],
        ["Type", "LPDDR4X, ×16, 4,266 MT/s (≈8.5 GB/s)"],
        ["Map", "2 TB ÷ 4 KB × 4 B ≈ 2 GB"],
        ["Package", "FBGA, 8 × 10 mm"],
      ],
      didYouKnow: "The DRAM is volatile. When power is cut, the latest map changes are lost — so the controller also journals them to flash and can rebuild the map from metadata stored alongside every page. Data-centre drives add capacitors to finish writing during a power cut.",
    },
    pmic: {
      name: "Power management IC (PMIC)",
      category: "power",
      summary: "Turns the slot's single 3.3 V supply into the half-dozen voltages the chips need.",
      details: [
        "M.2 provides only **3.3 V**, but the controller core wants ≈0.8 V, the DRAM ≈1.1 V and 0.6 V, and the NAND 2.5 V for its core (VCC) and 1.2 V for its I/O (VCCQ).",
        "The PMIC contains several **buck converters** switching at a few MHz, plus low-dropout regulators. It brings the rails up in the right order, monitors them, and can shut parts down to reach sub-5 mW sleep states.",
      ],
      specs: [
        ["Input", "3.3 V ± 5%"],
        ["Outputs", "≈0.8, 1.1, 1.2, 1.8, 2.5 V"],
        ["Package", "4 × 4 mm QFN"],
      ],
    },
    inductors: {
      name: "Power inductors",
      category: "power",
      summary: "Tiny moulded coils that smooth the switched current of the PMIC's buck converters.",
      details: [
        "Each buck converter chops 3.3 V into fast pulses; the inductor turns them into a steady current, the way a flywheel smooths out pedalling. The marking is the inductance: **R47** = 0.47 µH, **1R0** = 1.0 µH.",
        "At 2.0 × 1.6 mm they're far smaller than a graphics card's chokes because the currents are only a few amps and the switching frequency is several MHz.",
      ],
      specs: [
        ["Size", "2016 (2.0 × 1.6 × 1.0 mm)"],
        ["Values", "0.47 µH and 1.0 µH"],
      ],
    },
    crystal: {
      name: "Crystal resonator",
      category: "control",
      summary: "A sliver of quartz that vibrates at exactly 40 MHz to clock the controller.",
      details: [
        "Quartz is piezoelectric: an electric field makes it flex, and a precisely cut crystal rings at one very stable frequency. The controller's PLLs multiply this reference up to the GHz clocks its cores and PHYs need.",
        "The PCIe link itself is timed by the 100 MHz reference clock from the motherboard, so both ends agree on the bit rate.",
      ],
      specs: [
        ["Frequency", "40.000 MHz"],
        ["Package", "2.0 × 1.6 mm, ceramic with metal lid"],
      ],
    },
    "thermal-sensor": {
      name: "Thermal sensor",
      category: "control",
      summary: "Measures the board temperature near the flash so the drive can protect itself.",
      details: [
        "NVMe drives report several temperatures over the bus (you can read them as SMART data). If the controller passes roughly **80 °C**, the firmware **throttles** — slowing transfers — and at higher temperatures it shuts down to protect the data.",
        "Flash is picky about heat in both directions: it programs best warm (≈40–70 °C), but stored data leaks away faster at high temperature.",
      ],
      specs: [
        ["Throttle point", "≈80 °C (controller composite)"],
        ["Interface", "I²C / SMBus"],
      ],
    },
    "test-points": {
      name: "Test pads",
      category: "control",
      summary: "Gold pads used at the factory to program, test and debug the drive.",
      details: [
        "Production testers press spring pins onto these pads to load firmware, run a **serial console** for debugging, measure supply rails and set strap pins — for example to force the controller into **ROM mode** so a bricked drive can be re-flashed.",
      ],
    },
    "smd-passives": {
      name: "Capacitors & resistors",
      category: "power",
      summary: "Dozens of tiny ceramic capacitors and resistors that steady the power rails and set configuration.",
      details: [
        "The tan parts are **multilayer ceramic capacitors**. Placed right beside each chip, they supply the sudden bursts of current a chip draws when it switches — faster than the regulator can respond. The larger 0603 and 0805 parts are bulk capacitors of 10–22 µF.",
        "The black parts are **resistors**: pull-ups on control lines, feedback dividers that set the PMIC's output voltages, and configuration straps.",
        "The smallest here are the **0201** size — 0.6 × 0.3 mm, barely bigger than a grain of sand.",
      ],
      specs: [
        ["Sizes", "0201, 0402, 0603, 0805"],
        ["Bulk capacitors", "10–22 µF"],
      ],
    },

    // --- NAND flash packages ----------------------------------------------------
    "nand-1": {
      name: "NAND flash package (U3)",
      category: "storage",
      summary: "One of two 1 TB flash chips: eight 1-terabit 3D TLC dies stacked inside a 12 × 18 mm package.",
      details: [
        "Each package holds **8 dies × 1 Tbit = 1 TB**. Its twin, **U4**, is the one that opens up in the exploded view to show what's inside.",
        "The 16 dies of the drive are spread over the controller's 8 channels — two dies per channel — and each die has four planes that can work at once, so the controller can keep up to 64 operations in flight.",
        "Not all of the flash is visible to you: the dies hold 2 TiB (2,199 GB) but the drive offers 2,000 GB. The extra ~10% is **over-provisioning** — spare room that keeps garbage collection efficient and replaces blocks that wear out.",
      ],
      specs: [
        ["Capacity", "8 dies × 1 Tb = 1 TB"],
        ["Cell type", "3D TLC (3 bits per cell)"],
        ["Package", "BGA-152, 12 × 18 × 1.3 mm"],
        ["Interface", "2 channels × 8-bit, 2,400 MT/s"],
      ],
    },
    "nand-2": {
      name: "NAND flash package (U4)",
      category: "storage",
      summary: "The second 1 TB flash chip — opened up in the exploded view to show its stack of eight dies.",
      details: [
        "Inside the black mould compound are eight silicon dies, each about 50 µm thick, stacked like a staircase on a small circuit board (the substrate) and wired to it with gold wires.",
        "Keep exploding to follow the zoom: the top die floats up and grows into a labelled floorplan, and one of its erase blocks opens into a 3D cut-away of the memory array.",
      ],
      specs: [
        ["Capacity", "1 TB"],
        ["Dies", "8 × 1 Tb, wire-bonded"],
        ["Package height", "≈1.3 mm"],
      ],
      didYouKnow: "Using **SLC caching**, the controller first writes incoming data into some of this TLC flash as if it were 1-bit SLC, which is several times faster to program. Later, when the drive is idle, it folds that data into TLC — which is why huge copies can slow down once the cache fills.",
    },
    "nand-substrate": {
      name: "Package substrate",
      category: "signal",
      summary: "A thin two-layer circuit board that carries the dies and routes their wires to 152 solder balls.",
      details: [
        "The gold-plated **bond fingers** along one edge receive the wires from the dies; traces in the substrate carry those signals down to a grid of solder balls at 1 mm pitch on the underside.",
        "All eight dies share the same 8-bit data bus inside the package; separate **chip-enable** lines let the controller address one die at a time.",
      ],
      specs: [
        ["Material", "BT resin laminate, green mask"],
        ["Balls", "152 at 1.0 mm pitch"],
      ],
    },
    "nand-die-stack": {
      name: "Die stack (8 × 1 Tb)",
      category: "storage",
      summary: "Eight paper-thin silicon dies stacked in a staircase so every die's bond pads stay uncovered.",
      details: [
        "Each die is ground down to about **50 µm** — thinner than a hair — and glued to the one below with a **die-attach film**. Every die is shifted back a fraction of a millimetre, so the row of bond pads along the front edge of each die stays exposed for its wires.",
        "Stacking is how a single package reaches a terabyte: one die holds 128 GB; eight of them hold 1 TB. Some packages stack 16 dies.",
      ],
      specs: [
        ["Dies", "8 (\"octal-die package\")"],
        ["Die thickness", "≈40–60 µm"],
        ["Per die", "1 Tb = 128 GB"],
      ],
    },
    "bond-wires": {
      name: "Gold bond wires",
      category: "signal",
      summary: "Hair-thin gold wires that connect each die's pads to the package substrate.",
      details: [
        "A wire-bonding machine welds one end of a ~20 µm gold wire to a pad on the die with heat and ultrasound, loops it down and welds the other end to a finger on the substrate — several bonds per second, with micron precision.",
        "Each die has dozens of pads: the 8-bit data bus, its strobes, control lines and lots of power and ground. The wires from different dies interleave as they fan down to the fingers.",
      ],
      specs: [
        ["Diameter", "≈15–25 µm"],
        ["Material", "Gold (sometimes copper or silver alloy)"],
      ],
    },
    "nand-mold": {
      name: "Mould compound",
      category: "structure",
      summary: "The black epoxy block that encapsulates and protects the dies and wires.",
      details: [
        "After wire bonding, the whole stack is injection-moulded in epoxy loaded with silica powder, which matches the thermal expansion of silicon and blocks light and moisture. The part number is laser-etched into the top.",
        "Turn on **X-ray** to see through it while the drive is assembled.",
      ],
    },

    // --- Inside a NAND die ------------------------------------------------------
    "inside-nand": {
      name: "Inside the flash (magnified)",
      category: "storage",
      summary: "A zoom into package U4: one of its dies as a labelled floorplan, and a slice of its 3D memory array.",
      details: [
        "Near full explode, a copy of U4's top die grows out of the opened package — magnified about three times — and one of its highlighted **erase blocks** opens into a cut-away of the memory array, magnified about 20,000 times.",
        "The faint lines show where each magnified view comes from. Click any region of the die, or any layer of the array, to see what it does.",
      ],
    },
    "nand-die": {
      name: "NAND die (magnified)",
      category: "storage",
      summary: "One 1-terabit flash die: four memory planes surrounded by the circuits that read, program and erase them.",
      details: [
        "This die is a magnified copy of the top die in the stack, drawn as a labelled floorplan. Most of its ~70 mm² is the **memory array**, split into four **planes** that can work independently.",
        "Around the arrays sit **row decoders** that drive the word lines, **page buffers** that read and write whole pages at once, **charge pumps** that generate the 20-volt programming pulses, control logic, and a row of bond pads.",
        "In modern 3D NAND much of that circuitry is actually built **underneath** the array, so the floorplan here is simplified to show what each part does.",
      ],
      specs: [
        ["Capacity", "1 Tb (128 GB) TLC"],
        ["Cells", "≈370 billion (+ spares)"],
        ["Planes", "4 (2–6 in current dies)"],
        ["Page / block", "16 KB / ≈24 MB"],
        ["Interface", "8-bit, 2,400 MT/s"],
        ["Supplies", "VCC 2.5 V, VCCQ 1.2 V"],
      ],
    },
    "memory-planes": {
      name: "Memory planes (×4)",
      category: "storage",
      summary: "Four independent memory arrays, each holding about a quarter of the die's cells.",
      details: [
        "A plane is a self-contained array with its own page buffer. The controller can read or program the same page in all four planes at once (**multi-plane** operation), quadrupling the die's throughput.",
        "Each plane is divided into roughly 1,400 **erase blocks**, running across the plane like the faint stripes you can see. One is highlighted in amber.",
      ],
      specs: [
        ["Cells per plane", "≈100 billion"],
        ["Capacity per plane", "32 GB"],
        ["Blocks per plane", "≈1,400"],
      ],
    },
    "page-buffers": {
      name: "Page buffers",
      category: "control",
      summary: "Rows of sense amplifiers and latches that read or write a whole 16 KB page in one go.",
      details: [
        "There is one sense amplifier for every **bit line** — about 147,000 per plane (16 KB of data plus ~2 KB of spare bytes for ECC). To read, all the bit lines are precharged, a read voltage is put on one word line, and each sense amp detects whether its string conducts.",
        "For TLC each bit line has several data latches, because the three bits of a cell are read by comparing against **seven** different reference voltages. The latches also hold the data being programmed and check it after each pulse.",
      ],
      specs: [
        ["Sense amps per plane", "≈147,000"],
        ["Page read time", "≈40–60 µs"],
      ],
    },
    "row-decoders": {
      name: "Row decoders",
      category: "control",
      summary: "High-voltage switches that pick one block and put the right voltage on each of its word lines.",
      details: [
        "During an operation every word line of the selected block gets a different voltage: around **20 V** on the one being programmed, a 'pass' voltage of ~7 V on the others, and carefully stepped read levels during a read. The decoders route those voltages using high-voltage transistors.",
        "In 3D NAND the decoders reach each layer through the **word-line staircase** at the edge of the array.",
      ],
      specs: [["Voltages switched", "0 – ≈20 V"]],
    },
    "charge-pumps": {
      name: "Charge pumps",
      category: "power",
      summary: "Switched-capacitor circuits that boost the 2.5 V supply to the ~20 V needed to program and erase.",
      details: [
        "Pushing electrons through an insulating oxide (quantum **tunnelling**) needs an electric field of roughly 10 million volts per centimetre — about 20 V across the cell's thin layers.",
        "A charge pump builds that voltage by charging capacitors in parallel and then stacking them in series, many times per microsecond, like passing buckets up a ladder. The large squares in this region are the pump capacitors.",
      ],
      specs: [
        ["Input", "2.5 V (VCC)"],
        ["Outputs", "≈20 V program/erase, ≈7 V pass"],
      ],
    },
    "nand-periphery": {
      name: "Control logic & I/O",
      category: "control",
      summary: "The die's state machine, voltage regulators and the row of pads that connect it to the controller.",
      details: [
        "The controller doesn't drive the cells directly. It sends commands like \"program this page\" over the 8-bit bus; the die's own **state machine** then runs the whole algorithm — pulse, verify, pulse a little higher — and reports when it's done.",
        "Fuses on the die store factory **trim values** that tune each die's voltages and timings, and a list of bad blocks found during testing.",
        "The **I/O pads** along the front edge are where the gold wires attach.",
      ],
      specs: [
        ["Bus", "8-bit DQ + strobes, 2,400 MT/s"],
        ["Standard", "ONFI-style DDR interface"],
      ],
    },
    "erase-block": {
      name: "Erase block",
      category: "storage",
      summary: "The smallest piece of flash that can be erased — about 24 MB, made of ~1,500 pages.",
      details: [
        "Programming can only **add** electrons to cells. The only way to remove them is an erase, and an erase always hits a whole block at once, because all its cells share one channel well and source.",
        "That's why an SSD can't overwrite in place. A changed page is written somewhere fresh and the old copy is marked stale. Over time blocks fill up with a mix of valid and stale pages; **garbage collection** copies the valid pages into a new block and erases the old one.",
        "Each erase wears the cells a little. The controller's **wear levelling** spreads erases evenly across all blocks, so no part of the drive wears out early.",
      ],
      specs: [
        ["Size", "≈24 MB (1,536 pages × 16 KB)"],
        ["Erase time", "≈3–10 ms"],
        ["Endurance (TLC)", "≈1,000–3,000 erase cycles"],
      ],
      howItWorks: [
        "The block's word lines are held at 0 V while about 20 V is applied to the strings' channels.",
        "The strong field pulls trapped electrons back out of the charge-trap layer of every cell in the block at once.",
        "All cells now read as erased (\"111\" for TLC) and the block joins the pool of free blocks.",
      ],
      didYouKnow: "This mismatch — write in 16 KB pages, erase in 24 MB blocks — is the root of almost everything a flash controller does, and why a nearly full SSD can slow down: garbage collection has less free space to work with.",
    },
    "flash-page": {
      name: "Page (16 KB)",
      category: "storage",
      summary: "The smallest unit the flash can read or program: one row of cells along a word line.",
      details: [
        "A page is all the cells on one **word line** across the plane — one cell per bit line. With TLC, each word line stores **three pages** (lower, middle and upper bits) in the same cells.",
        "Each page has ~2 KB of extra space next to its 16 KB of data for the LDPC parity bits and metadata the controller uses to rebuild its map.",
      ],
      specs: [
        ["Data / spare", "16 KB + ≈2 KB"],
        ["Read time", "≈40–60 µs"],
        ["Program time", "≈0.4–0.8 ms per TLC word line"],
      ],
    },
    "nand-3d": {
      name: "3D NAND array (cut-away)",
      category: "storage",
      summary: "A slice of the memory array, magnified about 20,000×: vertical strings of cells drilled through a stack of word-line layers.",
      details: [
        "Modern flash builds its cells **vertically**. The chip is a stack of more than 200 alternating layers — tungsten word lines and silicon-oxide insulators — and millions of holes about **100 nm** wide are etched straight down through all of them. Each hole is lined with the cell layers and filled with a silicon channel.",
        "Every place a hole passes through a word-line layer forms one memory cell, so a single hole is a **string** of 200+ cells stacked like beads. This cut-away shows 24 word-line layers; a real 232-layer stack is about 12 µm tall.",
        "The front and right faces are cut straight through rows of channels, so you can see their layers and the **charge-trap cells** glowing with their stored level.",
      ],
      specs: [
        ["Layers", "200+ (24 shown)"],
        ["Channel hole", "≈100 nm wide, ≈12 µm deep"],
        ["Layer pitch", "≈50 nm"],
        ["Magnification", "≈20,000×"],
      ],
      didYouKnow: "Etching a 100 nm hole 12 µm deep is like drilling a hole 1 m wide and 120 m deep without wandering — so manufacturers build the stack in two or three \"decks\" and etch each separately.",
    },
    "word-lines": {
      name: "Word lines",
      category: "control",
      summary: "Tungsten plates, one per layer, that act as the control gate for every cell in that layer of the block.",
      details: [
        "Each grey plate is one word line. Its voltage controls every cell where a channel passes through it — tens of thousands of cells in a block. Reading or programming a page means putting a precise voltage on one plate and a pass voltage on all the others.",
        "The layers start out as sacrificial silicon nitride; after the channels are formed, the nitride is etched out through the slits and replaced with tungsten (\"gate replacement\").",
      ],
      specs: [
        ["Material", "Tungsten (W)"],
        ["Thickness", "≈20–35 nm"],
        ["Shown / real", "24 / 200+"],
      ],
    },
    "select-gates": {
      name: "Select gates",
      category: "control",
      summary: "Switch transistors at the top and bottom of every string that connect it to its bit line and source.",
      details: [
        "The blue layers at the top (drain side) and bottom (source side) of the stack are ordinary transistors, not memory cells. Turning them on connects a string to its **bit line** above and the **source line** below; turning them off isolates it.",
        "Several rows of strings share each bit line, so the top select gates pick which row (\"sub-block\") is being read or programmed.",
      ],
    },
    "channel-strings": {
      name: "Vertical channels (NAND strings)",
      category: "storage",
      summary: "Thin polysilicon tubes running down through all the layers — each one a string of cells in series.",
      details: [
        "Each channel is a hollow cylinder of polysilicon filled with oxide, wrapped in the cell layers. Current flows along it from the bit line at the top to the source line at the bottom — but only if **every** cell in the string is switched on. That series connection, like a NAND logic gate, gives NAND flash its name.",
        "To read one cell, the controller puts a high pass voltage on all the other word lines (turning those cells fully on) and a read voltage on the selected one. Whether the string conducts then depends only on that one cell.",
      ],
      specs: [
        ["Diameter", "≈100 nm"],
        ["Cells per string", "200+"],
        ["Channel", "Polysilicon, ≈10 nm thick"],
      ],
    },
    "charge-trap-cells": {
      name: "Charge-trap cells",
      category: "storage",
      summary: "The memory cells: wherever a channel crosses a word line, electrons trapped in silicon nitride store the data.",
      details: [
        "A cell is a transistor whose gate is the word line. Between gate and channel lies a sandwich of oxide, **silicon nitride** and a thin **tunnel oxide**. Electrons pushed into the nitride stay trapped there for years, and they make the transistor harder to turn on — they raise its **threshold voltage**.",
        "By programming cells to precise thresholds, one cell stores several bits: **SLC** uses 2 levels (1 bit), **MLC** 4 (2 bits), **TLC** 8 (3 bits) and **QLC** 16 (4 bits). Here the glow shows each cell's level: dim cells are erased, bright ones are fully programmed.",
        "More levels means more capacity but less margin between them — so TLC and QLC are slower, need stronger ECC and survive fewer erase cycles than SLC.",
      ],
      specs: [
        ["SLC / MLC / TLC / QLC", "2 / 4 / 8 / 16 levels"],
        ["TLC endurance", "≈1,000–3,000 P/E cycles"],
        ["SLC endurance", "≈50,000–100,000 P/E cycles"],
        ["Retention", "≈1 year unpowered at end of life (JEDEC client)"],
      ],
      howItWorks: [
        "**Program:** the word line is pulsed to ~15–20 V; electrons tunnel from the channel into the nitride and get stuck.",
        "**Verify:** after each pulse the threshold is checked; cells that reached their target are locked out, the rest get a slightly stronger pulse (incremental step pulse programming).",
        "**Read:** the die applies reference voltages between the 8 levels — 7 for TLC — and the page buffers note which ones make the string conduct, revealing the 3-bit value.",
        "**Erase:** a high voltage on the channel pulls the electrons back out of every cell in the block.",
      ],
    },
    "bit-lines": {
      name: "Bit lines",
      category: "signal",
      summary: "Copper lines on top of the array that connect strings to the page buffers' sense amplifiers.",
      details: [
        "Each bit line runs across the top of the block and connects, through a small contact, to one string in each row of channels. At its end sits a **sense amplifier** in the page buffer.",
        "When a page is read, all ~147,000 bit lines of a plane are sensed at once — that's what makes flash reads so wide and fast.",
      ],
      specs: [
        ["Material", "Copper"],
        ["Pitch", "≈20–40 nm"],
      ],
    },
    "wl-staircase": {
      name: "Word-line staircase",
      category: "signal",
      summary: "The stepped edge of the stack, where a vertical contact lands on each word-line layer.",
      details: [
        "A row decoder must connect to every layer separately, but the layers are stacked directly on top of each other. The solution is to etch the edge of the stack into a **staircase** — each layer sticks out a little further than the one above — so a tungsten contact can drop straight down onto each step.",
        "With 200+ layers the staircase is cut in two directions at once, otherwise it would be wider than the array itself.",
      ],
      specs: [["Contacts", "one per layer, per block"]],
    },
    "source-line": {
      name: "Common source line",
      category: "power",
      summary: "The doped silicon plate under the array, and the tungsten-filled slits, that form the bottom end of every string.",
      details: [
        "All strings connect at their bottom end to a shared **source**. Here it is a doped polysilicon plate under the stack, contacted through the tungsten-filled **slit** that runs along the back of the block.",
        "The slits do double duty: they split the stack into separate **blocks**, and they were the openings through which the word-line layers were filled with tungsten.",
      ],
    },
    "cmos-under-array": {
      name: "CMOS under array",
      category: "control",
      summary: "The die's control transistors, built in the silicon underneath the memory stack instead of beside it.",
      details: [
        "Page buffers, decoders and logic used to occupy a big strip beside the arrays. Modern 3D NAND builds them first, in ordinary silicon, and then grows the memory stack **on top** — saving a lot of die area.",
        "Some manufacturers go further and make the logic on a separate wafer, then bond the two wafers face to face.",
      ],
    },
    "nand-string": {
      name: "One NAND string, cut open",
      category: "storage",
      summary: "A single vertical string pulled out of the array and sliced open to show its layers.",
      details: [
        "From the outside in: the **word-line rings** (each ring is one cell's gate, the blue ones are select gates), the **blocking oxide**, the amber **silicon-nitride charge trap**, the light-blue **tunnel oxide**, the brown **polysilicon channel** and the white **oxide core**.",
        "The layers are stepped at the top like a stripped cable so you can see each one. A real string is about 0.1 µm across and 12 µm tall.",
      ],
      specs: [
        ["Layer stack", "SiO₂ / Si₃N₄ / SiO₂ / poly-Si / SiO₂"],
        ["Tunnel oxide", "≈5 nm"],
      ],
    },
    "trapped-charge": {
      name: "Trapped electrons",
      category: "storage",
      summary: "The stored data itself: a few hundred electrons stuck in the nitride layer of each cell.",
      details: [
        "The blue dots are electrons held in the charge-trap layer, drawn at each cell in proportion to its TLC level (0–7). More electrons push the cell's threshold voltage higher.",
        "The numbers are startlingly small: across the whole range from erased to fully programmed a cell holds only a few hundred extra electrons, so one TLC level is on the order of a **hundred electrons**. Losing a handful a year is why flash slowly forgets, and why the controller refreshes old data.",
      ],
      specs: [
        ["Levels (TLC)", "8 → 3 bits per cell"],
        ["Electrons per level", "order of 100"],
      ],
      didYouKnow: "Each level is assigned a 3-bit Gray code, so neighbouring levels differ in only one bit. If a cell drifts into the next level, only one of its three bits is wrong — easy work for the ECC.",
    },

    // --- Label ----------------------------------------------------------------------
    label: {
      name: "Label & heat spreader",
      category: "cooling",
      summary: "The sticker on top is a printed film laminated to a thin copper foil that spreads heat across the drive.",
      details: [
        "The controller concentrates several watts in a small area while the flash chips are fairly cool. The label's **copper foil** pulls heat sideways from the controller's hot spot and spreads it over the whole drive, lowering the peak temperature and delaying throttling.",
        "It's also why you shouldn't peel the label off to fit a heatsink: you'd remove the heat spreader (and usually void the warranty). Heatsinks press on top of it through a thermal pad instead.",
      ],
      specs: [
        ["Layers", "PET film + copper foil + adhesive"],
        ["Total thickness", "≈0.12 mm"],
      ],
    },
    "label-film": {
      name: "Printed label film",
      category: "structure",
      summary: "The printed polyester top layer with the model, capacity, serial number and codes.",
      details: [
        "The film carries the product name, capacity, the serial number as a barcode and a 2-D data-matrix code, the firmware version, the supply rating (3.3 V, 2.5 A) and regulatory marks.",
        "It also insulates the copper foil underneath from anything that touches the drive.",
      ],
    },
    "label-copper": {
      name: "Copper foil layer",
      category: "cooling",
      summary: "A ~50 µm sheet of rolled copper that spreads the controller's heat across the drive.",
      details: [
        "Copper conducts heat about **1,000 times better** than the label's plastic. Even a foil thinner than a sheet of paper moves enough heat sideways to lower the controller's temperature by several degrees.",
        "It has to be thin: on a single-sided M.2 drive, components plus label may be at most 1.5 mm tall so the drive fits under laptop keyboards.",
      ],
      specs: [
        ["Thickness", "≈50 µm"],
        ["Conductivity", "≈400 W/m·K"],
      ],
    },
  },
};
