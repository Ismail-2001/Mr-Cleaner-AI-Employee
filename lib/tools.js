import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { checkAvailability } from './calendar';
import { supabaseAdmin } from './supabase-admin';
import { stripe, createDepositSession } from './stripe';
import { isConfigured as lsConfigured, createCheckout as lsCreateCheckout } from './lemon-squeezy';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { withTimeout, abortAfter, DEFAULT_TIMEOUT_MS } from './timeout';
import { redactToolArgs } from './pii-redact';
import { getRedisClient, tryRedisOp } from './redis';

// --- KNOWLEDGE BASE (Dynamic with Resilient Fallback + Redis Cache) ---
const FALLBACK_KNOWLEDGE = {
    pricing: {
        'Executive Preservation': { sedan: 120, SUV: 150, truck: 150, 'large SUV': 180 },
        'The Master Detail': { sedan: 250, SUV: 300, truck: 300, 'large SUV': 350 },
        'Signature Ceramic': { sedan: 450, SUV: 550, truck: 550, 'large SUV': 650 }
    },
    service_durations: {
        'Executive Preservation': 120,
        'The Master Detail': 240,
        'Signature Ceramic': 480
    },
    policies: {
        cancellation: "Free cancellation with 24h notice. 50% charge for late cancellations.",
        hours: "Monday-Saturday: 8 AM - 6 PM (Sunday Closed)",
        payment: "Accepted: Cash, Zelle, Venmo.",
        advance_booking: "Minimum 24-hour advance booking required."
    },
    service_area: {
        counties: ['Travis', 'Williamson', 'Hays'],
        zip_codes: ['78701', '78702', '78703', '78704', '78705', '78613', '78660', '78664']
    }
};

const KNOWLEDGE_CACHE_TTL_SEC = 15 * 60; // 15 minutes
const KNOWLEDGE_CACHE_PREFIX = 'knowledge:';

/**
 * Get business knowledge from Supabase, scoped to business_id.
 * Uses Redis cache (15-min TTL) to avoid repeated DB hits for static config.
 * Falls back to hardcoded defaults if Supabase is unavailable or row missing.
 */
async function getKnowledge(topic, businessId) {
    if (!supabaseAdmin) return topic === 'all' ? FALLBACK_KNOWLEDGE : FALLBACK_KNOWLEDGE[topic];

    const cacheKey = `${KNOWLEDGE_CACHE_PREFIX}${businessId}:${topic}`;

    // Try cache first
    const cached = await tryRedisOp(async (redis) => {
        const val = await redis.get(cacheKey);
        return val || null;
    });
    if (cached) {
        try {
            return typeof cached === 'string' ? JSON.parse(cached) : cached;
        } catch {
            console.warn(`Cache corruption for key ${cacheKey}, falling back to DB`);
        }
    }

    try {
        let result;
        if (topic === 'all') {
            const { data } = await supabaseAdmin
                .from('business_knowledge')
                .select('id, data')
                .eq('business_id', businessId);
            if (!data || data.length === 0) return FALLBACK_KNOWLEDGE;
            result = data.reduce((acc, item) => ({ ...acc, [item.id]: item.data }), {});
        } else {
            const { data, error } = await supabaseAdmin
                .from('business_knowledge')
                .select('data')
                .eq('id', topic)
                .eq('business_id', businessId)
                .single();

            if (error || !data) {
                console.warn(`Knowledge lookup failed for ${topic} (business=${businessId}), using fallback.`);
                return FALLBACK_KNOWLEDGE[topic];
            }
            result = data.data;
        }

        // Cache the result
        await tryRedisOp(async (redis) => {
            await redis.set(cacheKey, result, { ex: KNOWLEDGE_CACHE_TTL_SEC });
        });

        return result;
    } catch (e) {
        return topic === 'all' ? FALLBACK_KNOWLEDGE : FALLBACK_KNOWLEDGE[topic];
    }
}

/**
 * Invalidate knowledge cache when dashboard updates knowledge entries.
 */
async function invalidateKnowledgeCache(businessId) {
    await tryRedisOp(async (redis) => {
        // Scan for keys matching this business's knowledge cache
        const pattern = `${KNOWLEDGE_CACHE_PREFIX}${businessId}:*`;
        let cursor = 0;
        do {
            const result = await redis.scan(cursor, { match: pattern, count: 100 });
            cursor = result[0];
            const keys = result[1];
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== 0);
    });
}

