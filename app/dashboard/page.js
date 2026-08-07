'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import BookingsTable from '@/components/dashboard/BookingsTable';
import Analytics from '@/components/dashboard/Analytics';
import CalendarGrid from '@/components/dashboard/CalendarGrid';
import StatCards from '@/components/dashboard/StatCards';
import ReasoningLog from '@/components/dashboard/ReasoningLog';
import Settings from '@/components/dashboard/Settings';
import ErrorBoundary from '@/components/ErrorBoundary';
import styles from './Dashboard.module.css';

/**
 * Dashboard page — server-side auth is enforced by middleware.js.
 * WHY NO CLIENT-SIDE PASSWORD CHECK: The old code compared 'cleaner2026'
 * in the browser bundle, which was trivially bypassable via dev tools or
 * direct API calls. Now, unauthenticated requests are rejected at the
 * middleware layer before this page ever renders.
 */
export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('bookings');
    const [bookings, setBookings] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [authError, setAuthError] = useState(false);
    const [status, setStatus] = useState({ supabase: 'checking', google: 'checking' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/bookings');
                if (res.status === 401) {
                    setAuthError(true);
                    window.location.href = '/dashboard/login';
                    return;
                }
                const data = await res.json();

                if (data.bookings) {
                    setBookings(data.bookings);
                }
            } catch (e) {
                console.error("Data fetch failed:", e);
            }
        };

        const fetchAnalytics = async () => {
            try {
                const res = await fetch('/api/dashboard/analytics');
                if (res.ok) {
                    const data = await res.json();
                    setAnalytics(data);
                }
            } catch {
                // Analytics unavailable — non-critical
            }
        };

        const checkStatus = async () => {
            try {
                const res = await fetch('/api/health');
                const health = await res.json();
                setStatus({
                    supabase: health.checks?.supabase === 'healthy' ? 'connected' : 'disconnected',
                    google: health.checks?.google_calendar === 'configured' ? 'connected' : 'disconnected',
                });
            } catch {
                setStatus({ supabase: 'disconnected', google: 'disconnected' });
            }
        };

        Promise.all([fetchData(), fetchAnalytics(), checkStatus()]).finally(() => setLoading(false));
    }, []);

    if (authError) {
        return null;
    }

    return (
        <div className={styles.wrapper}>
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

            <main className={styles.content}>
                <header className={styles.header}>
                    <div>
                        <h1>Owner Dashboard</h1>
                        <p>Welcome back, Mr. Cleaner</p>
                    </div>
                    <div className={styles.status}>
                        <div className={styles.dot}></div>
                        Maya AI Assistant Active
                    </div>
                </header>

                <ErrorBoundary>
                    <div className={styles.dashboardBody}>
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Stat cards skeleton */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} style={{
                                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: '12px', padding: '20px',
                                        }}>
                                            <div style={{ width: '40%', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '12px' }} />
                                            <div style={{ width: '60%', height: '24px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '8px' }} />
                                            <div style={{ width: '50%', height: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
                                        </div>
                                    ))}
                                </div>
                                {/* Table skeleton */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '12px', padding: '24px',
                                }}>
                                    <div style={{ width: '200px', height: '20px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '20px' }} />
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} style={{
                                            display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1.5fr 1fr 1fr',
                                            gap: '16px', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        }}>
                                            {[1, 2, 3, 4, 5, 6].map(j => (
                                                <div key={j} style={{ height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <>
                                {activeTab === 'bookings' && (
                                    <>
                                        <StatCards bookings={bookings} analytics={analytics} />
                                        <div className={styles.container}>
                                            <BookingsTable bookings={bookings} />
                                        </div>
                                    </>
                                )}
                                {activeTab === 'analytics' && (
                                    <div className={styles.container}>
                                        <Analytics />
                                    </div>
                                )}
                                {activeTab === 'intelligence' && (
                                    <div className={styles.container}>
                                        <ReasoningLog />
                                    </div>
                                )}
                                {activeTab === 'settings' && (
                                    <div className={styles.container}>
                                        <Settings />
                                    </div>
                                )}
                                {activeTab === 'calendar' && (
                                    <div className={styles.container}>
                                        {status.google === 'connected' ? (
                                            <CalendarGrid />
                                        ) : (
                                            <div className={styles.placeholder}>
                                                <h3>Calendar Sync</h3>
                                                <p>Connect your business calendar to enable Maya to check your availability in real-time.</p>
                                                <a
                                                    href="/api/auth/google"
                                                    className={styles.connectBtn}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Connect Google Calendar
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </ErrorBoundary>
            </main>
        </div>
    );
}
