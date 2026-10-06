import type { DeviceInfo, PartInfo } from "../types";

/** Shared explanation for each of the eight cores on the magnified compute die. */
function coreInfo(i: number): PartInfo {
  const where =
    i < 4
      ? `Core ${i} is one of the four cores along the left edge of the die, mirrored so that its L2 cache faces the shared L3 in the middle.`
      : `Core ${i} is one of the four cores along the right edge of the die.${i === 4 ? " It is the one shown magnified next to the die — open **Inside one core** to see its parts." : ""}`;
  return {
    name: `Core ${i}`,
    category: "compute",
    summary: "One of eight CPU cores on this die: it fetches, decodes and executes instructions — two threads at a time.",
    details: [
      "A core is a complete processor in its own right. It reads instructions from memory, works out what each one means and carries it out — at up to **≈5.7 billion clock cycles per second**, completing several instructions in each cycle.",
      "Modern cores are **out-of-order**: they look a few hundred instructions ahead and run whichever ones already have their data, then put the results back in program order. With **simultaneous multithreading (SMT)** each core also runs **two threads** at once — when one stalls waiting for memory, the other uses the idle units. That is why 16 cores show up as 32 processors in your task manager.",
      where,
    ],
    specs: [
      ["Threads", "2 (SMT)"],
      ["Clock", "up to ≈5.7 GHz"],
      ["Private caches", "32 KB L1i + 32 KB L1d + 1 MB L2"],
      ["Width", "decodes 4, dispatches 6 operations per cycle"],
      ["Area", "≈3.8 mm² including its L2"],
    ],
    didYouKnow:
      i === 0
        ? "When the computer starts, only one core — the bootstrap processor — is running. It sets up memory and the operating system, and only then wakes the other 31 threads."
        : undefined,
  };
}

/** Each core's private L2 cache on the magnified compute die. */
function l2Info(i: number): PartInfo {
  return {
    name: `L2 cache (core ${i})`,
    category: "memory",
    summary: `1 MB of cache private to core ${i}, about 3 ns away.`,
    details: [
      "When data isn't in the core's tiny L1 caches, it looks here next. The L2 is 32 times bigger than the L1 data cache but takes about **14 clock cycles (≈3 ns)** to answer.",
      "It sits right beside its core and faces the shared L3 in the middle of the die. Anything a core evicts from its L2 drops into the L3, where the other seven cores can still find it.",
    ],
    specs: [
      ["Size", "1 MB, 8-way set associative"],
      ["Latency", "≈14 cycles ≈ 3 ns"],
      ["Bandwidth", "64 bytes per cycle to the L1"],
    ],
  };
}