// --- SCHEMAS (ZOD GUARDRAILS) ---
const GetAvailabilitySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
    duration: z.number().optional().default(120)
});

const CalculateQuoteSchema = z.object({
    service: z.enum(['Executive Preservation', 'The Master Detail', 'Signature Ceramic']),
    vehicle_type: z.enum(['sedan', 'SUV', 'truck', 'large SUV']),
    condition: z.enum(['standard', 'pet hair', 'heavily soiled', 'luxury']).optional().default('standard')
});

const QueryKnowledgeSchema = z.object({
    topic: z.enum(['pricing', 'policies', 'all', 'service_durations', 'service_area'])
});

const SyncBookingSchema = z.object({
    customer_name: z.string().max(100, "Name too long").optional(),
    phone: z.string().max(20, "Phone too long").optional(),
    vehicle_type: z.string().max(30, "Vehicle type too long").optional(),
    service: z.string().max(100, "Service name too long").optional(),
    condition: z.string().max(50, "Condition too long").optional(),
    date: z.string().max(10, "Date too long").optional(),
    time: z.string().max(10, "Time too long").optional(),
    address: z.string().max(300, "Address too long").optional(),
    zip_code: z.string().max(10, "Zip code too long").optional(),
    price: z.number().optional(),
    status: z.enum(['inquiring', 'qualified', 'confirmed']).optional()
});

const VerifyServiceAreaSchema = z.object({
    zip_code: z.string().length(5, "US Zip codes must be 5 digits")
});

const CheckWeatherSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
    zip_code: z.string().max(10, "Zip code too long").optional()
});

const GenerateDepositLinkSchema = z.object({
    amount: z.number().min(1, "Deposit must be at least $1").max(500, "Deposit cannot exceed $500").optional(),
    service: z.string().min(1).max(100),
    customer_name: z.string().max(100, "Name too long").optional(),
    phone: z.string().max(20, "Phone too long").optional(),
    booking_date: z.string().max(10, "Date too long").optional(),
    booking_time: z.string().max(10, "Time too long").optional(),
    session_id: z.string().max(100, "Session ID too long").optional()
});

const AnalyzeVehiclePhotoSchema = z.object({
    photo_url: z.string().url("Must be a valid image URL"),
    photo_description: z.string().max(500, "Description too long").optional(),
});

export const MAYA_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_availability',
            description: 'Check available time slots for a specific date and duration.',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    duration: { type: 'number', description: 'Duration in minutes' }
                },
                required: ['date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calculate_quote',
            description: 'Calculate price for a service based on vehicle type and condition.',
            parameters: {
                type: 'object',
                properties: {
                    service: { type: 'string', enum: ['Executive Preservation', 'The Master Detail', 'Signature Ceramic'] },
                    vehicle_type: { type: 'string', enum: ['sedan', 'SUV', 'truck', 'large SUV'] },
                    condition: { type: 'string', enum: ['standard', 'pet hair', 'heavily soiled', 'luxury'], description: 'Apply price multipliers for difficult conditions.' }
                },
                required: ['service', 'vehicle_type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'verify_service_area',
            description: 'Verify if a US Zip Code is within the detailing service radius.',
            parameters: {
                type: 'object',
                properties: {
                    zip_code: { type: 'string', description: '5-digit US Zip Code' }
                },
                required: ['zip_code']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_weather',
            description: 'Check weather forecast for mobile detailing feasibility on a specific date.',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    zip_code: { type: 'string', description: '5-digit US Zip Code' }
                },
                required: ['date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_deposit_link',
            description: 'Generate a secure payment link for a non-refundable booking deposit.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: 'Deposit amount (USD)' },
                    service: { type: 'string' },
                    customer_name: { type: 'string' },
                    phone: { type: 'string' },
                    booking_date: { type: 'string' },
                    booking_time: { type: 'string' },
                    session_id: { type: 'string', description: 'Chat session ID for reconciliation' }
                },
                required: ['amount', 'service']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_knowledge',
            description: 'Get internal business info on pricing, durations, policies, or service areas.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', enum: ['pricing', 'policies', 'all', 'service_durations', 'service_area'] }
                },
                required: ['topic']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sync_booking_state',
            description: 'Update customer data gathered during chat.',
            parameters: {
                type: 'object',
                properties: {
                    customer_name: { type: 'string' },
                    phone: { type: 'string' },
                    vehicle_type: { type: 'string' },
                    service: { type: 'string' },
                    condition: { type: 'string' },
                    date: { type: 'string' },
                    time: { type: 'string' },
                    address: { type: 'string' },
                    zip_code: { type: 'string' },
                    price: { type: 'number' },
                    lead_score: { type: 'number' },
                    status: { type: 'string', enum: ['inquiring', 'qualified', 'confirmed'] }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyze_vehicle_photo',
            description: 'Analyze a vehicle photo to assess condition, identify damage, and recommend services. Use when the customer sends a photo of their vehicle.',
            parameters: {
                type: 'object',
                properties: {
                    photo_url: { type: 'string', description: 'URL of the uploaded vehicle photo' },
                    photo_description: { type: 'string', description: 'Optional customer description of what to look at' }
                },
                required: ['photo_url']
            }
        }
    }
];

