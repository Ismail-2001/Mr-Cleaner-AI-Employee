'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STEPS = [
    {
        id: 'domain',
        title: 'Your Domain',
        done: () => typeof window !== 'undefined' && window.location.hostname !== 'localhost',
        skip: true,
    },
    {
        id: 'gemini',
        title: 'AI Engine — Gemini API Key',
        env: 'GEMINI_API_KEY',
        url: 'https://aistudio.google.com/apikey',
        guide: 'Click "Create API Key" in Google AI Studio, copy the key, and add it to your .env.local as GEMINI_API_KEY.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.ai === 'connected';
        },
    },
    {
        id: 'supabase',
        title: 'Database — Supabase Project',
        env: 'NEXT_PUBLIC_SUPABASE_URL',
        url: 'https://supabase.com',
        guide: 'Create a free Supabase project, copy your URL and anon key from Settings > API, then paste them into your env file.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.supabase === 'connected';
        },
    },
    {
        id: 'lemonsqueezy',
        title: 'Payments — LemonSqueezy (Recommended)',
        env: 'LEMONSQUEEZY_API_KEY + STORE_ID + VARIANT_ID',
        url: 'https://app.lemonsqueezy.com/settings/api',
        guide: 'Create a free LemonSqueezy account (works in 190+ countries, including Pakistan). Go to Settings > API and generate a key. Create a "Deposit" product with one variant, copy the Store ID and Variant ID. Set webhook to your-domain.com/api/lemonsqueezy/webhook with order_created and order_refunded events.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.lemonsqueezy === 'configured';
        },
    },
    {
        id: 'stripe',
        title: 'Payments — Stripe (Fallback)',
        env: 'STRIPE_SECRET_KEY',
        url: 'https://dashboard.stripe.com/apikeys',
        guide: 'Optional. Only needed if you want Stripe as a backup. From Stripe Dashboard > Developers > API Keys, copy the Secret Key. Set webhook to your-domain.com/api/stripe/webhook with checkout.session.completed event.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.stripe === 'configured';
        },
    },
    {
        id: 'calendar',
        title: 'Google Calendar Sync',
        env: 'GOOGLE_CALENDAR_CLIENT_ID',
        url: 'https://console.cloud.google.com/apis/credentials',
        guide: 'Create OAuth 2.0 credentials in Google Cloud Console, add your domain to authorized redirect URIs (/api/auth/callback/google), and copy Client ID and Secret.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.calendar === 'configured';
        },
    },
    {
        id: 'twilio',
        title: 'SMS Alerts — Twilio Number',
        env: 'TWILIO_ACCOUNT_SID',
        url: 'https://console.twilio.com',
        guide: 'Buy a Twilio phone number ($1/month). Copy Account SID, Auth Token, and the phone number into your env file.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.twilio === 'configured';
        },
    },
    {
        id: 'email',
        title: 'Email Confirmations — Resend',
        env: 'RESEND_API_KEY',
        url: 'https://resend.com',
        guide: 'Create a free Resend account, verify a domain (or use the test domain), and copy the API key into your env file.',
        check: async () => {
            const res = await fetch('/api/health');
            const data = await res.json();
            return data.resend === 'configured';
        },
    },
];

