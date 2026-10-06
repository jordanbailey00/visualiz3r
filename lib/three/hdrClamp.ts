import { ShaderChunk } from "three";

/**
 * Caps the HDR output of every built-in material. Near-mirror surfaces (disk
 * platters, polished lids, chrome) catch direct-light highlights tens of
 * thousands of times brighter than white. Tone mapping turns those pixels into
 * plain white, but bloom spreads them into a haze across half the screen.
 * Nothing meant to glow is brighter than 4.2 (the Pi activity LED), so a
 * cap of 5 only removes the outliers. Import once, before materials compile.
 */
const MARK = "/* hdr-clamp */";

if (!ShaderChunk.opaque_fragment.includes(MARK)) {
  ShaderChunk.opaque_fragment = `${MARK}
outgoingLight = min( outgoingLight, vec3( 5.0 ) );
${ShaderChunk.opaque_fragment}`;
}
