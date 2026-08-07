// API v1 — Health endpoint
// Re-exports from the canonical /api/health route for backward compatibility.
// New clients should use /api/v1/health. Old clients continue using /api/health.
export { GET } from '@/app/api/health/route';
