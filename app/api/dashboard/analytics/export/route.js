/**
 * GET /api/dashboard/analytics/export — CSV export of bookings data
 *
 * Downloads a CSV file of all bookings for the business owner
 * to share with accountant/bookkeeper.
 *
 * SECURITY: business_id scoping on query. Without this, a multi-tenant
 * deployment would export ALL businesses' customer names and phone numbers
 * (PII) in a single CSV file — a critical data breach.
 *
 * Auth: Session cookie verified at handler level (defense-in-depth).
 * Middleware also protects GET /api/dashboard/*, but we verify here too.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/session';
import { DEFAULT_BUSINESS_ID } from '@/lib/tenant';

export async function GET(req) {
    const { response } = await requireSession(req);
    if (response) return response;

    if (!supabaseAdmin) {
        return Response.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Business scope — only export bookings belonging to this business
    const businessId = DEFAULT_BUSINESS_ID;

    try {
        const { data: bookings, error } = await supabaseAdmin
            .from('bookings')
            .select('customer_name, phone, service, service_price, vehicle_type, booking_date, booking_time, status, created_at')
            .eq('business_id', businessId)
            .order('booking_date', { ascending: false });

        if (error) {
            return Response.json({ error: error.message }, { status: 500 });
        }

        if (!bookings || bookings.length === 0) {
            return new Response('No bookings to export', { status: 200, headers: { 'Content-Type': 'text/csv' } });
        }

        // Build CSV
        const headers = ['Customer', 'Phone', 'Service', 'Price', 'Vehicle', 'Date', 'Time', 'Status', 'Created'];
        const rows = bookings.map(b => [
            `"${(b.customer_name || '').replace(/"/g, '""')}"`,
            b.phone || '',
            `"${(b.service || '').replace(/"/g, '""')}"`,
            b.service_price ?? '',
            b.vehicle_type || '',
            b.booking_date || '',
            b.booking_time || '',
            b.status || '',
            b.created_at ? new Date(b.created_at).toISOString() : '',
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        return new Response(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="bookings-export-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });
    } catch (error) {
        console.error('CSV export error:', error.message);
        return Response.json({ error: 'Export failed' }, { status: 500 });
    }
}
