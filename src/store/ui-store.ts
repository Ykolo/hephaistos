"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CursorMode = "forge" | "ring" | "point" | "lueur" | "none";

interface UIState {
  announce: boolean;
  menuOpen: boolean;
  cartOpen: boolean;
  searchOpen: boolean;
  cursorPanelOpen: boolean;
  cursor: CursorMode;

  closeAnnounce: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  openCart: () => void;
  closeCart: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleCursorPanel: () => void;
  closeCursorPanel: () => void;
  setCursor: (c: CursorMode) => void;
  closeAllOverlays: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      announce: true,
      menuOpen: false,
      cartOpen: false,
      searchOpen: false,
      cursorPanelOpen: false,
      cursor: "ring",

      closeAnnounce: () => set({ announce: false }),
      openMenu: () => set({ menuOpen: true }),
      closeMenu: () => set({ menuOpen: false }),
      openCart: () => set({ cartOpen: true }),
      closeCart: () => set({ cartOpen: false }),
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false }),
      toggleCursorPanel: () =>
        set((s) => ({ cursorPanelOpen: !s.cursorPanelOpen })),
      closeCursorPanel: () => set({ cursorPanelOpen: false }),
      setCursor: (c) => set({ cursor: c, cursorPanelOpen: false }),
      closeAllOverlays: () =>
        set({ menuOpen: false, cartOpen: false, searchOpen: false }),
    }),
    {
      name: "hf-ui",
      storage: createJSONStorage(() => localStorage),
      // only persist the curseur preference, not transient overlay state
      partialize: (s) => ({ cursor: s.cursor }),
    },
  ),
);