function StepCard({ step, index, status, onCheck }) {
    const statusColors = {
        pending: { border: '1px solid rgba(255,255,255,0.1)', icon: '○', text: 'rgba(255,255,255,0.3)' },
        checking: { border: '1px solid #c8a45c', icon: '◐', text: '#c8a45c' },
        done: { border: '1px solid #22c55e', icon: '●', text: '#22c55e' },
        failed: { border: '1px solid #ef4444', icon: '○', text: '#ef4444' },
    };

    const s = statusColors[status] || statusColors.pending;

    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: s.border,
            borderRadius: '16px',
            padding: '24px',
            transition: 'border-color 0.3s',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <span style={{ color: s.text, fontSize: '1.2rem', fontFamily: 'monospace', marginTop: '2px' }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                    <h3 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.1rem' }}>
                        {index + 1}. {step.title}
                    </h3>
                    {step.env && (
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontFamily: 'monospace', margin: '0 0 12px' }}>
                            {step.env}
                        </p>
                    )}
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 16px' }}>
                        {step.guide}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {step.url && (
                            <a href={step.url} target="_blank" rel="noopener noreferrer" style={{
                                padding: '6px 16px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.06)',
                                color: 'rgba(255,255,255,0.6)',
                                fontSize: '0.8rem',
                                textDecoration: 'none',
                            }}>
                                Open {step.id === 'gemini' ? 'Google AI Studio' : step.id === 'supabase' ? 'Supabase' : step.id === 'lemonsqueezy' ? 'LemonSqueezy Dashboard' : step.id === 'stripe' ? 'Stripe Dashboard' : step.id === 'calendar' ? 'Google Cloud Console' : step.id === 'twilio' ? 'Twilio Console' : step.id === 'email' ? 'Resend' : 'Site'} &rarr;
                            </a>
                        )}
                        <button onClick={() => onCheck(step.id)} disabled={status === 'checking'} style={{
                            padding: '6px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: status === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(200,164,92,0.15)',
                            color: status === 'done' ? '#22c55e' : '#c8a45c',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                        }}>
                            {status === 'done' ? 'Verified' : status === 'checking' ? 'Checking...' : 'Verify'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SetupPage() {
    const [statuses, setStatuses] = useState({});
    const [health, setHealth] = useState(null);

    useEffect(() => {
        fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
    }, []);

    const handleCheck = async (stepId) => {
        setStatuses(prev => ({ ...prev, [stepId]: 'checking' }));

        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            setHealth(data);

            let passed = false;
            switch (stepId) {
                case 'gemini': passed = data.ai === 'connected'; break;
                case 'supabase': passed = data.supabase === 'connected'; break;
                case 'lemonsqueezy': passed = data.lemonsqueezy === 'configured'; break;
                case 'stripe': passed = data.stripe === 'configured'; break;
                case 'calendar': passed = data.calendar === 'configured'; break;
                case 'twilio': passed = data.twilio === 'configured'; break;
                case 'email': passed = data.resend === 'configured'; break;
                default: passed = true;
            }

            setTimeout(() => {
                setStatuses(prev => ({ ...prev, [stepId]: passed ? 'done' : 'failed' }));
            }, 500);
        } catch {
            setStatuses(prev => ({ ...prev, [stepId]: 'failed' }));
        }
    };

    const doneCount = Object.values(statuses).filter(s => s === 'done').length;
    const totalSteps = STEPS.length;

    return (
        <main style={{
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            color: '#ccc',
            fontFamily: 'sans-serif',
        }}>
            <div style={{ maxWidth: '720px', margin: '0 auto', padding: '60px 20px' }}>
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: '#c8a45c',
                        color: '#0a0a0a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.8rem',
                        fontWeight: '800',
                        margin: '0 auto 24px',
                        fontFamily: 'serif',
                    }}>MC</div>

                    <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>
                        Set Up Your AI Concierge
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.05rem', lineHeight: '1.7', maxWidth: '500px', margin: '0 auto' }}>
                        Connect each service below. Maya won&apos;t go live until everything is verified.
                    </p>
                </div>

                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '32px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                        Progress: <strong style={{ color: '#fff' }}>{doneCount}</strong> / {totalSteps} connected
                    </span>
                    {doneCount === totalSteps && (
                        <span style={{
                            background: 'rgba(34,197,94,0.15)',
                            color: '#22c55e',
                            padding: '6px 16px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                        }}>
                            All systems ready &mdash; Maya is live
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {STEPS.map((step, i) => (
                        <StepCard
                            key={step.id}
                            step={step}
                            index={i}
                            status={statuses[step.id] || 'pending'}
                            onCheck={handleCheck}
                        />
                    ))}
                </div>

                <div style={{
                    marginTop: '48px',
                    padding: '24px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    textAlign: 'center',
                }}>
                    <h3 style={{ color: '#fff', marginBottom: '8px' }}>Need Help?</h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Each service has a free tier. You can run Maya with just Gemini + Supabase.
                    </p>
                    <a href="mailto:concierge@mrcleaner.com" style={{
                        color: '#c8a45c',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                    }}>
                        concierge@mrcleaner.com &rarr;
                    </a>
                </div>

                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                    <Link href="/" style={{
                        color: 'rgba(255,255,255,0.3)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                    }}>
                        &larr; Back to home
                    </Link>
                </div>
            </div>
        </main>
    );
}
