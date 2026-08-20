import { useEffect, useRef } from 'react';
import { Renderer, Camera, Geometry, Program, Mesh, Vec3 } from 'ogl';

/* ------------------------------------------------------------------ */
/*  Shaders — flowing light streams                                    */
/* ------------------------------------------------------------------ */

const VERTEX = /* glsl */ `
attribute vec3 position;   // stream base line (x along width, y band, z depth)
attribute vec3 aGrid;      // CONTROL — lattice
attribute vec3 aSphere;    // THE LAST — lobed monument
attribute vec4 aSeed;      // x size · y stream phase · z stream brightness · w hue

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uProgress;
uniform float uMotion;
uniform vec3  uPointer;
uniform float uForce;
uniform float uSize;
uniform float uScale;
uniform float uSpread;
uniform float uInvSpread;
uniform float uFalloff;
uniform float uGain;
uniform float uHalfW;

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

  float wBreak  = smoothstep(0.12, 1.0, p) * (1.0 - smoothstep(1.55, 2.30, p));
  float wGrid   = smoothstep(1.35, 2.10, p);
  float wSphere = smoothstep(2.30, 2.90, p);
  float wCalm   = smoothstep(2.50, 2.98, p);

  float t  = uTime * uMotion;
  float xs = position.x * uInvSpread;          // scale-independent coordinate
  float ph = aSeed.y * 6.2831;

  /* ORIGIN / BREAK — the flowing wave bundle from the reference */
  float amp = (0.17 + 0.10 * sin(ph * 3.0)) * (1.0 + wBreak * 2.4);
  vec3 streamPos = position;
  streamPos.y += (sin(xs * 1.15 + t * 0.7 + ph)
                + sin(xs * 2.35 - t * 1.1 + ph * 2.0) * 0.5
                + snoise(vec3(xs * 0.55, aSeed.y * 4.0, t * 0.30))) * amp * uSpread;
  streamPos.z += cos(xs * 1.7 + t * 0.5 + ph) * 0.14 * uSpread * (1.0 + wBreak);
  /* BREAK turbulence */
  streamPos.x += snoise(vec3(position.y * 2.0, t * 0.6, ph)) * 0.55 * wBreak * uSpread;
  streamPos.y += snoise(vec3(xs * 1.4, t * 0.8, ph)) * 0.65 * wBreak * uSpread;

  vec3 pos = streamPos;

  /* CONTROL — streams dissolve into the lattice */
  vec3 gridPos = aGrid + snoise(aGrid * 2.0 + t * 0.25) * 0.015 * uSpread;
  pos = mix(pos, gridPos, wGrid);

  /* THE LAST — breathing monument */
  float breathe = 1.0 + 0.04 * sin(t * 0.7 + aSeed.y * 6.2831) * (1.0 - wCalm * 0.7);
  vec3 spherePos = aSphere * breathe;
  spherePos += normalize(aSphere) * snoise(aSphere * 1.4 + t * 0.15) * 0.05 * uSpread;
  pos = mix(pos, spherePos, wSphere);

  /* pointer force field (desktop only — uForce is 0 on touch) */
  vec3 toP = pos - uPointer;
  float d2 = dot(toP, toP);
  float influence = uForce * exp(-d2 * uFalloff);
  pos += normalize(toP + 1e-4) * influence * 0.85 * uSpread;
  pos += normalize(cross(vec3(0.0, 1.0, 0.0), toP) + 1e-4) * influence * 0.5 * uSpread;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * (0.45 + aSeed.x * 1.1) * (1.0 + aSeed.z * 1.8);
  size *= 1.0 + wBreak * 0.4 * abs(snoise(position * 3.0 + t));
  size *= 1.0 + influence * 1.6;
  gl_PointSize = size * uScale / max(0.1, -mv.z);

  /* palette: deep violet → magenta → lavender-white (the reference video) */
  vec3 cDeep  = vec3(0.30, 0.17, 0.45);
  vec3 cMag   = vec3(0.80, 0.34, 1.00);
  vec3 cWhite = vec3(0.97, 0.93, 1.00);
  vec3 col = mix(cDeep, cMag, aSeed.z);
  col = mix(col, cWhite, aSeed.z * aSeed.z * 0.75);
  col = mix(col, vec3(1.00, 0.42, 0.85), wBreak * 0.35);
  col = mix(col, vec3(0.60, 0.52, 0.95), wGrid * (1.0 - wSphere) * 0.5);
  col = mix(col, cWhite, wSphere * 0.6);
  col += influence * vec3(0.55, 0.30, 0.90);
  vColor = col;

  float endFade = smoothstep(1.0, 0.78, abs(position.x) / uHalfW);
  float alpha = (0.06 + aSeed.z * 0.94) * endFade;
  alpha *= mix(0.8, 1.0, wSphere);
  alpha *= 1.0 + influence * 0.8;
  vAlpha = clamp(alpha * uGain, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec3  vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.10, d);
  float core = smoothstep(0.18, 0.0, d);
  float a = disc * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor + core * 0.5, a);
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WebGLScene({ onTelemetry }) {
  const canvasRef = useRef(null);
  const cbRef = useRef(null);

  useEffect(() => { cbRef.current = onTelemetry; }, [onTelemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse  = window.matchMedia('(pointer: coarse)').matches;
    const small   = Math.min(window.innerWidth, window.innerHeight) < 760;
    const mobile  = coarse || small;

    /* Mobile gets its own fitted composition (0.62x world). */
    const S = mobile ? 0.62 : 1.0;

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
      canvas.classList.add('is-unavailable');
      return undefined;
    }

    const gl = renderer.gl;
    gl.clearColor(0.075, 0.055, 0.10, 1); // deep aubergine, matches CSS --bg

    const camera = new Camera(gl, { fov: 42, near: 0.1, far: 80 });

    /* ---- particle data: streams + lattice + monument ---- */
    const N = mobile ? 24 : 34;
    const COUNT = N * N * N;
    const GA = Math.PI * (3 - Math.sqrt(5));

    const positions = new Float32Array(COUNT * 3);
    const grid      = new Float32Array(COUNT * 3);
    const sphere    = new Float32Array(COUNT * 3);
    const seeds     = new Float32Array(COUNT * 4);

    /* deterministic rng so every load composes the same "artwork" */
    let sv = 1234567;
    const rnd = () => { sv = (sv * 1664525 + 1013904223) % 4294967296; return sv / 4294967296; };

    const STREAMS = mobile ? 36 : 56;
    const per = Math.floor(COUNT / STREAMS);
    const halfW0 = mobile ? 4.2 : 6.5;

    const sY = [], sSlope = [], sBright = [], sPhase = [], sZ = [];
    for (let s = 0; s < STREAMS; s += 1) {
      const hero = s % 8 === 0;
      sBright[s] = hero ? 0.8 + rnd() * 0.2 : 0.06 + rnd() * 0.4;
      sY[s]    = hero ? (rnd() - 0.5) * 0.9 : (rnd() * 2 - 1) * 1.6;
      sSlope[s] = (rnd() - 0.5) * 0.5;
      sPhase[s] = rnd();
      sZ[s]    = (rnd() - 0.5) * 1.4;
    }

    const spacing = (4.6 * S) / (N - 1);
    const half = (N - 1) / 2;

    for (let i = 0; i < COUNT; i += 1) {
      const i3 = i * 3;
      const i4 = i * 4;

      if (rnd() < 0.06) {
        /* ambient dust for depth */
        const rad = (0.5 + Math.sqrt(rnd()) * 3.0) * S;
        const th = rnd() * Math.PI * 2;
        positions[i3]     = Math.cos(th) * rad;
        positions[i3 + 2] = Math.sin(th) * rad * 0.6;
        positions[i3 + 1] = (rnd() * 2 - 1) * 1.6 * S;
        seeds[i4] = rnd(); seeds[i4 + 1] = rnd();
        seeds[i4 + 2] = 0.05 + rnd() * 0.1; seeds[i4 + 3] = rnd();
      } else {
        /* a point on a flowing stream */
        const s = Math.min(Math.floor(i / per), STREAMS - 1);
        const u = ((i % per) + 0.5) / per;
        const x0 = (u * 2 - 1) * halfW0;
        positions[i3]     = x0 * S;
        positions[i3 + 1] = (sY[s] + x0 * sSlope[s] * 0.35 + (rnd() - 0.5) * 0.03) * S;
        positions[i3 + 2] = (sZ[s] + (rnd() - 0.5) * 0.25) * S;
        seeds[i4]     = rnd();
        seeds[i4 + 1] = sPhase[s];
        seeds[i4 + 2] = sBright[s];
        seeds[i4 + 3] = rnd();
      }

      /* CONTROL — cubic lattice */
      const gx = i % N;
      const gy = Math.floor(i / N) % N;
      const gz = Math.floor(i / (N * N));
      grid[i3]     = (gx - half) * spacing;
      grid[i3 + 1] = (gy - half) * spacing;
      grid[i3 + 2] = (gz - half) * spacing;

      /* THE LAST — lobed fibonacci sphere */
      const tt = COUNT > 1 ? i / (COUNT - 1) : 0;
      const y = 1 - tt * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = GA * i;
      const lobe = 0.34 * Math.sin(3.0 * phi) * Math.sin(2.4 * y * Math.PI)
                 + 0.16 * Math.sin(5.2 * y * Math.PI - phi * 2.0);
      const R = (2.0 + lobe + (rnd() - 0.5) * 0.22) * S;
      sphere[i3]     = Math.cos(phi) * ring * R;
      sphere[i3 + 1] = y * R;
      sphere[i3 + 2] = Math.sin(phi) * ring * R;
    }

    const uniforms = {
      uTime:      { value: 0 },
      uProgress:  { value: 0 },
      uMotion:    { value: reduced ? 0.25 : 1 },
      uPointer:   { value: new Vec3(0, 0, 0) },
      uForce:     { value: 0 },
      uSize:      { value: mobile ? 0.05 : 0.03 },
      uScale:     { value: 1 },
      uSpread:    { value: S },
      uInvSpread: { value: 1 / S },
      uFalloff:   { value: mobile ? 1.55 : 0.6 },
      uGain:      { value: mobile ? 1.7 : 1.0 },
      uHalfW:     { value: halfW0 * S },
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

    const points = new Mesh(gl, { mode: gl.POINTS, geometry, program });
    points.frustumCulled = false;

    /* ---- pointer (desktop only; touch is scroll-driven) ---- */
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
      if (!coarse && e.clientX != null) setPointer(e.clientX, e.clientY);
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

    /* ---- resize: aspect-adaptive FOV so portrait screens fit the field ---- */
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      const aspect = w / h;
      const fov = aspect >= 1 ? 42 : Math.min(74, 42 + (1 - aspect) * 38);
      camera.perspective({ fov, aspect });
      uniforms.uScale.value =
        (gl.drawingBufferHeight * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    };
    window.addEventListener('resize', resize);
    resize();

    /* ---- camera keyframes: mobile fitted ---- */
    const KEY_Z     = mobile ? [7.4, 7.0, 6.3, 5.8] : [8.6, 7.6, 6.9, 6.0];
    const KEY_Y     = mobile ? [0.35, 0.75, 1.1, 0.22] : [0.5, 1.05, 1.6, 0.3];
    const KEY_ORBIT = [0.0, 0.3, 0.85, 1.45];
    const smooth = (x) => x * x * (3 - 2 * x);
    const keyLerp = (arr, p) => {
      const i = Math.min(Math.floor(p), arr.length - 2);
      const f = smooth(Math.min(Math.max(p - i, 0), 1));
      return arr[i] + (arr[i + 1] - arr[i]) * f;
    };

    /* ---- loop ---- */
    const damp = (dt, k) => 1 - Math.exp(-k * dt);
    let progress = targetProgress;
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

      if (!coarse) {
        ndc.x += (ndc.tx - ndc.x) * damp(dt, 9);
        ndc.y += (ndc.ty - ndc.y) * damp(dt, 9);
        const moveDist = Math.hypot(ndc.tx - prevTx, ndc.ty - prevTy);
        prevTx = ndc.tx;
        prevTy = ndc.ty;
        pointerSpeed += (Math.min(moveDist / Math.max(dt, 0.001), 4) / 4 - pointerSpeed) * damp(dt, 6);

        camera.updateMatrixWorld();
        tmp.set(ndc.x, ndc.y, 0.5).unproject(camera);
        tmp.sub(camera.worldPosition);
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
      }

      const idle = simTime - lastPointerTime;
      const forceTarget = coarse
        ? 0
        : (idle < 1.6 ? (0.5 + 0.5 * Math.min(pointerSpeed * 1.6, 1)) : 0);
      const fk = damp(dt, forceTarget > uniforms.uForce.value ? 7 : 1.6);
      uniforms.uForce.value += (forceTarget - uniforms.uForce.value) * fk;

      driftAngle += dt * (reduced ? 0.004 : 0.03);
      const parallax = coarse ? 0 : (reduced ? 0.3 : 1);
      const orbit = keyLerp(KEY_ORBIT, progress) + driftAngle + ndc.x * 0.05 * parallax;
      const cz = keyLerp(KEY_Z, progress);
      const cy = keyLerp(KEY_Y, progress) + ndc.y * 0.22 * parallax;
      camera.position.set(Math.sin(orbit) * cz, cy, Math.cos(orbit) * cz);
      camera.lookAt(0, keyLerp([0, 0.1, 0.15, 0], progress), 0);

      renderer.render({ scene: points, camera });

      if (cbRef.current) {
        cbRef.current({
          progress,
          stage: Math.max(0, Math.min(3, Math.round(progress))),
          px: uniforms.uPointer.value.x,
          py: uniforms.uPointer.value.y,
          dist: Math.hypot(camera.position.x, camera.position.y, camera.position.z),
        });
      }
    };
    raf = requestAnimationFrame(loop);

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
    };
  }, []);

  return <canvas ref={canvasRef} className="tl-canvas" aria-hidden="true" />;
}
