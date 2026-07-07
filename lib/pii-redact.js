/**
 * PII redaction utilities for safe logging.
 *
 * WHY THIS EXISTS:
 * Customer names, phone numbers, and addresses are logged to console and stored
 * in usage_logs. In production, this creates GDPR/privacy compliance issues.
 * Logs may be shipped to aggregation services (Datadog, Logtail) where PII
 * must not appear. This module provides redaction functions for all PII types.
 */

/**
 * Redact a phone number, keeping only last 4 digits.
 * "555-123-4567" → "***-***-4567"
 */
function redactPhone(phone) {
    if (!phone || typeof phone !== 'string') return '[REDACTED]';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 4) return '[REDACTED]';
    return '***-***-' + cleaned.slice(-4);
}

/**
 * Redact a name, keeping only first initial.
 * "John Smith" → "J.***"
 */
function redactName(name) {
    if (!name || typeof name !== 'string') return '[REDACTED]';
    const first = name.trim()[0];
    return first ? `${first}.***` : '[REDACTED]';
}

/**
 * Redact an address, keeping only zip code.
 * "123 Main St, Austin, TX 78701" → "[ADDR] 78701"
 */
function redactAddress(address) {
    if (!address || typeof address !== 'string') return '[REDACTED]';
    const zipMatch = address.match(/\b(\d{5})\b/);
    return zipMatch ? `[ADDR] ${zipMatch[1]}` : '[ADDR]';
}

/**
 * Redact a full name and phone from a booking data object.
 * Returns a new object with PII fields redacted.
 */
export function redactBookingData(data) {
    if (!data || typeof data !== 'object') return data;
    return {
        ...data,
        customer_name: data.customer_name ? redactName(data.customer_name) : data.customer_name,
        phone: data.phone ? redactPhone(data.phone) : data.phone,
        address: data.address ? redactAddress(data.address) : data.address,
    };
}

/**
 * Redact PII from tool arguments before logging.
 * Strips customer_name, phone, address from any object.
 */
export function redactToolArgs(args) {
    if (!args || typeof args !== 'object') return args;
    const redacted = { ...args };
    if (redacted.customer_name) redacted.customer_name = redactName(redacted.customer_name);
    if (redacted.phone) redacted.phone = redactPhone(redacted.phone);
    if (redacted.address) redacted.address = redactAddress(redacted.address);
    return redacted;
}
