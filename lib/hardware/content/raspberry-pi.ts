import type { DeviceInfo } from "../types";

export const raspberryPi: DeviceInfo = {
  id: "raspberry-pi",
  name: "Raspberry Pi 5",
  shortName: "Pi 5",
  model: "Raspberry Pi 5 (8 GB) with the official Active Cooler",
  tagline: "A whole computer on a board the size of a credit card.",
  intro: [
    "A **single-board computer** puts everything a PC needs — processor, memory, storage slot, networking and ports — on one circuit board. The Raspberry Pi 5 does it in 85 × 56 mm and draws about as much power as a phone charger, yet runs a full desktop operating system.",
    "Its brain is a **system-on-chip (SoC)**: four 2.4 GHz CPU cores, a graphics processor and video engines on one sliver of silicon. Unusually, the slow, pin-hungry jobs — USB, Ethernet, cameras and the famous **GPIO pins** — live on a second chip, **RP1**, that Raspberry Pi designed themselves and connected to the SoC with a PCI Express link.",
    "Press **Explode** to lift off the cooler, pop the lid off the processor and pull the connectors away from the board. Slide it all the way and a **magnified map of the processor die** rises out of the chip — click any block to see what that part of the silicon does.",
  ],
  specs: [
    ["Processor", "Broadcom BCM2712 · 4× Arm Cortex-A76 @ 2.4 GHz · 16 nm"],
    ["Memory", "8 GB LPDDR4X-4267 (32-bit, ≈17 GB/s)"],
    ["Graphics", "VideoCore VII · OpenGL ES 3.1, Vulkan"],
    ["I/O controller", "RP1, linked to the SoC by PCIe 2.0 ×4"],
    ["Storage", "microSD (SDR104) · NVMe via PCIe 2.0 ×1"],
    ["Networking", "Gigabit Ethernet (PoE+ ready) · Wi-Fi 5 · Bluetooth 5.0"],
    ["Ports", "2× USB 3.0, 2× USB 2.0, 2× micro-HDMI (4Kp60), 2× MIPI camera/display"],
    ["Power", "5 V / 5 A over USB-C · ≈3 W idle, ≈12 W peak"],
    ["Size", "85 × 56 mm · ≈17 mm tall at the USB ports"],
  ],
  camera: { position: [-70, 105, 150], target: [4, 4, 4] },
  size: 100,
  parts: {
    // --- Mounting -----------------------------------------------------------
    standoffs: {
      name: "Mounting standoffs (×4)",
      category: "mechanical",
      summary: "Brass M2.5 spacers and screws that hold the board off the desk.",
      details: [
        "The four corner holes are 2.7 mm wide, sized for **M2.5 screws**, and sit on a 58 × 49 mm rectangle. That pattern is part of the **HAT standard**, so add-on boards, cases and these standoffs fit every modern Raspberry Pi.",
        "The standoffs aren't part of the Pi itself — they're how most people mount one. Lifting the board keeps the soldered pins on its underside off conductive surfaces and lets air reach both sides.",
      ],
      specs: [
        ["Hole size", "Ø2.7 mm (M2.5)"],
        ["Hole pattern", "58 × 49 mm"],
        ["Standoff", "5 mm brass hex"],
      ],
    },

    // --- The board ----------------------------------------------------------
    pcb: {
      name: "Printed circuit board",
      category: "structure",
      summary: "An 85 × 56 mm multi-layer board that wires every chip and connector together.",
      details: [
        "The board is a sandwich of thin copper layers separated by fibreglass-epoxy. The green colour is the **solder mask**, a protective coating; the slightly lighter areas are copper underneath it, and the white text is **silkscreen** ink.",
        "Most of each copper layer is a solid **ground plane**. Signals run as thin traces in channels cut through it — look for the paired lines heading to the HDMI and USB ports: they are **differential pairs**, two wires carrying opposite copies of a signal so interference cancels out.",
        "Note the bare corner beside the Wi-Fi can at the top left: no copper is allowed near the antenna, or it would block the radio waves.",
      ],
      specs: [
        ["Size", "85 × 56 mm, 3 mm corner radius"],
        ["Finish", "Green solder mask, gold (ENIG) pads"],
        ["Mounting", "4× Ø2.7 mm + 2× Ø3 mm cooler holes"],
      ],
      didYouKnow:
        "The Pi 5 is assembled at Sony's factory in Pencoed, South Wales, where Raspberry Pi boards have been made since 2012.",
    },

    // --- SoC ----------------------------------------------------------------
    soc: {
      name: "BCM2712 system-on-chip",
      category: "compute",
      summary: "The main processor: four Arm CPU cores, a GPU and video engines on one chip.",
      details: [
        "A **system-on-chip** packs what a PC spreads over several chips — CPU cores, graphics, memory controller, display and video hardware — onto a single piece of silicon. Fewer chips means a smaller, cheaper and more power-efficient board.",
        "The BCM2712 is made by Broadcom on a **16 nm** process. Its four **Arm Cortex-A76** cores run at 2.4 GHz, giving roughly two to three times the CPU performance of the Raspberry Pi 4.",
        "Explode the board to lift the metal lid off and see the bare die underneath; go all the way to see a magnified map of what's on that die.",
      ],
      specs: [
        ["CPU", "4× Arm Cortex-A76, 2.4 GHz, 64-bit"],
        ["Caches", "64 KB + 64 KB L1 and 512 KB L2 per core, 2 MB shared L3"],
        ["GPU", "VideoCore VII, 800 MHz"],
        ["Process", "16 nm"],
        ["Package", "17 × 17 mm flip-chip BGA with a metal lid"],
      ],
      howItWorks: [
        "The bootloader in a small flash chip starts the SoC and loads the operating system from microSD, USB or NVMe.",
        "The CPU cores run your programs, fetching instructions and data through their caches from the LPDDR4X memory beside the chip.",
        "Graphics, video decoding and display output are handed to dedicated hardware blocks, which are far more efficient than the CPU at those jobs.",
        "Anything that talks to the outside world through USB, Ethernet or GPIO is forwarded over PCI Express to RP1.",
      ],
    },
    "soc-lid": {
      name: "Heat spreader (lid)",
      category: "cooling",
      summary: "A stamped nickel-plated metal cap that protects the die and spreads its heat.",
      details: [
        "The silicon die is brittle and only a few square millimetres in size. The lid shields it from cracking when a heatsink is pressed on, and spreads the heat from that small hot spot over a much larger area for the cooler to pick up.",
        "This one is a 'top hat' stamping: a flat plateau over the die and two flanges glued to the package substrate. The laser-etched text identifies the chip, its stepping (C1) and when it was made.",
      ],
      specs: [
        ["Material", "Nickel-plated copper"],
        ["Contact", "Thermal interface material on the die"],
      ],
    },
    "soc-tim": {
      name: "Thermal interface material",
      category: "cooling",
      summary: "A thin grey layer that carries heat from the die into the lid.",
      details: [
        "Two flat surfaces only touch at microscopic high points; the gaps are full of air, which insulates. A thin layer of thermal compound fills those gaps so heat can flow from the silicon into the lid.",
        "It is far less conductive than metal, so it is kept as thin as possible — a few tens of micrometres.",
      ],
    },
    "soc-die": {
      name: "Silicon die",
      category: "compute",
      summary: "The chip itself: 8.6 × 6.5 mm of silicon carrying billions of transistors.",
      details: [
        "This mirror-like rectangle is the actual processor. It is mounted **upside down** (\"flip-chip\"): the circuitry faces the package, connected by hundreds of tiny solder bumps, and what you see on top is the polished back of the silicon.",
        "The 8 GB Pi 5 uses the **C1** stepping of the BCM2712, about 56 mm². It contains some blocks the Pi never uses; a later **D0** stepping strips those out and is a third smaller.",
        "Slide **Explode** to the end to see a magnified, labelled map of the circuitry.",
      ],
      specs: [
        ["Size", "8.63 × 6.47 mm (≈56 mm², C1 stepping)"],
        ["Process", "16 nm FinFET"],
        ["Connection", "Flip-chip solder bumps"],
      ],
    },
    "die-floorplan": {
      name: "Die floorplan (magnified)",
      category: "compute",
      summary: "A 5.5× enlarged map of the BCM2712's circuitry, block by block.",
      details: [
        "Every chip is planned like a city: big districts for the CPU cores, caches and graphics, with the 'roads' of wiring in between and the input/output circuits around the edge where they can reach the package's connections.",
        "Each interface sits on the edge of the die that faces the part it talks to on the board: the memory interface toward the SDRAM, the PCI Express lanes toward RP1 and the HDMI circuits toward the HDMI ports. Click any block to learn what it does.",
        "Broadcom doesn't publish the BCM2712 floorplan, so this map is a simplified illustration: the blocks are real, their exact shapes and positions are approximate. The textures imitate real die photos — fine stripes are memory arrays, speckled regions are logic.",
      ],
    },
    "die-cpu": {
      name: "CPU cluster",
      category: "compute",
      summary: "Four Cortex-A76 cores and the caches that keep them fed.",
      details: [
        "The four cores sit in a group around their shared **L3 cache** and the **DynamIQ Shared Unit (DSU)**, which keeps the cores' caches consistent with each other and connects the cluster to the rest of the chip.",
        "Caches exist because main memory is slow: fetching data from the LPDDR4X chip takes around 100 ns, roughly 250 CPU clock cycles. Each level of cache is bigger but slower than the one before, so most requests are answered long before they reach DRAM.",
      ],
      specs: [
        ["Cores", "4× Cortex-A76 (Armv8.2-A, 64-bit)"],
        ["Clock", "up to 2.4 GHz"],
        ["Cache", "L1 64+64 KB and L2 512 KB per core; 2 MB L3 shared"],
      ],
    },
    "die-cpu-cores": {
      name: "Cortex-A76 cores (×4)",
      category: "compute",
      summary: "Four out-of-order CPU cores — the parts that actually run your programs.",
      details: [
        "The Cortex-A76 is a high-performance Arm design originally built for smartphones. Each core decodes up to **four instructions per clock** and executes them **out of order**: if one instruction is waiting for data, later independent ones run in the meantime.",
        "A **branch predictor** guesses which way each `if` will go before it is known, so the pipeline never has to stop and wait. Guess wrong and the core throws away the speculative work and starts again — it guesses right well over 90% of the time.",
      ],
      specs: [
        ["Architecture", "Armv8.2-A, 64-bit"],
        ["Pipeline", "4-wide decode, out-of-order"],
        ["Clock", "2.4 GHz (1.5 GHz when throttled)"],
      ],
      howItWorks: [
        "**Fetch**: the next instructions are read from the L1 instruction cache.",
        "**Decode & rename**: they are translated into simpler internal operations and given private registers so they can run independently.",
        "**Execute**: operations go to integer, floating-point/vector (NEON) and load/store units as soon as their inputs are ready.",
        "**Retire**: results are committed in the original program order, so the program never notices the reshuffling.",
      ],
    },
    "die-l1": {
      name: "L1 caches",
      category: "memory",
      summary: "Each core's private 64 KB instruction cache and 64 KB data cache.",
      details: [
        "The L1 caches are the fastest memory on the chip — a few cycles away from the execution units. One holds the instructions the core is about to run, the other the data it is working on.",
        "They are made of **SRAM**: each bit is held by six transistors in a tiny latch, which is fast and needs no refresh, but takes far more area per bit than DRAM.",
      ],
      specs: [
        ["Size", "64 KB instruction + 64 KB data, per core"],
        ["Latency", "≈4 cycles"],
      ],
    },
    "die-l2": {
      name: "L2 caches (512 KB per core)",
      category: "memory",
      summary: "A larger private cache behind each core's L1.",
      details: [
        "When something isn't in L1, the core looks in its own 512 KB L2. It is about ten times larger than L1 and still only around ten cycles away.",
        "The regular, finely striped texture is typical of SRAM arrays on real die photos — rows of identical bit cells repeated thousands of times.",
      ],
      specs: [
        ["Size", "512 KB per core (2 MB total)"],
        ["Latency", "≈9–11 cycles"],
      ],
    },
    "die-l3": {
      name: "Shared L3 cache (2 MB)",
      category: "memory",
      summary: "The last cache before main memory, shared by all four cores.",
      details: [
        "The L3 holds data any core may need, so cores working on the same data don't each fetch it from DRAM. It sits next to the **DSU**, the cluster's traffic controller that also keeps all the caches coherent — if one core changes a value, the others see the new one.",
        "The BCM2712's 2 MB L3 is new compared with the Pi 4's chip, which had no L3 at all.",
      ],
      specs: [
        ["Size", "2 MB"],
        ["Shared by", "all four cores"],
      ],
    },
    "die-gpu": {
      name: "VideoCore VII GPU",
      category: "compute",
      summary: "The graphics processor that draws the desktop, games and 3D.",
      details: [
        "VideoCore is Broadcom's long-running graphics family; generation VII runs at 800 MHz and supports **OpenGL ES 3.1** and **Vulkan**, the same APIs used by phones and PCs.",
        "Like any GPU it works on many pixels at once: its shader processors run the same small program for thousands of pixels or vertices in parallel. Raspberry Pi's open-source Mesa driver (V3D) is what the Linux desktop uses to talk to it.",
      ],
      specs: [
        ["Clock", "800 MHz"],
        ["APIs", "OpenGL ES 3.1, Vulkan"],
        ["Displays", "drives two 4Kp60 HDMI outputs"],
      ],
    },
    "die-hevc": {
      name: "HEVC video decoder",
      category: "compute",
      summary: "Fixed-function hardware that decodes H.265 video up to 4K at 60 fps.",
      details: [
        "Decoding modern video in software would keep all four CPU cores busy. A dedicated block of logic does it in hardware for a fraction of the power, which is why the Pi 5 can play 4K video smoothly.",
        "HEVC (H.265) is the compression used by most 4K streams. The Pi 5 drops hardware **H.264** decode and has no hardware encoder; those are handled quickly enough by the faster CPU.",
      ],
      specs: [["Format", "HEVC (H.265), up to 4Kp60"]],
    },
    "die-isp": {
      name: "Image signal processor (back end)",
      category: "compute",
      summary: "Turns raw camera sensor data into clean, colour-correct images.",
      details: [
        "A camera sensor delivers a raw mosaic of red, green and blue samples. The ISP **demosaics** it into full-colour pixels, removes noise, corrects lens shading and colour, and scales the result — billions of operations per second that would swamp the CPU.",
        "On the Pi 5 the camera pipeline is split: RP1 receives the sensor data and gathers statistics (the front end), and this back end on the SoC does the heavy image processing.",
      ],
    },
    "die-memory": {
      name: "LPDDR4X memory controller & PHY",
      category: "memory",
      summary: "The circuitry that talks to the 8 GB SDRAM chip at 4,267 megatransfers per second.",
      details: [
        "The **memory controller** turns the cores' and GPU's requests into DRAM commands — open a row, read a column, refresh — and reorders them to keep the memory busy. The **PHY** next to the die edge is the analog circuitry that actually drives the 32 data wires.",
        "It sits on the edge of the die facing the SDRAM chip so the traces between them are as short as possible.",
      ],
      specs: [
        ["Standard", "LPDDR4X-4267"],
        ["Width", "32 bits (2 channels × 16)"],
        ["Peak bandwidth", "4,267 MT/s × 4 bytes ≈ 17 GB/s"],
      ],
    },
    "die-pcie": {
      name: "PCI Express controllers",
      category: "io",
      summary: "Two PCIe 2.0 links: four lanes to RP1 and one lane to the external connector.",
      details: [
        "PCI Express sends data as fast serial streams over pairs of wires. The BCM2712 uses a **four-lane** link to reach RP1 — about 16 Gbit/s, enough to feed both USB 3 ports, Ethernet and the cameras at once.",
        "A separate **single-lane** controller drives the small FPC connector on the edge of the board, where an M.2 HAT can add an NVMe SSD or an AI accelerator.",
      ],
      specs: [
        ["To RP1", "PCIe 2.0 ×4 (≈16 Gbit/s)"],
        ["External", "PCIe 2.0 ×1 (5 GT/s, Gen 3 unofficially)"],
      ],
    },
    "die-display": {
      name: "Display pipeline & HDMI",
      category: "io",
      summary: "Composes the screen image and drives two 4K HDMI outputs.",
      details: [
        "The **Hardware Video Scaler (HVS)** combines the desktop, video and mouse-pointer layers into each finished frame, scaling and converting colours on the fly. Two HDMI controllers then serialise those frames and send them out through the micro-HDMI ports.",
        "Both outputs can run **4K at 60 Hz** at the same time.",
      ],
      specs: [["Outputs", "2× HDMI 2.0, 4Kp60 each"]],
    },
    "die-io": {
      name: "Low-speed I/O",
      category: "io",
      summary: "Interfaces that stay on the SoC: the SD card, the Wi-Fi link and debug ports.",
      details: [
        "Not everything moved to RP1. The **SD card** interface (SDR104, up to about 100 MB/s) and the **SDIO** link to the Wi-Fi chip connect directly to the SoC, as do the debug UART, I²C and timers it needs to boot and manage the board.",
      ],
    },
    "die-system": {
      name: "Boot ROM & system control",
      category: "control",
      summary: "The first code the chip runs, plus clocks, power domains and security.",
      details: [
        "When power arrives, a tiny program burned into the chip's **ROM** wakes up, loads the bootloader from the flash chip on the board and checks it. The same area manages the chip's clocks, voltages and power domains — switching off blocks that aren't in use.",
      ],
    },
    "die-dark-silicon": {
      name: "Unused blocks ('dark silicon')",
      category: "structure",
      summary: "Parts of the die the Raspberry Pi never switches on.",
      details: [
        "The BCM2712 was designed for more products than the Pi, so the C1 stepping carries functions the Pi doesn't use — an Ethernet controller among them, since RP1 handles networking.",
        "Broadcom later made a **D0** stepping without these blocks. It is about a third smaller (≈38 mm² instead of ≈56 mm²), costs less and idles at noticeably lower power.",
      ],
    },
    "soc-substrate": {
      name: "Package substrate",
      category: "signal",
      summary: "A tiny circuit board that connects the die to the main board through solder balls.",
      details: [
        "The die's connections are only about 0.15 mm apart — far too fine for a normal PCB. The substrate's thin build-up layers fan them out to a grid of **solder balls** 0.8 mm apart on its underside (a **ball grid array**, BGA).",
        "Tiny capacitors placed right next to the die smooth its power supply when the cores suddenly speed up.",
      ],
      specs: [
        ["Size", "17 × 17 mm"],
        ["Connection to board", "Ball grid array"],
      ],
    },

    // --- Memory, I/O and power chips ---------------------------------------
    sdram: {
      name: "LPDDR4X SDRAM (8 GB)",
      category: "memory",
      summary: "The computer's working memory: 8 GB of low-power DRAM in one package.",
      details: [
        "Everything the Pi is actively using — the operating system, open programs, the screen image — lives here. **DRAM** stores each bit as charge in a tiny capacitor; it is dense and cheap but leaks, so every row is refreshed thousands of times a second.",
        "**LPDDR4X** is the low-power memory used in phones. Several dies are stacked inside this one package and connected to the SoC by a 32-bit bus running at 4,267 megatransfers per second.",
        "It sits right next to the SoC because at these speeds every millimetre of trace matters.",
      ],
      specs: [
        ["Capacity", "8 GB (1, 2, 4 and 16 GB versions exist)"],
        ["Type", "LPDDR4X-4267, 32-bit"],
        ["Bandwidth", "≈17 GB/s peak"],
        ["Package", "10 × 14.5 mm BGA"],
      ],
    },
    rp1: {
      name: "RP1 I/O controller",
      category: "io",
      summary: "Raspberry Pi's own chip that runs USB, Ethernet, cameras and the GPIO pins.",
      details: [
        "On earlier Pis these interfaces were built into the Broadcom SoC. For the Pi 5, Raspberry Pi moved them to a chip of their own design — a **chiplet** approach: the expensive cutting-edge 16 nm process is spent on computing, while the I/O, which needs lots of pins and analog circuits but little speed, is made on a cheaper, mature **40 nm** process.",
        "RP1 connects to the SoC over a four-lane **PCI Express** link, so to the operating system it looks like a plug-in card. It took years and around $15 million to develop, and it can be reused with future processors.",
      ],
      specs: [
        ["Host link", "PCIe 2.0 ×4 (≈16 Gbit/s)"],
        ["USB", "2× USB 3.0 + 2× USB 2.0 (two controllers)"],
        ["Networking", "Gigabit Ethernet MAC"],
        ["Camera/display", "2× 4-lane MIPI CSI-2 / DSI"],
        ["GPIO", "28 pins: 5 UART, 6 SPI, 4 I²C, I²S, PWM"],
        ["Process / package", "TSMC 40 nm · 12 × 12 mm BGA"],
      ],
      howItWorks: [
        "The SoC sees RP1 as a PCI Express device and reads and writes its registers across the link.",
        "RP1's own DMA engines move data — USB packets, Ethernet frames, camera images — straight to and from the Pi's main memory.",
        "Two small Arm Cortex-M3 cores inside RP1 handle housekeeping, so the main CPU isn't interrupted for every small event.",
      ],
      didYouKnow:
        "Because GPIO now lives on RP1, the Pi 5 broke some older software that poked the Broadcom GPIO registers directly. Libraries like **gpiozero** and **libgpiod** hide the difference.",
    },
    pmic: {
      name: "Power management IC",
      category: "power",
      summary: "Turns the 5 V input into the many lower voltages the chips need.",
      details: [
        "The SoC core runs near **0.8–1 V**, memory at 1.1 and 0.6 V, I/O at 3.3 and 1.8 V. This single chip (a Renesas DA9091 designed for the Pi) contains **eight switch-mode power supplies** that generate them all from 5 V.",
        "Its biggest supply feeds the CPU and GPU through four phases taking turns, providing up to **20 A**. It also keeps the real-time clock running and handles the power button.",
      ],
      specs: [
        ["Regulators", "8 switch-mode supplies"],
        ["Core supply", "4 phases, up to 20 A"],
        ["Extras", "Real-time clock, power-button control"],
      ],
      howItWorks: [
        "A switch connects an inductor to 5 V for a fraction of a microsecond, storing energy in its magnetic field.",
        "The switch opens; the inductor keeps current flowing into the output capacitors at the lower voltage.",
        "Repeating this millions of times per second, and adjusting the on-time, holds the output exactly at the requested voltage — over 90% efficiently, where a simple linear regulator would waste most of the power as heat.",
      ],
    },
    "core-inductors": {
      name: "Core-supply inductors (×4)",
      category: "power",
      summary: "One inductor per phase of the 20 A supply that feeds the SoC cores.",
      details: [
        "Each phase of the core supply has its own inductor. The phases switch in turn, a quarter-cycle apart, so their ripples largely cancel and each inductor only carries a share of the current.",
        "The marking **R47** means 0.47 µH — the R stands in for the decimal point.",
      ],
      specs: [
        ["Count", "4 (quad-phase)"],
        ["Marking", "R47 = 0.47 µH"],
      ],
    },
    "ethernet-phy": {
      name: "Gigabit Ethernet PHY",
      category: "io",
      summary: "Converts RP1's digital network data into signals on the Ethernet cable.",
      details: [
        "RP1 contains the Ethernet **MAC**, which builds and checks network frames. This chip is the **PHY** (physical layer): it turns those bits into the analog waveforms sent over the four twisted pairs of an Ethernet cable at 1 Gbit/s, and back again.",
        "It is mounted at a 45° angle — a first for a Raspberry Pi — so the traces to RP1 on one side and to the Ethernet jack on the other run straight and short.",
      ],
      specs: [
        ["Chip", "Broadcom BCM54213PE"],
        ["Speed", "10/100/1000 Mbit/s"],
        ["Interface to RP1", "RGMII"],
      ],
    },
    "wifi-module": {
      name: "Wi-Fi & Bluetooth radio",
      category: "io",
      summary: "Dual-band Wi-Fi 5 and Bluetooth 5.0 under a metal shield, with a PCB antenna.",
      details: [
        "An Infineon **CYW43455** radio provides 802.11ac Wi-Fi on both the 2.4 and 5 GHz bands, plus Bluetooth 5.0 and Bluetooth Low Energy. It talks to the SoC over **SDIO**, the same kind of interface an SD card uses.",
        "Explode the board to lift the shield can and see the radio chip and its crystal underneath.",
      ],
      specs: [
        ["Wi-Fi", "802.11b/g/n/ac, 2.4 + 5 GHz"],
        ["Bluetooth", "5.0 + BLE"],
        ["Link to SoC", "SDIO"],
      ],
    },
    "wifi-shield": {
      name: "RF shield can",
      category: "structure",
      summary: "A tin-plated steel box that keeps radio noise in and other noise out.",
      details: [
        "Radios are sensitive receivers sitting next to a computer full of fast-switching signals. The grounded metal can acts as a **Faraday cage**: it stops digital noise from drowning out faint Wi-Fi signals and stops the radio's own oscillators from interfering with the rest of the board.",
        "The small holes let solder-reflow heat and X-ray inspection reach the parts inside.",
      ],
    },
    "wifi-chip": {
      name: "Wireless chip",
      category: "io",
      summary: "The CYW43455 radio itself, with its crystal and RF filtering parts.",
      details: [
        "Inside one small package are the radio transmitters and receivers, the Wi-Fi and Bluetooth protocol processors and power amplifiers. A **37.4 MHz crystal** beside it is the reference from which the 2.4 and 5 GHz carrier frequencies are synthesised.",
      ],
      specs: [
        ["Chip", "Infineon CYW43455"],
        ["Reference", "37.4 MHz crystal"],
      ],
    },
    "wifi-antenna": {
      name: "PCB antenna",
      category: "signal",
      summary: "A shaped patch of copper on the board itself that radiates the Wi-Fi signal.",
      details: [
        "There is no separate antenna part: the radiating element is copper etched into the board in the corner, in an area kept free of ground plane. A few tiny tuning components match it to both Wi-Fi bands.",
        "The design is licensed from the antenna specialist Proant (now Abracon), and the same idea has been used since the Raspberry Pi 3 B+.",
      ],
      didYouKnow:
        "Metal near this corner — a metal case lid, or a big heatsink — noticeably cuts Wi-Fi range. Notice that the Active Cooler leaves the antenna uncovered.",
    },
    "boot-flash": {
      name: "Bootloader flash",
      category: "storage",
      summary: "A 2 MB flash chip holding the firmware that starts the Pi.",
      details: [
        "When you power on, the SoC's ROM loads the **bootloader** from this chip. The bootloader sets up memory, then finds and starts the operating system from microSD, USB, NVMe or the network, in the order set by its `BOOT_ORDER` setting.",
        "Because it lives in rewritable flash, Raspberry Pi can ship new boot features (like NVMe or HTTP network boot) as updates — run `rpi-eeprom-update` to get them.",
      ],
      specs: [
        ["Type", "SPI/QSPI NOR flash"],
        ["Capacity", "2 MB"],
        ["Default boot order", "SD card, then USB"],
      ],
    },
    crystals: {
      name: "Crystal oscillators (×3)",
      category: "control",
      summary: "Quartz crystals that set the beat for the SoC, RP1 and the Ethernet PHY.",
      details: [
        "A quartz crystal is a sliver of stone that vibrates at a precise frequency when driven electrically. Each chip multiplies its crystal's frequency up to the clocks it needs — the SoC turns **54 MHz** into a 2.4 GHz CPU clock.",
        "RP1 has its own **50 MHz** crystal and the Ethernet PHY a **25 MHz** one, because Ethernet and USB need their own accurately timed clocks.",
      ],
      specs: [
        ["SoC", "54 MHz"],
        ["RP1", "50 MHz"],
        ["Ethernet PHY", "25 MHz"],
      ],
    },
    "support-ics": {
      name: "Support chips",
      category: "control",
      summary: "Small helpers: USB power switching and ESD protection for the HDMI ports.",
      details: [
        "Next to the USB ports, an electronic switch powers the ports and limits their current — **600 mA** in total with a 3 A supply, **1.6 A** with a 5 A one — so a faulty device can't brown out the Pi.",
        "Behind each HDMI port, an ESD protection array clamps the static-electricity spikes that arrive when a cable is plugged in, before they can reach the SoC.",
      ],
    },
    passives: {
      name: "Capacitors & resistors",
      category: "power",
      summary: "Hundreds of tiny surface-mount parts that filter power and set signal levels.",
      details: [
        "The tan parts are **ceramic capacitors**, stacks of hundreds of thin metal and ceramic layers. Placed right next to a chip, each acts as a tiny local reservoir that supplies sudden bursts of current faster than the power supply can react.",
        "The black ones are **resistors**, used as pull-ups, terminations and to set reference levels. Most are the 0402 and 0201 sizes — 1.0 × 0.5 mm and 0.6 × 0.3 mm, smaller than a grain of sand.",
      ],
      specs: [
        ["Sizes", "0201, 0402, 0603, 0805"],
        ["Smallest", "0.6 × 0.3 mm"],
      ],
    },
    "underside-caps": {
      name: "Underside capacitors",
      category: "power",
      summary: "A dense grid of capacitors on the back, right under the SoC and RP1.",
      details: [
        "The fastest current spikes last nanoseconds. At those speeds even a few millimetres of copper add too much inductance, so designers put a grid of capacitors on the back of the board, directly beneath the chips' power balls — the shortest path there is.",
      ],
    },

    // --- Connectors ------------------------------------------------------------
    "gpio-header": {
      name: "40-pin GPIO header",
      category: "io",
      summary: "The famous pin header for connecting LEDs, sensors, motors and add-on boards.",
      details: [
        "**GPIO** means general-purpose input/output: software can set most of these pins high (3.3 V) or low (0 V) to light an LED or drive a relay, or read them to see whether a button is pressed. Around them are 5 V, 3.3 V and ground pins to power small circuits.",
        "Many pins have a second job: **I²C** and **SPI** buses for sensors and displays, a **UART** serial port, **PWM** for dimming LEDs and controlling servos, and **I²S** for audio. Add-on boards called **HATs** plug straight on top and identify themselves through an EEPROM on two dedicated pins.",
        "The pins work at **3.3 V logic and are not 5 V tolerant** — connecting 5 V straight to a GPIO pin can destroy it. On the Pi 5 they are driven by RP1.",
      ],
      specs: [
        ["Pins", "40 (2 × 20, 2.54 mm pitch)"],
        ["GPIO", "28 (incl. 2 for HAT ID)"],
        ["Logic level", "3.3 V (not 5 V tolerant)"],
        ["Buses", "I²C, SPI, UART, PWM, I²S"],
      ],
      howItWorks: [
        "Each pin connects to a pad driver in RP1 that can push current out (output) or sense voltage (input).",
        "Software writes a register to choose the pin's function — plain GPIO or one of its alternate functions such as SPI or UART.",
        "As an input, a voltage above about 2 V reads as 1 and below about 0.8 V as 0; internal pull-up or pull-down resistors stop floating pins from reading random values.",
      ],
      didYouKnow:
        "Pin 1 is marked by a square pad on the board. The 40-pin layout has stayed the same since 2014, so HATs made for a Raspberry Pi B+ still fit a Pi 5.",
    },
    "poe-header": {
      name: "PoE+ header",
      category: "power",
      summary: "Four pins that pass Power over Ethernet to a PoE+ HAT.",
      details: [
        "With **Power over Ethernet**, a network switch sends power down the same cable as the data. The four pins connect to the centre taps of the transformers inside the Ethernet jack, where that power appears at up to 57 V.",
        "The Pi can't use that voltage directly, so a **PoE+ HAT** sits on top, picks it up from these pins and converts it to 5 V.",
      ],
      specs: [
        ["Standard", "IEEE 802.3at (PoE+)"],
        ["Pins", "2 × 2, 2.54 mm"],
      ],
    },
    "usb3-ports": {
      name: "USB 3.0 ports (×2)",
      category: "io",
      summary: "Two blue SuperSpeed USB ports for fast drives and devices.",
      details: [
        "USB 3.0 adds extra wire pairs (the second row of contacts deeper inside the blue tongue) that carry data at **5 Gbit/s** in each direction — about ten times USB 2.0.",
        "On the Pi 5 each USB 3.0 port has its own controller in RP1, so both can run at full speed at the same time — the Pi 4's two ports had to share one link.",
      ],
      specs: [
        ["Speed", "5 Gbit/s each, simultaneously"],
        ["Controller", "RP1 (one per port)"],
        ["Power", "shared 1.6 A limit with a 5 A supply"],
      ],
    },
    "usb2-ports": {
      name: "USB 2.0 ports (×2)",
      category: "io",
      summary: "Two black USB ports for keyboards, mice and other everyday devices.",
      details: [
        "USB 2.0 uses a single pair of data wires at up to **480 Mbit/s** — plenty for keyboards, mice, audio and most peripherals, which leaves the blue ports free for fast storage.",
        "The four contacts on the tongue carry 5 V, two data lines and ground.",
      ],
      specs: [["Speed", "480 Mbit/s"]],
    },
    "ethernet-jack": {
      name: "Gigabit Ethernet jack",
      category: "io",
      summary: "RJ45 socket with built-in transformers and link/activity LEDs.",
      details: [
        "Inside the metal shield are tiny **transformers** (magnetics) that couple the signals onto the cable while isolating the Pi electrically from whatever is at the other end — often hundreds of metres away with a different ground voltage.",
        "The green LED shows a link; the amber one flickers with traffic. Four contacts at the back feed the PoE header for Power over Ethernet.",
      ],
      specs: [
        ["Speed", "1 Gbit/s full duplex"],
        ["Cable pairs", "4 twisted pairs"],
        ["PoE", "PoE+ capable (with HAT)"],
      ],
    },
    "hdmi-ports": {
      name: "Micro-HDMI ports (×2)",
      category: "io",
      summary: "Two video outputs, each able to drive a 4K screen at 60 Hz.",
      details: [
        "HDMI sends the picture as three high-speed colour channels plus a clock over four wire pairs, along with a slower channel the Pi uses to read the monitor's capabilities.",
        "**Micro-HDMI** (type D) is used because two full-size sockets wouldn't fit along the edge. Port 0 is the one nearest the USB-C power input.",
      ],
      specs: [
        ["Outputs", "2 × 4Kp60, HDR capable"],
        ["Connector", "Micro-HDMI (type D)"],
      ],
    },
    "usb-c-power": {
      name: "USB-C power input",
      category: "power",
      summary: "Where the power comes in: 5 V at up to 5 A.",
      details: [
        "The Pi 5 needs more power than its predecessors, so its official supply delivers **5.1 V at 5 A (27 W)**. Using **USB Power Delivery**, the Pi asks the supply whether it can provide 5 A; if so, it allows USB devices to draw up to 1.6 A in total.",
        "With an ordinary 5 V 3 A supply the Pi still runs, but limits USB devices to 600 mA and may warn about the power supply.",
      ],
      specs: [
        ["Input", "5 V, up to 5 A (27 W supply)"],
        ["Negotiation", "USB Power Delivery"],
        ["Board power", "≈3 W idle, ≈12 W peak"],
      ],
    },
    "pcie-connector": {
      name: "PCIe 2.0 ×1 connector",
      category: "io",
      summary: "A tiny flat-cable socket that brings a PCI Express lane off the board.",
      details: [
        "This 16-pin flexible-cable connector exposes one lane of **PCI Express** from the SoC — the same bus that graphics cards and SSDs use in a PC. With an **M.2 HAT+** it can take an NVMe SSD (and boot from it), an AI accelerator or other PCIe cards.",
        "It runs at Gen 2 speed, 5 GT/s, roughly **500 MB/s** — several times faster than the microSD card. Gen 3 can be enabled in software, but isn't officially certified.",
      ],
      specs: [
        ["Interface", "PCIe 2.0 ×1 (Gen 3 unofficially)"],
        ["Bandwidth", "≈500 MB/s (up to ≈1 GB/s at Gen 3)"],
        ["Connector", "16-pin, 0.5 mm FPC"],
      ],
    },
    "mipi-connectors": {
      name: "Camera/display connectors (×2)",
      category: "io",
      summary: "Two 4-lane MIPI connectors, each usable for a camera or a display.",
      details: [
        "**MIPI CSI-2** (cameras) and **DSI** (displays) are the interfaces phones use to connect their camera modules and screens. Each of these 22-pin connectors carries four high-speed data lanes plus a clock lane, and RP1 can run either standard on either port — so the Pi 5 can drive two cameras, two displays, or one of each.",
        "The flat cable drops in from above with its contacts facing the Ethernet port, then the dark latch is pushed down to grip it.",
      ],
      specs: [
        ["Lanes", "4 data + clock, each"],
        ["Connector", "22-pin, 0.5 mm pitch"],
        ["Controller", "RP1"],
      ],
    },
    "fan-connector": {
      name: "Fan connector (4-pin)",
      category: "cooling",
      summary: "Where the Active Cooler plugs in: 5 V, ground, PWM speed control and tachometer.",
      details: [
        "A four-pin JST-SH socket provides **5 V**, **ground**, a **PWM** signal that sets the fan speed and a **tachometer** line on which the fan reports its speed back.",
        "The firmware runs the fan on a temperature curve: off below 50 °C, then 30%, 50%, 70% and 100% at 50, 60, 67.5 and 75 °C.",
      ],
      specs: [
        ["Pins", "5 V · PWM · GND · Tach"],
        ["Connector", "JST-SH, 1.0 mm pitch"],
      ],
    },
    "rtc-connector": {
      name: "RTC battery connector",
      category: "power",
      summary: "Plug in a small rechargeable cell to keep the clock running when unplugged.",
      details: [
        "The Pi 5 is the first Raspberry Pi with a built-in **real-time clock** (inside the PMIC). Without a battery it keeps time only while powered; a lithium-manganese coin cell plugged in here keeps it ticking for months.",
        "The PMIC can trickle-charge the cell (off by default). The clock can also wake the Pi from a very low-power off state at a set time — handy for time-lapse photography.",
      ],
      specs: [
        ["Connector", "2-pin JST-SH (J5)"],
        ["Battery", "Rechargeable Li-Mn coin cell"],
      ],
    },
    "uart-connector": {
      name: "Debug UART connector",
      category: "io",
      summary: "A dedicated 3-pin serial port for watching the Pi boot.",
      details: [
        "A **UART** is the simplest kind of serial port: bits sent one after another on a TX wire and received on an RX wire. This connector carries the Pi's debug console — boot messages and a login prompt — without using any GPIO pins.",
        "It matches the Raspberry Pi Debug Probe's cable and runs at 3.3 V, 115,200 baud by default.",
      ],
      specs: [
        ["Pins", "TX, RX and ground"],
        ["Default", "115,200 baud, 3.3 V"],
      ],
    },
    "power-button": {
      name: "Power button",
      category: "control",
      summary: "The first Raspberry Pi with an on/off button.",
      details: [
        "Earlier Pis had no switch; you pulled the plug. On the Pi 5 a press of this side-mounted button asks the operating system to **shut down cleanly** — on the desktop it opens a shutdown menu, and a second press confirms.",
        "When the Pi is halted, pressing it boots it again. Holding it down forces a hard power-off. The two **J2** pads near the RTC connector let you wire up an external button that does the same thing.",
      ],
    },
    "status-led": {
      name: "Status LED",
      category: "control",
      summary: "A two-colour LED: red when in standby, green while running.",
      details: [
        "This single package holds a red and a green LED chip side by side, aimed out of the board edge. It shows **red** when the Pi is powered but shut down, turns **green** as it boots, and flickers off as the microSD card is accessed.",
        "If the Pi can't boot, the LED blinks a code — a number of long and short flashes that identifies the problem, such as a missing or corrupt boot file.",
      ],
    },
    "microsd-slot": {
      name: "microSD card slot",
      category: "storage",
      summary: "The default boot drive, mounted on the underside of the board.",
      details: [
        "The slot sits under the board's edge so the card is protected but easy to reach. It supports the high-speed **SDR104** mode — roughly twice the speed of the Pi 4's slot, at around 100 MB/s with a fast card.",
        "Eight springy contacts touch the card's pads; a separate switch detects whether a card is inserted.",
      ],
      specs: [
        ["Mode", "SDR104, ≈100 MB/s"],
        ["Location", "Underside, left edge"],
      ],
    },
    "microsd-card": {
      name: "microSD card",
      category: "storage",
      summary: "The card holding the operating system and your files.",
      details: [
        "Inside is **NAND flash** memory and a small controller that manages it — the same technology as an SSD, just slower and in a fingernail-sized package. The Pi starts its operating system from here unless told to boot from USB or NVMe.",
        "Speed markings matter: **A2** cards are rated for the small random reads and writes an operating system does constantly, which makes the desktop feel far snappier than a camera card optimised for big sequential writes.",
      ],
      specs: [
        ["Size", "15 × 11 × 1 mm"],
        ["Contacts", "8"],
      ],
    },

    // --- Active Cooler ----------------------------------------------------------
    "active-cooler": {
      name: "Active Cooler",
      category: "cooling",
      summary: "The official clip-on heatsink-and-fan that stops the Pi 5 from throttling.",
      details: [
        "Under sustained load the BCM2712 can heat up to its limit within a few minutes. At **80 °C** the firmware starts lowering the CPU clock, and at **85 °C** it drops to 1.5 GHz to protect the chip — this is **thermal throttling**.",
        "The Active Cooler clips on with two spring-loaded pins and pulls heat out of the SoC, RP1, PMIC and Wi-Fi chip through thermal pads. With it fitted, the Pi stays around 60 °C even when all four cores run flat out, so it keeps its full 2.4 GHz.",
      ],
      specs: [
        ["Size", "63.5 × 42.5 mm, 13.7 mm tall incl. pins"],
        ["Fan", "Blower, up to ≈8,000 rpm, PWM controlled"],
        ["Temperatures", "≈45 °C idle, ≈60–63 °C full load"],
        ["Without cooling", ">85 °C and throttling under sustained load"],
      ],
      howItWorks: [
        "Heat flows from the hot chips into the thermal pads and the aluminium base plate.",
        "The base spreads it into a forest of small fins, giving a large surface area.",
        "The blower draws air in from above and pushes it sideways through the fins, carrying the heat away.",
        "The firmware raises the fan speed in steps as the temperature climbs, so it stays silent at idle.",
      ],
    },
    "cooler-heatsink": {
      name: "Aluminium heatsink",
      category: "cooling",
      summary: "A single anodised aluminium piece: base plate plus 54 cross-cut fins.",
      details: [
        "Air is a poor conductor, so to hand heat over to it you need **surface area**. The heatsink's six rows of fins are cut across into 54 separate pins, which lets air flow through in several directions and adds even more edges for heat to escape from.",
        "Aluminium conducts heat well, is light and easy to machine. **Anodising** grows a hard oxide layer on the surface that resists scratches and corrosion — and slightly improves radiation of heat.",
      ],
      specs: [
        ["Material", "Anodised aluminium, one piece"],
        ["Fins", "6 × 9 cross-cut pin fins"],
      ],
    },
    "cooler-fan": {
      name: "Blower fan",
      category: "cooling",
      summary: "A small centrifugal fan that blows air sideways through the fins.",
      details: [
        "Unlike a desk fan, a **blower** pulls air in through the circular opening on top and flings it outward with a spinning wheel; the snail-shaped **volute** inside the housing collects that air and channels it out of one side — straight into the fin array.",
        "Blowers make more pressure than flat axial fans of the same size, which helps push air through tightly packed fins. Three screws hold it to the heatsink.",
      ],
      specs: [
        ["Type", "Centrifugal blower, 30 × 30 mm"],
        ["Speed", "up to 8,000 rpm ±15%"],
        ["Supply", "5 V from the fan connector"],
      ],
    },
    "fan-impeller": {
      name: "Impeller",
      category: "mechanical",
      summary: "The bladed wheel that throws air outward as it spins.",
      details: [
        "Dozens of thin, forward-curved blades are moulded around the motor hub. As the wheel spins, the air between the blades is flung outward by centrifugal force and new air is sucked in at the centre.",
        "A brushless motor inside the hub turns it, and a Hall-effect sensor produces the tachometer pulses the Pi uses to check the fan is actually spinning.",
      ],
    },
    "fan-cable": {
      name: "Fan cable & plug",
      category: "io",
      summary: "Four thin wires to the board's fan connector.",
      details: [
        "The red wire brings **5 V**, black is **ground**, blue carries the **PWM** speed signal from the Pi and yellow returns the **tachometer** pulses from the fan. The small white plug is a JST-SH type with 1 mm spacing between contacts.",
      ],
      specs: [["Wires", "red 5 V · blue PWM · black GND · yellow tach"]],
    },
    "cooler-push-pins": {
      name: "Spring-loaded push pins (×2)",
      category: "mechanical",
      summary: "Clips that pass through two dedicated holes and press the cooler down evenly.",
      details: [
        "The Pi 5 has two extra holes, diagonally opposite each other, just for the cooler. Each pin's split barb squeezes through its hole and springs open under the board; the coil spring then holds the heatsink against the chips with a steady, even force.",
        "Too little pressure leaves an air gap; too much could crack the board or chips. Springs give the right force regardless of small differences in height.",
      ],
    },
    "cooler-thermal-pads": {
      name: "Thermal pads (×4)",
      category: "cooling",
      summary: "Soft, heat-conducting pads between the cooler and four hot chips.",
      details: [
        "The chips under the cooler are all different heights, so the heatsink can't touch them directly. Squishy silicone pads filled with ceramic particles fill each gap while conducting heat: a thin one on the SoC's lid, thicker ones on RP1, the PMIC and the Wi-Fi shield.",
        "The pads come pre-applied and are only meant to be compressed once, which is why Raspberry Pi advises against removing the cooler after fitting it.",
      ],
      specs: [
        ["Covers", "SoC, RP1, PMIC, Wi-Fi can"],
        ["Material", "Ceramic-filled silicone"],
      ],
    },
  },
};
