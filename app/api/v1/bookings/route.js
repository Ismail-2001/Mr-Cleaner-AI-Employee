// API v1 — Bookings endpoint
// Re-exports from the canonical /api/bookings route for backward compatibility.
// New clients should use /api/v1/bookings. Old clients continue using /api/bookings.
export { GET, POST } from '@/app/api/bookings/route';
