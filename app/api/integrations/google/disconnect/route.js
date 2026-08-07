import { clearGoogleTokens } from '@/lib/calendar';
import { log } from '@/lib/logger';

export async function POST() {
    try {
        const success = await clearGoogleTokens();
        if (!success) {
            return Response.json({ error: 'Failed to disconnect' }, { status: 500 });
        }
        return Response.json({ success: true, message: 'Google Calendar disconnected' });
    } catch (error) {
        log.error('google-disconnect', 'Google disconnect error', { error: error.message });
        return Response.json({ error: 'Internal error' }, { status: 500 });
    }
}
