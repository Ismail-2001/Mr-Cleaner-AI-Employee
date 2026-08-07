// API v1 — Chat endpoint
// Re-exports from the canonical /api/chat route for backward compatibility.
// New clients should use /api/v1/chat. Old clients continue using /api/chat.
export { POST } from '@/app/api/chat/route';
