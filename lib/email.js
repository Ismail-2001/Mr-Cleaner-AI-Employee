import * as Sentry from '@sentry/nextjs';
import { escapeHtml } from './html-escape';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_MAX_RETRIES = 2;
const EMAIL_RETRY_DELAY_MS = 1000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send booking confirmation email — bilingual (English/Spanish).
 * @param {Object} options
 * @param {string} [options.language='en'] - 'en' or 'es'
 */
export async function sendBookingConfirmation({ email, customerName, service, servicePrice, bookingDate, bookingTime, address, language = 'en' }) {
    if (!RESEND_API_KEY) {
        console.log('RESEND_API_KEY not set — skipping email confirmation');
        return { success: false, reason: 'not_configured' };
    }

    try {
        const { Resend } = await import('resend');
        const resend = new Resend(RESEND_API_KEY);

        const priceStr = servicePrice ? `$${servicePrice}` : (language === 'es' ? 'Se definirá en llegada' : 'TBD on arrival');

        const t = language === 'es' ? {
            subject: `Reserva Confirmada — ${escapeHtml(service)} el ${escapeHtml(bookingDate)}`,
            heading: 'Reserva Confirmada',
            greeting: `Hola ${escapeHtml(customerName)},`,
            intro: 'Su cita está confirmada. Aquí tiene los detalles:',
            svcLabel: 'Servicio',
            dateLabel: 'Fecha',
            timeLabel: 'Hora',
            priceLabel: 'Precio',
            depositNote: 'Se ha cobrado el depósito. El saldo restante se paga a la llegada.',
        } : {
            subject: `Booking Confirmed — ${escapeHtml(service)} on ${escapeHtml(bookingDate)}`,
            heading: 'Booking Confirmed',
            greeting: `Hi ${escapeHtml(customerName)},`,
            intro: "Your appointment is locked in. Here's what you need to know:",
            svcLabel: 'Service',
            dateLabel: 'Date',
            timeLabel: 'Time',
            priceLabel: 'Price',
            depositNote: 'Deposit has been collected. Remaining balance is due on arrival.',
        };

        let lastError = null;
        for (let attempt = 1; attempt <= EMAIL_MAX_RETRIES; attempt++) {
            try {
                await resend.emails.send({
                    from: 'Mr. Cleaner <bookings@mrcleaner.app>',
                    to: email,
                    subject: t.subject,
                    html: `
                        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                            <div style="background: #0a0a0a; padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                                <span style="background: #c8a45c; color: #0a0a0a; padding: 6px 12px; border-radius: 8px; font-weight: 800; font-size: 0.85rem;">MC</span>
                                <h1 style="color: #fff; margin-top: 16px; font-size: 1.5rem;">${t.heading}</h1>
                            </div>
                            <div style="background: #111; padding: 32px; border-radius: 0 0 16px 16px;">
                                <p style="color: #ccc; line-height: 1.7;">${t.greeting}</p>
                                <p style="color: #ccc; line-height: 1.7;">${t.intro}</p>
                                <table style="width: 100%; margin: 24px 0; border-collapse: collapse;">
                                    <tr><td style="padding: 8px 0; color: #888;">${t.svcLabel}</td><td style="padding: 8px 0; color: #fff; text-align: right; font-weight: 600;">${escapeHtml(service)}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #888; border-top: 1px solid #222;">${t.dateLabel}</td><td style="padding: 8px 0; color: #fff; text-align: right; border-top: 1px solid #222;">${escapeHtml(bookingDate)}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #888; border-top: 1px solid #222;">${t.timeLabel}</td><td style="padding: 8px 0; color: #fff; text-align: right; border-top: 1px solid #222;">${escapeHtml(bookingTime)}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #888; border-top: 1px solid #222;">${t.priceLabel}</td><td style="padding: 8px 0; color: #fff; text-align: right; border-top: 1px solid #222; font-weight: 700;">${escapeHtml(priceStr)}</td></tr>
                                </table>
                                ${address ? `<p style="color: #888; font-size: 0.9rem;">${language === 'es' ? 'Ubicación' : 'Location'}: ${escapeHtml(address)}</p>` : ''}
                                <p style="color: #888; font-size: 0.85rem; margin-top: 24px;">${t.depositNote}</p>
                            </div>
                        </div>
                    `,
                });

                console.log(`Booking confirmation sent to ${email} (${language})`);
                return { success: true };
            } catch (err) {
                lastError = err;
                if (attempt < EMAIL_MAX_RETRIES) {
                    console.warn(`Email attempt ${attempt} failed, retrying in ${EMAIL_RETRY_DELAY_MS}ms:`, err.message);
                    await sleep(EMAIL_RETRY_DELAY_MS);
                }
            }
        }

        throw lastError || new Error('Email send failed');
    } catch (error) {
        console.error('Failed to send booking confirmation email:', error.message);
        Sentry.captureException(error, { tags: { module: 'email', method: 'sendBookingConfirmation' } });
        return { success: false, error: error.message };
    }
}
