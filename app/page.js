'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import StatsCounter from '../components/StatsCounter';
import ServiceMenu from '../components/ServiceMenu';
import ValueProps from '../components/ValueProps';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import Testimonials from '../components/Testimonials';
import CTASection from '../components/CTASection';
import ChatButton from '../components/ChatButton';
import ChatInterface from '../components/ChatInterface';
import PageLoader from '../components/PageLoader';
import CursorRing from '../components/CursorRing';

export default function Home() {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [initialService, setInitialService] = useState(null);
    const [landingConfig, setLandingConfig] = useState(null);

    useEffect(() => {
        fetch('/api/config')
            .then(r => r.ok ? r.json() : null)
            .then(setLandingConfig)
            .catch(() => {});
    }, []);

    useEffect(() => {
        const handleOpenChat = (e) => {
            if (e.detail && e.detail.service) {
                setInitialService(e.detail.service);
            } else {
                setInitialService(null);
            }
            setIsChatOpen(true);
        };

        window.addEventListener('open-chat', handleOpenChat);
        return () => window.removeEventListener('open-chat', handleOpenChat);
    }, []);

    return (
        <>
            <CursorRing />
            <PageLoader />
            <main className="grain" style={{ backgroundColor: 'var(--obsidian)' }}>
            <Navbar />
            <Hero config={landingConfig?.hero} />
            <StatsCounter config={landingConfig?.stats} />
            <ServiceMenu />
            <ValueProps />
            <section style={{ padding: 'var(--section-padding)', backgroundColor: 'var(--obsidian)' }}>
                <div className="container">
                    <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                        <span style={{ color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '3px', display: 'block', marginBottom: '20px' }}>Results</span>
                        <h2 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', color: 'var(--white)', marginBottom: '20px', letterSpacing: '-1px' }}>See The Difference</h2>
                        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto' }}>Drag the slider to compare before and after our detailing service</p>
                    </div>
                    <BeforeAfterSlider
                        beforeSrc="/images/car-before.jpg"
                        afterSrc="/images/car-after.jpg"
                        beforeAlt="Vehicle before detailing"
                        afterAlt="Vehicle after detailing"
                    />
                </div>
            </section>
            <Testimonials config={landingConfig?.testimonials} />
            <CTASection />

            <ChatButton />

            {isChatOpen && (
                <ChatInterface
                    onClose={() => setIsChatOpen(false)}
                    initialMessage={initialService ? `I'd like to book a ${initialService}` : null}
                />
            )}

            <footer style={{
                padding: '80px 0 40px',
                backgroundColor: 'var(--obsidian)',
                borderTop: '1px solid var(--glass-border)',
                color: 'var(--platinum)'
            }}>
                <div className="container">
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '48px',
                        marginBottom: '60px',
                        textAlign: 'left'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <span style={{
                                    background: 'var(--gold)',
                                    color: 'var(--obsidian)',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    fontFamily: 'var(--font-heading)'
                                }}>{landingConfig?.footer?.brandInitials || 'MC'}</span>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{landingConfig?.footer?.brandName || 'Mr. Cleaner'}</h3>
                            </div>
                            <p style={{ color: 'rgba(255,255,255,0.4)', lineHeight: '1.7', fontSize: '0.9rem', maxWidth: '280px' }}>
                                {landingConfig?.footer?.tagline || "Texas\u2019 premier mobile detailing concierge. Powered by AI, perfected by hand."}
                            </p>
                        </div>
                        <div>
                            <h4 style={{ marginBottom: '20px', color: 'var(--white)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Services</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(landingConfig?.footer?.services || ['Executive Preservation', 'The Master Detail', 'Signature Ceramic']).map((s) => (
                                    <a key={s} href="#services" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', textDecoration: 'none', transition: 'color 0.2s' }}>{s}</a>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 style={{ marginBottom: '20px', color: 'var(--white)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Contact</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>{landingConfig?.footer?.locations || 'Austin \u00b7 Dallas \u00b7 Houston'}</p>
                                <a href={`mailto:${landingConfig?.footer?.email || 'concierge@mrcleaner.com'}`} style={{ color: 'var(--gold)', fontSize: '0.9rem', textDecoration: 'none' }}>{landingConfig?.footer?.email || 'concierge@mrcleaner.com'}</a>
                                <a href={`tel:${landingConfig?.footer?.phone?.replace(/\D/g, '') || '+15074797804'}`} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', textDecoration: 'none' }}>{landingConfig?.footer?.phone || '+1 (507) 479-7804'}</a>
                            </div>
                        </div>
                        <div>
                            <h4 style={{ marginBottom: '20px', color: 'var(--white)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Hours</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(landingConfig?.footer?.hours || [
                                    { label: 'Mon - Sat: 8 AM - 6 PM' },
                                    { label: 'Sunday: Closed' },
                                    { label: 'AI Concierge: 24/7', gold: true },
                                ]).map((h, i) => (
                                    <p key={i} style={{ color: h.gold ? 'var(--gold)' : 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>{h.label}</p>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{
                        paddingTop: '32px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '16px',
                        fontSize: '0.8rem',
                        color: 'rgba(255,255,255,0.2)'
                    }}>
                        <p>{landingConfig?.footer?.copyright || '\u00a9 2026 Mr. Cleaner Mobile Detailing Texas. All rights reserved.'}</p>
                        <p>{landingConfig?.footer?.tagline2 || 'Built with AI \u00b7 Powered by Maya'}</p>
                    </div>
                </div>
            </footer>
            </main>
        </>
    );
}
