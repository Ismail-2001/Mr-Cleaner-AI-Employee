/**
 * Jobber CRM integration utilities.
 *
 * HANDLES:
 * - OAuth2 authentication flow
 * - GraphQL API client with automatic token refresh
 * - Bidirectional sync: bookings ↔ Jobber jobs
 * - Webhook handling for real-time updates
 *
 * JOBBER API:
 * - GraphQL endpoint: https://api.getjobber.com/api/graphql
 * - OAuth2: standard authorization code flow
 * - Scopes: jobs:read, jobs:write, clients:read, clients:write
 *
 * SYNC FLOW:
 * 1. When a booking is confirmed via Maya, create a Jobber job
 * 2. When Jobber updates job status, sync back to bookings table
 * 3. Webhook receives real-time updates from Jobber
 *
 * SETUP:
 * 1. Create a Jobber app at https://developer.getjobber.com/
 * 2. Set JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET env vars
 * 3. Add OAuth redirect URI: https://your-domain.com/api/integrations/jobber/callback
 *
 * REFERENCES:
 * - https://developer.getjobber.com/docs/
 * - https://developer.getjobber.com/graphql/
 */

import * as Sentry from '@sentry/nextjs';
import { encrypt, decrypt } from './encrypt';

const JOBBER_CLIENT_ID = process.env.JOBBER_CLIENT_ID;
const JOBBER_CLIENT_SECRET = process.env.JOBBER_CLIENT_SECRET;
const JOBBER_API_URL = 'https://api.getjobber.com/api/graphql';
const JOBBER_WEBHOOK_SECRET = process.env.JOBBER_WEBHOOK_SECRET;

// ─── OAuth2 Flow ─────────────────────────────────────────────────────────────

/**
 * Generate the OAuth2 authorization URL for Jobber.
 *
 * @param {string} state - CSRF protection state parameter
 * @returns {string} Authorization URL
 */
export function getJobberAuthUrl(state) {
    const params = new URLSearchParams({
        client_id: JOBBER_CLIENT_ID,
        redirect_uri: getRedirectUri(),
        response_type: 'code',
        scope: 'jobs:read jobs:write clients:read clients:write',
        state,
    });

    return `https://get.jobber.com/appcenter/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 *
 * @param {string} code - Authorization code from OAuth callback
 * @returns {Object} { accessToken, refreshToken, expiresIn, accountId }
 */
export async function exchangeJobberCode(code) {
    if (!JOBBER_CLIENT_ID || !JOBBER_CLIENT_SECRET) {
        console.warn('Jobber OAuth credentials not configured');
        return null;
    }

    try {
        const response = await fetch('https://api.getjobber.com/api/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: JOBBER_CLIENT_ID,
                client_secret: JOBBER_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: getRedirectUri(),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Jobber token exchange failed:', error);
            return null;
        }

        const data = await response.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            accountId: data.account_id,
        };
    } catch (error) {
        console.error('Jobber OAuth error:', error.message);
        Sentry.captureException(error, { tags: { module: 'jobber', method: 'exchangeJobberCode' } });
        return null;
    }
}

/**
 * Refresh an expired Jobber access token.
 *
 * @param {string} refreshToken - The stored refresh token
 * @returns {Object} { accessToken, refreshToken, expiresIn }
 */
export async function refreshJobberToken(refreshToken) {
    if (!JOBBER_CLIENT_ID || !JOBBER_CLIENT_SECRET) return null;

    try {
        const response = await fetch('https://api.getjobber.com/api/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: JOBBER_CLIENT_ID,
                client_secret: JOBBER_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) {
            console.error('Jobber token refresh failed:', await response.text());
            return null;
        }

        const data = await response.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in,
        };
    } catch (error) {
        console.error('Jobber token refresh error:', error.message);
        return null;
    }
}

function getRedirectUri() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/integrations/jobber/callback`;
}

// ─── GraphQL Client ──────────────────────────────────────────────────────────

/**
 * Execute a GraphQL query against the Jobber API.
 *
 * @param {string} query - GraphQL query or mutation
 * @param {Object} variables - Query variables
 * @param {string} accessToken - OAuth access token
 * @returns {Object} Query data or null on error
 */
