# Supernova background

The circling star background from the personal site's Supernova theme
(`personal-site/supernova-background`): 5,000 white points in a spherical shell
(radii 20–80) slowly rotating in front of the camera, with fog and additive
blending.

`index.js` and `style.css` are copied unchanged. `starfield.js` differs in two
ways: it imports Three.js from the project's `three` package instead of the
bundled `vendor/three` copy (so the library isn't shipped twice), and the sphere
turns at 40% of the original rate (`SPIN`).

The package's demo page, vendored Three.js and React variant were not needed.

Used by the home page through `components/site/SupernovaBackground.tsx`, which
mounts it on load and disposes it when you navigate away.
