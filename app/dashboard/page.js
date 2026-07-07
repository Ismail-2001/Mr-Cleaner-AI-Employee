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
    const [isConnected, setIsConnected] = useState(false);
    const [bookings, setBookings] = useState([]);
    const [authError, setAuthError] = useState(false);

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

                // Note: isCalendarConnected is no longer exposed via API
                // for security reasons. Calendar status can be determined
                // from the Settings page.
            } catch (e) {
                console.error("Data fetch failed:", e);
            }
        };
        fetchData();
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
                        {activeTab === 'bookings' && (
                            <>
                                <StatCards bookings={bookings} />
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
                                {isConnected ? (
                                    <CalendarGrid />
                                ) : (
                                    <div className={styles.placeholder}>
                                        <h3>Calendar Sync</h3>
                                        <p>Connect your business calendar to enable Maya to check your availability in real-time.</p>
                                        <a
                                            href="/api/auth/google"
                                            className={styles.connectBtn}
                                            target="_blank"
                                        >
                                            Connect Google Calendar
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ErrorBoundary>
            </main>
        </div>
    );
}
