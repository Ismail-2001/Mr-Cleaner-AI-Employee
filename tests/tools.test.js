import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before importing tools
vi.mock('@/lib/calendar', () => ({
    checkAvailability: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
    stripe: null,
    createDepositSession: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: null,
}));

import { executeTool } from '@/lib/tools';

const VALID_SERVICES = ['Executive Preservation', 'The Master Detail', 'Signature Ceramic'];
const VALID_VEHICLES = ['sedan', 'SUV', 'truck', 'large SUV'];
const VALID_CONDITIONS = ['standard', 'pet hair', 'heavily soiled', 'luxury'];

// ---- calculate_quote ----
describe('calculate_quote', () => {
    const PRICING_FALLBACK = {
        'Executive Preservation': { sedan: 120, SUV: 150, truck: 150, 'large SUV': 180 },
        'The Master Detail': { sedan: 250, SUV: 300, truck: 300, 'large SUV': 350 },
        'Signature Ceramic': { sedan: 450, SUV: 550, truck: 550, 'large SUV': 650 },
    };

    it('returns correct base prices for all service × vehicle combinations', async () => {
        for (const service of VALID_SERVICES) {
            for (const vehicle of VALID_VEHICLES) {
                const result = await executeTool('calculate_quote', { service, vehicle_type: vehicle, condition: 'standard' });
                const parsed = JSON.parse(result);
                expect(parsed.price).toBe(PRICING_FALLBACK[service][vehicle]);
                expect(parsed.currency).toBe('USD');
                expect(parsed.base_price_impact).toBe(false);
            }
        }
    });

    it('applies pet hair multiplier correctly', async () => {
        const result = await executeTool('calculate_quote', { service: 'The Master Detail', vehicle_type: 'SUV', condition: 'pet hair' });
        const parsed = JSON.parse(result);
        expect(parsed.price).toBe(Math.round(300 * 1.25));
        expect(parsed.base_price_impact).toBe(true);
    });

    it('applies heavily soiled multiplier correctly', async () => {
        const result = await executeTool('calculate_quote', { service: 'Signature Ceramic', vehicle_type: 'truck', condition: 'heavily soiled' });
        const parsed = JSON.parse(result);
        expect(parsed.price).toBe(Math.round(550 * 1.5));
    });

    it('applies luxury multiplier correctly', async () => {
        const result = await executeTool('calculate_quote', { service: 'Executive Preservation', vehicle_type: 'sedan', condition: 'luxury' });
        const parsed = JSON.parse(result);
        expect(parsed.price).toBe(Math.round(120 * 1.2));
    });

    it('rounds prices to whole numbers', async () => {
        // large SUV with pet hair = 180 * 1.25 = 225 (whole)
        const result = await executeTool('calculate_quote', { service: 'Executive Preservation', vehicle_type: 'large SUV', condition: 'pet hair' });
        const parsed = JSON.parse(result);
        expect(Number.isInteger(parsed.price)).toBe(true);
    });
});

// ---- verify_service_area ----
describe('verify_service_area', () => {
    it('returns supported=true for zip in service area', async () => {
        const result = await executeTool('verify_service_area', { zip_code: '78701' });
        const parsed = JSON.parse(result);
        expect(parsed.supported).toBe(true);
    });

    it('returns supported=false for zip outside service area', async () => {
        const result = await executeTool('verify_service_area', { zip_code: '90210' });
        const parsed = JSON.parse(result);
        expect(parsed.supported).toBe(false);
    });

    it('returns generic error message for zip shorter than 5 digits', async () => {
        const result = await executeTool('verify_service_area', { zip_code: '123' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
        expect(parsed.error).not.toContain('ZodError');
    });
});

// ---- check_weather ----
describe('check_weather', () => {
    const realFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENWEATHER_API_KEY;

    beforeEach(() => {
        globalThis.fetch = realFetch;
        delete process.env.OPENWEATHER_API_KEY;
    });

    afterAll(() => {
        if (originalApiKey) process.env.OPENWEATHER_API_KEY = originalApiKey;
    });

    it('returns fallback simulation when no API key is set', async () => {
        const result = await executeTool('check_weather', { date: '2026-07-20' });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('forecast');
        expect(parsed).toHaveProperty('can_service_outdoors');
        expect(parsed).toHaveProperty('recommendation');
    });

    it('returns rain advisory when weather API reports rain', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                weather: [{ main: 'Rain', description: 'moderate rain' }],
                main: { temp: 65 },
                wind: { speed: 10 },
            }),
        });
        process.env.OPENWEATHER_API_KEY = 'test_key';
        const result = await executeTool('check_weather', { date: '2026-07-20', zip_code: '78701' });
        const parsed = JSON.parse(result);
        expect(parsed.can_service_outdoors).toBe(false);
        expect(parsed.recommendation.toLowerCase()).toContain('rain');
    });

    it('returns wind advisory when wind exceeds 20 mph', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                weather: [{ main: 'Clear', description: 'clear sky' }],
                main: { temp: 75 },
                wind: { speed: 25 },
            }),
        });
        process.env.OPENWEATHER_API_KEY = 'test_key';
        const result = await executeTool('check_weather', { date: '2026-07-20', zip_code: '78701' });
        const parsed = JSON.parse(result);
        expect(parsed.can_service_outdoors).toBe(false);
        expect(parsed.recommendation.toLowerCase()).toContain('wind');
    });

    it('returns clear advisory when weather is good', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                weather: [{ main: 'Clear', description: 'clear sky' }],
                main: { temp: 78 },
                wind: { speed: 5 },
            }),
        });
        process.env.OPENWEATHER_API_KEY = 'test_key';
        const result = await executeTool('check_weather', { date: '2026-07-20', zip_code: '78701' });
        const parsed = JSON.parse(result);
        expect(parsed.can_service_outdoors).toBe(true);
        expect(parsed.recommendation.toLowerCase()).toContain('perfect');
    });

    it('uses fallback when weather API fetch fails', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
        process.env.OPENWEATHER_API_KEY = 'test_key';
        const result = await executeTool('check_weather', { date: '2026-07-20', zip_code: '78701' });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('forecast');
        expect(parsed).toHaveProperty('can_service_outdoors');
    });
});

