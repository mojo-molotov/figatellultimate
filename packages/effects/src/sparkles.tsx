'use client';

/**
 * Twinkling particles in the margins, drawn on a canvas; placed and masked by `styles.css`.
 *
 * Key design decisions:
 *     - Resizes throttled (`throttleit`, at most every `RESIZE_EVERY` ms): a new size sizes the canvas again and
 *       draws new particles, too much to redo for every step of a window's edge dragged. The first resize at once,
 *       the last one always, so the canvas ends at the final size; a resize still pending at unmount is dropped
 *       (throttleit has no cancel: a flag guards it, or the frames would start again). The theme, the motion
 *       preference and the page's visibility stay immediate: one change each, never a burst.
 *
 * Invariants (`sparkles.test.tsx`): decorative (hidden, never catching a click); nothing drawn without a 2D
 * context; every frame and listener released on unmount; a burst of resizes drawn at once, then once settled, never
 * after unmount.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import throttle from 'throttleit';

/** The text column's width in rem when `--fig-sparkles-column` is unset: particles only beside it. */
const COLUMN_REM = 48;
/** Particles per square pixel of margin: a few dozen on a wide screen. */
const DENSITY = 1 / 6000;
const MAX_PARTICLES = 140;
/** The least time between two resizes drawn, in milliseconds. */
const RESIZE_EVERY = 200;

interface Particle {
  x: number;
  y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly twinkle: number;
  readonly phase: number;
  readonly vx: number;
  readonly vy: number;
  /** Which margin it drifts in, so that it never wanders over the text. */
  readonly side: 'start' | 'end';
}

const between = (min: number, max: number): number => min + Math.random() * (max - min);

/**
 * Twinkling, slowly drifting particles in the margins beside the text column: a fixed canvas behind the page, its
 * particles fading out toward the text (`styles.css` masks the middle). Drawn one frame at a time only while shown
 * (a theme's stylesheet may hide it, e.g. in the light theme: it follows the theme and the screen) and the page
 * visible; still points with `prefers-reduced-motion`. Mounted once, in the layout that client-side navigations
 * keep: the same particles from page to page, Back included.
 *
 * @returns An `aria-hidden` canvas carrying `data-slot="sparkles"`.
 *
 * @example
 * <Sparkles /> // or let `Effects` load it on demand
 */
export function Sparkles(): ReactNode {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');

    if (element == null || context == null) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    let particles: Particle[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    let margin = 0;
    let mounted = true;

    /** The canvas sized to its box; the same particles while its size stays, new ones for a new size. */
    const populate = (): void => {
      const ratio = window.devicePixelRatio || 1;
      const sameSize = width === element.clientWidth && height === element.clientHeight && particles.length > 0;

      width = element.clientWidth;
      height = element.clientHeight;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const column =
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--fig-sparkles-column')) || COLUMN_REM;

      margin = Math.max(0, (width - column * rem) / 2);

      if (sameSize) return;

      const count = Math.min(MAX_PARTICLES, Math.round(2 * margin * height * DENSITY));

      particles = Array.from({ length: count }, (_, index) => {
        const side = index % 2 === 0 ? 'start' : 'end';
        const x = between(0, margin);

        return {
          x: side === 'start' ? x : width - x,
          y: between(0, height),
          radius: between(0.4, 1.4),
          opacity: between(0.3, 1),
          twinkle: between(0.6, 2.2),
          phase: between(0, Math.PI * 2),
          vx: between(-3, 3),
          vy: between(-12, -3),
          side,
        };
      });
    };

    const move = (seconds: number): void => {
      for (const particle of particles) {
        particle.y += particle.vy * seconds;
        particle.x += particle.vx * seconds;

        // Back in at the bottom once out at the top; kept inside its own margin.
        if (particle.y < -2) particle.y = height + 2;

        const [min, max] = particle.side === 'start' ? [0, margin] : [width - margin, width];

        if (particle.x < min) particle.x = max;
        else if (particle.x > max) particle.x = min;
      }
    };

    /** One frame; the twinkle follows the clock. */
    const draw = (moving: boolean): void => {
      const now = Date.now() / 1000;

      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(element).color;

      for (const particle of particles) {
        const glow = moving ? 0.5 + 0.5 * Math.sin(now * particle.twinkle + particle.phase) : 1;

        context.globalAlpha = particle.opacity * glow;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
    };

    let last = 0;
    const step = (time: number): void => {
      move(last === 0 ? 0 : Math.min(0.1, (time - last) / 1000));
      last = time;
      draw(true);
      frame = requestAnimationFrame(step);
    };

    const stop = (): void => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    /** Runs, draws still, or stops, as the theme, the screen, the motion preference and the page's visibility say. */
    const update = (): void => {
      if (!mounted) return;

      stop();
      const shown = getComputedStyle(element).display !== 'none' && document.visibilityState === 'visible';

      if (!shown) return;

      populate();

      if (reduced.matches) draw(false);
      else frame = requestAnimationFrame(step);
    };

    const resize = new ResizeObserver(throttle(update, RESIZE_EVERY));

    resize.observe(element);
    // The theme toggle sets `<html data-theme>`: the effect follows it.
    const theme = new MutationObserver(update);

    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    reduced.addEventListener('change', update);
    dark.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();

    return () => {
      mounted = false;
      stop();
      resize.disconnect();
      theme.disconnect();
      reduced.removeEventListener('change', update);
      dark.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <canvas ref={canvas} data-slot="sparkles" aria-hidden="true" />;
}
