import type { DeviceInfo } from "../types";

export const gpu: DeviceInfo = {
  id: "gpu",
  name: "Graphics Card",
  shortName: "GPU",
  model: "Flagship-class triple-fan desktop graphics card",
  tagline: "Thousands of tiny cores, a wall of copper and three fans.",
  intro: [
    "A graphics card is a computer inside your computer. At its heart is the **GPU**, a chip with thousands of simple cores that all work at once — ideal for drawing millions of pixels, and for the matrix maths behind AI.",
    "Around it sit its own ultra-fast memory (**VRAM**), a miniature power plant (the **VRM**) that turns 12 volts into about 1 volt at hundreds of amps, and a cooler big enough to remove the heat of a small space heater.",
    "Press **Explode** to take it apart layer by layer — when fully open, the GPU die flips over to show the circuitry hidden on its underside.",
  ],
  specs: [
    ["GPU", "≈640 mm² die · 144 SMs · 18,432 shader cores"],
    ["Memory", "24 GB GDDR7 · 384-bit bus · ≈1.5 TB/s"],
    ["Board power", "up to ≈450 W"],
    ["Host interface", "PCI Express 5.0 ×16"],
    ["Outputs", "3× DisplayPort 2.1, 1× HDMI 2.1"],
    ["Size", "300 × 124 × 62 mm (3 slots)"],
    ["Cooling", "Vapor chamber, 8 heat pipes, 146 fins, 3 fans"],
  ],
  camera: { position: [250, 240, 310], target: [0, 18, 0] },
  size: 320,
  parts: {
    // --- Cooler ------------------------------------------------------------
    cooler: {
      name: "Cooler assembly",
      category: "cooling",
      summary: "Everything that moves heat out of the chips and into the air.",
      details: [
        "A flagship GPU can turn **450 watts** of electricity into heat inside a chip smaller than a postage stamp. Left alone, the silicon would pass 100 °C in about a second.",
        "The cooler moves that heat in stages: from the die into a **vapor chamber**, along **heat pipes**, into a large surface area of **aluminium fins**, and finally into air pushed through by the **fans**.",
      ],
      specs: [
        ["Heat removed", "up to ≈450 W"],
        ["Typical GPU temperature", "60–80 °C under load"],
        ["Mass", "≈1.5 kg (most of the card's weight)"],
      ],
      howItWorks: [
        "Heat flows from hot to cold, so the cooler's job is to give it a path with as little resistance as possible.",
        "Metals with high conductivity (copper, then aluminium) carry it away from the die.",
        "Phase change inside the vapor chamber and heat pipes moves heat much faster than solid metal could.",
        "Air finally carries it away — and air is a poor conductor, which is why the fins need so much area.",
      ],
    },
    shroud: {
      name: "Shroud & fan assembly",
      category: "cooling",
      summary: "The outer cover that holds the fans and channels air through the heatsink.",
      details: [
        "The shroud guides air from the fans down into the fin stack instead of letting it spill sideways. It also gives the card its look and protects the fins.",
        "Use **X-ray** to see through it.",
      ],
    },
    "shroud-frame": {
      name: "Shroud",
      category: "structure",
      summary: "Die-cast aluminium and plastic cover with three fan openings.",
      details: [
        "Each fan sits in a circular duct so that the air it pushes goes straight down into the fins. The tight gap between blade tips and the duct wall improves pressure and reduces noise.",
        "The fan motors hang from thin struts on the underside — those struts are shaped to disturb the airflow as little as possible.",
      ],
      specs: [["Material", "Die-cast aluminium + PC/ABS plastic"]],
    },
    fans: {
      name: "Axial fans (×3)",
      category: "cooling",
      summary: "Three ≈95 mm fans push air down through the fin stack.",
      details: [
        "Each fan has **11 swept blades** joined at the tips by a **barrier ring**. The ring stops air from leaking around the blade tips, which raises static pressure — important because the fins resist airflow.",
        "The middle fan spins the **opposite way** to its neighbours, so where two fans meet the air moves in the same direction instead of colliding. This reduces turbulence and noise.",
        "At light loads the fans stop completely (**zero-RPM mode**); the heatsink alone can handle a few tens of watts.",
      ],
      specs: [
        ["Diameter", "≈95 mm"],
        ["Blades", "11, with tip ring"],
        ["Speed", "0 – ≈3,000 RPM (PWM controlled)"],
        ["Bearing", "Fluid dynamic bearing"],
      ],
      didYouKnow:
        "Fan speed is set dozens of times a second from the GPU temperature using a 25 kHz PWM signal — far above human hearing, so the speed control itself makes no whine.",
    },
    "light-bar": {
      name: "LED light bar",
      category: "control",
      summary: "Addressable RGB LEDs behind a diffuser along the top edge.",
      details: [
        "Purely cosmetic: a small microcontroller drives a strip of addressable LEDs that can show colours, effects or the GPU temperature.",
      ],
    },
    heatsink: {
      name: "Heatsink",
      category: "cooling",
      summary: "Vapor chamber, heat pipes and fins working as one heat exchanger.",
      details: [
        "The heatsink spreads the GPU's heat from a 6 cm² die to more than **a square metre** of fin surface. That huge area is what lets slow-moving air carry away hundreds of watts.",
      ],
      specs: [
        ["Fin surface area", "≈1 m²"],
        ["Heat pipes", "8 × 6 mm"],
      ],
    },
    "vapor-chamber": {
      name: "Vapor chamber",
      category: "cooling",
      summary: "A flat, sealed copper chamber that spreads heat using boiling water.",
      details: [
        "Inside this nickel-plated copper plate is a partial vacuum, a copper **wick** and a few drops of **water**. At such low pressure, water boils at around 30 °C.",
        "Where the plate touches the hot die the water evaporates, absorbing a lot of energy. The vapor rushes to cooler areas of the chamber, condenses, releases that energy, and the wick pulls the liquid back. The whole plate stays within a few degrees of uniform temperature.",
      ],
      specs: [
        ["Material", "Nickel-plated copper"],
        ["Working fluid", "Water under partial vacuum"],
        ["Effective conductivity", "several × that of solid copper"],
      ],
      howItWorks: [
        "Die heats the bottom of the chamber; water in the wick boils.",
        "Vapor spreads across the chamber in milliseconds.",
        "Vapor condenses on the cooler top surface where heat pipes and fins take the heat away.",
        "Capillary action in the wick returns the liquid to the hot spot.",
      ],
    },
    "thermal-paste": {
      name: "Thermal paste",
      category: "cooling",
      summary: "A thin grey compound that fills microscopic gaps between die and cooler.",
      details: [
        "Even polished metal surfaces are rough at the micron scale, and trapped air is an excellent insulator. A layer of paste a few tens of micrometres thick fills those voids so heat can cross the joint.",
        "It is not a great conductor itself (≈5–12 W/m·K versus ≈400 for copper), so **thinner is better** — just enough to fill the gaps.",
      ],
      specs: [
        ["Thickness", "≈20–50 µm when clamped"],
        ["Conductivity", "≈5–12 W/m·K"],
      ],
    },
    "heat-pipes": {
      name: "Heat pipes (×8)",
      category: "cooling",
      summary: "Sealed copper tubes that carry heat from the base to the far ends of the fins.",
      details: [
        "A heat pipe works like a vapor chamber stretched into a tube: water boils at the hot end, the vapor travels down the pipe, condenses in the cool fin stack and returns through a **sintered copper wick** lining the walls.",
        "This moves heat dozens of times better than a solid copper rod of the same size, so the outermost fins — 15 cm from the GPU — still do useful work.",
        "Notice the U-bends: each pipe leaves the base, runs the length of the card through the fins and turns back, so every fin is crossed by several pipes.",
      ],
      specs: [
        ["Diameter", "6 mm"],
        ["Plating", "Nickel (prevents oxidation, allows soldering)"],
        ["Capacity", "≈50–80 W each"],
      ],
    },
    "fin-stack": {
      name: "Aluminium fin stack",
      category: "cooling",
      summary: "146 thin aluminium plates that hand the heat over to the air.",
      details: [
        "Air is a poor conductor, so the only way to pass hundreds of watts into it is with **area**. Each fin is just 0.4 mm thick and spaced 1.9 mm from the next, giving roughly one square metre of surface.",
        "The spacing is a compromise: tighter fins add area but resist airflow more, which the fans must overcome with pressure.",
      ],
      specs: [
        ["Fins", "146"],
        ["Thickness / pitch", "0.4 mm / 1.9 mm"],
        ["Material", "Aluminium (light, conductive, cheap)"],
      ],
    },
    "base-plate": {
      name: "Cooling base plate",
      category: "cooling",
      summary: "A black aluminium frame that cools the memory and power stages and stiffens the board.",
      details: [
        "The GPU is not the only hot part. The memory chips and the power stages each dissipate several watts. Milled **pedestals** on the underside of this plate reach down to them through **thermal pads**.",
        "Screwed through the PCB into the backplate, it also keeps the heavy card from bending.",
      ],
    },
    "thermal-pads": {
      name: "Thermal pads",
      category: "cooling",
      summary: "Soft, squishy pads that bridge the gaps between chips and the base plate.",
      details: [
        "Chips on a board are not all the same height, so instead of paste the cooler uses compressible silicone pads filled with ceramic particles. They fill gaps of 0.5–3 mm while conducting heat.",
        "Pad thickness matters: too thick and the cooler won't press firmly on the GPU die; too thin and the memory won't touch the plate at all.",
      ],
      specs: [["Conductivity", "≈3–15 W/m·K"]],
    },

    // --- Board ---------------------------------------------------------------
    pcb: {
      name: "Printed circuit board",
      category: "structure",
      summary: "A 14-layer board that wires the GPU, memory and power delivery together.",
      details: [
        "What looks like one board is a sandwich of around **14 copper layers** separated by fibreglass-epoxy (FR-4). Thick inner copper planes carry hundreds of amps to the GPU; thin traces carry signals at up to **32 gigabits per second**.",
        "Those high-speed traces are engineered like microwave waveguides: their width, spacing and length are tightly controlled so signals arrive at the same time and don't reflect.",
        "The board is short — the third fan blows straight through the cooler and out the back (**flow-through** design).",
      ],
      specs: [
        ["Layers", "≈14"],
        ["Thickness", "1.6–2.0 mm"],
        ["Solder mask", "Matte black"],
      ],
      didYouKnow:
        "Look closely at the bus between the GPU and each memory chip: at 32 Gbit/s a signal travels only about 5 mm along a trace during a single bit, so trace lengths are matched to fractions of a millimetre.",
    },
    "gpu-package": {
      name: "GPU package",
      category: "compute",
      summary: "The graphics processor: a silicon die mounted on a substrate that connects it to the board.",
      details: [
        "This is the brain of the card. The shiny rectangle is the **die** — the silicon itself. It sits on a **substrate**, a small high-density circuit board that fans the die's tens of thousands of microscopic connections out to about **2,000 solder balls** underneath.",
        "Explode the card fully to see the die lift and flip over: the circuitry is on the side facing **down** (a \"flip-chip\" design), so what you normally see is the polished back of the silicon.",
      ],
      specs: [
        ["Die size", "≈24 × 26 mm (≈640 mm²)"],
        ["Transistors", "≈75–90 billion"],
        ["Process", "≈4–5 nm class"],
        ["Package balls", "≈2,000 at 1 mm pitch"],
      ],
    },
    "gpu-die": {
      name: "GPU die",
      category: "compute",
      summary: "A slab of silicon holding about 80 billion transistors organised into 144 streaming multiprocessors.",
      details: [
        "The die is organised as **12 graphics processing clusters (GPCs)**, each holding **12 streaming multiprocessors (SMs)**. An SM is the GPU's equivalent of a CPU core: it has its own schedulers, register file, 128 arithmetic lanes, tensor cores for matrix maths, a ray-tracing core and an L1 cache.",
        "Through the centre runs the **L2 cache**, shared by every SM. Along the left and right edges are the **memory PHYs** — analog circuits that drive the 384 data lines to the memory chips. The top edge holds the PCI Express interface, display engines and video encoders.",
        "Running thousands of threads at once is the GPU's trick: while some wait for memory, others compute, so the arithmetic units stay busy.",
      ],
      specs: [
        ["GPCs × SMs", "12 × 12 = 144"],
        ["FP32 lanes", "144 × 128 = 18,432"],
        ["Tensor cores", "576"],
        ["L2 cache", "tens of MB"],
        ["Clock", "≈2.5 GHz"],
      ],
      howItWorks: [
        "Work arrives as thousands of small threads, grouped into **warps** of 32 that execute the same instruction together.",
        "Each SM juggles dozens of warps; every cycle its schedulers pick warps that are ready and issue their instructions.",
        "The 32 lanes of a warp perform the same operation on different data — e.g. shading 32 pixels, or multiplying 32 numbers of a matrix.",
        "Tensor cores multiply small matrices in one step, which is why GPUs are so good at neural networks.",
      ],
      didYouKnow:
        "The pattern you see when the die flips over is a stylised floorplan: regular, finely striped areas are SRAM (cache and register files); noisy areas are logic; the gold rows at the edges are I/O circuits.",
    },
    "gpu-substrate": {
      name: "Package substrate",
      category: "signal",
      summary: "A tiny, ultra-dense circuit board that connects the die to the main PCB.",
      details: [
        "The die's connections (\"bumps\") are only about 0.15 mm apart — far too fine to solder to a normal PCB. The substrate's thin build-up layers route them outward to balls 1 mm apart.",
        "It also carries small capacitors right next to the die to smooth its power supply during sudden load changes.",
      ],
      specs: [
        ["Material", "Organic build-up (ABF) layers"],
        ["Size", "50 × 50 mm"],
      ],
    },
    vram: {
      name: "GDDR7 memory (×12)",
      category: "memory",
      summary: "Twelve 2 GB memory chips that feed the GPU at about 1.5 terabytes per second.",
      details: [
        "Each chip connects to the GPU with its own **32-bit** channel; twelve chips make a **384-bit** bus. GDDR7 sends data at up to 32 Gbit/s per pin using three-level signalling (**PAM3**), packing 1.5 bits into each symbol.",
        "That bandwidth matters: a GPU can do tens of trillions of operations per second, and keeping it fed with data is often the real bottleneck — especially for AI models whose weights must be streamed from memory for every token.",
        "The chips sit as close to the GPU as possible, in a ring, to keep the traces short.",
      ],
      specs: [
        ["Capacity", "12 × 2 GB = 24 GB"],
        ["Bus width", "12 × 32 = 384 bits"],
        ["Data rate", "32 Gbit/s per pin"],
        ["Bandwidth", "384 × 32 ÷ 8 ≈ 1,536 GB/s"],
        ["Package", "BGA, ≈12 × 14 mm"],
      ],
      howItWorks: [
        "Inside each chip, data lives in billions of tiny capacitors (DRAM cells) arranged in banks.",
        "The GPU's memory controller opens a row in a bank, then streams bursts of data from it.",
        "Because each capacitor slowly leaks, every row is refreshed thousands of times per second.",
      ],
    },
    vrm: {
      name: "Voltage regulator module (VRM)",
      category: "power",
      summary: "18 power phases that convert 12 V into ≈1 V at up to 500 amps.",
      details: [
        "The GPU runs at roughly **1 volt** but draws up to **450 watts** — that is around **450 amps**, comparable to what a car's starter motor draws. Delivering it at 12 V and converting right next to the chip keeps the current in the cables and connector manageable.",
        "The VRM is a **multi-phase buck converter**: 15 phases feed the GPU core and 3 the memory. Each phase switches on and off around a million times a second; the phases take turns (\"interleave\") so their ripples cancel out.",
      ],
      specs: [
        ["Phases", "15 (GPU core) + 3 (memory)"],
        ["Input / output", "12 V → ≈0.7–1.1 V"],
        ["Peak current", "≈500 A"],
        ["Switching frequency", "≈0.5–1 MHz per phase"],
        ["Efficiency", "≈90%"],
      ],
      howItWorks: [
        "A power stage connects the choke to 12 V for a short time, building current.",
        "It then connects the choke to ground; the inductor keeps the current flowing into the output capacitors.",
        "The fraction of time it spends connected to 12 V (about 1/12, the **duty cycle**) sets the output voltage: 12 V × 1/12 ≈ 1 V.",
        "The controller adjusts each phase's timing thousands of times per second to hold the voltage steady as the load jumps.",
      ],
    },
    "power-stages": {
      name: "Power stages",
      category: "power",
      summary: "Integrated MOSFET switches and drivers — one per phase, each handling up to 70 A.",
      details: [
        "Each small package contains two power MOSFETs (the high-side and low-side switches), the gate driver that flips them in nanoseconds, and sensors that report current and temperature back to the controller.",
        "Because they switch hundreds of amps, even a few milliohms of resistance turns into heat — so they are cooled by thermal pads touching the base plate.",
      ],
      specs: [
        ["Rating", "≈70 A each"],
        ["Package", "≈5 × 6 mm QFN"],
      ],
    },
    chokes: {
      name: "Chokes (inductors)",
      category: "power",
      summary: "Grey blocks that store energy in a magnetic field to smooth the switched current.",
      details: [
        "A choke is a coil of thick copper wire inside a ferrite or metal-powder core. Inductors resist changes in current, so they turn the power stage's sharp on/off pulses into a smooth flow.",
        "The marking **R22** means 0.22 µH (the \"R\" marks the decimal point).",
      ],
      specs: [
        ["Inductance", "0.22 µH"],
        ["Current rating", "≈60–70 A"],
      ],
      didYouKnow:
        "The faint high-pitched \"coil whine\" some cards make at very high frame rates is these chokes physically vibrating with the changing magnetic forces.",
    },
    "output-caps": {
      name: "Output capacitors",
      category: "power",
      summary: "Polymer tantalum capacitors that hold the GPU's supply voltage steady.",
      details: [
        "When the GPU suddenly goes from idle to full load, its current can jump by hundreds of amps in microseconds — faster than the VRM can react. These capacitors act as local reservoirs, supplying charge until the regulator catches up.",
      ],
      specs: [
        ["Type", "Polymer tantalum (POSCAP)"],
        ["Value", "470 µF, 2.5 V"],
      ],
    },
    "input-caps": {
      name: "Input capacitors",
      category: "power",
      summary: "Aluminium polymer capacitors that buffer the 12 V supply from the power connector.",
      details: [
        "Each time a power stage switches on it draws a burst of current from the 12 V rail. These capacitors supply those bursts locally so the long cable from the power supply only has to provide the average current.",
        "The cross scored into the top is a pressure vent; the coloured mark shows polarity.",
      ],
      specs: [
        ["Value", "270 µF, 16 V"],
        ["Type", "Solid aluminium polymer"],
      ],
    },
    "pwm-controller": {
      name: "PWM controller",
      category: "control",
      summary: "The VRM's conductor: tells each phase when to switch.",
      details: [
        "This digital controller reads the voltage the GPU requests, measures the output and each phase's current, and generates the timing signals for every power stage. It balances the load between phases and adds or drops phases as demand changes.",
        "It also enforces the card's power limits and protects against over-current and over-temperature.",
      ],
    },
    "power-connector": {
      name: "12V-2x6 power connector",
      category: "power",
      summary: "A 16-pin socket that brings up to 600 W from the power supply.",
      details: [
        "Twelve large pins carry the current (six at +12 V, six at ground); four small **sense pins** tell the card how much power the cable and supply can safely deliver.",
        "Together with the 75 W available through the PCIe slot, this connector lets a single card draw over 600 W.",
      ],
      specs: [
        ["Pins", "12 power + 4 sense"],
        ["Rating", "up to 600 W (≈9.5 A per pin)"],
      ],
      didYouKnow:
        "At 600 W each power pin carries about 8 amps. A slightly loose plug concentrates that current through a few pins, which is why these connectors are designed to be pushed in fully and latched.",
    },
    "pcie-connector": {
      name: "PCIe ×16 edge connector",
      category: "io",
      summary: "Gold-plated contacts that plug into the motherboard: data lanes plus up to 75 W of power.",
      details: [
        "164 contacts (82 per side) carry 16 bidirectional high-speed **lanes**, each a pair of wires in each direction. With PCIe 5.0 each lane runs at 32 GT/s, giving about **64 GB/s in each direction**.",
        "The notch (key) prevents the card from being inserted the wrong way. Some contacts are shorter than others so they connect last — letting the system detect that the card is fully seated.",
      ],
      specs: [
        ["Contacts", "164 (82 per side)"],
        ["Bandwidth", "≈64 GB/s each way (PCIe 5.0 ×16)"],
        ["Slot power", "75 W"],
        ["Plating", "Hard gold over nickel"],
      ],
    },
    "display-outputs": {
      name: "Display outputs",
      category: "io",
      summary: "Three DisplayPort and one HDMI socket that send finished frames to monitors.",
      details: [
        "The GPU's display engine reads each finished frame from memory and streams it out over these ports, pixel by pixel, many times a second.",
        "**DisplayPort 2.1** carries up to 80 Gbit/s — enough for 4K at 240 Hz or 8K at 60 Hz with compression. **HDMI 2.1** reaches 48 Gbit/s and is common on TVs.",
      ],
      specs: [
        ["DisplayPort 2.1", "3 × (up to 80 Gbit/s)"],
        ["HDMI 2.1", "1 × (48 Gbit/s)"],
      ],
    },
    "bios-chip": {
      name: "Video BIOS (firmware) chip",
      category: "control",
      summary: "A small flash memory holding the card's firmware.",
      details: [
        "This 8-pin chip stores the **VBIOS**: the code and tables the card needs before any driver loads — memory timings, voltage/frequency curves, power limits, fan curves, and a basic display driver so you can see the boot screen.",
      ],
      specs: [
        ["Type", "SPI NOR flash"],
        ["Capacity", "2 MB"],
      ],
    },
    "fan-headers": {
      name: "Fan & lighting headers",
      category: "io",
      summary: "Small connectors where the fans and LED bar plug into the board.",
      details: [
        "The 4-pin fan headers carry 12 V, ground, a **tachometer** signal (the fan reports its speed) and a **PWM** signal (the card sets its speed). The black 3-pin header drives the addressable LEDs.",
      ],
    },
    "support-ics": {
      name: "Support chips",
      category: "control",
      summary: "Small helper ICs: display signal re-timers, sensors, an EEPROM and a microcontroller.",
      details: [
        "Not everything on a graphics card is done by the GPU. Small chips near the outputs **re-time** the high-speed display signals so they arrive clean at the connector; others monitor current and temperature, store configuration (EEPROM) or run the fans and LEDs.",
        "Each has its own little cluster of decoupling capacitors and pull-up resistors around it.",
      ],
    },
    "smd-passives": {
      name: "SMD capacitors & resistors",
      category: "power",
      summary: "Hundreds of rice-grain-sized parts that filter power and set signal levels.",
      details: [
        "The tan parts are **multilayer ceramic capacitors (MLCCs)**: each is a stack of hundreds of thin ceramic and metal layers. Placed right next to chips, they supply the instantaneous current bursts that longer power paths can't deliver fast enough (\"decoupling\").",
        "The black ones are **resistors**, used for pull-ups, current sensing and setting reference voltages.",
        "Most here are the 0402 size: 1.0 × 0.5 mm.",
      ],
      specs: [
        ["Size", "0402 (1.0 × 0.5 mm) and 0603"],
        ["Count", "hundreds per side"],
      ],
    },
    "back-mlcc": {
      name: "MLCC array (behind the GPU)",
      category: "power",
      summary: "A tight grid of capacitors on the back of the board, directly under the GPU.",
      details: [
        "The fastest current spikes happen in nanoseconds. At those speeds even a few millimetres of copper add too much inductance, so designers place a dense grid of ceramic capacitors on the back of the board, directly beneath the GPU's power balls — the shortest possible path.",
      ],
    },
    "retention-bracket": {
      name: "Retention bracket",
      category: "structure",
      summary: "A spring-steel X-bracket that clamps the cooler evenly onto the GPU.",
      details: [
        "Four spring-loaded screws pull the cooler toward this bracket from the other side of the board. The springs set a precise, even pressure on the die — too little and heat can't cross the joint; too much and the board bends or the die cracks.",
      ],
    },
    "io-bracket": {
      name: "I/O bracket",
      category: "structure",
      summary: "The steel plate that screws the card to the case and holds the display ports.",
      details: [
        "This is the only part of the card you see from the back of a PC. It positions the connectors, anchors the card to the case with screws through its tabs, and its slots let some hot air escape.",
        "It is three slots wide because the cooler is about 60 mm thick.",
      ],
    },
    // --- Deep dive: inside the GPU die -----------------------------------------
    "inside-gpu": {
      name: "Inside the GPU die",
      category: "compute",
      summary: "Magnified views of the die's floorplan and of one of its 144 streaming multiprocessors.",
      details: [
        "These views appear when the card is fully exploded. Left: the circuit side of the die at 3.6× real size, with its functional regions outlined. Right: one streaming multiprocessor (SM) — the GPU's equivalent of a CPU core — magnified about 60×.",
        "Click any region or unit to see what it does.",
      ],
    },
    "die-map": {
      name: "Die floorplan (×3.6)",
      category: "compute",
      summary: "The die's layout: compute clusters around a central cache, memory interfaces at the edges.",
      details: [
        "A GPU die is organised for **throughput**: most of its area is a regular array of identical compute clusters. The shared **L2 cache** runs through the middle, the **memory PHYs** line the left and right edges, and the top edge holds the host interface, display and video engines.",
        "The colourful texture is a stylised die shot: finely striped areas are SRAM (caches, register files), noisy areas are logic, and the gold rows are I/O circuits.",
      ],
    },
    gpc: {
      name: "Graphics processing clusters (×12)",
      category: "compute",
      summary: "Twelve identical clusters, each with a raster engine and 12 streaming multiprocessors.",
      details: [
        "Each GPC contains a **raster engine** (which turns triangles into pixels) and six texture processing clusters of two SMs each — **12 SMs per GPC, 144 in total**.",
        "Because the GPCs are identical, one design can be sold in many versions: chips with manufacturing defects simply have a few SMs or GPCs switched off. Consumer flagships typically ship with around 128–170 of the SMs enabled.",
      ],
      specs: [
        ["SMs per GPC", "12"],
        ["GPCs", "12"],
      ],
    },
    "l2-cache": {
      name: "L2 cache",
      category: "memory",
      summary: "A large on-chip cache shared by every SM, saving trips to the slower GDDR7.",
      details: [
        "Every memory request from the SMs goes through the L2. Modern GPUs carry **tens of megabytes** of it — far more than older designs — because a hit in L2 is several times faster and far cheaper in energy than reading from VRAM.",
        "The large striped areas you see are SRAM arrays: six transistors per bit, packed as densely as the process allows.",
      ],
      specs: [
        ["Size", "≈64–128 MB (design dependent)"],
        ["Shared by", "all 144 SMs"],
      ],
    },
    "memory-phy": {
      name: "Memory controllers & GDDR7 PHYs",
      category: "memory",
      summary: "Twelve 32-bit interfaces that drive the data lines to the memory chips.",
      details: [
        "Each controller schedules reads and writes for one GDDR7 chip, and its **PHY** (physical layer) is the analog circuitry that actually drives and receives the 32 Gbit/s three-level PAM3 signals on the board.",
        "Analog I/O circuits barely shrink with new manufacturing processes, which is why they take up such a large strip of expensive silicon along the die's edges.",
      ],
      specs: [
        ["Controllers", "12 × 32-bit = 384-bit"],
        ["Signalling", "PAM3, up to 32 Gbit/s per pin"],
      ],
    },
    crossbar: {
      name: "Crossbar (on-chip network)",
      category: "signal",
      summary: "The switching network that connects every cluster to every slice of L2 and memory.",
      details: [
        "Any SM can read data held by any memory controller. The crossbar routes thousands of requests per clock between the clusters and the L2 slices — moving several terabytes per second inside the chip.",
      ],
    },
    "pcie-phy": {
      name: "PCI Express interface",
      category: "io",
      summary: "The link to the CPU: 16 PCIe lanes plus copy engines.",
      details: [
        "This block drives the 16 lanes of the edge connector. Dedicated **copy engines** (DMA) move data between system memory and VRAM in the background while the SMs keep computing.",
      ],
    },
    "display-engine": {
      name: "Display engine",
      category: "io",
      summary: "Reads finished frames from memory and streams them to the monitors.",
      details: [
        "The display engine scans out frames many times per second, blends overlays (like the mouse cursor), converts colours, can compress the stream (DSC) for very high resolutions, and drives up to four monitors at once.",
      ],
    },
    "media-engine": {
      name: "Video encode / decode engines",
      category: "compute",
      summary: "Fixed-function hardware for compressing and decompressing video.",
      details: [
        "Encoding a video stream on the general-purpose cores would waste power, so GPUs include dedicated engines for H.264, HEVC and AV1. They let you stream a game or play an 8K video while using only a few watts.",
      ],
    },
    "sm-view": {
      name: "Streaming multiprocessor (×60)",
      category: "compute",
      summary: "The GPU's core: 128 arithmetic lanes fed by four warp schedulers.",
      details: [
        "An SM runs groups of 32 threads called **warps**. It keeps up to about 48 warps (1,536 threads) resident at once, so whenever one warp waits for memory, another is ready to run — the GPU hides latency with sheer parallelism instead of big caches.",
        "It is split into **four processing blocks**, each with its own scheduler, register file, 32 lanes and a tensor core, sharing an L1 cache, texture units and a ray-tracing core.",
      ],
      specs: [
        ["FP32 lanes", "128 (4 × 32)"],
        ["Tensor cores", "4"],
        ["Register file", "4 × 64 KB = 256 KB"],
        ["Resident threads", "up to ≈1,536"],
      ],
    },
    "instruction-cache": {
      name: "Instruction cache",
      category: "memory",
      summary: "Holds the program's machine instructions for the whole SM.",
      details: ["Shader and compute programs are fetched from here; each processing block also has a tiny L0 instruction cache of its own."],
    },
    "warp-schedulers": {
      name: "Warp schedulers (×4)",
      category: "control",
      summary: "Each picks a ready warp every clock and issues its next instruction to 32 threads.",
      details: [
        "Switching between warps costs nothing — all their registers stay in place — so a scheduler can issue from a different warp every cycle, skipping any that are waiting for data.",
      ],
    },
    "register-files": {
      name: "Register files (×4)",
      category: "memory",
      summary: "256 KB of the fastest storage on the chip — every thread's working variables.",
      details: [
        "Each processing block has a 64 KB register file: 16,384 registers of 32 bits. Together they are larger than the SM's L1 cache, because thousands of resident threads each need their own registers.",
      ],
      specs: [["Per SM", "256 KB (65,536 × 32-bit)"]],
    },
    "cuda-cores": {
      name: "FP32 / INT32 lanes (128)",
      category: "compute",
      summary: "The arithmetic units: each does a fused multiply-add every clock.",
      details: [
        "Each orange cube is one lane. A warp instruction runs on 32 lanes at once — the same operation on 32 different numbers. A fused multiply-add (a × b + c) counts as two floating-point operations.",
        "Across the whole chip: 128 lanes × 144 SMs × 2 operations × ≈2.5 GHz ≈ **92 trillion** operations per second in 32-bit floating point.",
      ],
      specs: [
        ["Per SM", "128"],
        ["Whole die", "18,432"],
        ["Peak FP32", "≈92 TFLOPS"],
      ],
    },
    "tensor-cores": {
      name: "Tensor cores (×4)",
      category: "compute",
      summary: "Matrix-multiply engines — the reason GPUs dominate AI.",
      details: [
        "Instead of one multiply-add per lane, a tensor core multiplies whole small matrices (tiles like 16×16) in a few cycles, in low-precision formats such as FP16, BF16, FP8 or FP4.",
        "Neural networks are mostly matrix multiplications, so tensor cores deliver many times the throughput of the regular lanes — hundreds of trillions to over a quadrillion operations per second across the chip.",
      ],
      didYouKnow: "Every grid you can see in the LLM section of this site is computed with exactly the kind of matrix multiply that tensor cores accelerate.",
    },
    "load-store": {
      name: "Load / store units",
      category: "memory",
      summary: "Compute addresses and move data between registers and memory.",
      details: [
        "When the 32 threads of a warp read neighbouring addresses, the load/store units **coalesce** them into a single wide memory transaction — one of the most important performance rules in GPU programming.",
      ],
    },
    sfu: {
      name: "Special function units",
      category: "compute",
      summary: "Fast hardware approximations of sin, cos, exp, log, reciprocal and square root.",
      details: [
        "Transcendental functions would take many ordinary instructions, so SFUs approximate them directly. The exponentials in an AI model's softmax are a typical job for them.",
      ],
    },
    "l1-shared": {
      name: "L1 data cache / shared memory",
      category: "memory",
      summary: "128 KB of fast memory, split between a cache and programmer-controlled shared memory.",
      details: [
        "Threads in the same block can cooperate through **shared memory**: for example, a matrix multiply loads a tile of each matrix once and lets every thread reuse it. Access takes tens of cycles, versus hundreds for VRAM.",
      ],
      specs: [["Size", "128 KB per SM"]],
    },
    "texture-units": {
      name: "Texture units (×4)",
      category: "compute",
      summary: "Fetch and filter texture images for graphics.",
      details: ["They look up texels, blend neighbouring ones (bilinear and anisotropic filtering) and decompress texture formats in hardware."],
    },
    "rt-core": {
      name: "Ray-tracing core",
      category: "compute",
      summary: "Hardware for following light rays through a 3D scene.",
      details: [
        "To ray-trace, every ray must find which of millions of triangles it hits. The RT core walks the scene's bounding-volume hierarchy and runs ray–triangle tests in dedicated hardware, many times faster than the general lanes could.",
      ],
    },

    backplate: {
      name: "Backplate",
      category: "structure",
      summary: "An aluminium plate that stiffens the board and helps cool its back side.",
      details: [
        "A large card weighs well over a kilogram; the backplate keeps the PCB from sagging and protects the components on its back.",
        "Thermal pads on its inner face touch the back of the VRM and the GPU area, so the backplate also acts as a passive heatsink. The slotted opening lets air from the third fan pass straight through.",
      ],
      specs: [["Material", "Anodised aluminium, 2 mm"]],
    },
  },
};
