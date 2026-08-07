'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function BookingSuccessContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('session_id');

    return (
        <main style={{
            minHeight: '100vh',
            backgroundColor: 'var(--obsidian)',
            color: 'var(--platinum)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            fontFamily: 'var(--font-body, sans-serif)',
        }}>
            <div style={{ maxWidth: '500px', textAlign: 'center' }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'var(--gold)',
                    color: 'var(--obsidian)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.5rem',
                    fontWeight: '800',
                    margin: '0 auto 32px',
                    fontFamily: 'var(--font-heading, sans-serif)',
                }}>MC</div>

                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    marginBottom: '16px',
                    color: 'var(--white)',
                    fontFamily: 'var(--font-heading, sans-serif)',
                }}>Payment Confirmed!</h1>

                <p style={{
                    fontSize: '1.1rem',
                    lineHeight: '1.7',
                    color: 'rgba(255,255,255,0.6)',
                    marginBottom: '32px',
                }}>
                    Thank you for your deposit. Your appointment is secured and our team will
                    arrive at the scheduled time.
                </p>

                {sessionId && (
                    <p style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.2)',
                        marginBottom: '32px',
                    }}>
                        Reference: {sessionId}
                    </p>
                )}

                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '32px',
                    textAlign: 'left',
                }}>
                    <p style={{
                        fontSize: '0.9rem',
                        color: 'rgba(255,255,255,0.5)',
                        marginBottom: '12px',
                    }}>What happens next?</p>
                    <ul style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                    }}>
                        {[
                            'You\'ll receive a confirmation text shortly',
                            'Our team will arrive at your selected time',
                            'Full payment is collected on-site after service',
                        ].map((item) => (
                            <li key={item} style={{
                                fontSize: '0.9rem',
                                color: 'rgba(255,255,255,0.7)',
                                paddingLeft: '20px',
                                position: 'relative',
                            }}>
                                <span style={{
                                    position: 'absolute',
                                    left: 0,
                                    color: 'var(--gold)',
                                }}>&bull;</span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                <Link href="/" style={{
                    display: 'inline-block',
                    padding: '14px 40px',
                    borderRadius: '12px',
                    background: 'var(--gold)',
                    color: 'var(--obsidian)',
                    fontWeight: '700',
                    textDecoration: 'none',
                    fontSize: '1rem',
                    transition: 'opacity 0.2s',
                }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.85'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                    Back to Home
                </Link>
            </div>
        </main>
    );
}

export default function BookingSuccess() {
    return (
        <Suspense fallback={null}>
            <BookingSuccessContent />
        </Suspense>
    );
}
