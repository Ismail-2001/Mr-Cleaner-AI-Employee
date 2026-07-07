'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import VisionShowcase from '../components/VisionShowcase';
import ServiceMenu from '../components/ServiceMenu';
import ValueProps from '../components/ValueProps';
import ChatButton from '../components/ChatButton';
import ChatInterface from '../components/ChatInterface';

export default function Home() {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [initialService, setInitialService] = useState(null);

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
        <main style={{ backgroundColor: 'var(--obsidian)' }}>
            <Navbar />
            <Hero />

            <section id="experience">
                <VisionShowcase />
            </section>

            <ServiceMenu />

            <ValueProps />

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
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '60px',
                        marginBottom: '60px',
                        textAlign: 'left'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <span style={{ background: 'var(--gold)', color: 'var(--obsidian)', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>MC</span>
                                <h3 style={{ margin: 0 }}>Mr. Cleaner</h3>
                            </div>
                            <p style={{ color: '#666', lineHeight: '1.6', fontSize: '0.9rem' }}>
                                Texas' premier mobile detailing concierge. Powered by AI, perfected by hand.
                            </p>
                        </div>
                        <div>
                            <h4 style={{ marginBottom: '20px', color: 'var(--white)' }}>Contact</h4>
                            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '10px' }}>Austin • Dallas • Houston</p>
                            <p style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>concierge@mrcleaner.com</p>
                        </div>
                        <div>
                            <h4 style={{ marginBottom: '20px', color: 'var(--white)' }}>Technology</h4>
                            <p style={{ color: '#666', fontSize: '0.9rem' }}>Maya Vision Support Active</p>
                            <p style={{ color: '#666', fontSize: '0.9rem' }}>Real-time Calendar Sync</p>
                        </div>
                    </div>

                    <div style={{
                        paddingTop: '40px',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                        color: '#444'
                    }}>
                        <p>© 2026 Mr. Cleaner Mobile Detailing Texas.</p>
                        <p>Designed by Advanced Agentic Systems Engineers</p>
                    </div>
                </div>
            </footer>
        </main>
    );
}
