import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 config. The Prisma CLI (generate, migrate, db push, studio) reads the
// schema location and the database connection URL from here. Unlike the runtime
// client, the CLI does NOT auto-load .env, hence the explicit `dotenv/config`
// import above.
//
// The URL falls back to a placeholder so `prisma generate` (which never connects
// to a database) can run in environments without DATABASE_URL — e.g. the Vercel
// build's `postinstall`. Commands that DO connect (migrate, db push, studio)
// will fail fast against the placeholder, which is the behaviour we want.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
