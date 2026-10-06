import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type MeshPhysicalMaterialParameters,
} from "three";

/**
 * Shared physically based materials. Created lazily and reused by every model
 * so a scene with thousands of parts still uses a handful of shader programs.
 */
const made = new Map<string, MeshPhysicalMaterial | MeshStandardMaterial>();

function phys(key: string, p: MeshPhysicalMaterialParameters) {
  let m = made.get(key);
  if (!m) {
    m = new MeshPhysicalMaterial(p);
    m.name = key;
    made.set(key, m);
  }
  return m as MeshPhysicalMaterial;
}

export const MAT = {
  // --- Metals -------------------------------------------------------------
  /** ENIG gold on pads and edge fingers. */
  get gold() {
    return phys("gold", { color: "#f0c56a", metalness: 1, roughness: 0.2 });
  },
  get copper() {
    return phys("copper", { color: "#d08a5c", metalness: 1, roughness: 0.27 });
  },
  /** Nickel-plated copper: heat pipes, cold plates, IHS. */
  get nickel() {
    return phys("nickel", { color: "#d6d3ce", metalness: 1, roughness: 0.2 });
  },
  /** Solder / tin-plated terminals. */
  get tin() {
    return phys("tin", { color: "#c7cbd1", metalness: 1, roughness: 0.32 });
  },
  get steel() {
    return phys("steel", { color: "#a9aeb5", metalness: 1, roughness: 0.34 });
  },
  get steelDark() {
    return phys("steelDark", { color: "#3b3e44", metalness: 1, roughness: 0.45 });
  },
  get aluminum() {
    return phys("aluminum", { color: "#c4c8cd", metalness: 1, roughness: 0.3 });
  },
  get aluminumBrushed() {
    return phys("aluminumBrushed", {
      color: "#c9cdd2",
      metalness: 1,
      roughness: 0.32,
      anisotropy: 0.8,
    });
  },
  /** Black anodised aluminium (backplates, shrouds). */
  get aluminumBlack() {
    return phys("aluminumBlack", {
      color: "#1b1d21",
      metalness: 0.85,
      roughness: 0.42,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
    });
  },
  /** Gunmetal grey anodised aluminium. */
  get aluminumGunmetal() {
    return phys("aluminumGunmetal", {
      color: "#4a4e55",
      metalness: 0.9,
      roughness: 0.38,
      anisotropy: 0.5,
    });
  },
  /** Heatsink fins: thin stamped aluminium. */
  get fin() {
    return phys("fin", { color: "#b8bcc2", metalness: 1, roughness: 0.3, side: DoubleSide });
  },
  get chrome() {
    return phys("chrome", { color: "#e7e9ec", metalness: 1, roughness: 0.08 });
  },

  // --- Plastics -----------------------------------------------------------
  get plasticBlack() {
    return phys("plasticBlack", { color: "#151619", metalness: 0, roughness: 0.62 });
  },
  get plasticSatin() {
    return phys("plasticSatin", {
      color: "#1c1e22",
      metalness: 0,
      roughness: 0.42,
      clearcoat: 0.3,
      clearcoatRoughness: 0.5,
    });
  },
  get plasticGloss() {
    return phys("plasticGloss", {
      color: "#0d0e10",
      metalness: 0,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
  },
  get plasticGray() {
    return phys("plasticGray", { color: "#2c2f35", metalness: 0, roughness: 0.55 });
  },
  get plasticWhite() {
    return phys("plasticWhite", { color: "#e9e7e1", metalness: 0, roughness: 0.48 });
  },
  /** Natural nylon connector housings. */
  get nylon() {
    return phys("nylon", { color: "#e6dcc6", metalness: 0, roughness: 0.55, sheen: 0.2 });
  },
  get plasticBlue() {
    return phys("plasticBlue", { color: "#1f5fc8", metalness: 0, roughness: 0.45 });
  },
  get rubber() {
    return phys("rubber", { color: "#0b0b0c", metalness: 0, roughness: 0.92 });
  },

  // --- Electronics --------------------------------------------------------
  /** Epoxy mould compound of IC packages. */
  get epoxy() {
    return phys("epoxy", { color: "#19191b", metalness: 0, roughness: 0.74 });
  },
  /** Back side of a flip-chip silicon die: lapped, nearly mirror-like. */
  get silicon() {
    return phys("silicon", {
      color: "#2d3039",
      metalness: 0.7,
      roughness: 0.1,
      iridescence: 0.35,
      iridescenceIOR: 1.7,
      iridescenceThicknessRange: [250, 650],
    });
  },
  /** MLCC ceramic body. */
  get ceramic() {
    return phys("ceramic", { color: "#b3946b", metalness: 0, roughness: 0.58 });
  },
  get ceramicDark() {
    return phys("ceramicDark", { color: "#6d5238", metalness: 0, roughness: 0.6 });
  },
  /** Thick-film resistor body (top coat). */
  get resistor() {
    return phys("resistor", { color: "#111214", metalness: 0, roughness: 0.62 });
  },
  /** Ferrite / composite inductor body. */
  get ferrite() {
    return phys("ferrite", { color: "#3b3c40", metalness: 0.25, roughness: 0.66 });
  },
  /** FR-4 board edge (glass-epoxy core). */
  get fr4() {
    return phys("fr4", { color: "#5f6a3e", metalness: 0, roughness: 0.75 });
  },
  /** Organic package substrate (green-brown). */
  get substrate() {
    return phys("substrate", {
      color: "#38452c",
      metalness: 0,
      roughness: 0.45,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    });
  },
  /** Underfill epoxy fillet around a flip-chip die. */
  get underfill() {
    return phys("underfill", { color: "#2a2117", metalness: 0, roughness: 0.35, clearcoat: 0.6 });
  },
  get thermalPad() {
    return phys("thermalPad", { color: "#8ea3b8", metalness: 0, roughness: 0.95 });
  },
  get thermalPadPink() {
    return phys("thermalPadPink", { color: "#c98f93", metalness: 0, roughness: 0.95 });
  },
  get thermalPaste() {
    return phys("thermalPaste", { color: "#b6babf", metalness: 0.1, roughness: 0.6 });
  },
  get labelWhite() {
    return phys("labelWhite", { color: "#f1f0ea", metalness: 0, roughness: 0.55 });
  },
} as const;

const emissives = new Map<string, MeshStandardMaterial>();

/** Glowing material (LEDs, light bars). Intensity > 1 blooms. */
export function emissive(color: string, intensity = 2.5) {
  const key = `${color}:${intensity}`;
  let m = emissives.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color).multiplyScalar(0.3),
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
      toneMapped: true,
    });
    emissives.set(key, m);
  }
  return m;
}

const tinted = new Map<string, MeshPhysicalMaterial>();

/** A one-off variant of a shared material, cached by key. */
export function variant(
  key: string,
  base: MeshPhysicalMaterial,
  overrides: MeshPhysicalMaterialParameters,
) {
  let m = tinted.get(key);
  if (!m) {
    m = base.clone();
    m.setValues(overrides);
    m.name = key;
    tinted.set(key, m);
  }
  return m;
}
