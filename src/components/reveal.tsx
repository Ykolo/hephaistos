"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type RevealProps = {
  children?: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Scroll-reveal wrapper mirroring the source app's `data-reveal` behaviour:
 * fade + 26px rise, triggered once when the element enters the viewport.
 */
export function Reveal({ children, delay = 0, style, className }: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
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