export async function executeTool(name, args, businessId) {
    console.log(`[Agent Tool Execution] ${name}`, args);

    try {
        switch (name) {
            case 'verify_service_area': {
                const validated = VerifyServiceAreaSchema.parse(args);
                const area = await getKnowledge('service_area', businessId);
                const isSupported = area.zip_codes.includes(validated.zip_code);

                return JSON.stringify({
                    supported: isSupported,
                    message: isSupported ? "Service target area confirmed." : "We currently do not service this zip code. We are expanding to new areas soon!",
                    zip_code: validated.zip_code
                });
            }

            case 'check_weather': {
                const validated = CheckWeatherSchema.parse(args);

                // Real weather API (OpenWeatherMap free tier: 1000 calls/day)
                const apiKey = process.env.OPENWEATHER_API_KEY;
                if (apiKey && validated.zip_code) {
                    try {
                        const weatherRes = await fetch(
                            `https://api.openweathermap.org/data/2.5/weather?zip=${validated.zip_code},us&appid=${apiKey}&units=imperial`,
                            { signal: abortAfter(8000) }
                        );
                        if (weatherRes.ok) {
                            const weather = await weatherRes.json();
                            const main = weather.weather[0].main.toLowerCase();
                            const desc = weather.weather[0].description;
                            const temp = Math.round(weather.main.temp);
                            const wind = Math.round(weather.wind.speed);

                            const requiresCover = ['rain', 'drizzle', 'thunderstorm', 'snow'].includes(main);
                            const highWind = wind > 20;

                            let recommendation;
                            if (requiresCover) {
                                recommendation = `Rain forecasted (${desc}). Indoor garage or cover required.`;
                            } else if (highWind) {
                                recommendation = `High winds (${wind} mph). Cover or shelter recommended.`;
                            } else {
                                recommendation = `Weather looks perfect for a mobile detail. ${temp}F, ${desc}.`;
                            }

                            return JSON.stringify({
                                forecast: `${desc}, ${temp}F, ${wind} mph wind`,
                                temperature_f: temp,
                                wind_mph: wind,
                                can_service_outdoors: !requiresCover && !highWind,
                                recommendation
                            });
                        }
                    } catch (e) {
                        console.warn("Weather API call failed:", e.message);
                    }
                }

                // Fallback: deterministic simulation when API key not set or zip not provided
                // Uses a simple seeded hash of the date to produce reproducible results
                const forecasts = ['Clear Skies', 'Sunny', 'Partly Cloudy', 'Potential Rain', 'High Wind'];
                const dateSeed = new Date().toISOString().slice(0, 10).split('-').reduce((a, b) => a + parseInt(b), 0);
                const forecast = forecasts[dateSeed % forecasts.length];
                const requiresCover = forecast.toLowerCase().includes('rain') || forecast.toLowerCase().includes('wind');

                return JSON.stringify({
                    forecast,
                    can_service_outdoors: !requiresCover,
                    recommendation: requiresCover ? "Indoor garage or cover required for this date." : "Weather looks perfect for a mobile detail."
                });
            }

            case 'generate_deposit_link': {
                const validated = GenerateDepositLinkSchema.parse(args);

                // Resolve deposit amount: explicit arg > business default > $50
                let depositAmount = validated.amount;
                if (!depositAmount && supabaseAdmin) {
                    try {
                        const { data } = await supabaseAdmin
                            .from('businesses')
                            .select('default_deposit_amount')
                            .eq('id', businessId)
                            .single();
                        depositAmount = data?.default_deposit_amount || 50;
                    } catch {
                        depositAmount = 50;
                    }
                }
                if (!depositAmount) depositAmount = 50;

                // Primary: LemonSqueezy (works in Pakistan, no Stripe required)
                if (lsConfigured()) {
                    try {
                        const checkout = await lsCreateCheckout({
                            amount: depositAmount,
                            service: validated.service,
                            customerName: validated.customer_name,
                            phone: validated.phone,
                            bookingDate: validated.booking_date,
                            bookingTime: validated.booking_time,
                            sessionId: validated.session_id,
                        });

                        return JSON.stringify({
                            payment_url: checkout.url,
                            session_id: checkout.id,
                            deposit_amount: depositAmount,
                            currency: 'USD',
                            provider: 'lemonsqueezy',
                            note: "Slots are secured only after deposit payment is confirmed via webhook."
                        });
                    } catch (lsError) {
                        console.error('LemonSqueezy checkout failed, falling back to Stripe:', lsError.message);
                    }
                }

                // Fallback: Stripe
                if (stripe) {
                    const session = await createDepositSession({
                        amount: depositAmount,
                        service: validated.service,
                        customerName: validated.customer_name,
                        phone: validated.phone,
                        bookingDate: validated.booking_date,
                        bookingTime: validated.booking_time,
                        sessionId: validated.session_id,
                    });

                    return JSON.stringify({
                        payment_url: session.url,
                        session_id: session.id,
                        deposit_amount: depositAmount,
                        currency: 'USD',
                        provider: 'stripe',
                        note: "Slots are secured only after deposit payment is confirmed via webhook."
                    });
                }

                // Dev fallback: mock URL
                const mockUrl = `https://checkout.lemonsqueezy.com/checkout/mock_${Math.random().toString(36).substring(7)}`;
                return JSON.stringify({
                    payment_url: mockUrl,
                    deposit_amount: depositAmount,
                    currency: 'USD',
                    provider: 'mock',
                    note: "No payment provider configured — set LEMONSQUEEZY_API_KEY or STRIPE_SECRET_KEY for real payments."
                });
            }

            case 'get_availability': {
                const validated = GetAvailabilitySchema.parse(args);
                const inputDate = new Date(validated.date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (isNaN(inputDate.getTime()) || inputDate < today) {
                    return JSON.stringify({
                        error: "Invalid date. Appointments must be today or in the future."
                    });
                }

                const slots = await checkAvailability(validated.date, validated.duration);
                return JSON.stringify({ date: validated.date, slots, duration: validated.duration });
            }

            case 'calculate_quote': {
                const validated = CalculateQuoteSchema.parse(args);
                const pricing = await getKnowledge('pricing', businessId);

                // DEFENSIVE PRICING: Validate pricing data shape before accessing.
                // If the business owner edits business_knowledge in the dashboard
                // and removes a service tier or vehicle type, this catches it
                // with a specific, loggable error rather than a silent TypeError.
                let basePrice = null;
                let usedFallback = false;

                if (!pricing || typeof pricing !== 'object') {
                    console.error(JSON.stringify({
                        tool: 'calculate_quote',
                        error: 'PRICING_DATA_MALFORMED',
                        detail: 'pricing knowledge returned non-object',
                        timestamp: new Date().toISOString()
                    }));
                } else if (!pricing[validated.service]) {
                    console.error(JSON.stringify({
                        tool: 'calculate_quote',
                        error: 'PRICING_SERVICE_MISSING',
                        detail: `Service "${validated.service}" not found in pricing data`,
                        timestamp: new Date().toISOString()
                    }));
                } else if (typeof pricing[validated.service][validated.vehicle_type] !== 'number') {
                    console.error(JSON.stringify({
                        tool: 'calculate_quote',
                        error: 'PRICING_VEHICLE_MISSING',
                        detail: `Vehicle type "${validated.vehicle_type}" not found for service "${validated.service}"`,
                        timestamp: new Date().toISOString()
                    }));
                }

                // Try fallback if primary pricing data is incomplete
                if (basePrice === null) {
                    const fallbackPricing = FALLBACK_KNOWLEDGE.pricing;
                    if (fallbackPricing[validated.service] &&
                        typeof fallbackPricing[validated.service][validated.vehicle_type] === 'number') {
                        basePrice = fallbackPricing[validated.service][validated.vehicle_type];
                        usedFallback = true;
                        console.warn(JSON.stringify({
                            tool: 'calculate_quote',
                            warning: 'USED_FALLBACK_PRICING',
                            detail: `Service="${validated.service}" Vehicle="${validated.vehicle_type}"`,
                            timestamp: new Date().toISOString()
                        }));
                    }
                }

                if (basePrice === null) {
                    return JSON.stringify({
                        error: "Pricing information is temporarily unavailable for this combination. Please contact us directly for a quote.",
                        price: null
                    });
                }

                // Multiplier Logic for US Detailing Market
                const multipliers = {
                    'standard': 1.0,
                    'pet hair': 1.25,
                    'heavily soiled': 1.5,
                    'luxury': 1.2 // High-risk insurance surcharge
                };

                const multiplier = multipliers[validated.condition] || 1.0;
                const price = Math.round(basePrice * multiplier);

                return JSON.stringify({
                    price,
                    currency: 'USD',
                    condition: validated.condition,
                    base_price_impact: multiplier !== 1.0,
                    _fallback: usedFallback ? true : undefined
                });
            }

            case 'query_knowledge': {
                const validated = QueryKnowledgeSchema.parse(args);
                const content = await getKnowledge(validated.topic, businessId);
                return JSON.stringify(content);
            }

            case 'sync_booking_state': {
                const validated = SyncBookingSchema.parse(args);

                // Lead Scoring Logic (US Market SaaS optimization)
                let score = 0;
                if (validated.service === 'Signature Ceramic') score += 50;
                if (validated.vehicle_type === 'large SUV' || validated.vehicle_type === 'truck') score += 30;
                if (validated.condition === 'luxury' || validated.condition === 'heavily soiled') score += 20;
                validated.lead_score = score;

                if (validated.phone) {
                    const phoneNumber = parsePhoneNumberFromString(validated.phone, 'US');
                    if (!phoneNumber || !phoneNumber.isValid()) {
                        return JSON.stringify({
                            status: 'error',
                            message: "Invalid US phone number format."
                        });
                    }
                    validated.phone = phoneNumber.format('E.164');
                }

                return JSON.stringify({ status: 'synced', data: validated });
            }

            case 'analyze_vehicle_photo': {
                const validated = AnalyzeVehiclePhotoSchema.parse(args);

                // Store analysis request in database for audit trail
                if (supabaseAdmin) {
                    try {
                        await supabaseAdmin.from('vehicle_photos').insert({
                            session_id: businessId || 'unknown',
                            storage_path: validated.photo_url,
                            analysis_result: {
                                photo_url: validated.photo_url,
                                description: validated.photo_description,
                                analyzed_at: new Date().toISOString(),
                            },
                        });
                    } catch (e) {
                        // Non-fatal — just log
                        console.warn('[analyze_vehicle_photo] Failed to log analysis:', e.message);
                    }
                }

                // The AI already has the image in its vision context.
                // This tool just acknowledges the photo and prompts structured analysis.
                return JSON.stringify({
                    status: 'acknowledged',
                    photo_url: validated.photo_url,
                    message: "Photo received. Please analyze the vehicle condition, identify any damage, dirt levels, and recommend appropriate services.",
                });
            }

            default:
                return JSON.stringify({ error: 'Tool not found' });
        }
    } catch (error) {
        // STRUCTURED ERROR LOGGING: Log every tool failure in a consistent JSON
        // shape so it can be piped into a real logging/alerting tool without a
        // rewrite. PII is redacted before logging using the existing pii-redact.
        const logEntry = JSON.stringify({
            tool: name,
            error: error.message,
            args: redactToolArgs(args),
            level: error instanceof z.ZodError ? 'validation' : 'runtime',
            timestamp: new Date().toISOString()
        });
        console.error(`[ToolError] ${logEntry}`);
        Sentry.captureException(error, { tags: { tool: name, level: error instanceof z.ZodError ? 'validation' : 'runtime' } });

        // SECURITY: Never expose schema structure or internal error details to the LLM.
        // The LLM could relay these to the customer or use them to craft targeted attacks.
        return JSON.stringify({
            error: "The provided data could not be processed. Please try again."
        });
    }
}

export { invalidateKnowledgeCache };
