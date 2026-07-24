import twilio from 'twilio';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from './supabase-admin';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

// ─── Retry Configuration ─────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send an SMS via Twilio with exponential backoff retry.
 *
 * Attempts up to MAX_RETRIES times. Between each attempt, waits
 * BASE_DELAY_MS * 2^attemptNumber (1s, 2s, 4s). On final failure,
 * returns { success: false, error, attempts }.
 */
export async function sendSMS(to, body) {
    if (!client || !twilioNumber) {
        console.warn("SMS Simulation Mode: Twilio credentials missing.");
        console.log(`[SIMULATED SMS to ${to}]: ${body}`);
        return { success: true, simulated: true };
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const message = await client.messages.create({
                body,
                from: twilioNumber,
                to,
            });
            console.log(`SMS Sent: ${message.sid} (attempt ${attempt}/${MAX_RETRIES})`);
            return { success: true, sid: message.sid, attempts: attempt };
        } catch (error) {
            lastError = error;
            // Only retry on transient errors: rate limits (20429) and server errors (5xx).
            // Do NOT retry on permanent failures: invalid number (21211), unsubscribed (21614).
            const isPermanentFailure = error.code === 21211 || error.code === 21614;
            const isServerError = error.status >= 500 && error.status < 600;
            const isRetryable = error.code === 20429 || isServerError;

            if (isPermanentFailure || !isRetryable || attempt === MAX_RETRIES) {
                console.error(`SMS failed after ${attempt} attempt(s):`, error.message);
                Sentry.captureException(error, {
                    tags: { module: 'twilio', method: 'sendSMS' },
                    extra: { attempt, to: to?.slice(-4), code: error.code },
                });
                return { success: false, error: error.message, attempts: attempt };
            }

            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`SMS attempt ${attempt} failed (code ${error.code}), retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }

    // Should never reach here, but TypeScript safety
    return { success: false, error: lastError?.message || 'Unknown error', attempts: MAX_RETRIES };
}

/**
 * Send SMS with automatic email fallback.
 * Tries SMS first. If all retries fail, sends an email via Resend.
 */
export async function sendSMSWithFallback(to, body, { fallbackEmail, fallbackSubject, customerName } = {}) {
    const smsResult = await sendSMS(to, body);
    if (smsResult.success) {
        return { method: 'sms', ...smsResult };
    }

    // SMS failed — fall back to email if email is available
    if (fallbackEmail) {
        console.log(`SMS failed, falling back to email for ${to}`);
        const emailResult = await sendFallbackEmail({
            to: fallbackEmail,
            subject: fallbackSubject || 'Message from Mr. Cleaner',
            body,
            customerName,
        });
        if (emailResult.success) {
            return { method: 'email_fallback', ...emailResult };
        }
        console.error('Both SMS and email fallback failed');
        return { method: 'failed', smsError: smsResult.error, emailError: emailResult.error };
    }

    return { method: 'failed', smsError: smsResult.error };
}

/**
 * Send a fallback email via Resend when SMS is unavailable.
 */
async function sendFallbackEmail({ to, subject, body, customerName }) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not set — cannot send fallback email');
        return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    try {
        const { Resend } = await import('resend');
        const resend = new Resend(RESEND_API_KEY);

        await resend.emails.send({
            from: 'Mr. Cleaner <bookings@mrcleaner.app>',
            to,
            subject,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <div style="background: #0a0a0a; padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                        <span style="background: #c8a45c; color: #0a0a0a; padding: 6px 12px; border-radius: 8px; font-weight: 800; font-size: 0.85rem;">MC</span>
                        <h1 style="color: #fff; margin-top: 16px; font-size: 1.5rem;">${subject}</h1>
                    </div>
                    <div style="background: #111; padding: 32px; border-radius: 0 0 16px 16px;">
                        <p style="color: #ccc; line-height: 1.7;">Hi ${customerName || 'there'},</p>
                        <pre style="color: #ccc; white-space: pre-wrap; font-family: sans-serif; line-height: 1.7;">${body}</pre>
                        <p style="color: #888; font-size: 0.85rem; margin-top: 24px;">Mr. Cleaner Mobile Detailing</p>
                    </div>
                </div>
            `,
        });

        console.log(`Fallback email sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('Fallback email failed:', error.message);
        Sentry.captureException(error, { tags: { module: 'twilio', method: 'sendFallbackEmail' } });
        return { success: false, error: error.message };
    }
}

// ─── TCPA Compliance ─────────────────────────────────────────────────────────

/**
 * Check if a customer has given SMS consent.
 * Queries the bookings table for sms_consent = true.
 * Returns true if consent exists, false otherwise.
 */
export async function hasSmsConsent(phone, businessId) {
    if (!supabaseAdmin || !phone) return false;

    try {
        const { data } = await supabaseAdmin
            .from('bookings')
            .select('sms_consent')
            .eq('phone', phone)
            .eq('business_id', businessId || '00000000-0000-0000-0000-000000000001')
            .eq('sms_consent', true)
            .limit(1)
            .single();

        return !!data;
    } catch {
        return false;
    }
}

// ─── Lead Alerts ─────────────────────────────────────────────────────────────

/**
 * Triggers dual lead alerts for owner and customer.
 *
 * TCPA: Customer SMS is only sent if sms_consent is true.
 * Retry: Both SMS attempts use exponential backoff.
 * Fallback: Owner alert falls back to email if SMS fails.
 */
export async function triggerLeadAlerts(booking) {
    const leadScore = booking.lead_score || 0;
    const isHighValue = leadScore >= 80;

    const ownerHeader = isHighValue ? "*PRIORITY* HIGH-VALUE LEAD" : "NEW BOOKING";

    const ownerMessage = `${ownerHeader}
Name: ${booking.customer_name}
Value: $${booking.service_price || booking.price}
Service: ${booking.service}
Score: ${leadScore}/100
Vehicle: ${booking.vehicle_type} (${booking.condition || 'standard'})
Time: ${booking.booking_date} @ ${booking.booking_time}
Phone: ${booking.phone}

View reasoning: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`;

    const customerMessage = `Hi ${booking.customer_name}, this is Maya from Mr. Cleaner. Your detailing appointment is confirmed for ${booking.booking_date} at ${booking.booking_time}. We're excited to restore your ${booking.vehicle_type}! See you soon.`;

    const results = { owner: null, customer: null };

    // Read at call time (not module load) so tests can set process.env
    const ownerPhone = process.env.BUSINESS_PHONE;

    // 1. Notify Owner (Critical) — retry + email fallback
    if (ownerPhone) {
        results.owner = await sendSMSWithFallback(ownerPhone, ownerMessage, {
            fallbackEmail: process.env.BUSINESS_EMAIL,
            fallbackSubject: `${ownerHeader} — ${booking.customer_name}`,
            customerName: 'Owner',
        });
    }

    // 2. Notify Customer (High-Touch) — TCPA consent gate
    if (booking.phone) {
        // TCPA COMPLIANCE: Never send marketing/SMS without explicit consent.
        // The sms_consent field must be true — set during booking creation.
        const consent = booking.sms_consent === true;

        if (!consent) {
            console.log(`TCPA: Customer ${booking.phone?.slice(-4)} has not consented to SMS — skipping`);
            results.customer = { method: 'skipped', reason: 'no_sms_consent' };
        } else {
            results.customer = await sendSMS(booking.phone, customerMessage);
        }
    }

    return results;
}

