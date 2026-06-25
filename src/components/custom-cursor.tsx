"use client";

import { useEffect } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { useHasFinePointer } from "@/hooks/use-is-mobile";
import { useUIStore, type CursorMode } from "@/store/ui-store";

const RING: Record<CursorMode, string> = {
  forge: "h-[46px] w-[46px] border border-[rgba(255,120,40,.35)]",
  ring: "h-[34px] w-[34px] border-[1.5px] border-ink",
  point: "h-0 w-0 opacity-0",
  lueur:
    "h-[52px] w-[52px] bg-[radial-gradient(circle,rgba(20,20,20,.12),transparent_70%)]",
  none: "hidden",
};

const DOT: Record<CursorMode, string> = {
  forge:
    "h-[10px] w-[10px] bg-ember shadow-[0_0_12px_4px_rgba(255,110,20,.55)]",
  ring: "h-[6px] w-[6px] bg-ink",
  point: "h-[13px] w-[13px] bg-ink",
  lueur: "h-[5px] w-[5px] bg-ink",
  none: "hidden",
};

const OPTIONS: { mode: CursorMode; label: string; swatch: string }[] = [
  { mode: "forge", label: "Forge", swatch: "bg-ember" },
  { mode: "ring", label: "Anneau", swatch: "bg-ink" },
  { mode: "point", label: "Point", swatch: "bg-ink" },
  { mode: "lueur", label: "Lueur", swatch: "bg-muted-ink" },
  { mode: "none", label: "Aucun", swatch: "bg-line-strong" },
];

export function CustomCursor() {
  const fine = useHasFinePointer();
  const cursor = useUIStore((s) => s.cursor);
  const panelOpen = useUIStore((s) => s.cursorPanelOpen);
  const togglePanel = useUIStore((s) => s.toggleCursorPanel);
  const setCursor = useUIStore((s) => s.setCursor);

  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);
  const ringX = useSpring(mouseX, { stiffness: 350, damping: 30, mass: 0.4 });
  const ringY = useSpring(mouseY, { stiffness: 350, damping: 30, mass: 0.4 });

  const active = fine && cursor !== "none";

  useEffect(() => {
    if (!active) return;
    const move = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [active, mouseX, mouseY]);

  useEffect(() => {
    document.body.classList.toggle("hf-cursor-active", active);
    return () => document.body.classList.remove("hf-cursor-active");
  }, [active]);

  if (!fine) return null;

  return (
    <>
      {active && (
        <div className="pointer-events-none fixed inset-0 z-[9999]">
          <motion.div
            style={{ x: ringX, y: ringY }}
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          >
            <div className={cn("rounded-full", RING[cursor])} />
          </motion.div>
          <motion.div
            style={{ x: mouseX, y: mouseY }}
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          >
            <div className={cn("rounded-full", DOT[cursor])} />
          </motion.div>
        </div>
      )}

      {/* Cursor mode launcher — desktop only */}
      <div className="fixed bottom-6 right-6 z-[9000] flex flex-col items-end gap-3">
        <AnimatePresence>
          {panelOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="w-[200px] border border-line bg-paper/95 p-2 shadow-[0_24px_48px_-18px_rgba(0,0,0,.3)] backdrop-blur-md"
            >
              <div className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-[.2em] text-muted-ink">
                Curseur
              </div>
              {OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setCursor(opt.mode)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-[11px] px-2 py-[10px] text-left text-[13px] text-ink transition-colors",
                    cursor === opt.mode ? "bg-sand-card font-semibold" : "",
                  )}
                >
                  <span
                    className={cn(
                      "h-[10px] w-[10px] rounded-full",
                      opt.swatch,
                    )}
                  />
                  {opt.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={togglePanel}
          aria-label="Changer le curseur"
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-line bg-paper/95 shadow-[0_12px_28px_-12px_rgba(0,0,0,.4)] backdrop-blur-md transition-transform hover:scale-105"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-ink" />
          <span className="absolute h-[22px] w-[22px] rounded-full border border-ink/60" />
        </button>
      </div>
    </>
  );
}
