import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // `core/...` resolves to src/core in both the app and the tests, so the hidden
  // suites import the real modules by the same path the game does.
  resolve: {
    alias: {
      core: r("./src/core"),
      game: r("./src/game"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    // three is large; splitting it means the app shell can start rendering the
    // menu while the engine chunk is still arriving on a phone connection.
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] },
      },
    },
  },
  server: { host: true, port: 5173 },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
