// Aliased in place of the `server-only` package when running under vitest (Node)
// — `server-only` throws if imported outside a React Server Component bundle,
// which would block importing lib/tenant.ts and the route handlers in tests.
export {};
