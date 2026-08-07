import { supabaseAdmin } from './supabase-admin';
import { log } from './logger';

/**
 * Multi-tenant business resolver.
 *
 * WHY THIS EXISTS:
 * Every API route needs to know WHICH business a request belongs to.
 * Currently (single-tenant), we always return the default Mr. Cleaner business.
 * Future: will resolve from subdomain, x-business-id header, or JWT claim.
 *
 * SECURITY: This is the SINGLE SOURCE OF TRUTH for business resolution.
 * All routes MUST use this instead of hardcoding business IDs.
 */

export const DEFAULT_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Resolve business_id from request context.
 * Current: always returns default business.
 * Future: will check subdomain, x-business-id header, or JWT claim.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<string>} The business UUID
 */
export async function resolveBusinessId(request) {
    // Future implementation:
    // 1. Check JWT claim (for authenticated users)
    // 2. Check subdomain (for multi-tenant web app)
    // 3. Fall back to default business
    //
    // SECURITY: x-business-id header is NOT accepted without authentication.
    // If a client could set any business ID, they could access other tenants'
    // data. Enable explicitly via ALLOW_HEADER_BUSINESS_ID=true for dev only.
    //
    // In multi-tenant mode, business ID should come from session JWT claims
    // scoped to the authenticated user.

    // SECURITY: x-business-id header is NEVER accepted.
    // In multi-tenant mode, business ID must come from session JWT claims
    // scoped to the authenticated user. Header override is disabled permanently
    // to prevent cross-tenant data access.
    if (process.env.NODE_ENV === 'production') {
        const headerBusinessId = request?.headers?.get('x-business-id');
        if (headerBusinessId) {
            log.warn('tenant', 'Rejected x-business-id header in production', {
                headerValue: headerBusinessId?.slice(0, 8) + '...',
            });
        }
    }

    return DEFAULT_BUSINESS_ID;
}

/**
 * Get full business config from Supabase.
 * Returns null for non-existent business_id (graceful degradation).
 *
 * @param {string} businessId - The business UUID
 * @returns {Promise<Object|null>} Business row or null
 */
export async function getBusinessConfig(businessId) {
    if (!supabaseAdmin) return null;

    try {
        const { data, error } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .eq('id', businessId)
            .eq('is_active', true)
            .single();

        if (error || !data) return null;

        // Also load business_knowledge for this business
        const { data: kbData } = await supabaseAdmin
            .from('business_knowledge')
            .select('id, data')
            .eq('business_id', businessId);

        const knowledge = {};
        if (kbData && kbData.length > 0) {
            for (const item of kbData) {
                knowledge[item.id] = item.data;
            }
        }

        return {
            ...data,
            knowledge,
        };
    } catch (error) {
        log.error('tenant', 'getBusinessConfig error:', { error: error.message });
        return null;
    }
}

/**
 * Resolve business from GBP location_id.
 * Used by GBP webhook to find which business owns this location.
 *
 * @param {string} locationId - Google Business Profile location ID
 * @returns {Promise<Object|null>} Business row or null
 */
export async function resolveBusinessByLocationId(locationId) {
    if (!supabaseAdmin || !locationId) return null;

    try {
        const { data } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .eq('gbp_location_id', locationId)
            .single();

        return data || null;
    } catch (error) {
        log.error('tenant', 'resolveBusinessByLocationId error:', { error: error.message });
        return null;
    }
}

/**
 * Resolve business from Meta page_id.
 * Used by Meta webhook to find which business owns this page.
 *
 * @param {string} pageId - Meta page ID
 * @returns {Promise<Object|null>} Business row or null
 */
export async function resolveBusinessByPageId(pageId) {
    if (!supabaseAdmin || !pageId) return null;

    try {
        const { data } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .eq('meta_page_id', pageId)
            .single();

        return data || null;
    } catch (error) {
        log.error('tenant', 'resolveBusinessByPageId error:', { error: error.message });
        return null;
    }
}
