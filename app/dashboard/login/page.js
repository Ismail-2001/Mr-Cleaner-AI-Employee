'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import styles from '../Dashboard.module.css';

/**
 * Server-side dashboard login.
 * WHY THIS EXISTS: The old code compared 'cleaner2026' in the browser bundle —
 * anyone could read it from dev tools. This page submits to a server-side API
 * route that validates the password and issues a signed httpOnly session cookie.
 * The password never appears in client-side code.
 */
export default function DashboardLogin() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/dashboard/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                // Session cookie set by server — redirect to dashboard
                window.location.href = '/dashboard';
            } else {
                const data = await res.json();
                setError(data.error || 'Invalid credentials');
            }
        } catch {
            setError('Connection failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.lockScreen}>
            <div className={styles.lockCard}>
                <div className={styles.lockIcon}><Lock size={40} /></div>
                <h2>Intelligence Portal</h2>
                <p>Enter your executive credentials to access the Mr. Cleaner Intelligence Dashboard.</p>
                <form onSubmit={handleLogin}>
                    <input
                        type="password"
                        placeholder="Access Code"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={styles.lockInput}
                        autoFocus
                    />
                    {error && <p className={styles.error}>{error}</p>}
                    <button type="submit" className={styles.lockBtn} disabled={loading}>
                        {loading ? 'Authenticating...' : 'Initialize Access'}
                    </button>
                </form>
            </div>
        </div>
    );
}
