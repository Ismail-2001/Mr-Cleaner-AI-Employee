/**
 * Business configuration loader for multi-tenant landing pages.
 *
 * WHY THIS EXISTS:
 * Each business using Maya should customize their landing page content
 * (testimonials, stats, hero text, footer info). This module provides
 * a single source of truth for business-specific config with sensible
 * defaults so new tenants get a working page without any configuration.
 *
 * DB SCHEMA:
 * businesses table has a `landing_config` JSONB column. If NULL or
 * empty, the defaults below are used. Keys in the DB override defaults
 * at the top level (shallow merge).
 */

import { supabaseAdmin } from './supabase-admin';

const DEFAULT_LANDING_CONFIG = {
    hero: {
        badge: "Texas' #1 Luxury Detailers",
        line1: ['Your', 'Car', 'Deserves'],
        line2: ['Elite', 'Treatment'],
        description: 'Book your premium mobile detail in 60 seconds. Our AI Maya handles everything 24/7. We come to you.',
    },
    stats: [
        { number: 2400, suffix: '+', label: 'Details Completed', description: 'Premium vehicles serviced' },
        { number: 98, suffix: '%', label: 'Satisfaction Rate', description: 'Five-star reviews' },
        { number: 45, suffix: 'min', label: 'Average Booking', description: 'From chat to confirmed' },
        { number: 3, suffix: 'x', label: 'Revenue Growth', description: 'Since AI integration' },
    ],
    testimonials: [
        {
            name: 'James Richardson',
            role: 'BMW M4 Owner',
            text: 'Maya understood exactly what my car needed. The ceramic coating came out flawless. Best detailing experience in Austin.',
            rating: 5,
            location: 'Austin, TX',
        },
        {
            name: 'Sarah Chen',
            role: 'Tesla Model S Owner',
            text: 'Booked through the AI at 2 AM, had my appointment confirmed in minutes. The attention to detail was extraordinary.',
            rating: 5,
            location: 'Dallas, TX',
        },
        {
            name: 'Michael Torres',
            role: 'Porsche Cayenne Owner',
            text: 'They transformed my SUV from neglected to showroom condition. The paint correction alone was worth every penny.',
            rating: 5,
            location: 'Houston, TX',
        },
    ],
    footer: {
        brandName: 'Mr. Cleaner',
        brandInitials: 'MC',
        tagline: "Texas' premier mobile detailing concierge. Powered by AI, perfected by hand.",
        services: ['Executive Preservation', 'The Master Detail', 'Signature Ceramic'],
        locations: 'Austin \u00b7 Dallas \u00b7 Houston',
        email: 'concierge@mrcleaner.com',
        phone: '+1 (507) 479-7804',
        hours: [
            { label: 'Mon - Sat: 8 AM - 6 PM' },
            { label: 'Sunday: Closed' },
            { label: 'AI Concierge: 24/7', gold: true },
        ],
        copyright: '\u00a9 2026 Mr. Cleaner Mobile Detailing Texas. All rights reserved.',
        tagline2: 'Built with AI \u00b7 Powered by Maya',
    },
};

const configCache = new Map();
const CONFIG_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Get landing page config for a business.
 * Merges DB-stored overrides on top of defaults.
 *
 * @param {string} businessId
 * @returns {Promise<Object>} Merged landing config
 */
export async function getLandingConfig(businessId) {
    if (!businessId) return DEFAULT_LANDING_CONFIG;

    const cached = configCache.get(businessId);
    if (cached && Date.now() - cached.ts < CONFIG_CACHE_TTL_MS) {
        return cached.config;
    }

    if (!supabaseAdmin) {
        return DEFAULT_LANDING_CONFIG;
    }

    try {
        const { data } = await supabaseAdmin
            .from('businesses')
            .select('landing_config')
            .eq('id', businessId)
            .single();

        const dbConfig = data?.landing_config;
        if (!dbConfig || typeof dbConfig !== 'object') {
            configCache.set(businessId, { config: DEFAULT_LANDING_CONFIG, ts: Date.now() });
            return DEFAULT_LANDING_CONFIG;
        }

        const merged = {
            ...DEFAULT_LANDING_CONFIG,
            ...dbConfig,
            stats: dbConfig.stats || DEFAULT_LANDING_CONFIG.stats,
            testimonials: dbConfig.testimonials || DEFAULT_LANDING_CONFIG.testimonials,
            footer: { ...DEFAULT_LANDING_CONFIG.footer, ...(dbConfig.footer || {}) },
            hero: { ...DEFAULT_LANDING_CONFIG.hero, ...(dbConfig.hero || {}) },
        };

        configCache.set(businessId, { config: merged, ts: Date.now() });
        return merged;
    } catch {
        return DEFAULT_LANDING_CONFIG;
    }
}

export { DEFAULT_LANDING_CONFIG };
