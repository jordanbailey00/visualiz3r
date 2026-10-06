# Hardware explorer — how models are built

Each device is a React Three Fiber component tree built from procedural geometry
(no downloaded meshes). Units are **millimetres**, **+Y is up**, and a device rests
on the floor at **y = 0**, centred on the origin in XZ.

```
lib/hardware/
  types.ts              DeviceInfo / PartInfo types
  catalog.ts            device list for navigation
  content/<id>.ts       explanations for every part (+ device intro, specs, camera)
  store.ts              zustand store (selection, explode, x-ray, …)
components/hardware/
  Part.tsx              selectable / explodable group
  HardwareCanvas.tsx    lights, environment, camera, post-processing
  kit/                  reusable parts (boards, chips, passives, connectors, fans…)
  models/<id>/          one folder per device; default export from <Name>Model.tsx
  models/registry.ts    lazy imports of each model
lib/three/
  painter.ts            canvas painter → colour / roughness-metalness / bump maps
  pcbPaint.ts           PCB helpers: traces, vias, BGA lands, silkscreen…
  dieShot.ts            procedural silicon floorplans
  fit.ts                perspective-exact framing of the visible meshes
  viewShift.ts          pixel shift that centres the view between the side panels
  visibleHits.ts        pointer events ignore hidden objects
  hdrClamp.ts           caps material output at 5.0 so mirror highlights don't bloom
```

## Parts

```tsx
<Part id="vram" explode={[0, 8, 0]} explodeRange={[0.5, 1]}>
  …meshes and nested <Part>s…
</Part>
```

- `id` must have an entry in the device's `parts` content map. The component tree
  in the UI mirrors `<Part>` nesting; clicking selects the deepest part hit
  (the camera stays put), double-clicking or pressing **F** flies to it.
- Every visible mesh should live inside a `Part` — otherwise it can't be selected.
- `explode` is the displacement (parent space) at full explode; nested offsets add.
  `explodeRange` staggers motion over the slider; `explodeRotate` adds rotation.
- `cover` marks shells that turn see-through in X-ray mode.
- Group repeated identical items under one Part (e.g. "GDDR7 memory (×12)").

## Kit highlights

| Module | Use |
| --- | --- |
| `kit/Board` | PCB from a `Shape` outline; paint top/bottom with `pcbPaint` helpers |
| `kit/Chip` | `Chip` (bga/qfn/soic/tsop/sot/lga with marking + balls), `FlipChip` (substrate + bare die, selectable die that flips on explode), `markingMaterial`, `BallGrid` |
| `kit/Passives` | `SmdField` (instanced 0201–1206 R/C) + `ringOf/rowOf/gridOf/scatterIn`, `PolymerCap`, `TantalumCap`, `Choke` |
| `kit/Connectors` | `DisplayPort`, `Hdmi` (`micro`), `UsbC`, `UsbA` (`stacked`, `usb3`), `Rj45`, `PinHeader`, `WireHeader`, `Power16Pin`, `FfcConnector`, `Standoff` |
| `kit/Fan`, `kit/Thermal` | Axial fan with twisted blades; `FinStack`, `HeatPipe`, `bentPath` |
| `kit/Fasteners` | `Screw` |
| `kit/Reveal` | `Reveal` grows magnified "deep dive" views out of a point near full explode; `useAutoExplode(rootId)` opens the model when such a part is picked from the tree |
| `kit/geometry` | `cached`, `roundedBox`, `roundedRectShape`, `circlePath`, `polygonShape`, `flatFace`, `extrudedWalls` |
| `kit/materials` | `MAT.*` shared PBR materials, `emissive()` (keep intensity ≤ 4.5: output is capped at 5), `variant()` |

Ports open toward **+Z** at z = 0 with their base at y = 0; rotate them into place.
Instanced and merged geometry keeps draw calls low — prefer `SmdField`,
`InstancedMesh` and `mergeGeometries` for anything repeated.

Hidden parts never receive pointer events (the canvases filter hits on
invisible objects), so collapsed views and parts hidden from the tree are safe.

## Content

`lib/hardware/content/<id>.ts` exports a `DeviceInfo`: intro paragraphs, headline
specs, a camera direction (`position`/`target` — only the direction is used:
the camera is fitted to whatever is visible, and re-fitted after exploding), a
characteristic `size` in mm, and `parts`. Copy supports `**bold**`, `` `code` ``
and `_italic_`.

## Checking your work

With the dev server running on port 4174:

```bash
node scripts/screenshot.mjs /hardware/gpu .screenshots/gpu.png --wait 9000 \
  --eval "window.__explorer.getState().setExplode(1)" --then-wait 4000
npm run smoke   # loads every device, explodes it, zooms to its smallest part
```

In development `window.__explorer` is the store and `window.__three` the R3F state
(`__three.controls` is the CameraControls instance). `--mouse x,y` moves the pointer
and prints the hovered part. Press **H** (or add `?clean` to the URL) to hide the UI
for clean renders; **C** opens the component tree, **I** the unit brief, **L** toggles
part labels, **E** explode, **X** X-ray, **R** reset.
