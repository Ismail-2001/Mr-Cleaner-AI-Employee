// API v1 — Upload endpoint
// Re-exports from the canonical /api/upload route for backward compatibility.
// New clients should use /api/v1/upload. Old clients continue using /api/upload.
export { POST } from '@/app/api/upload/route';
