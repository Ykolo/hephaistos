import { defineConfig } from "vitest/config";


export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Les tests de concurrence partagent une base : les faire tourner en
    // parallèle ferait échouer les assertions sur le stock pour de mauvaises
    // raisons. Un seul worker, la suite reste rapide.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
