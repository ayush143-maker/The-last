# THE LAST — Field Study 02

Project 02 of the portfolio timeline. The counterpoint to **01 / THE FIRST ONE**:
where that one was raw beginner HTML, this one is the current state — React, Vite,
and a single OGL particle universe that evolves through four states.

## Run

npm install
npm run dev

## The four stages

One continuous WebGL environment — never separate scenes:

1. **ORIGIN** — a calm, sparse cloud
2. **BREAK** — swirl, burst, unstable core
3. **CONTROL** — the field snaps into an exact cubic lattice (particle count is N³)
4. **THE LAST** — a breathing lobed monument, then calm

## Notes

- OGL only. No Three.js.
- No React state in the render loop — all mutable values live in refs/uniforms;
  the HUD updates through direct DOM writes via a telemetry callback.
- Pointer is projected onto the field plane and applied as a gaussian force field
  (repulsion + tangential bend) with inertia.
- Mobile: 24³ particles, capped DPR, camera pulled back, touch acts as the pointer.
- Honors `prefers-reduced-motion` (slowed field, no scramble, instant reveals).
