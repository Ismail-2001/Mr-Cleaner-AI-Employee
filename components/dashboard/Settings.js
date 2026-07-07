'use client';

import { useState, useEffect } from 'react';
import styles from './Settings.module.css';
import {
    Building2,
    Smartphone,
    Globe,
    ShieldCheck,
    Database,
    Calendar,
    MessageCircle,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';

export default function Settings() {
    const [status, setStatus] = useState({
        supabase: 'checking',
        google: 'checking',
        openai: 'checking',
        deepseek: 'checking',
        twilio: 'checking'
    });

    useEffect(() => {
        // Mocking a status check for the UI demo
        // In a real app, we'd hit an /api/status endpoint
        const checkStatus = async () => {
            const res = await fetch('/api/bookings');
            const data = await res.json();

            setStatus({
                supabase: 'connected',
                google: data.isCalendarConnected ? 'connected' : 'disconnected',
                openai: 'connected',
                deepseek: 'connected',
                twilio: 'connected'
            });
        };
        checkStatus();
    }, []);

    const StatusBadge = ({ state }) => {
        if (state === 'connected') return <span className={styles.statusConnected}><CheckCircle2 size={14} /> Systems Online</span>;
        if (state === 'disconnected') return <span className={styles.statusError}><AlertCircle size={14} /> Action Required</span>;
        return <span className={styles.statusChecking}>Checking...</span>;
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h3>Internal Configuration</h3>
                    <p>Manage your business infrastructure and AI parameters.</p>
                </div>
                <button className={styles.saveBtn}>Save All Changes</button>
            </header>

            <div className={styles.grid}>
                {/* Section 1: Business Identity */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Building2 size={20} />
                        <h4>Business Identity</h4>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Business Legal Name</label>
                        <input type="text" defaultValue="Mr. Cleaner Mobile Detailing" />
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Base Operations</label>
                            <input type="text" defaultValue="Texas, USA" />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Primary Timezone</label>
                            <select defaultValue="America/Chicago">
                                <option value="America/Chicago">Central Time (CST)</option>
                                <option value="America/New_York">Eastern Time (EST)</option>
                                <option value="America/Los_Angeles">Pacific Time (PST)</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* Section 2: Concierge Channels */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Smartphone size={20} />
                        <h4>Concierge Channels</h4>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Business SMS Line (Twilio)</label>
                        <input type="text" defaultValue="+1 (507) 479-7804" />
                    </div>
                    <div className={styles.formGroup}>
                        <label>WhatsApp Specialist Number</label>
                        <input type="text" defaultValue="+1 (507) 479-7804" />
                    </div>
                    <div className={styles.formGroup}>
                        <label>AI Assistant Personality</label>
                        <select defaultValue="maya">
                            <option value="maya">Maya (Elite Concierge)</option>
                            <option value="bruno">Bruno (Rugged Specialist)</option>
                        </select>
                    </div>
                </section>

                {/* Section 3: Neural Link Status */}
                <section className={`${styles.section} ${styles.fullWidth}`}>
                    <div className={styles.sectionHeader}>
                        <ShieldCheck size={20} />
                        <h4>Neural Link & Provider Integrity</h4>
                    </div>
                    <div className={styles.statusGrid}>
                        <div className={styles.statusItem}>
                            <div className={styles.providerInfo}>
                                <Database size={18} />
                                <div>
                                    <h5>Supabase Cloud</h5>
                                    <p>Primary Data Persistence</p>
                                </div>
                            </div>
                            <StatusBadge state={status.supabase} />
                        </div>
                        <div className={styles.statusItem}>
                            <div className={styles.providerInfo}>
                                <Calendar size={18} />
                                <div>
                                    <h5>Google Calendar API</h5>
                                    <p>Real-time Availability Sync</p>
                                </div>
                            </div>
                            <StatusBadge state={status.google} />
                        </div>
                        <div className={styles.statusItem}>
                            <div className={styles.providerInfo}>
                                <Globe size={18} />
                                <div>
                                    <h5>DeepSeek AI</h5>
                                    <p>Primary Reasoning Engine</p>
                                </div>
                            </div>
                            <StatusBadge state={status.deepseek} />
                        </div>
                        <div className={styles.statusItem}>
                            <div className={styles.providerInfo}>
                                <MessageCircle size={18} />
                                <div>
                                    <h5>Twilio SMS</h5>
                                    <p>Owner Lead Notifications</p>
                                </div>
                            </div>
                            <StatusBadge state={status.twilio} />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
