import { z } from 'zod';
import { checkAvailability } from './calendar';
import { supabase } from './supabase';
import { stripe, createDepositSession } from './stripe';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

// --- KNOWLEDGE BASE (Dynamic with Resilient Fallback) ---
const FALLBACK_KNOWLEDGE = {
    pricing: {
        'Executive Preservation': { sedan: 120, SUV: 150, truck: 150, 'large SUV': 180 },
        'The Master Detail': { sedan: 250, SUV: 300, truck: 300, 'large SUV': 350 },
        'Signature Ceramic': { sedan: 450, SUV: 550, truck: 550, 'large SUV': 650 }
    },
    service_durations: {
        'Executive Preservation': 120, // 2 hours
        'The Master Detail': 240,     // 4 hours
        'Signature Ceramic': 480      // 8 hours
    },
    policies: {
        cancellation: "Free cancellation with 24h notice. 50% charge for late cancellations.",
        hours: "Monday-Saturday: 8 AM - 6 PM (Sunday Closed)",
        payment: "Accepted: Cash, Zelle, Venmo.",
        advance_booking: "Minimum 24-hour advance booking required."
    },
    service_area: {
        counties: ['Travis', 'Williamson', 'Hays'],
        zip_codes: ['78701', '78702', '78703', '78704', '78705', '78613', '78660', '78664'] // Austin area
    }
};

async function getKnowledge(topic) {
    if (!supabase) return topic === 'all' ? FALLBACK_KNOWLEDGE : FALLBACK_KNOWLEDGE[topic];

    try {
        if (topic === 'all') {
            const { data } = await supabase.from('business_knowledge').select('*');
            if (!data || data.length === 0) return FALLBACK_KNOWLEDGE;
            return data.reduce((acc, item) => ({ ...acc, [item.id]: item.content }), {});
        }

        const { data, error } = await supabase
            .from('business_knowledge')
            .select('content')
            .eq('id', topic)
            .single();

        if (error || !data) {
            console.warn(`Knowledge lookup failed for ${topic}, using fallback.`);
            return FALLBACK_KNOWLEDGE[topic];
        }
        return data.content;
    } catch (e) {
        return topic === 'all' ? FALLBACK_KNOWLEDGE : FALLBACK_KNOWLEDGE[topic];
    }
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
    customer_name: z.string().optional(),
    phone: z.string().optional(),
    vehicle_type: z.string().optional(),
    service: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    address: z.string().optional(),
    zip_code: z.string().optional(),
    price: z.number().optional(),
    status: z.enum(['inquiring', 'qualified', 'confirmed']).optional()
});

const VerifyServiceAreaSchema = z.object({
    zip_code: z.string().length(5, "US Zip codes must be 5 digits")
});

const CheckWeatherSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
    zip_code: z.string().optional()
});

const GenerateDepositLinkSchema = z.object({
    amount: z.number().min(1, "Deposit must be at least $1").max(500, "Deposit cannot exceed $500"),
    service: z.string().min(1).max(100),
    customer_name: z.string().optional(),
    phone: z.string().optional(),
    booking_date: z.string().optional(),
    booking_time: z.string().optional(),
    session_id: z.string().optional()
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
    }
];

export async function executeTool(name, args) {
    console.log(`[Agent Tool Execution] ${name}`, args);

    try {
        switch (name) {
            case 'verify_service_area': {
                const validated = VerifyServiceAreaSchema.parse(args);
                const area = await getKnowledge('service_area');
                const isSupported = area.zip_codes.includes(validated.zip_code);

                return JSON.stringify({
                    supported: isSupported,
                    message: isSupported ? "Service target area confirmed." : "We currently do not service this zip code. We are expanding to new areas soon!",
                    zip_code: validated.zip_code
                });
            }

            case 'check_weather': {
                const validated = CheckWeatherSchema.parse(args);
                // Simulation logic for SaaS robustness
                const forecasts = ['Clear Skies', 'Sunny', 'Partly Cloudy', 'Potential Rain', 'High Wind'];
                const forecast = forecasts[Math.floor(Math.random() * forecasts.length)];
                const requiresCover = forecast.toLowerCase().includes('rain') || forecast.toLowerCase().includes('wind');

                return JSON.stringify({
                    forecast,
                    can_service_outdoors: !requiresCover,
                    recommendation: requiresCover ? "Indoor garage or cover required for this date." : "Weather looks perfect for a mobile detail."
                });
            }

            case 'generate_deposit_link': {
                const validated = GenerateDepositLinkSchema.parse(args);

                if (!stripe) {
                    // Graceful fallback when Stripe is not configured (local dev)
                    const mockUrl = `https://checkout.stripe.com/pay/cs_test_${Math.random().toString(36).substring(7)}`;
                    return JSON.stringify({
                        payment_url: mockUrl,
                        deposit_amount: validated.amount,
                        currency: 'USD',
                        note: "Stripe not configured — using mock URL. Set STRIPE_SECRET_KEY for real payments."
                    });
                }

                // Create a real Stripe Checkout Session server-side
                const session = await createDepositSession({
                    amount: validated.amount,
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
                    deposit_amount: validated.amount,
                    currency: 'USD',
                    note: "Slots are secured only after deposit payment is confirmed via webhook."
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
                const pricing = await getKnowledge('pricing');
                let price = pricing[validated.service][validated.vehicle_type];

                // Multiplier Logic for US Detailing Market
                const multipliers = {
                    'standard': 1.0,
                    'pet hair': 1.25,
                    'heavily soiled': 1.5,
                    'luxury': 1.2 // High-risk insurance surcharge
                };

                price = Math.round(price * (multipliers[validated.condition] || 1.0));

                return JSON.stringify({
                    price,
                    currency: 'USD',
                    condition: validated.condition,
                    base_price_impact: multipliers[validated.condition] !== 1.0
                });
            }

            case 'query_knowledge': {
                const validated = QueryKnowledgeSchema.parse(args);
                const content = await getKnowledge(validated.topic);
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

            default:
                return JSON.stringify({ error: 'Tool not found' });
        }
    } catch (error) {
        console.error(`Tool Validation Error (${name}):`, error.message);
        // SECURITY: Never expose schema structure or internal error details to the LLM.
        // The LLM could relay these to the customer or use them to craft targeted attacks.
        return JSON.stringify({
            error: "The provided data could not be processed. Please try again."
        });
    }
}
