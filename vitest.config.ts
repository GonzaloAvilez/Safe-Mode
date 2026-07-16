import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./src/test/mocks/server-only.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Integration tests hit a real local Postgres (supabase start) and only run via
    // `npm run test:integration` — see vitest.integration.config.ts. Excluded here so
    // the default `npm run test` (mocked, no Docker needed) never tries to run them
    // against a stack that isn't up. Repeats Vitest's own defaults (see
    // https://vitest.dev/config/#exclude) since setting `exclude` at all replaces them
    // rather than extending them.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "src/test/integration/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Scoped to src/lib on purpose — src/app is almost entirely async Server
      // Components and canvases, which Vitest can't meaningfully unit test (Next's
      // own docs recommend E2E for async Server Components instead). Including it
      // here would just produce a permanently-low, misleading number.
      include: ["src/lib/**"],
      exclude: ["src/lib/**/*.test.ts"],
    },
  },
});
