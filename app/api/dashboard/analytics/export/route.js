import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/session';
import { DEFAULT_BUSINESS_ID } from '@/lib/tenant';
import { log } from '@/lib/logger';

/**
 * GET /api/dashboard/analytics/export — export bookings as CSV
 *
 * Auth: Session cookie required (defense-in-depth — middleware also protects /api/dashboard/*).
 * Returns CSV file with all bookings for the business, scoped by date range.
 */
export async function GET(req) {
    const { response: authError } = await requireSession(req);
    if (authError) return authError;

    if (!supabaseAdmin) {
        return Response.json({ error: 'Database not configured' }, { status: 503 });
    }

    const businessId = DEFAULT_BUSINESS_ID;
    const url = new URL(req.url);
    const range = url.searchParams.get('range') || 'all';

    try {
        let query = supabaseAdmin
            .from('bookings')
            .select('customer_name, phone, service, vehicle_type, service_price, booking_date, booking_time, status, notes, created_at')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(1000);

        if (range !== 'all') {
            const days = parseInt(range.replace('d', ''), 10);
            if (!isNaN(days) && days > 0) {
                const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                query = query.gte('created_at', fromDate);
            }
        }

        const { data: bookings, error } = await query;

        if (error) {
            log.error('analytics-export', 'Failed to fetch bookings', { error: error.message });
            return Response.json({ error: 'Failed to export data' }, { status: 500 });
        }

        if (!bookings || bookings.length === 0) {
            return new Response('No bookings found for the selected period\n', {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="bookings-export.csv"',
                },
            });
        }

        // Build CSV
        const headers = ['Customer Name', 'Phone', 'Service', 'Vehicle Type', 'Price', 'Date', 'Time', 'Status', 'Notes', 'Created At'];
        const csvRows = [headers.join(',')];

        for (const b of bookings) {
            const row = [
                escapeCsvField(b.customer_name),
                escapeCsvField(b.phone),
                escapeCsvField(b.service),
                escapeCsvField(b.vehicle_type),
                b.service_price || 0,
                b.booking_date || '',
                b.booking_time || '',
                b.status || '',
                escapeCsvField(b.notes),
                b.created_at || '',
            ];
            csvRows.push(row.join(','));
        }

        const csv = csvRows.join('\n');

        return new Response(csv + '\n', {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="bookings-export-${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error) {
        log.error('analytics-export', 'Export error', { error: error.message });
        return Response.json({ error: 'Export failed' }, { status: 500 });
    }
}

function escapeCsvField(field) {
    if (!field) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
