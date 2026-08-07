'use client';

import Link from 'next/link';

export default function BookingCancel() {
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
                    background: 'rgba(255,255,255,0.08)',
                    color: 'var(--platinum)',
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
                }}>Payment Cancelled</h1>

                <p style={{
                    fontSize: '1.1rem',
                    lineHeight: '1.7',
                    color: 'rgba(255,255,255,0.6)',
                    marginBottom: '32px',
                }}>
                    No charges were made. Your booking is still pending — you can complete the
                    deposit whenever you&apos;re ready.
                </p>

                <div style={{
                    display: 'flex',
                    gap: '16px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                }}>
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
            </div>
        </main>
    );
}
