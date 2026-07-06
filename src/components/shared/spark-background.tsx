'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient gold spark particle system on <canvas>.
 * Drop into any hero section as an absolutely-positioned background layer.
 *
 * Props:
 *  - density: particle count (default 45)
 *  - className: positioning (default absolute inset-0)
 */
export default function SparkBackground({
  density = 45,
  className = 'absolute inset-0',
}: {
  density?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let raf = 0;

    const COLORS = ['232,197,71', '245,185,50', '251,191,36', '217,155,30', '253,210,90'];

    type Spark = {
      x: number; y: number; r: number; vx: number; vy: number;
      alpha: number; decay: number; color: string; wob: number; wobV: number;
    };

    const make = (scatter: boolean): Spark => ({
      x: Math.random() * W,
      y: scatter ? Math.random() * H : H + Math.random() * 60,
      r: Math.random() * 2.1 + 0.3,
      vx: (Math.random() - 0.5) * 0.7,
      vy: -(Math.random() * 1.3 + 0.4),
      alpha: Math.random() * 0.7 + 0.15,
      decay: Math.random() * 0.005 + 0.002,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      wob: Math.random() * Math.PI * 2,
      wobV: (Math.random() - 0.5) * 0.04,
    });

    let particles: Spark[] = [];

    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };

    const init = () => {
      particles = Array.from({ length: density }, () => make(true));
    };

    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.wob += p.wobV;
        p.x += p.vx + Math.sin(p.wob) * 0.3;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0 || p.y < -20) Object.assign(p, make(false));

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = `rgb(${p.color})`;
        ctx.shadowBlur = p.r * 6;
        ctx.shadowColor = `rgba(${p.color}, 0.9)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    init();
    tick();

    const onResize = () => { resize(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
