import { NextResponse } from 'next/server';
import { getLandingConfig } from '@/lib/business-config';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitResult = await checkRateLimit(`config:${ip}`);
    if (rateLimitResult) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(rateLimitResult.retryAfterSec) },
        });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || '00000000-0000-0000-0000-000000000001';

    const config = await getLandingConfig(businessId);
    return NextResponse.json(config);
}
