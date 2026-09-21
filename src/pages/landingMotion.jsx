import { useEffect } from 'react';
import { animate, m, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

// Apple's motion reads as a spring that settles rather than an ease that stops.
// One entrance curve and one spring, shared by everything on the page so the
// whole thing feels like a single material.
export const EASE = [0.32, 0.72, 0, 1];
export const SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
  mass: 0.9,
};

/**
 * Lifts its children into place the first time they scroll into view.
 *
 * `MotionConfig reducedMotion="user"` (set on the page root) drops the
 * translation for people who ask for less motion and leaves a plain fade.
 */
export function Rise({ children, delay = 0, as = 'div', className = '' }) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.7, ease: EASE, delay: delay / 1000 }}
    >
      {children}
    </Tag>
  );
}

/**
 * A number that eases to its new value instead of snapping. The animated text
 * is written straight to the DOM from a motion value, so a 500ms tween never
 * re-renders React.
 *
 * Callers should hide this from assistive tech (aria-hidden) and announce the
 * final value from a separate static live region: a screen reader must hear
 * the answer once, not every intermediate frame.
 */
export function AnimatedNumber({ value, format }) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (latest) => format(latest));

  useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      return undefined;
    }
    const controls = animate(motionValue, value, {
      duration: 0.55,
      ease: EASE,
    });
    return () => controls.stop();
  }, [value, reduce, motionValue]);

  return <m.span>{text}</m.span>;
}
