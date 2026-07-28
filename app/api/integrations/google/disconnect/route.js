import { clearGoogleTokens } from '@/lib/calendar';

export async function POST() {
    try {
        const success = await clearGoogleTokens();
        if (!success) {
            return Response.json({ error: 'Failed to disconnect' }, { status: 500 });
        }
        return Response.json({ success: true, message: 'Google Calendar disconnected' });
    } catch (error) {
        console.error('Google disconnect error:', error.message);
        return Response.json({ error: 'Internal error' }, { status: 500 });
    }
}