// ─── Daily Summary ───────────────────────────────────────────────────────────

/**
 * Build and send a daily booking summary to the business owner.
 * Queries today's bookings, formats a digest, sends via SMS or email fallback.
 *
 * Call this from a cron job (e.g., Vercel Cron or GitHub Actions).
 */
export async function sendDailySummary(businessId) {
    if (!supabaseAdmin) {
        console.warn('Daily summary skipped: no Supabase configured');
        return { success: false, reason: 'no_supabase' };
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        // Fetch today's bookings for this business
        const { data: bookings, error } = await supabaseAdmin
            .from('bookings')
            .select('customer_name, phone, vehicle_type, service, service_price, booking_date, booking_time, status')
            .eq('business_id', businessId)
            .eq('booking_date', today)
            .neq('status', 'cancelled')
            .order('booking_time', { ascending: true });

        if (error) {
            console.error('Daily summary query failed:', error.message);
            return { success: false, error: error.message };
        }

        if (!bookings || bookings.length === 0) {
            console.log(`Daily summary: no bookings for ${today}`);
            return { success: true, count: 0 };
        }

        // Format digest
        const totalRevenue = bookings.reduce((sum, b) => sum + (b.service_price || 0), 0);
        const bookingList = bookings.map(b =>
            `• ${b.booking_time} — ${b.customer_name} (${b.vehicle_type}) — $${b.service_price || 'TBD'} — ${b.service}`
        ).join('\n');

        const summaryMessage = `DAILY SUMMARY — ${today}
${bookings.length} booking(s) • $${totalRevenue} revenue

${bookingList}

Dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`;

        // Resolve business phone from businesses table
        const { data: business } = await supabaseAdmin
            .from('businesses')
            .select('phone, email')
            .eq('id', businessId)
            .single();

        const ownerPhone = business?.phone || businessPhone;
        const ownerEmail = business?.email || process.env.BUSINESS_EMAIL;

        // Send via SMS with email fallback
        if (ownerPhone) {
            const result = await sendSMSWithFallback(ownerPhone, summaryMessage, {
                fallbackEmail: ownerEmail,
                fallbackSubject: `Daily Summary — ${bookings.length} bookings, $${totalRevenue} revenue`,
                customerName: business?.owner_name || 'Owner',
            });
            return { success: true, count: bookings.length, revenue: totalRevenue, method: result.method };
        }

        // SMS not available — send email directly
        if (ownerEmail) {
            const emailResult = await sendFallbackEmail({
                to: ownerEmail,
                subject: `Daily Summary — ${bookings.length} bookings, $${totalRevenue} revenue`,
                body: summaryMessage,
                customerName: business?.owner_name || 'Owner',
            });
            return { success: emailResult.success, count: bookings.length, revenue: totalRevenue, method: 'email' };
        }

        console.warn('Daily summary: no phone or email configured for business');
        return { success: false, reason: 'no_recipient', count: bookings.length };
    } catch (error) {
        console.error('Daily summary failed:', error.message);
        Sentry.captureException(error, { tags: { module: 'twilio', method: 'sendDailySummary' } });
        return { success: false, error: error.message };
    }
}
