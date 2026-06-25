"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

type RevealProps = {
  children?: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Scroll-reveal wrapper mirroring the source app's `data-reveal` behaviour:
 * fade + 26px rise, triggered once when the element enters the viewport.
 *
 * Uses `useInView` (rather than `whileInView`) so elements already visible on
 * first paint — e.g. an above-the-fold hero — reveal on mount instead of
 * waiting for a scroll event.
 */
export function Reveal({ children, delay = 0, style, className }: RevealProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, {
    once: true,
    margin: "0px 0px -10% 0px",
  });

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y: 26 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 }}
      transition={{
        duration: 1,
        delay: delay / 1000,
        ease: [0.16, 0.84, 0.44, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
