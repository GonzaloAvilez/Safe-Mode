import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vitest.config.ts on purpose — these tests hit a real local Postgres +
// PostgREST (via `supabase start`, see scripts/run-integration-tests.sh), unlike the
// default suite's fully-mocked Supabase client. Never run as part of `npm run test`;
// only via `npm run test:integration`, which brings the local stack up first.
export default defineConfig({
  resolve: {
    alias: {
      // Same no-op stand-in the unit-test config uses — lets these tests import the real
      // src/lib modules (src/lib/supabase.ts, spend.ts, phrases.ts) instead of
      // reimplementing simplified test-only versions of them. Running the actual
      // application code against a real local Postgres is the whole point: it's what
      // would have caught the increment_daily_spend overload bug, a mock never could.
      "server-only": path.resolve(__dirname, "./src/test/mocks/server-only.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
