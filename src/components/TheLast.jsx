import { useCallback, useEffect, useMemo, useRef } from 'react';
import FloatingLines from './FloatingLines.jsx';

const STAGES = ['01 / ORIGIN', '02 / BREAK', '03 / CONTROL', '04 / THE LAST'];
const GLYPHS = '█▓▒░<>/\\*+=#%@$·01';

/* stage keyframes — one shader environment, four states */
const K = {
  speed:  [1.0, 2.4, 0.35, 0.9],
  bend:   [-0.5, -2.2, -0.15, -0.6],
  radius: [5, 8, 3, 5],
  topY:   [0.5, 0.8, 0.5, 0.06],
  topR:   [-0.4, -1.4, 0.0, -0.12],
  midY:   [0.0, 0.35, 0.0, 0.0],
  midR:   [0.2, 0.9, 0.0, 0.04],
  botY:   [-0.7, -1.1, -0.7, -0.05],
  botR:   [-1.0, -1.8, 0.0, -0.08],
};

const PALS = [
  ['#f5f0ff', '#e945f5', '#b48cff', '#6f6f7a'], // origin — the video look
  ['#ffd7fb', '#ff2fd6', '#ff5fa0', '#7a4a5a'], // break — hot magenta
  ['#e8e8f2', '#9aa0b8', '#7d84a0', '#565a6e'], // control — steel order
  ['#ffffff', '#ffb3f6', '#e945f5', '#9a86ff'], // last — white-hot bundle
].map((pal) => pal.map((hex) => {
  const v = hex.slice(1);
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ];
}));

const smooth = (x) => x * x * (3 - 2 * x);
const keyLerp = (arr, p) => {
  const i = Math.min(Math.floor(p), arr.length - 2);
  const f = smooth(Math.min(Math.max(p - i, 0), 1));
  return arr[i] + (arr[i + 1] - arr[i]) * f;
};

