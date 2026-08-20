import { useEffect, useRef } from 'react';
import { Renderer, Camera, Geometry, Program, Mesh, Vec3 } from 'ogl';

/* ------------------------------------------------------------------ */
/*  Shaders                                                            */
/* ------------------------------------------------------------------ */

const VERTEX = /* glsl */ `
attribute vec3 position;   // ORIGIN  — loose cloud
attribute vec3 aGrid;      // CONTROL — lattice
attribute vec3 aSphere;    // THE LAST — lobed monument
attribute vec4 aSeed;      // per-particle variation

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uProgress;   // 0..3 across the four stages
uniform float uMotion;     // 0.25 when prefers-reduced-motion
uniform vec3  uPointer;    // pointer projected onto the field plane
uniform float uForce;      // pointer force strength (inertia in JS)
uniform float uSize;
uniform float uScale;      // viewport scale for point attenuation

varying vec3  vColor;
varying float vAlpha;

/* --- simplex noise (Ashima) --- */
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  float p = uProgress;

  /* stage weights — one universe, four states */
  float wBreak  = smoothstep(0.12, 1.0, p) * (1.0 - smoothstep(1.55, 2.30, p));
  float wGrid   = smoothstep(1.35, 2.10, p);
  float wSphere = smoothstep(2.30, 2.90, p);
  float wCalm   = smoothstep(2.50, 2.98, p);

  float t = uTime * uMotion;

  /* ambient drift — the calm origin state */
  vec3 drift = vec3(
    snoise(position * 0.55 + vec3(0.0, t * 0.05, 7.3)),
    snoise(position * 0.55 + vec3(t * 0.06, 3.1, 0.0)),
    snoise(position * 0.55 + vec3(9.2, 0.0, t * 0.05))
  ) * (0.14 + 0.30 * wBreak);

  /* BREAK — swirl, burst, stretch, unstable core */
  float rr = length(position.xz);
  float swirl = wBreak * (1.2 * exp(-rr * 0.45) + 0.18) * (aSeed.w * 2.0 - 1.0);
  float ca = cos(swirl);
  float sa = sin(swirl);
  vec3 broken = position;
  broken.xz = mat2(ca, -sa, sa, ca) * position.xz;
  broken += normalize(position + 0.001)
          * snoise(position * 1.6 + vec3(0.0, t * 0.4, 0.0)) * 1.15 * wBreak;
  broken.y *= 1.0 + wBreak * 0.5
            * snoise(vec3(position.x * 0.7, t * 0.35, position.z * 0.7));
  broken += wBreak * exp(-rr * 0.9) * 0.35
          * vec3(sin(t * 2.1 + aSeed.y * 9.0),
                 cos(t * 1.6 + aSeed.y * 7.0),
                 sin(t * 2.7 + aSeed.y * 5.0));

  vec3 pos = position + drift;
  pos = mix(pos, broken + drift * 1.4, wBreak);

  /* CONTROL — settle into the lattice */
  vec3 gridPos = aGrid + snoise(aGrid * 2.0 + t * 0.25) * 0.015;
  pos = mix(pos, gridPos, wGrid);

  /* THE LAST — breathing monument */
  float breathe = 1.0 + 0.04 * sin(t * 0.7 + aSeed.y * 6.2831) * (1.0 - wCalm * 0.7);
  vec3 spherePos = aSphere * breathe;
  spherePos += normalize(aSphere) * snoise(aSphere * 1.4 + t * 0.15) * 0.05 * uMotion;
  pos = mix(pos, spherePos, wSphere);

  /* pointer force field — repulsion + tangential bend */
  vec3 toP = pos - uPointer;
  float d2 = dot(toP, toP);
  float influence = uForce * exp(-d2 * 0.6);
  pos += normalize(toP + 1e-4) * influence * 0.85;
  pos += normalize(cross(vec3(0.0, 1.0, 0.0), toP) + 1e-4) * influence * 0.5;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * (0.4 + aSeed.x * 1.4);
  size *= 1.0 + wBreak * 0.5 * abs(snoise(position * 3.0 + t));
  size *= 1.0 + influence * 1.6;
  gl_PointSize = size * uScale / max(0.1, -mv.z);

  /* colour story: bone white → ember → steel → white-hot */
  vec3 cBase  = vec3(0.90, 0.88, 0.84);
  vec3 cEmber = vec3(1.00, 0.42, 0.20);
  vec3 cSteel = vec3(0.58, 0.68, 0.78);
  vec3 cCore  = vec3(1.00, 0.97, 0.90);
  vec3 col = cBase;
  col = mix(col, cEmber, wBreak * (0.25 + 0.75 * aSeed.w));
  col = mix(col, cSteel, wGrid * (1.0 - wSphere) * 0.6);
  col = mix(col, cCore,  wSphere * 0.75);
  col += influence * vec3(0.85, 0.45, 0.20);
  vColor = col;

  float alpha = 0.28 + aSeed.z * 0.72;
  alpha *= mix(0.75, 1.0, wSphere);
  alpha *= 1.0 + influence * 0.8;
  alpha *= mix(1.0, 0.55, step(0.82, aSeed.y) * (1.0 - wGrid)); // sparse origin feel
  vAlpha = clamp(alpha, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec3  vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.12, d);
  float core = smoothstep(0.16, 0.0, d);
  float a = disc * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor + core * 0.35, a);
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WebGLScene({ onTelemetry }) {
  const canvasRef = useRef(null);
  const cbRef = useRef(null);

  // keep the callback fresh without re-running the WebGL effect
  useEffect(() => { cbRef.current = onTelemetry; }, [onTelemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse  = window.matchMedia('(pointer: coarse)').matches;
    const small   = Math.min(window.innerWidth, window.innerHeight) < 760;
    const mobile  = coarse || small;

    let renderer;
    try {
      renderer = new Renderer({
        canvas,
        dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2),
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      canvas.classList.add('is-unavailable'); // page still works, typography only
      return undefined;
    }

    const gl = renderer.gl;
    gl.clearColor(0.02, 0.02, 0.024, 1);

    const camera = new Camera(gl, { fov: 42, near: 0.1, far: 80 });

    /* ---- particle data: COUNT = N³ so the CONTROL lattice is exact ---- */
    const N = mobile ? 24 : 34;               // 13,824 or 39,304 particles
    const COUNT = N * N * N;
    const GA = Math.PI * (3 - Math.sqrt(5));  // golden angle

    const positions = new Float32Array(COUNT * 3);
    const grid      = new Float32Array(COUNT * 3);
    const sphere    = new Float32Array(COUNT * 3);
    const seeds     = new Float32Array(COUNT * 4);

    const spacing = 4.6 / (N - 1);
    const half = (N - 1) / 2;

    for (let i = 0; i < COUNT; i += 1) {
      const i3 = i * 3;
      const i4 = i * 4;

      // ORIGIN — flattened cloud, some far dust for depth
      const far = Math.random() < 0.15;
      const rad = far ? 4.5 + Math.random() * 3.5 : 0.5 + Math.sqrt(Math.random()) * 3.2;
      const th = Math.random() * Math.PI * 2;
      positions[i3]     = Math.cos(th) * rad;
      positions[i3 + 2] = Math.sin(th) * rad;
      positions[i3 + 1] = (Math.random() + Math.random() + Math.random() - 1.5)
                        * (far ? 1.9 : 0.85);

      // CONTROL — cubic lattice
      const gx = i % N;
      const gy = Math.floor(i / N) % N;
      const gz = Math.floor(i / (N * N));
      grid[i3]     = (gx - half) * spacing;
      grid[i3 + 1] = (gy - half) * spacing;
      grid[i3 + 2] = (gz - half) * spacing;

      // THE LAST — lobed fibonacci sphere
      const tt = COUNT > 1 ? i / (COUNT - 1) : 0;
      const y = 1 - tt * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = GA * i;
      const lobe = 0.34 * Math.sin(3.0 * phi) * Math.sin(2.4 * y * Math.PI)
                 + 0.16 * Math.sin(5.2 * y * Math.PI - phi * 2.0);
      const R = 2.0 + lobe + (Math.random() - 0.5) * 0.22;
      sphere[i3]     = Math.cos(phi) * ring * R;
      sphere[i3 + 1] = y * R;
      sphere[i3 + 2] = Math.sin(phi) * ring * R;

      seeds[i4]     = Math.random();
      seeds[i4 + 1] = Math.random();
      seeds[i4 + 2] = Math.random();
      seeds[i4 + 3] = Math.random();
    }

    const uniforms = {
      uTime:     { value: 0 },
      uProgress: { value: 0 },
      uMotion:   { value: reduced ? 0.25 : 1 },
      uPointer:  { value: new Vec3(0, 0, 0) },
      uForce:    { value: 0 },
      uSize:     { value: mobile ? 0.024 : 0.028 },
      uScale:    { value: 1 },
    };

    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      aGrid:    { size: 3, data: grid },
      aSphere:  { size: 3, data: sphere },
      aSeed:    { size: 4, data: seeds },
    });

    // FIX IS HERE: Use Mesh with mode: gl.POINTS instead of Points
    const points = new Mesh(gl, { mode: gl.POINTS, geometry, program });
    points.frustumCulled = false;

    /* ---- pointer ---- */
    const ndc = { x: 0, y: 0, tx: 0, ty: 0 };
    const ptrTarget = new Vec3(0, 0, 0);
    const tmp = new Vec3();
    let simTime = 0;
    let lastPointerTime = -100;
    let pointerSpeed = 0;
    let prevTx = 0;
    let prevTy = 0;

    const setPointer = (cx, cy) => {
      ndc.tx = (cx / window.innerWidth) * 2 - 1;
      ndc.ty = -((cy / window.innerHeight) * 2 - 1);
      lastPointerTime = simTime;
    };
    const onPointerMove = (e) => {
      if (e.clientX != null) setPointer(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });

    /* ---- scroll → target progress ---- */
    let targetProgress = 0;
    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      targetProgress = max > 0 ? Math.min(3, Math.max(0, (window.scrollY / max) * 3)) : 0;
    };
    window.addEventListener('scroll', readScroll, { passive: true });
    readScroll();

    /* ---- resize ---- */
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.perspective({ aspect: window.innerWidth / window.innerHeight });
      uniforms.uScale.value =
        (gl.drawingBufferHeight * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    };
    window.addEventListener('resize', resize);
    resize();

    /* ---- camera keyframes per stage ---- */
    const KEY_Z     = [8.6, 7.6, 6.9, 6.0];
    const KEY_Y     = [0.5, 1.05, 1.6, 0.3];
    const KEY_ORBIT = [0.0, 0.3, 0.85, 1.45];
    const smooth = (x) => x * x * (3 - 2 * x);
    const keyLerp = (arr, p) => {
      const i = Math.min(Math.floor(p), arr.length - 2);
      const f = smooth(Math.min(Math.max(p - i, 0), 1));
      return arr[i] + (arr[i + 1] - arr[i]) * f;
    };

    /* ---- loop ---- */
    const damp = (dt, k) => 1 - Math.exp(-k * dt);
    let progress = targetProgress;   // reload mid-page: no fly-through
    let driftAngle = 0;
    let raf = 0;
    let running = true;
    let last = performance.now();

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      simTime += dt * (reduced ? 0.4 : 1);
      uniforms.uTime.value = simTime;

      progress += (targetProgress - progress) * damp(dt, 2.4);
      uniforms.uProgress.value = progress;

      /* pointer smoothing + velocity */
      ndc.x += (ndc.tx - ndc.x) * damp(dt, 9);
      ndc.y += (ndc.ty - ndc.y) * damp(dt, 9);
      const moveDist = Math.hypot(ndc.tx - prevTx, ndc.ty - prevTy);
      prevTx = ndc.tx;
      prevTy = ndc.ty;
      pointerSpeed += (Math.min(moveDist / Math.max(dt, 0.001), 4) / 4 - pointerSpeed) * damp(dt, 6);

      /* project pointer onto the field plane (z = 0) */
      camera.updateMatrixWorld();
      tmp.set(ndc.x, ndc.y, 0.5).unproject(camera);
      tmp.sub(camera.worldPosition); // now a direction
      if (Math.abs(tmp.z) > 1e-4) {
        const tt = -camera.worldPosition.z / tmp.z;
        if (tt > 0) {
          ptrTarget.set(
            camera.worldPosition.x + tmp.x * tt,
            camera.worldPosition.y + tmp.y * tt,
            0
          );
        }
      }
      const pv = uniforms.uPointer.value;
      const pk = damp(dt, 8);
      pv.x += (ptrTarget.x - pv.x) * pk;
      pv.y += (ptrTarget.y - pv.y) * pk;
      pv.z += (ptrTarget.z - pv.z) * pk;

      /* force: rises fast while moving, decays slowly when still */
      const idle = simTime - lastPointerTime;
      const forceTarget = idle < 1.6
        ? (coarse ? 0.75 : 1) * (0.5 + 0.5 * Math.min(pointerSpeed * 1.6, 1))
        : 0;
      const fk = damp(dt, forceTarget > uniforms.uForce.value ? 7 : 1.6);
      uniforms.uForce.value += (forceTarget - uniforms.uForce.value) * fk;

      /* camera — one slow orbit, keyframed distance/height, gentle parallax */
      driftAngle += dt * (reduced ? 0.004 : 0.03);
      const parallax = reduced ? 0.3 : 1;
      const orbit = keyLerp(KEY_ORBIT, progress) + driftAngle + ndc.x * 0.05 * parallax;
      const cz = keyLerp(KEY_Z, progress) + (mobile ? 1.0 : 0);
      const cy = keyLerp(KEY_Y, progress) + ndc.y * 0.22 * parallax;
      camera.position.set(Math.sin(orbit) * cz, cy, Math.cos(orbit) * cz);
      camera.lookAt(0, keyLerp([0, 0.1, 0.15, 0], progress), 0);

      renderer.render({ scene: points, camera });

      if (cbRef.current) {
        cbRef.current({
          progress,
          stage: Math.max(0, Math.min(3, Math.round(progress))),
          px: pv.x,
          py: pv.y,
          dist: Math.hypot(camera.position.x, camera.position.y, camera.position.z),
        });
      }
    };
    raf = requestAnimationFrame(loop);

    /* pause when the tab is hidden */
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerMove);
      document.removeEventListener('visibilitychange', onVis);
      // Note: buffers/programs are released with the context on page unload;
      // no explicit loseContext() so React StrictMode remounts stay healthy.
    };
  }, []);

  return <canvas ref={canvasRef} className="tl-canvas" aria-hidden="true" />;
}
