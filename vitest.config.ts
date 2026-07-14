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
