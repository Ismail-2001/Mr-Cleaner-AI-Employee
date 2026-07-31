import { NextResponse } from 'next/server';
import { resetRateLimiters } from '@/lib/rate-limit';

export async function POST(request) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const expectedToken = process.env.DASHBOARD_SESSION_SECRET;

    if (!expectedToken || token !== expectedToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    resetRateLimiters();
    return NextResponse.json({ success: true, message: 'Rate limiters reset (Redis-only)' });
}
