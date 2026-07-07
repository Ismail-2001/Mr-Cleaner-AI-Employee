import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const businessPhone = process.env.BUSINESS_PHONE;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send an SMS via Twilio with expert error handling.
 */
export async function sendSMS(to, body) {
    if (!client || !twilioNumber) {
        console.warn("SMS Simulation Mode: Twilio credentials missing.");
        console.log(`[SIMULATED SMS to ${to}]: ${body}`);
        return { success: true, simulated: true };
    }

    try {
        const message = await client.messages.create({
            body: body,
            from: twilioNumber,
            to: to
        });
        console.log(`SMS Sent: ${message.sid}`);
        return { success: true, sid: message.sid };
    } catch (error) {
        console.error("Twilio SMS Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Triggers dual lead alerts for both owner and customer.
 * Expertly formatted for maximum clarity.
 */
export async function triggerLeadAlerts(booking) {
    const leadScore = booking.lead_score || 0;
    const isHighValue = leadScore >= 80;

    const ownerHeader = isHighValue ? "💎 PRIORITY ELITE ALERT (WHALE)" : "📅 NEW LEAD ALERT";

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

    // 1. Notify Owner (Critical)
    if (businessPhone) {
        await sendSMS(businessPhone, ownerMessage);
    }

    // 2. Notify Customer (High-Touch)
    if (booking.phone) {
        await sendSMS(booking.phone, customerMessage);
    }
}
