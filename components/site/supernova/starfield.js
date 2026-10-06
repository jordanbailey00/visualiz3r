import * as THREE from 'three';

// Port of space-version/components/starfield/Starfield.tsx. Preserve the same
// star volume, perspective, circular particles, additive blending, fog, and
// rotation rates; only the React wrapper has been replaced.
const PARTICLES_COUNT = 5000;
/** visualiz3r: the sphere turns at 40% of the original rate. */
const SPIN = 0.4;

function createStarPositions() {
  const positions = new Float32Array(PARTICLES_COUNT * 3);
  const innerRadius = 20;
  const outerRadius = 80;
  for (let i = 0; i < PARTICLES_COUNT; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = Math.cbrt(Math.random() * (outerRadius ** 3 - innerRadius ** 3) + innerRadius ** 3);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  return positions;
}

export function createStarfield({ document, window }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'supernova-background';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  // Match React Three Fiber's default output and tone mapping in the old site.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.Fog('#000000', 25, 120);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 5);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(createStarPositions(), 3));
  const material = new THREE.PointsMaterial({
    size: 0.15, color: '#ffffff', transparent: true, opacity: 0.7,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      if (r > 1.0) discard;
      #include <clipping_planes_fragment>
    `);
  };
  const stars = new THREE.Group();
  stars.position.set(0, 0, -60);
  stars.add(new THREE.Points(geometry, material));
  scene.add(stars);
  let frame = null;
  let previous = null;
  let moving = false;
  let contextLost = false;

  function cancelFrame() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    previous = null;
  }

  function animate(now) {
    const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 0.1);
    previous = now;
    stars.rotation.y += delta * 0.015 * SPIN;
    stars.rotation.x += delta * 0.005 * SPIN;
    stars.rotation.z += delta * 0.002 * SPIN;
    renderer.render(scene, camera);
    frame = window.requestAnimationFrame(animate);
  }

  function setMotion(enabled) {
    moving = enabled;
    cancelFrame();
    if (moving && !contextLost) frame = window.requestAnimationFrame(animate);
  }

  function resize() {
    if (contextLost) return;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Reduced-motion readers still get the original star field, held still.
    renderer.render(scene, camera);
  }

  function lost(event) {
    event.preventDefault();
    contextLost = true;
    cancelFrame();
  }
  function restored() {
    contextLost = false;
    resize();
    setMotion(moving);
  }

  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('resize', resize);
  document.body.prepend(canvas);
  resize();
  return {
    setMotion,
    dispose() {
      cancelFrame();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