export async function jobberGraphQL(query, variables = {}, accessToken) {
    if (!accessToken) {
        console.warn('No Jobber access token provided');
        return null;
    }

    try {
        const response = await fetch(JOBBER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();

        if (result.errors) {
            console.error('Jobber GraphQL errors:', JSON.stringify(result.errors));
            Sentry.captureMessage('Jobber GraphQL errors', {
                level: 'error',
                tags: { module: 'jobber', method: 'graphql' },
                extra: { errors: result.errors },
            });
            return null;
        }

        return result.data;
    } catch (error) {
        console.error('Jobber GraphQL request failed:', error.message);
        Sentry.captureException(error, { tags: { module: 'jobber', method: 'graphql' } });
        return null;
    }
}

// ─── Client Management ───────────────────────────────────────────────────────

const CREATE_CLIENT_MUTATION = `
    mutation CreateClient($input: CreateClientInput!) {
        clients {
            create(input: $input) {
                client {
                    id
                    name
                    companyName
                    email
                    phone
                }
            }
        }
    }
`;

/**
 * Create a client in Jobber.
 *
 * @param {Object} clientData - { name, email, phone, company? }
 * @param {string} accessToken - OAuth access token
 * @returns {Object|null} Created client or null
 */
export async function createJobberClient(clientData, accessToken) {
    const data = await jobberGraphQL(CREATE_CLIENT_MUTATION, {
        input: {
            firstName: clientData.name?.split(' ')[0] || '',
            lastName: clientData.name?.split(' ').slice(1).join(' ') || '',
            email: clientData.email || undefined,
            phone: clientData.phone || undefined,
            companyName: clientData.company || undefined,
        },
    }, accessToken);

    return data?.clients?.create?.client || null;
}

const GET_CLIENTS_QUERY = `
    query GetClients($first: Int!) {
        clients {
            nodes(first: $first) {
                id
                name
                email
                phone
            }
        }
    }
`;

/**
 * Search for existing clients by name or phone.
 *
 * @param {string} query - Search query (name or phone)
 * @param {string} accessToken - OAuth access token
 * @returns {Array} Matching clients
 */
export async function searchJobberClients(query, accessToken) {
    const data = await jobberGraphQL(GET_CLIENTS_QUERY, { first: 10 }, accessToken);
    const clients = data?.clients?.nodes || [];

    // Client-side filtering (Jobber doesn't support text search)
    const q = query.toLowerCase();
    return clients.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(query)
    );
}

// ─── Job Management ──────────────────────────────────────────────────────────

const CREATE_JOB_MUTATION = `
    mutation CreateJob($input: CreateJobInput!) {
        jobs {
            create(input: $input) {
                job {
                    id
                    title
                    status
                    scheduledStart
                    scheduledEnd
                }
            }
        }
    }
`;

/**
 * Create a Jobber job from a booking.
 *
 * @param {Object} booking - Booking data from our system
 * @param {string} clientId - Jobber client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Object|null} Created job or null
 */
export async function createJobberJob(booking, clientId, accessToken) {
    const title = `${booking.service || 'Detailing'} — ${booking.customer_name || 'Customer'}`;
    const description = [
        `Vehicle: ${booking.vehicle_type || 'Not specified'}`,
        `Service: ${booking.service || 'Not specified'}`,
        `Price: $${booking.service_price || 'TBD'}`,
        `Address: ${booking.address || 'Not provided'}`,
        booking.condition ? `Condition: ${booking.condition}` : '',
    ].filter(Boolean).join('\n');

    const data = await jobberGraphQL(CREATE_JOB_MUTATION, {
        input: {
            clientId,
            title,
            description,
            scheduledStart: booking.booking_date && booking.booking_time
                ? combineDateTime(booking.booking_date, booking.booking_time)
                : undefined,
            instructions: description,
        },
    }, accessToken);

    const job = data?.jobs?.create?.job;
    if (job) {
        console.log(`Created Jobber job ${job.id} for booking`);
    }
    return job || null;
}

const GET_JOBS_QUERY = `
    query GetJobs($first: Int!, $after: String) {
        jobs {
            nodes(first: $first, after: $after) {
                id
                title
                status
                scheduledStart
                scheduledEnd
                client {
                    id
                    name
                }
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`;

/**
 * Fetch recent jobs from Jobber.
 *
 * @param {string} accessToken - OAuth access token
 * @param {number} pageSize - Number of jobs to fetch
 * @returns {Array} Array of job objects
 */
export async function getJobberJobs(accessToken, pageSize = 20) {
    const data = await jobberGraphQL(GET_JOBS_QUERY, { first: pageSize }, accessToken);
    return data?.jobs?.nodes || [];
}

// ─── Webhook Verification ────────────────────────────────────────────────────

/**
 * Verify a Jobber webhook signature.
 *
 * @param {string} rawBody - Raw request body
 * @param {string} signature - X-Jobber-Signature header
 * @returns {boolean} true if valid
 */
