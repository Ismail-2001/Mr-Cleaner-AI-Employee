import { getAuthUrl } from '@/lib/calendar';
import { redirect } from 'next/navigation';

/**
 * Initiates Google OAuth flow with CSRF protection.
 *
 * The state parameter is stored in a cookie and verified on callback to prevent
 * OAuth CSRF attacks where an attacker links their own Google account.
 */
export async function GET() {
    const { url, state } = getAuthUrl();

    // Set state cookie for CSRF verification on callback
    const response = redirect(url);
    response.headers.set(
        'Set-Cookie',
        `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    );
    return response;
}
