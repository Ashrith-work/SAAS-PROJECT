import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Reuse a single PrismaClient instance across hot reloads in development to
// avoid exhausting the database connection pool. In production a fresh client
// is created per server instance.
//
// Prisma 7 connects through a driver adapter rather than a built-in engine, so
// we pass a node-postgres adapter built from DATABASE_URL.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
