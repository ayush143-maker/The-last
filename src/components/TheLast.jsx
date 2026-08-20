import { useCallback, useEffect, useMemo, useRef } from 'react';
import WebGLScene from './WebGLScene.jsx';

const STAGES = ['01 / ORIGIN', '02 / BREAK', '03 / CONTROL', '04 / THE LAST'];
const GLYPHS = '█▓▒░<>/\\*+=#%@$·01';

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

const fmt = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`;

export default function TheLast() {
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

  const onTelemetry = useCallback((t) => {
    if (coordsRef.current) {
      coordsRef.current.textContent =
        `X ${fmt(t.px)}  Y ${fmt(t.py)}  R ${t.dist.toFixed(1)}`;
    }
    if (railFillRef.current) {
      railFillRef.current.style.transform = `scaleY(${Math.min(1, t.progress / 3)})`;
    }
    if (brRef.current) brRef.current.classList.toggle('is-dim', t.stage === 3);
    if (t.stage !== stageIndex.current) {
      stageIndex.current = t.stage;
      if (stageTextRef.current) stageTextRef.current.textContent = STAGES[t.stage];
      dotsRef.current.forEach((d, i) => d && d.classList.toggle('is-on', i <= t.stage));
    }
  }, []);

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
      <WebGLScene onTelemetry={onTelemetry} />

      <div className="tl-vignette" aria-hidden="true" />

      <div className="tl-frame" aria-hidden="true">
        <i /><i /><i /><i />
      </div>

      <header className="tl-hud tl-hud--tl">
        THE LAST<span className="tl-hud-extra"><span className="tl-hud-sep">—</span>FIELD STUDY 02</span>
      </header>
      <div className="tl-hud tl-hud--tr" ref={coordsRef}>
        X +0.00&nbsp;&nbsp;Y +0.00&nbsp;&nbsp;R 7.4
      </div>
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
              FIELD STUDY 02 · REACT + OGL · 2026<br />
              PREV — 01 / THE FIRST ONE&nbsp;&nbsp;·&nbsp;&nbsp;NEXT — 03 / STILL LOADING…
            </p>
          </div>
        </section>
      </main>

      <div className="tl-grain" aria-hidden="true" />
    </div>
  );
}
