import { handleAuthCallback } from '@/lib/calendar';
import { NextResponse } from 'next/server';

/**
 * Google OAuth callback handler.
 *
 * CSRF PROTECTION: The state parameter is verified against a cookie set during
 * the OAuth initiation. This prevents an attacker from linking their own Google
 * account to the business's calendar by tricking the owner into visiting a
 * crafted callback URL with the attacker's authorization code.
 */
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    // Verify state parameter against cookie to prevent CSRF
    const storedState = req.cookies.get('oauth_state')?.value;
    if (!state || !storedState || state !== storedState) {
        console.error('OAuth CSRF: state mismatch or missing');
        return new Response('Authentication failed: invalid state parameter.', {
            status: 403,
            headers: { 'Content-Type': 'text/plain' },
        });
    }

    try {
        await handleAuthCallback(code);

        // Clear the state cookie after successful verification
        const response = new Response('Authentication successful! You can close this window.', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        });
        response.headers.set('Set-Cookie', 'oauth_state=; Path=/; Max-Age=0');
        return response;
    } catch (error) {
        console.error('Auth Callback Route Error:', error.message);
        return new Response('Authentication failed. Please check your server logs.', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}