export function verifyJobberWebhook(rawBody, signature) {
    if (!JOBBER_WEBHOOK_SECRET) {
        // SECURITY: Fail closed — never accept unverified webhooks in production.
        if (process.env.NODE_ENV === 'production') {
            console.error('CRITICAL: JOBBER_WEBHOOK_SECRET not set — rejecting webhook (fail closed)');
            return false;
        }
        console.warn('JOBBER_WEBHOOK_SECRET not set — allowing webhook in development (INSECURE)');
        return true;
    }

    if (!signature) return false;

    const crypto = require('crypto');
    const expected = 'sha256=' + crypto
        .createHmac('sha256', JOBBER_WEBHOOK_SECRET)
        .update(rawBody, 'utf8')
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    } catch {
        return false;
    }
}

// ─── Jobber Event Parsing ───────────────────────────────────────────────────

/**
 * Parse a Jobber webhook event.
 *
 * @param {Object} body - Webhook body
 * @returns {Object|null} Parsed event
 */
export function parseJobberEvent(body) {
    if (!body) return null;

    const eventType = body.event || body.type || body.action;

    switch (eventType) {
        case 'job.created':
        case 'job.updated':
            return {
                type: 'job_update',
                jobId: body.data?.job?.id || body.job_id,
                status: body.data?.job?.status || body.status,
                action: eventType,
                data: body.data || body,
            };

        case 'invoice.created':
        case 'invoice.paid':
            return {
                type: 'invoice_update',
                invoiceId: body.data?.invoice?.id || body.invoice_id,
                status: body.data?.invoice?.status || body.status,
                action: eventType,
                data: body.data || body,
            };

        case 'client.created':
            return {
                type: 'client_created',
                clientId: body.data?.client?.id || body.client_id,
                data: body.data || body,
            };

        default:
            console.log(`Unhandled Jobber event: ${eventType}`);
            return {
                type: 'unknown',
                rawType: eventType,
                data: body.data || body,
            };
    }
}

// ─── Booking Sync ────────────────────────────────────────────────────────────

/**
 * Sync a confirmed booking to Jobber.
 * Creates a client (if needed) and a job.
 *
 * @param {Object} booking - Booking data
 * @param {string} businessId - Business UUID (for looking up Jobber credentials)
 * @returns {Object} { success, jobId?, clientId?, error? }
 */
export async function syncBookingToJobber(booking, businessId) {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    if (!supabaseAdmin) {
        return { success: false, error: 'No Supabase configured' };
    }

    // Look up Jobber credentials for this business
    const { data: integration } = await supabaseAdmin
        .from('integrations')
        .select('access_token, refresh_token, expires_at')
        .eq('business_id', businessId)
        .eq('provider', 'jobber')
        .single();

    if (!integration?.access_token) {
        return { success: false, error: 'Jobber not connected for this business' };
    }

    // Decrypt tokens (backward compatible — plaintext tokens pass through if ENCRYPTION_KEY not set)
    const decryptedAccessToken = decrypt(integration.access_token);
    const decryptedRefreshToken = decrypt(integration.refresh_token);

    let accessToken = decryptedAccessToken;

    // Check if token is expired and refresh if needed
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
        const refreshToken = decryptedRefreshToken || integration.refresh_token;
        if (refreshToken) {
            const refreshed = await refreshJobberToken(refreshToken);
            if (refreshed) {
                accessToken = refreshed.accessToken;
                // Update stored token (re-encrypted)
                await supabaseAdmin
                    .from('integrations')
                    .update({
                        access_token: encrypt(refreshed.accessToken),
                        refresh_token: encrypt(refreshed.refreshToken),
                        expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
                    })
                    .eq('business_id', businessId)
                    .eq('provider', 'jobber');
            }
        }
    }

    // Find or create client
    let clientId = null;
    const existingClients = await searchJobberClients(booking.phone || booking.customer_name, accessToken);
    if (existingClients.length > 0) {
        clientId = existingClients[0].id;
    } else {
        const newClient = await createJobberClient({
            name: booking.customer_name,
            phone: booking.phone,
        }, accessToken);
        clientId = newClient?.id;
    }

    if (!clientId) {
        return { success: false, error: 'Failed to create/find Jobber client' };
    }

    // Create job
    const job = await createJobberJob(booking, clientId, accessToken);
    if (!job) {
        return { success: false, clientId, error: 'Failed to create Jobber job' };
    }

    return { success: true, jobId: job.id, clientId };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function combineDateTime(date, time) {
    // Parse "2026-08-01" + "10:00 AM" or "2026-08-01" + "14:00:00" → ISO datetime
    try {
        const trimmed = time.trim();
        const is24h = /^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed) && !/AM|PM/i.test(trimmed);
        const timeStr = is24h ? trimmed : trimmed.replace(/\s*(AM|PM)/i, ' $1');
        const dateObj = new Date(`${date} ${timeStr}`);
        if (isNaN(dateObj.getTime())) return undefined;
        return dateObj.toISOString();
    } catch {
        return undefined;
    }
}
