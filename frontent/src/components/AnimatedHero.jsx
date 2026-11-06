import { useEffect, useRef } from 'react';
import './AnimatedHero.css';

// All coordinates below are in the 557x645 space of the hero layer images.
const SERVER_LEDS = [
  [52, 205], [52, 241], [52, 277], [52, 313], [52, 350],
  [172, 214], [172, 250], [306, 212], [306, 248], [446, 250], [446, 287], [446, 323],
];

const PARTICLES = [
  { left: '30%', delay: '0s' },
  { left: '42%', delay: '1.2s' },
  { left: '50%', delay: '2.6s' },
  { left: '57%', delay: '0.6s' },
  { left: '64%', delay: '3.3s' },
  { left: '37%', delay: '2s' },
  { left: '70%', delay: '1.7s' },
];

const STATUS_DOTS_Y = [515, 551, 588];

/**
 * Animated database illustration: servers layer + two floating card layers with SVG effects.
 * Only one instance should be on a page at a time (the SVG defs use fixed ids).
 */
export default function AnimatedHero({ className = '', style, tilt = true }) {
  const tiltRef = useRef(null);

  // SVG (SMIL) animations ignore CSS, so pause them when "Reduce animations" is on
  useEffect(() => {
    const root = tiltRef.current;
    if (!root) return undefined;
    const apply = () => {
      const reduce = document.documentElement.classList.contains('reduce-motion');
      root.querySelectorAll('svg').forEach((svg) => (reduce ? svg.pauseAnimations() : svg.unpauseAnimations()));
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // 3D tilt following the mouse
  const handleMove = (e) => {
    const el = tiltRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--ry', `${x * 10}deg`);
    el.style.setProperty('--rx', `${-y * 8}deg`);
  };

  const handleLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };

  return (
    <div
      className={`ah-hero ${className}`}
      style={style}
      onMouseMove={tilt ? handleMove : undefined}
      onMouseLeave={tilt ? handleLeave : undefined}
    >
      <span className="ah-hero-shadow" aria-hidden="true" />
      <div className="ah-hero-float">
        <div className="ah-hero-tilt" ref={tiltRef}>
          {/* Layer 1: servers, cylinder, pedestal and status card */}
          <img src="/assets/hero_layer_servers.webp" alt="Database servers with live status" draggable="false" />

          <svg className="ah-hero-fx" viewBox="0 0 557 645" aria-hidden="true">
            <defs>
              <radialGradient id="lgCylGlow">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.95" />
                <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="lgScan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="50%" stopColor="#e0f7ff" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lgSweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <clipPath id="lgCylClip">
                <rect x="196" y="268" width="134" height="160" rx="40" />
              </clipPath>
              <clipPath id="lgChart1">
                <rect x="55" y="80" width="215" height="55" />
              </clipPath>
              <clipPath id="lgChart2">
                <rect x="378" y="135" width="128" height="40" />
              </clipPath>
              <filter id="lgBlur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            {/* Pulse rings from the platform */}
            {[0, 1.05, 2.1].map((d) => (
              <ellipse key={d} className="fx-ring" cx="262" cy="440" rx="150" ry="40" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ animationDelay: `${d}s` }} />
            ))}

            {/* Glowing database cylinder */}
            <ellipse className="fx-glow" cx="262" cy="345" rx="105" ry="120" fill="url(#lgCylGlow)" />
            <g clipPath="url(#lgCylClip)" style={{ mixBlendMode: 'screen' }}>
              <rect x="196" y="260" width="134" height="34" fill="url(#lgScan)">
                <animate attributeName="y" values="250;420" dur="2.6s" repeatCount="indefinite" />
              </rect>
            </g>

            {/* Orbit ring with travelling data packets */}
            <path id="lgOrbit" className="fx-orbit" d="M129,345 a133,42 0 1,0 266,0 a133,42 0 1,0 -266,0" fill="none" stroke="#7dd3fc" strokeOpacity="0.7" strokeWidth="1.5" />
            {[0, -1.4, -2.8].map((b) => (
              <g key={b}>
                <circle r="7" fill="#38bdf8" filter="url(#lgBlur)">
                  <animateMotion dur="4.2s" begin={`${b}s`} repeatCount="indefinite">
                    <mpath href="#lgOrbit" />
                  </animateMotion>
                </circle>
                <circle r="3" fill="#ffffff">
                  <animateMotion dur="4.2s" begin={`${b}s`} repeatCount="indefinite">
                    <mpath href="#lgOrbit" />
                  </animateMotion>
                </circle>
              </g>
            ))}

            {/* Shield halo */}
            <circle className="fx-ring" cx="345" cy="398" r="30" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ animationDuration: '2.4s' }} />

            {/* Server LEDs */}
            {SERVER_LEDS.map(([x, y], i) => (
              <circle key={i} className="fx-led" cx={x} cy={y} r="2.2" fill="#7dd3fc" style={{ animationDelay: `${(i * 0.37) % 1.6}s` }} />
            ))}

            {/* Status pings on the DB online list */}
            {STATUS_DOTS_Y.map((y, i) => (
              <circle key={y} className="fx-ping" cx="281" cy={y} r="5" fill="#22c55e" style={{ animationDelay: `${i * 0.4}s` }} />
            ))}
          </svg>

          <span className="ah-hero-shine" />

          {/* Layer 2: "Database Online" card floats on its own */}
          <div className="ah-hero-layer ah-hero-card-db">
            <img src="/assets/hero_layer_card_db.webp" alt="" draggable="false" />
            <svg className="ah-hero-fx" viewBox="0 0 557 645" aria-hidden="true">
              <g clipPath="url(#lgChart1)">
                <rect y="80" width="45" height="55" fill="url(#lgSweep)">
                  <animate attributeName="x" values="10;290" dur="3s" repeatCount="indefinite" />
                </rect>
              </g>
              <circle className="fx-ping" cx="63" cy="68" r="4" fill="#22c55e" />
            </svg>
          </div>

          {/* Layer 3: "Replication" card floats on its own */}
          <div className="ah-hero-layer ah-hero-card-repl">
            <img src="/assets/hero_layer_card_repl.webp" alt="" draggable="false" />
            <svg className="ah-hero-fx" viewBox="0 0 557 645" aria-hidden="true">
              <g clipPath="url(#lgChart2)">
                <rect y="135" width="35" height="40" fill="url(#lgSweep)">
                  <animate attributeName="x" values="340;520" dur="3s" begin="1.5s" repeatCount="indefinite" />
                </rect>
              </g>
              <circle className="fx-ping" cx="383" cy="127" r="4" fill="#22c55e" style={{ animationDelay: '0.6s' }} />
            </svg>
          </div>
        </div>
      </div>

      {PARTICLES.map((p, i) => (
        <span key={i} className="ah-particle" style={{ left: p.left, animationDelay: p.delay }} />
      ))}
    </div>
  );
}
