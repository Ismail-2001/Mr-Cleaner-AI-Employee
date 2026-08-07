import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/session';
import { log } from '@/lib/logger';

const SETTINGS_ID = 'business_settings';

const DEFAULT_SETTINGS = {
    business_name: 'Mr. Cleaner Mobile Detailing',
    location: 'Texas, USA',
    timezone: 'America/Chicago',
    twilio_phone: '+1 (507) 479-7804',
    whatsapp_number: '+1 (507) 479-7804',
    ai_personality: 'maya',
    business_hours: {
        mon: { open: '08:00', close: '18:00', enabled: true },
        tue: { open: '08:00', close: '18:00', enabled: true },
        wed: { open: '08:00', close: '18:00', enabled: true },
        thu: { open: '08:00', close: '18:00', enabled: true },
        fri: { open: '08:00', close: '18:00', enabled: true },
        sat: { open: '09:00', close: '14:00', enabled: true },
        sun: { open: '00:00', close: '00:00', enabled: false },
    },
};

export async function GET() {
    if (!supabaseAdmin) {
        return Response.json({ settings: DEFAULT_SETTINGS });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('application_config')
            .select('data')
            .eq('id', SETTINGS_ID)
            .maybeSingle();

        if (error || !data?.data) {
            return Response.json({ settings: DEFAULT_SETTINGS });
        }

        return Response.json({ settings: { ...DEFAULT_SETTINGS, ...data.data } });
    } catch {
        return Response.json({ settings: DEFAULT_SETTINGS });
    }
}

export async function PUT(req) {
    // Defense-in-depth: middleware also guards this, but verify here too
    const { session, response: authError } = await requireSession(req);
    if (authError) return authError;

    if (!supabaseAdmin) {
        return Response.json({ error: 'Database not configured' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const { settings } = body;

        if (!settings || typeof settings !== 'object') {
            return Response.json({ error: 'Invalid settings payload' }, { status: 400 });
        }

        const sanitized = {};
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (settings[key] !== undefined) {
                if (key === 'business_hours' && typeof settings[key] === 'object') {
                    // Validate nested business_hours structure
                    const hours = settings[key];
                    const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                    sanitized[key] = {};
                    for (const day of validDays) {
                        if (hours[day] && typeof hours[day] === 'object') {
                            sanitized[key][day] = {
                                open: String(hours[day].open || '08:00').trim(),
                                close: String(hours[day].close || '18:00').trim(),
                                enabled: Boolean(hours[day].enabled),
                            };
                        }
                    }
                } else {
                    sanitized[key] = String(settings[key]).trim();
                }
            }
        }

        const { error } = await supabaseAdmin.from('application_config').upsert({
            id: SETTINGS_ID,
            data: sanitized,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (error) {
            return Response.json({ error: 'Failed to save settings' }, { status: 500 });
        }

        return Response.json({ success: true, settings: sanitized });
    } catch (error) {
        log.error('settings', 'Settings save error', { error: error.message });
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
}