export const cpu: DeviceInfo = {
  id: "cpu",
  name: "Processor",
  shortName: "CPU",
  model: "16-core chiplet desktop processor in an LGA 1718 socket",
  tagline: "Billions of transistors under a nickel-plated lid.",
  intro: [
    "The **central processing unit** runs the operating system and every program you use — billions of instructions per second on each of its **16 cores**. Each core can work on two threads at once, so the chip appears to software as 32 processors.",
    "This is a **chiplet** design. Under the nickel-plated lid sit three separate pieces of silicon: two **compute dies** with eight cores each, and a larger **I/O die** that talks to memory, the graphics card and USB. The 40 × 40 mm package has no pins at all — **1718 gold pads** on its underside press onto 1718 tiny springs in the socket.",
    "Press **Explode** to take it apart the way a technician would: open the socket, lift the processor out, take off the lid and flip the dies over. At the end a **magnified floorplan** of a compute die grows out of the chip, followed by a close-up of a single core — click any block to see what it does.",
  ],
  specs: [
    ["Cores / threads", "16 / 32 (2 compute dies × 8 cores)"],
    ["Clock speed", "≈4.5 GHz base · up to ≈5.7 GHz boost"],
    ["Cache", "64 KB L1 + 1 MB L2 per core · 2 × 32 MB L3"],
    ["Transistors", "≈16.5 billion (2 × 6.5 B + 3.4 B)"],
    ["Process", "5 nm-class compute dies · 6 nm-class I/O die"],
    ["Power", "170 W rated · up to ≈230 W package power"],
    ["Memory", "DDR5, 2 channels · ≈5,200–6,000 MT/s"],
    ["Expansion", "28 PCIe 5.0 lanes · USB · basic graphics"],
    ["Package", "40 × 40 mm land grid array, 1718 lands"],
  ],
  camera: { position: [70, 150, 215], target: [0, 8, 0] },
  size: 120,
  parts: {
    // --- Base ----------------------------------------------------------------
    backplate: {
      name: "Backplate",
      category: "structure",
      summary: "A steel plate under the motherboard that the socket frame and the cooler screw into.",
      details: [
        "Closing the socket squeezes the processor onto its contacts with roughly **450 newtons** — the weight of a 45 kg mass. A 1.6 mm circuit board would bend under that, so four screws pass from the socket's retention frame straight through the board into this **backplate**. The board ends up clamped between two rigid steel parts instead of being bent.",
        "The same plate carries the threads for the cooler screws. A thin insulating sheet keeps it from shorting the copper on the back of the board, and the window in the middle leaves room for the capacitor field directly under the processor.",
      ],
      specs: [
        ["Size", "≈67 × 106 mm"],
        ["Material", "≈1.5 mm black-coated steel"],
        ["Cooler holes", "54 × 90 mm pattern"],
      ],
    },
    motherboard: {
      name: "Motherboard (section)",
      category: "structure",
      summary: "A square cut from the main circuit board: socket in the middle, power on the left, memory wiring to the right.",
      details: [
        "A motherboard is a sandwich of **8–10 copper layers** separated by fibreglass-epoxy. The socket's 1718 contacts fan out through tiny plated holes (vias) to the **memory slots** (right), the **graphics-card slot** (front, in neat pairs) and the chipset, USB and network chips (back).",
        "Roughly half of the processor's contacts carry power or ground. They are fed by thick copper planes inside the board from the voltage regulator on the left.",
        "Look at the memory traces on the right: the zig-zags are **length-matching serpentines** that make every wire of a bus equally long, so all the bits of a word arrive at the same moment.",
      ],
      specs: [
        ["Layers", "≈8–10 copper layers"],
        ["Thickness", "1.6 mm"],
        ["Shown", "110 × 110 mm section"],
      ],
      didYouKnow:
        "At DDR5 speeds one bit lasts about 0.17 nanoseconds. In that time a signal travels only ≈2.5 cm along a board trace — so a few millimetres of extra length would make a bit arrive late.",
    },
    "board-capacitors": {
      name: "Board capacitors",
      category: "power",
      summary: "Hundreds of rice-grain-sized ceramic capacitors that keep the processor's supply steady.",
      details: [
        "When a core wakes up, the processor's current can jump by tens of amps within nanoseconds — far faster than the voltage regulator can react. **Multilayer ceramic capacitors (MLCCs)** placed as close as possible supply that charge locally while the regulator catches up.",
        "The densest field is on the **back of the board, directly under the socket**, inside the window of the backplate: the shortest possible path to the processor's power contacts. Rotate the view to look underneath.",
        "Others sit beside the power stages, filter the memory signals, and — the tiny pairs on the PCIe lanes — block DC while letting the high-speed data through (AC coupling).",
      ],
      specs: [
        ["Sizes", "0201 to 0805 (0.6 × 0.3 to 2.0 × 1.25 mm)"],
        ["In this section", "≈430 on both faces"],
      ],
    },
    vrm: {
      name: "Voltage regulator (VRM)",
      category: "power",
      summary: "The processor's private power supply: it turns 12 V into about 1.1 V at up to 200 amps.",
      details: [
        "The cores run at only **≈1.0–1.4 V**, but at full load the processor draws up to ≈230 W — about **200 amps**. Bringing that much current from the power supply would need cables as thick as a finger, so 12 V is delivered instead and converted right beside the socket.",
        "The regulator is a **multi-phase buck converter**. This section shows six **phases**, each a power stage plus a choke; they switch in turn so their ripples cancel. Real boards use 12 to 20 phases arranged around two sides of the socket.",
      ],
      specs: [
        ["Input", "12 V from the power supply"],
        ["Output", "≈0.7–1.45 V, set by the processor"],
        ["Current", "up to ≈200 A"],
        ["Switching", "≈0.5–1 MHz per phase"],
        ["Efficiency", "≈90%"],
      ],
      howItWorks: [
        "The processor continuously tells the regulator which voltage it wants over a dedicated digital link — raising it before boosting a core, lowering it when idle.",
        "Each power stage connects its choke to 12 V for a short pulse, then to ground; the choke keeps the current flowing smoothly into the capacitors.",
        "The fraction of time spent connected to 12 V (about 1/10) sets the output voltage.",
        "A controller staggers the phases and shifts load between them thousands of times per second.",
      ],
    },
    "vrm-stages": {
      name: "Power stages (×6)",
      category: "power",
      summary: "Smart switches that connect each choke to 12 V or to ground about a million times per second.",
      details: [
        "Each small package contains two power transistors (MOSFETs), the driver that flips them in a few nanoseconds, and sensors that report current and temperature back to the controller.",
        "At 80 A each, even a milliohm of resistance becomes several watts of heat, so on a real board these sit under a finned heatsink.",
      ],
      specs: [
        ["Rating", "≈80 A each"],
        ["Package", "5 × 6 mm QFN"],
      ],
    },
    "vrm-chokes": {
      name: "Chokes (×6)",
      category: "power",
      summary: "Inductors that store energy in a magnetic field and smooth the switched current into a steady flow.",
      details: [
        "A choke is a few turns of thick copper inside a magnetic core. Inductors resist sudden changes in current, so they turn the power stage's sharp on/off pulses into a nearly constant current.",
        "The marking **R15** means 0.15 µH — the R stands for the decimal point.",
      ],
      specs: [
        ["Inductance", "0.15 µH"],
        ["Current rating", "≈60–80 A"],
      ],
    },
    "vrm-caps": {
      name: "Bulk capacitors",
      category: "power",
      summary: "Solid polymer capacitors that store energy on the 12 V input.",
      details: [
        "Every time a power stage switches on it draws a burst of current from the 12 V rail. These capacitors supply those bursts locally, so the cable from the power supply only has to provide the average.",
        "The cross pressed into each aluminium top is a vent; the coloured arc marks the negative side.",
      ],
      specs: [
        ["Value", "560 µF"],
        ["Type", "Solid aluminium polymer"],
      ],
    },
    "cooler-brackets": {
      name: "Cooler retention brackets",
      category: "mechanical",
      summary: "Plastic brackets that clip-on coolers hook onto, screwed into the backplate.",
      details: [
        "Simple boxed coolers hook a spring clip over the tab in the middle of each bracket. Bigger coolers remove the brackets and bolt straight into the backplate through the same four holes.",
        "The hole pattern (**54 × 90 mm**) and the height of the lid above the board were deliberately kept identical to the previous socket generation, so most existing coolers still fit.",
      ],
      specs: [
        ["Hole spacing", "54 × 90 mm"],
        ["Material", "Glass-filled nylon"],
      ],
    },

    // --- Socket ----------------------------------------------------------------
    socket: {
      name: "CPU socket (LGA 1718)",
      category: "io",
      summary: "The connector that holds the processor and joins its 1718 pads to the motherboard.",
      details: [
        "There are no pins on this processor. The **socket** holds 1718 springy contacts and the processor has flat gold pads — a **land grid array (LGA)**. Older desktop processors did the opposite: pins on the chip, holes in the socket (**PGA**).",
        "Moving the pins into the socket makes the processor much tougher and allows a denser grid with more connections. The catch: a bent contact now means repairing the motherboard instead of the processor.",
        "It is a **zero-insertion-force** socket: the processor simply drops in. All the force comes from closing the load plate and lever.",
      ],
      specs: [
        ["Contacts", "1718"],
        ["Contact pitch", "0.81 × 0.94 mm, staggered rows"],
        ["Clamping force", "≈450 N in total"],
        ["Mounting", "Soldered to the board (surface mount)"],
      ],
      howItWorks: [
        "Lift the lever and the load plate swings open.",
        "Drop the processor in with its gold triangle in the marked corner; two keys on the socket walls fit notches in the package edges.",
        "Close the plate and push the lever under its latch: the plate presses every land onto its spring.",
      ],
      didYouKnow:
        "1718 springs pushing back with about a quarter of a newton each add up to roughly 450 N — which is why the frame is screwed to a steel backplate rather than to the board alone.",
    },
    "socket-housing": {
      name: "Socket body",
      category: "structure",
      summary: "Black heat-resistant plastic that holds the contacts and guides the processor into place.",
      details: [
        "The body is moulded from **liquid-crystal polymer (LCP)**, a plastic that survives the 260 °C of soldering without warping. It is soldered to the board through a ball under every contact.",
        "Two small keys on its side walls match the notches in the processor's edges, and a triangle marks the pin-1 corner, so the processor only fits one way round. The notches in the front and back walls are for your fingers when lifting it out.",
      ],
      specs: [
        ["Material", "Liquid-crystal polymer"],
        ["Cavity", "≈40.3 × 40.3 mm"],
      ],
    },
    "socket-contacts": {
      name: "Spring contacts (×1718)",
      category: "signal",
      summary: "Gold-plated leaf springs, one for each pad on the processor.",
      details: [
        "Each contact is stamped from copper alloy, bent into a tiny cantilever spring and plated with **gold** so it never corrodes. When the plate closes, each spring is pressed down by about 0.3–0.4 mm and slides slightly across its pad, wiping it clean for a reliable connection.",
        "About half of the contacts carry **power and ground**. Each can safely carry only around half an amp to an amp, so the processor's ≈200 A has to be shared between hundreds of them.",
      ],
      specs: [
        ["Count", "1718"],
        ["Force", "≈0.25 N each"],
        ["Current", "≈0.5–1 A each"],
        ["Plating", "Gold over nickel"],
      ],
    },
    "retention-frame": {
      name: "Retention frame",
      category: "mechanical",
      summary: "A stamped stainless-steel frame that carries the hinge and the lever latch.",
      details: [
        "The frame surrounds the socket body and is fastened by four Torx screws through the board into the backplate. It anchors the load plate's hinge at the back and the latch hook that holds the lever at the front right.",
        "Its raised side flanges stiffen it, so the clamping force is spread evenly instead of bending the board.",
      ],
      specs: [
        ["Material", "1.2 mm stainless steel"],
        ["Fastening", "4 × Torx screws into the backplate"],
      ],
    },
    "load-plate": {
      name: "Load plate",
      category: "mechanical",
      summary: "The hinged steel plate that presses the processor down onto its contacts.",
      details: [
        "When closed, the plate's edges press on the low ledge around the heat spreader, while the thick plateau in the middle pokes up through the window so the cooler can sit flat on it.",
        "The force is large for such a small part, and it must be even: if the package warped by a few hundredths of a millimetre, some contacts would lose touch. Explode the view to see it swing open on its hinge.",
      ],
      specs: [
        ["Material", "1.2 mm stainless steel"],
        ["Force on the package", "≈450 N"],
      ],
    },
    "load-lever": {
      name: "Load lever",
      category: "mechanical",
      summary: "A bent 2.5 mm stainless-steel wire that locks the load plate down.",
      details: [
        "The lever pivots at the back of the socket. Swung down, it presses a tab on the side of the load plate and tucks under the latch hook on the frame, holding everything closed.",
        "Releasing it — press down, push it outward from under the hook, lift — is always the first step in removing a processor.",
      ],
      specs: [["Material", "2.5 mm stainless-steel wire"]],
    },

    // --- Processor package -------------------------------------------------------
    cpu: {
      name: "Processor package",
      category: "compute",
      summary: "The complete processor: three silicon dies on a small circuit board, under a metal lid.",
      details: [
        "What you buy and hold is the **package**: a 40 × 40 mm substrate carrying three dies, 64 small capacitors and a copper lid. It connects the dies' microscopic contacts to 1718 pads and carries their heat into the cooler.",
        "This processor is built from **chiplets**. Instead of one large die, two small **compute dies** (8 cores each) and one **I/O die** are joined by wiring inside the substrate. Small dies are far cheaper to make, and the same compute die can be reused across a whole family of products.",
        "At full speed it can turn about **230 W** into heat in a few square centimetres of silicon, and it throttles itself to stay below 95 °C.",
      ],
      specs: [
        ["Size", "40 × 40 mm, ≈7 mm tall"],
        ["Dies", "2 × compute (CCD) + 1 × I/O"],
        ["Transistors", "≈16.5 billion"],
        ["Power", "170 W rated · ≈230 W maximum"],
        ["Maximum temperature", "95 °C"],
      ],
      howItWorks: [
        "Manufacturing defects are scattered randomly across a silicon wafer; any die that contains one is lost.",
        "With about one defect per 10 cm², a 71 mm² compute die comes out good ≈93% of the time, while a single 260 mm² die holding the same circuits would succeed only ≈77% of the time.",
        "Splitting the design also lets each part use the best process: cores on expensive 5 nm-class silicon, I/O on cheaper 6 nm-class silicon.",
        "The price is a little extra latency and power whenever data has to cross between dies.",
      ],
    },
    ihs: {
      name: "Heat spreader (lid)",
      category: "cooling",
      summary: "A thick nickel-plated copper lid that protects the dies and spreads their heat across the cooler.",
      details: [
        "The dies are tiny, and their hottest spots produce more than 100 W per square centimetre. The lid's **≈3.5 mm of copper** spreads that heat sideways, so the cooler sees a large, even warm area instead of three small hot spots. Nickel plating stops the copper from tarnishing.",
        "Its unusual outline — **eight legs** with cut-outs between them — leaves room for the capacitors on top of the package. The thick plateau in the middle keeps the total height the same as on the previous socket, so existing coolers still make contact.",
        "Toggle **X-ray** to look through it at the dies.",
      ],
      specs: [
        ["Material", "Nickel-plated copper"],
        ["Copper over the dies", "≈3.5 mm"],
        ["Height above the substrate", "4.55 mm"],
        ["Underside", "Gold-plated for soldering"],
      ],
      didYouKnow:
        "Because the lid is so thick, some enthusiasts remove it (\"delidding\") or grind it thinner — lowering temperatures by several degrees, at the risk of destroying the processor.",
    },
    "solder-tim": {
      name: "Solder thermal interface (indium)",
      category: "cooling",
      summary: "Thin sheets of indium metal soldered between each die and the lid.",
      details: [
        "Even a few micrometres of air between die and lid would block the heat, so the gap must be filled. Instead of paste, this processor uses **solder TIM**: a preform of pure **indium** that melts during assembly and bonds die and lid together. It conducts heat roughly ten times better than good thermal paste.",
        "Indium is very soft, so it absorbs the different thermal expansion of silicon and copper without cracking the dies. To let it wet both surfaces, the backs of the dies and the underside of the lid are **gold-plated** — you can see the gold once the parts separate.",
      ],
      specs: [
        ["Material", "Indium (melts at 157 °C)"],
        ["Thermal conductivity", "≈80 W/m·K (paste ≈5–10)"],
        ["Thickness", "≈0.2–0.3 mm"],
      ],
    },
    "ccd-0": {
      name: "Compute die (CCD 0)",
      category: "compute",
      summary: "Eight cores and 32 MB of L3 cache on a sliver of silicon smaller than a fingernail.",
      details: [
        "This **core complex die** measures about 10.7 × 6.6 mm and holds roughly **6.5 billion transistors**, made on a 5 nm-class process. Eight cores line its two long sides and the L3 cache they share fills the middle.",
        "It is mounted **flip-chip**: the circuitry faces down onto thousands of microscopic solder bumps, so from above you see the polished back of the silicon (gold-plated here). Explode fully to watch it flip over — and then grow into the magnified floorplan.",
      ],
      specs: [
        ["Size", "≈10.7 × 6.6 mm (≈71 mm²)"],
        ["Transistors", "≈6.5 billion"],
        ["Process", "5 nm-class"],
        ["Cores / threads", "8 / 16"],
        ["L3 cache", "32 MB"],
      ],
    },
    "ccd-1": {
      name: "Compute die (CCD 1)",
      category: "compute",
      summary: "The second compute die: eight more cores with their own 32 MB L3 cache.",
      details: [
        "Identical to CCD 0. Its cores can't read the other die's L3 directly: data between the two compute dies travels through the I/O die, which takes several times longer than staying on one die.",
        "Operating systems and games therefore try to keep a program's threads together on one compute die — a good illustration of why *where* data lives matters as much as how fast the cores are.",
      ],
      specs: [
        ["Size", "≈10.7 × 6.6 mm (≈71 mm²)"],
        ["Transistors", "≈6.5 billion"],
        ["Cores / threads", "8 / 16"],
      ],
      didYouKnow:
        "The very same compute die is used in server processors that carry up to 12 of them in one package — one design, many products.",
    },
    "io-die": {
      name: "I/O die",
      category: "io",
      summary: "The traffic hub: memory controllers, PCIe, USB, basic graphics and the links to both compute dies.",
      details: [
        "Everything that enters or leaves the processor passes through this die: two **DDR5** memory channels, **28 PCIe 5.0 lanes** for the graphics card and SSDs, USB ports, and a small **integrated GPU** with display outputs, so the PC works even without a graphics card.",
        "Analog drivers, pads and memory interfaces barely shrink on newer processes, so this die is made on an older, cheaper **6 nm-class** process. Only the compute dies pay for the newest technology — the main economic idea behind chiplets.",
      ],
      specs: [
        ["Size", "≈9.3 × 12.5 mm (≈122 mm²)"],
        ["Transistors", "≈3.4 billion"],
        ["Process", "6 nm-class"],
        ["Memory", "2 × DDR5 channels (128 bits)"],
        ["PCIe", "28 lanes of PCIe 5.0"],
        ["Graphics", "2 compute units"],
      ],
      howItWorks: [
        "A core misses in its caches and sends a request across its fabric link.",
        "The I/O die's data fabric routes it to the right memory controller.",
        "The controller opens a row in a DRAM chip and streams back 64 bytes.",
        "The whole round trip takes about **70–80 ns** — some 400 clock cycles of a core.",
      ],
    },
    substrate: {
      name: "Package substrate",
      category: "signal",
      summary: "A small, extremely dense circuit board that connects the dies to the 1718 lands — and to each other.",
      details: [
        "The substrate is about 1.2 mm thick and built from a dozen or more copper layers in organic resin, with wires only ~10 µm wide. It routes the dies' bumps — packed 0.15–0.2 mm apart — out to lands nearly a millimetre apart, carries the links between the compute dies and the I/O die, and spreads power through solid copper planes.",
        "The dark epoxy fillet around each die is **underfill**: it glues the die down and protects the tiny solder bumps from cracking as the chip heats and cools. The grey bead marks where the lid's legs were glued.",
      ],
      specs: [
        ["Size", "40 × 40 × ≈1.2 mm"],
        ["Layers", "≈12–14 copper layers"],
        ["Die bumps", "tens of thousands"],
      ],
      didYouKnow:
        "The gold triangle in one corner marks pin 1 — line it up with the triangle on the socket frame and the processor can only go in one way.",
    },
    "package-caps": {
      name: "Package capacitors",
      category: "power",
      summary: "64 tiny capacitors in the lid's cut-outs that steady the dies' supply voltage.",
      details: [
        "These sit just millimetres from the dies — closer than any capacitor on the motherboard could — and supply the fastest current spikes.",
        "On older packages they hid under the lid or on the bottom. Here the underside is covered in lands and there was no room for them under the lid, so they moved to the top surface — the reason the lid has its cut-outs.",
      ],
      specs: [
        ["Size", "0402 (1.0 × 0.5 mm)"],
        ["Count", "64 (8 in each cut-out)"],
      ],
    },
    "lga-lands": {
      name: "Land pads (×1718)",
      category: "signal",
      summary: "Flat gold pads on the underside that touch the socket's springs.",
      details: [
        "Each land is a gold-plated copper pad about 0.6 mm across, arranged in staggered rows. Pads are far sturdier than pins — you can't bend them — and allow a denser grid.",
        "The corners are trimmed and the pin-1 corner most of all, which is part of how the pad count comes to exactly 1718. Rotate the view to look under the lifted processor.",
      ],
      specs: [
        ["Count", "1718"],
        ["Pitch", "0.81 × 0.94 mm, staggered"],
        ["Finish", "Gold over nickel"],
      ],
    },

    // --- Magnified compute-die floorplan ----------------------------------------
    "ccd-floorplan": {
      name: "Inside a compute die (×6)",
      category: "compute",
      summary: "A magnified floorplan of compute die 0: eight cores arranged around a shared L3 cache.",
      details: [
        "This is how the 10.7 × 6.6 mm die is laid out. Each **core** has its private **L2 cache** beside it, and all eight share the **L3 cache** in the middle. Along the bottom edge are the **fabric link** to the I/O die and the circuits that manage power and clocks.",
        "Finely striped areas are **SRAM** (cache memory); speckled areas are **logic**. Cache takes up roughly half of the die — feeding the cores matters as much as the cores themselves. Click any block to learn more.",
      ],
      specs: [
        ["Magnification", "×6"],
        ["Cores", "8"],
        ["Cache", "8 × 1 MB L2 · 32 MB shared L3"],
        ["Transistors", "≈6.5 billion"],
      ],
      howItWorks: [
        "**L1** (64 KB per core): answers in 4–5 cycles, **≈1 ns**.",
        "**L2** (1 MB per core): ≈14 cycles, **≈3 ns**.",
        "**L3** (32 MB shared): ≈50 cycles, **≈10 ns**.",
        "**DRAM** (gigabytes, off-chip): **≈80 ns** — about 400 cycles, during which a core could have executed over a thousand instructions.",
        "Each level is bigger but slower; programs run fast because most accesses hit in the small, fast levels.",
      ],
    },
    "fp-core-0": coreInfo(0),
    "fp-core-1": coreInfo(1),
    "fp-core-2": coreInfo(2),
    "fp-core-3": coreInfo(3),
    "fp-core-4": coreInfo(4),
    "fp-core-5": coreInfo(5),
    "fp-core-6": coreInfo(6),
    "fp-core-7": coreInfo(7),
    "fp-l2-0": l2Info(0),
    "fp-l2-1": l2Info(1),
    "fp-l2-2": l2Info(2),
    "fp-l2-3": l2Info(3),
    "fp-l2-4": l2Info(4),
    "fp-l2-5": l2Info(5),
    "fp-l2-6": l2Info(6),
    "fp-l2-7": l2Info(7),
    "fp-l3": {
      name: "L3 cache (32 MB, shared)",
      category: "memory",
      summary: "The die's large shared cache: 32 MB that all eight cores can use, about 10 ns away.",
      details: [
        "Each bit is stored in an **SRAM cell** of six transistors, so 32 MB alone takes about 1.6 billion transistors — a quarter of the die. It is split into **eight 4 MB slices**, one beside each core, and any core can reach any slice in about 50 cycles.",
        "It mostly holds data the cores' L2 caches have recently evicted (a *victim cache*), so cores working on shared data find it here instead of going all the way to DRAM, which is roughly eight times slower.",
      ],
      specs: [
        ["Size", "32 MB (8 × 4 MB slices)"],
        ["Latency", "≈50 cycles ≈ 10 ns"],
        ["Bit cell", "6-transistor SRAM"],
      ],
      didYouKnow:
        "Some versions of this processor stack an extra 64 MB cache die directly on top of the L3, bonded copper-to-copper without solder — tripling the cache, which helps games in particular.",
    },
    "fp-fabric": {
      name: "Fabric link to the I/O die",
      category: "signal",
      summary: "The high-speed link that connects this compute die to the I/O die through the substrate.",
      details: [
        "All traffic to memory, to PCIe devices and to the other compute die leaves through this narrow strip of transmitter and receiver circuits (PHYs), across wires in the package substrate.",
        "It moves about **64 GB/s** toward the cores and **32 GB/s** back. Signalling between dies costs more energy than wires on a die — around 2 picojoules per bit — which is the main price paid for using chiplets.",
      ],
      specs: [
        ["Bandwidth", "≈64 GB/s read · ≈32 GB/s write"],
        ["Clock", "≈2 GHz fabric clock"],
        ["Energy", "≈2 pJ per bit"],
      ],
    },
    "fp-control": {
      name: "Power management, clocks & test",
      category: "control",
      summary: "Circuits that set each core's voltage and speed, generate clocks and test the die.",
      details: [
        "Each core has its own clock. A power-management controller reads dozens of temperature and current sensors and adjusts every core's frequency about a thousand times per second — letting one or two cores boost to ≈5.7 GHz when the others are idle, and pulling all of them back when the chip nears 95 °C.",
        "The strip also holds the clock generators (PLLs), fuses that store each die's factory calibration, and the test and debug logic used to sort dies on the wafer.",
      ],
      specs: [
        ["Clock control", "per core"],
        ["Update rate", "≈1 ms"],
      ],
    },

    // --- Magnified core ------------------------------------------------------------
    "core-floorplan": {
      name: "Inside one core (×16)",
      category: "compute",
      summary: "Core 4 magnified: the pipeline units that make up a CPU core.",
      details: [
        "Instructions move through a core like an assembly line. The **front end** (top row) predicts where the program is going, fetches instructions and decodes them. The **back end** (bottom row) executes them and moves data to and from the caches. The L2 cache sits on the side facing the shared L3.",
        "Each unit is a block you can click. Notice how much of the core is memory: the L1 caches, the op cache and the L2 together take up nearly half of it.",
      ],
      specs: [
        ["Magnification", "×16"],
        ["Pipeline", "≈19 stages"],
        ["In flight", "up to ≈320 instructions"],
        ["Peak", "6 operations dispatched per cycle"],
      ],
      howItWorks: [
        "**Predict**: the branch predictor guesses which instructions come next.",
        "**Fetch**: 32 bytes of instructions per cycle are read from the L1 instruction cache.",
        "**Decode**: x86 instructions become simple micro-operations (or come ready-made from the op cache).",
        "**Rename & schedule**: each operation waits until its inputs are ready, regardless of program order.",
        "**Execute**: ALUs, address generators and vector units do the work; loads and stores go through the L1 data cache.",
        "**Retire**: results are committed in the original program order, so software never notices the reshuffling.",
      ],
    },
    "cu-fetch": {
      name: "Branch prediction + fetch",
      category: "control",
      summary: "Guesses where the program goes next and fetches instructions from there.",
      details: [
        "Roughly every fifth instruction is a branch (an *if*, a loop, a function call). Waiting to find out which way each one goes would stall the pipeline for a dozen cycles every time, so the core **predicts** — using large tables of past behaviour — and fetches ahead speculatively.",
        "Modern predictors are right more than 95% of the time, often 98–99%. A wrong guess throws away the speculative work and costs about 11–15 cycles.",
      ],
      specs: [
        ["Accuracy", "typically > 95%"],
        ["Misprediction cost", "≈11–15 cycles"],
        ["Fetch", "32 bytes per cycle"],
      ],
    },
    "cu-l1i": {
      name: "L1 instruction cache",
      category: "memory",
      summary: "32 KB of the program's instructions, right beside the fetch unit.",
      details: [
        "The fetch unit reads instructions from here every cycle. Because programs spend most of their time in small loops, 32 KB is enough to hit almost every time; misses go to the L2.",
      ],
      specs: [
        ["Size", "32 KB, 8-way"],
        ["Latency", "≈4 cycles (≈1 ns)"],
      ],
    },
    "cu-decode": {
      name: "Decoders + op cache",
      category: "control",
      summary: "Translates x86 instructions into simple internal micro-operations — and remembers the results.",
      details: [
        "x86 instructions are 1 to 15 bytes long and some do several things at once, so decoding them is hard work: four decoders handle up to **4 instructions per cycle**.",
        "The resulting micro-operations are saved in an **op cache** of about 6,750 entries. Loops are then replayed from the op cache at up to 9 operations per cycle, and the decoders can rest — saving power.",
      ],
      specs: [
        ["Decoders", "4 instructions per cycle"],
        ["Op cache", "≈6,750 micro-operations"],
      ],
    },
    "cu-int": {
      name: "Integer execution",
      category: "compute",
      summary: "ALUs that add, compare, shift and branch — plus the units that compute memory addresses.",
      details: [
        "**Four ALUs** perform whole-number arithmetic and logic, and **three address-generation units (AGUs)** work out where loads and stores should go.",
        "In front of them sit the out-of-order machinery: a **renamer** that maps the 16 architectural registers onto ≈224 physical ones, **schedulers** that release each operation as soon as its inputs are ready, and a **reorder buffer** of 320 entries that keeps track of program order.",
      ],
      specs: [
        ["ALUs / AGUs", "4 / 3"],
        ["Physical registers", "≈224 integer"],
        ["Reorder buffer", "320 entries"],
      ],
    },
    "cu-fp": {
      name: "Floating-point / vector unit",
      category: "compute",
      summary: "Wide SIMD units for decimal maths, graphics, media and AI.",
      details: [
        "**SIMD** means single instruction, multiple data: one instruction works on a whole vector, for example sixteen 32-bit numbers held in a 512-bit register. **Fused multiply-add (FMA)** units compute a × b + c in a single step.",
        "Each core can do 32 single-precision operations per cycle, so all 16 cores together reach about **2.5 trillion operations per second** — useful for video encoding, physics and running small AI models.",
      ],
      specs: [
        ["Vector registers", "32 × 512-bit"],
        ["Throughput", "32 FP32 operations per cycle"],
        ["Instruction sets", "SSE, AVX2, AVX-512"],
      ],
    },
    "cu-lsu": {
      name: "Load/store unit",
      category: "memory",
      summary: "Moves data between the registers and the L1 data cache — up to three memory operations per cycle.",
      details: [
        "It keeps track of roughly 88 loads and 64 stores in flight, translates virtual addresses to physical ones, and forwards data straight from a pending store to a later load that needs it.",
        "It also checks that loads run early only when it is safe: if a store to the same address turns up later, the affected instructions are replayed.",
      ],
      specs: [
        ["Per cycle", "up to 3 memory operations (at most 2 stores)"],
        ["In flight", "≈88 loads + 64 stores"],
      ],
    },
    "cu-l1d": {
      name: "L1 data cache",
      category: "memory",
      summary: "The fastest data memory in the chip: 32 KB that answers in about 1 ns.",
      details: [
        "Every load checks here first, and in typical programs well over 90% of them hit. Its small size is what makes it fast: signals only have to cross a fraction of a millimetre.",
      ],
      specs: [
        ["Size", "32 KB, 8-way"],
        ["Latency", "4–5 cycles ≈ 1 ns"],
        ["Bandwidth", "up to 64 bytes read per cycle"],
      ],
    },
    "cu-l2": {
      name: "L2 cache (core 4)",
      category: "memory",
      summary: "1 MB of private cache, the next stop after the L1 caches — about 3 ns away.",
      details: [
        "It holds a copy of everything in the core's L1 caches plus a much larger working set. Misses here go out to the shared L3 in the middle of the die.",
      ],
      specs: [
        ["Size", "1 MB, 8-way"],
        ["Latency", "≈14 cycles ≈ 3 ns"],
      ],
    },
  },
};
