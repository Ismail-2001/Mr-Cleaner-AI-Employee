import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/session';
import { DEFAULT_BUSINESS_ID } from '@/lib/tenant';

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

    try {
        const [logsResult, inspectionsResult, bookingsCountResult, revenueResult, bookingData] = await Promise.all([
            supabaseAdmin.from('usage_logs').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
            supabaseAdmin.from('usage_logs').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('event_type', 'tool_call'),
            supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
            supabaseAdmin.from('bookings').select('service_price').eq('business_id', businessId).not('status', 'eq', 'cancelled'),
            supabaseAdmin.from('bookings').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
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
        const revenueByDay = bookings.reduce((acc, b) => {
            if (!b.booking_date) return acc;
            const day = new Date(b.booking_date).toLocaleDateString('en-US', { weekday: 'short' });
            const existing = acc.find(d => d.day === day);
            const dayRevenue = (b.service_price !== null && b.service_price > 0) ? b.service_price : 0;
            if (existing) existing.revenue += dayRevenue;
            else acc.push({ day, revenue: dayRevenue });
            return acc;
        }, []);

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
        console.error('Analytics API error:', error.message);
        return Response.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
