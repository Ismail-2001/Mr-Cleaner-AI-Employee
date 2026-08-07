import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/session';
import { DEFAULT_BUSINESS_ID } from '@/lib/tenant';
import { log } from '@/lib/logger';

/**
 * GET /api/dashboard/analytics — owner dashboard analytics
 *
 * SECURITY: business_id scoping on ALL queries. Without this, a multi-tenant
 * deployment would leak every business's revenue, bookings, and customer data
 * to any authenticated dashboard owner.
 *
 * Auth: Session cookie verified at handler level (defense-in-depth).
 * Middleware also protects GET /api/dashboard/*, but we verify here too.
 */
export async function GET(req) {
    const { response } = await requireSession(req);
    if (response) return response;

    if (!supabaseAdmin) {
        return Response.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Business scope — all queries filtered to this business only
    const businessId = DEFAULT_BUSINESS_ID;

    // Date range filtering
    const url = new URL(req.url);
    const range = url.searchParams.get('range') || '30d';
    const now = new Date();
    let fromDate = null;
    if (range !== 'all') {
        const days = parseInt(range.replace('d', ''), 10);
        if (!isNaN(days) && days > 0) {
            fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        }
    }

    try {
        // PERFORMANCE: Select only columns needed for analytics.
        // Previously select('*') fetched all columns including notes, address,
        // zip_code, stripe_session_id — none needed for dashboard metrics.

        // Build base queries with optional date filter
        const bookingsQuery = supabaseAdmin.from('bookings')
            .select('id, customer_name, phone, service, vehicle_type, service_price, booking_date, booking_time, status, created_at')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(365);
        if (fromDate) bookingsQuery.gte('created_at', fromDate);

        const revenueQuery = supabaseAdmin.from('bookings')
            .select('service_price')
            .eq('business_id', businessId)
            .not('status', 'eq', 'cancelled');
        if (fromDate) revenueQuery.gte('created_at', fromDate);

        const logsQuery = supabaseAdmin.from('usage_logs')
            .select('id, session_id, event_type, payload, created_at')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(5);
        if (fromDate) logsQuery.gte('created_at', fromDate);

        const toolCountQuery = supabaseAdmin.from('usage_logs').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('event_type', 'tool_call');
        if (fromDate) toolCountQuery.gte('created_at', fromDate);

        const bookingsCountQuery = supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
        if (fromDate) bookingsCountQuery.gte('created_at', fromDate);

        const [logsResult, inspectionsResult, bookingsCountResult, revenueResult, bookingData] = await Promise.all([
            logsQuery,
            toolCountQuery,
            bookingsCountQuery,
            revenueQuery,
            bookingsQuery,
        ]);

        const bookings = bookingData.data || [];

        // REVENUE INTEGRITY: Only sum bookings with a known service_price.
        const revenue = revenueResult.data?.reduce((sum, b) => {
            if (b.service_price !== null && b.service_price > 0) {
                return sum + b.service_price;
            }
            return sum;
        }, 0) || 0;

        // ─── Revenue By Day (for line chart) ────────────────────────────────
        // SECURITY FIX: Group by actual date (YYYY-MM-DD), not weekday name.
        // Weekday grouping merges bookings from different weeks (e.g., all
        // Mondays across 6 months get merged into one bar).
        const revenueByDay = bookings.reduce((acc, b) => {
            if (!b.booking_date) return acc;
            const dateStr = b.booking_date.slice(0, 10); // YYYY-MM-DD
            const existing = acc.find(d => d.date === dateStr);
            const dayRevenue = (b.service_price !== null && b.service_price > 0) ? b.service_price : 0;
            if (existing) existing.revenue += dayRevenue;
            else acc.push({ date: dateStr, revenue: dayRevenue });
            return acc;
        }, []).sort((a, b) => a.date.localeCompare(b.date));

        // ─── Service Distribution (for pie chart) ───────────────────────────
        const serviceDistribution = bookings.reduce((acc, b) => {
            const existing = acc.find(s => s.name === b.service);
            if (existing) existing.value++;
            else acc.push({ name: b.service, value: 1 });
            return acc;
        }, []);

        // ─── Trend Over Time (week-over-week revenue + bookings) ────────────
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        let thisWeekRevenue = 0, lastWeekRevenue = 0;
        let thisWeekBookings = 0, lastWeekBookings = 0;

        for (const b of bookings) {
            const d = new Date(b.booking_date);
            const rev = (b.service_price !== null && b.service_price > 0) ? b.service_price : 0;
            if (d >= weekAgo) {
                thisWeekRevenue += rev;
                thisWeekBookings++;
            } else if (d >= twoWeeksAgo) {
                lastWeekRevenue += rev;
                lastWeekBookings++;
            }
        }

        const trend = {
            revenue: {
                current: thisWeekRevenue,
                previous: lastWeekRevenue,
                change: lastWeekRevenue > 0
                    ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
                    : thisWeekRevenue > 0 ? 100 : 0,
            },
            bookings: {
                current: thisWeekBookings,
                previous: lastWeekBookings,
                change: lastWeekBookings > 0
                    ? Math.round(((thisWeekBookings - lastWeekBookings) / lastWeekBookings) * 100)
                    : thisWeekBookings > 0 ? 100 : 0,
            },
        };

        // ─── Repeat Customers (phone number match) ──────────────────────────
        const phoneCountMap = {};
        for (const b of bookings) {
            if (b.phone) {
                const normalized = b.phone.replace(/\D/g, '');
                phoneCountMap[normalized] = (phoneCountMap[normalized] || 0) + 1;
            }
        }
        const repeatCustomers = Object.entries(phoneCountMap)
            .filter(([, count]) => count > 1)
            .map(([phone, count]) => ({ phone: phone.slice(-4), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const totalUniqueCustomers = Object.keys(phoneCountMap).length;

        return Response.json({
            logs: logsResult.data || [],
            stats: {
                revenue,
                inspections: inspectionsResult.count || 0,
                bookings: bookingsCountResult.count || 0,
            },
            revenueByDay,
            serviceDistribution,
            trend,
            repeatCustomers,
            totalUniqueCustomers,
            bookings,
        }, {
            headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
        });
    } catch (error) {
        log.error('analytics', 'Analytics API error', { error: error.message });
        return Response.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