// ---- sync_booking_state ----
describe('sync_booking_state', () => {
    it('awards points for Signature Ceramic service', async () => {
        const result = await executeTool('sync_booking_state', { service: 'Signature Ceramic' });
        const parsed = JSON.parse(result);
        expect(parsed.data.lead_score).toBeGreaterThanOrEqual(50);
    });

    it('awards points for large SUV or truck', async () => {
        const result1 = await executeTool('sync_booking_state', { vehicle_type: 'large SUV' });
        const parsed1 = JSON.parse(result1);
        expect(parsed1.data.lead_score).toBeGreaterThanOrEqual(30);

        const result2 = await executeTool('sync_booking_state', { vehicle_type: 'truck' });
        const parsed2 = JSON.parse(result2);
        expect(parsed2.data.lead_score).toBeGreaterThanOrEqual(30);
    });

    it('awards points for luxury or heavily soiled condition', async () => {
        const result = await executeTool('sync_booking_state', { condition: 'luxury' });
        const parsed = JSON.parse(result);
        expect(parsed.data.lead_score).toBeGreaterThanOrEqual(20);
    });

    it('accumulates points from multiple fields', async () => {
        const result = await executeTool('sync_booking_state', {
            service: 'Signature Ceramic',
            vehicle_type: 'large SUV',
            condition: 'heavily soiled',
        });
        const parsed = JSON.parse(result);
        expect(parsed.data.lead_score).toBe(50 + 30 + 20);
    });

    it('returns error for clearly invalid phone number', async () => {
        const result = await executeTool('sync_booking_state', { phone: 'abc' });
        const parsed = JSON.parse(result);
        expect(parsed.status).toBe('error');
        expect(parsed.message.toLowerCase()).toContain('invalid');
    });
});

// ---- generate_deposit_link ----
describe('generate_deposit_link', () => {
    it('returns mock URL when Stripe is not configured', async () => {
        const result = await executeTool('generate_deposit_link', { amount: 50, service: 'Executive Preservation' });
        const parsed = JSON.parse(result);
        expect(parsed.payment_url).toContain('checkout.stripe.com');
        expect(parsed.deposit_amount).toBe(50);
        expect(parsed.currency).toBe('USD');
    });

    it('rejects deposit below $1', async () => {
        const result = await executeTool('generate_deposit_link', { amount: 0, service: 'Executive Preservation' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('rejects deposit above $500', async () => {
        const result = await executeTool('generate_deposit_link', { amount: 501, service: 'Executive Preservation' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });
});

// ---- get_availability ----
describe('get_availability', () => {
    it('rejects past dates', async () => {
        const result = await executeTool('get_availability', { date: '2020-01-01' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toContain('Invalid date');
    });

    it('rejects invalid date format', async () => {
        const result = await executeTool('get_availability', { date: 'not-a-date' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('passes duration through to checkAvailability', async () => {
        const { checkAvailability } = await import('@/lib/calendar');
        checkAvailability.mockResolvedValue([]);
        const result = await executeTool('get_availability', { date: '2026-08-15', duration: 240 });
        expect(checkAvailability).toHaveBeenCalledWith('2026-08-15', 240);
    });
});
