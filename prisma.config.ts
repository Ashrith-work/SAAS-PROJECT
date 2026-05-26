import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 config. The Prisma CLI (generate, migrate, db push, studio) reads the
// schema location and the database connection URL from here. Unlike the runtime
// client, the CLI does NOT auto-load .env, hence the explicit `dotenv/config`
// import above.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