function scrambleIn(el) {
  const finalText = el.dataset.text || el.textContent;
  el.dataset.text = finalText;
  const start = performance.now();
  const duration = 700 + finalText.length * 45;
  let raf = 0;
  const tick = (now) => {
    const t = (now - start) / duration;
    if (t >= 1) { el.textContent = finalText; return; }
    const solved = Math.floor(t * finalText.length);
    let out = finalText.slice(0, solved);
    for (let i = solved; i < finalText.length; i += 1) {
      out += finalText[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export default function TheLast() {
  const uniformsRef = useRef(null);
  const coordsRef = useRef(null);
  const stageTextRef = useRef(null);
  const railFillRef = useRef(null);
  const brRef = useRef(null);
  const dotsRef = useRef([]);
  const stageIndex = useRef(-1);
  const cancels = useRef(new Set());

  const reduced = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const coarse = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia('(pointer: coarse)').matches,
    []
  );

  /* ---- scroll → morph uniforms directly (no React state) ---- */
  useEffect(() => {
    let raf = 0;
    let target = 0;
    let progress = 0;
    let last = performance.now();

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      target = max > 0 ? Math.min(3, Math.max(0, (window.scrollY / max) * 3)) : 0;
    };
    window.addEventListener('scroll', readScroll, { passive: true });
    readScroll();
    progress = target;

    const damp = (dt, k) => 1 - Math.exp(-k * dt);

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      progress += (target - progress) * damp(dt, 2.6);

      const u = uniformsRef.current;
      if (u) {
        const m = reduced ? 0.3 : 1;
        const speed = keyLerp(K.speed, progress) * m;
        const bend = keyLerp(K.bend, progress);
        u.animationSpeed.value = speed;
        u.bendStrength.value = bend;
        u.bendRadius.value = keyLerp(K.radius, progress);
        u.topWavePosition.value.set(10, keyLerp(K.topY, progress), keyLerp(K.topR, progress));
        u.middleWavePosition.value.set(5, keyLerp(K.midY, progress), keyLerp(K.midR, progress));
        u.bottomWavePosition.value.set(2, keyLerp(K.botY, progress), keyLerp(K.botR, progress));

        const i = Math.min(Math.floor(progress), 2);
        const f = smooth(Math.min(Math.max(progress - i, 0), 1));
        for (let c = 0; c < 4; c += 1) {
          const a = PALS[i][c];
          const b = PALS[i + 1][c];
          u.lineGradient.value[c].set(
            a[0] + (b[0] - a[0]) * f,
            a[1] + (b[1] - a[1]) * f,
            a[2] + (b[2] - a[2]) * f
          );
        }

        if (coordsRef.current) {
          coordsRef.current.textContent =
            `SPD ${speed.toFixed(2)} · BND ${bend.toFixed(2)} · P ${progress.toFixed(2)}`;
        }
      }

      if (railFillRef.current) {
        railFillRef.current.style.transform = `scaleY(${Math.min(1, progress / 3)})`;
      }
      const stage = Math.max(0, Math.min(3, Math.round(progress)));
      if (brRef.current) brRef.current.classList.toggle('is-dim', stage === 3);
      if (stage !== stageIndex.current) {
        stageIndex.current = stage;
        if (stageTextRef.current) stageTextRef.current.textContent = STAGES[stage];
        dotsRef.current.forEach((d, idx) => d && d.classList.toggle('is-on', idx <= stage));
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', readScroll);
    };
  }, [reduced]);

  /* ---- reveals ---- */
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll('.tl-stage'));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const inner = entry.target.querySelector('[data-reveal]');
          if (inner && !inner.classList.contains('is-in')) {
            inner.classList.add('is-in');
            inner.querySelectorAll('[data-scramble]').forEach((el) => {
              if (reduced) {
                el.textContent = el.dataset.text || el.textContent;
                return;
              }
              cancels.current.add(scrambleIn(el));
            });
          }
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.22 }
    );
    sections.forEach((s) => io.observe(s));
    return () => {
      io.disconnect();
      cancels.current.forEach((fn) => fn());
    };
  }, [reduced]);

  return (
    <div className="thelast-root">
      <FloatingLines
        uniformsRef={uniformsRef}
        linesGradient={['#f5f0ff', '#e945f5', '#b48cff', '#6f6f7a']}
        enabledWaves={['top', 'middle', 'bottom']}
        lineCount={coarse ? 6 : 8}
        lineDistance={8}
        bendRadius={5}
        bendStrength={-0.5}
        interactive
        parallax
        animationSpeed={1}
      />

      <div className="tl-vignette" aria-hidden="true" />

      <div className="tl-frame" aria-hidden="true">
        <i /><i /><i /><i />
      </div>

      <header className="tl-hud tl-hud--tl">
        THE LAST<span className="tl-hud-extra"><span className="tl-hud-sep">—</span>FIELD STUDY 02</span>
      </header>
      <div className="tl-hud tl-hud--tr" ref={coordsRef}>SPD 1.00 · BND -0.50 · P 0.00</div>
      <div className="tl-hud tl-hud--bl" ref={stageTextRef}>01 / ORIGIN</div>
      <div className="tl-hud tl-hud--br" ref={brRef}>SCROLL TO EVOLVE</div>

      <div className="tl-rail" aria-hidden="true">
        <div className="tl-rail-line">
          <div className="tl-rail-fill" ref={railFillRef} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="tl-rail-dot"
            style={{ top: `${(i / 3) * 100}%` }}
            ref={(el) => { dotsRef.current[i] = el; }}
          />
        ))}
      </div>

      <main>
        <section className="tl-stage tl-stage--origin">
          <div className="tl-stage-inner" data-reveal>
            <p className="tl-label tl-fade">01 / ORIGIN</p>
            <h1 className="tl-display">
              <span className="tl-mask"><span data-scramble>THE LAST</span></span>
            </h1>
            <p className="tl-sub tl-fade" data-d="2">
              the latest version of me as a creator.
            </p>
          </div>
        </section>

        <section className="tl-stage tl-stage--break">
          <div className="tl-stage-inner" data-reveal>
            <p className="tl-label tl-fade">02 / BREAK</p>
            <h2 className="tl-display">
              <span className="tl-mask"><span data-scramble>BREAK</span></span>
            </h2>
            <p className="tl-line tl-mask" data-d="2">
              <span>Everything changes when the rules stop helping.</span>
            </p>
          </div>
        </section>

        <section className="tl-stage tl-stage--control">
          <div className="tl-stage-inner" data-reveal>
            <p className="tl-label tl-fade">03 / CONTROL</p>
            <h2 className="tl-display">
              <span className="tl-mask"><span data-scramble>CONTROL</span></span>
            </h2>
            <p className="tl-line tl-mask" data-d="2">
              <span>Structure is chaos, held still.</span>
            </p>
            <p className="tl-note tl-fade" data-d="3">FIELD STATE → LATTICE / ORDER RESTORED</p>
          </div>
        </section>

        <section className="tl-stage tl-stage--last">
          <div className="tl-stage-inner" data-reveal>
            <p className="tl-label tl-fade">04 / THE LAST</p>
            <h2 className="tl-display tl-display--giant">
              <span className="tl-mask"><span data-scramble>THE LAST</span></span>
            </h2>
            <p className="tl-still tl-fade" data-d="2">Still building.</p>
            <p className="tl-colophon tl-fade" data-d="3">
              FIELD STUDY 02 · REACT + THREE · 2026<br />
              PREV — 01 / THE FIRST ONE&nbsp;&nbsp;·&nbsp;&nbsp;NEXT — 03 / STILL LOADING…
            </p>
          </div>
        </section>
      </main>

      <div className="tl-grain" aria-hidden="true" />
    </div>
  );
}
