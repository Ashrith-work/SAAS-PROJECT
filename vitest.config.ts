import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config for the HotelTrack integration tests. We resolve the `@/*`
// alias the same way tsconfig.json does so test files can import `@/lib/...`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // `server-only` throws outside a React Server Component bundle; stub it so
      // tests can import lib/tenant.ts and the route handlers.
      "server-only": path.resolve(__dirname, "tests/__mocks__/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000, // DB integration tests can take a while
    hookTimeout: 60_000, // seed/cleanup do many sequential writes over the network
    pool: "forks",       // each test file in its own process — Prisma client is happier
    fileParallelism: false,
  },
});
