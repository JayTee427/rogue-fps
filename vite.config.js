import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { appendFileSync } from "node:fs";

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

/** Dev-only telemetry sink.
 *
 * The game posts play events here and they are appended to playtest.log, so a
 * real play session produces objective data - what killed you, at what range,
 * on which floor, with how much health - instead of being reconstructed from
 * memory afterwards. Dev server only: `apply: "serve"` keeps it out of every
 * production build, and nothing in src/ imports it.
 */
function telemetrySink() {
  return {
    name: "playtest-telemetry",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__telemetry", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on("end", () => {
          try {
            appendFileSync(r("./playtest.log"), body.trim() + String.fromCharCode(10));
          } catch { /* never let logging break the game */ }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [telemetrySink()],
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
