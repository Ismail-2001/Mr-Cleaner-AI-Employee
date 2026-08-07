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
    AlertCircle,
    Clock
} from 'lucide-react';

const DEFAULT_BUSINESS_HOURS = {
    mon: { open: '08:00', close: '18:00', enabled: true },
    tue: { open: '08:00', close: '18:00', enabled: true },
    wed: { open: '08:00', close: '18:00', enabled: true },
    thu: { open: '08:00', close: '18:00', enabled: true },
    fri: { open: '08:00', close: '18:00', enabled: true },
    sat: { open: '09:00', close: '14:00', enabled: true },
    sun: { open: '00:00', close: '00:00', enabled: false },
};

const DAY_LABELS = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
};

export default function Settings() {
    const [status, setStatus] = useState({
        supabase: 'checking',
        google: 'checking',
        gemini: 'checking',
    });
    const [saveMessage, setSaveMessage] = useState('');
    const [settings, setSettings] = useState({
        business_name: 'Mr. Cleaner Mobile Detailing',
        location: 'Texas, USA',
        timezone: 'America/Chicago',
        twilio_phone: '+1 (507) 479-7804',
        whatsapp_number: '+1 (507) 479-7804',
        ai_personality: 'maya',
        business_hours: DEFAULT_BUSINESS_HOURS,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                const [healthRes, settingsRes] = await Promise.all([
                    fetch('/api/health'),
                    fetch('/api/dashboard/settings'),
                ]);
                const health = await healthRes.json();
                setStatus({
                    supabase: health.checks?.supabase === 'healthy' ? 'connected' : 'disconnected',
                    google: health.checks?.google_calendar === 'configured' ? 'connected' : 'disconnected',
                    gemini: health.checks?.gemini === 'configured' ? 'connected' : 'disconnected',
                });
                const settingsData = await settingsRes.json();
                if (settingsData.settings) {
                    setSettings(prev => ({ ...prev, ...settingsData.settings }));
                }
            } catch {
                setStatus({ supabase: 'disconnected', google: 'disconnected', gemini: 'disconnected' });
            }
        };
        init();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveMessage('');
        try {
            const res = await fetch('/api/dashboard/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings }),
            });
            if (res.ok) {
                setSaveMessage('Settings saved successfully!');
            } else {
                setSaveMessage('Failed to save settings.');
            }
        } catch {
            setSaveMessage('Connection failed.');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    const update = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const updateBusinessHours = (day, field, value) => {
        setSettings(prev => ({
            ...prev,
            business_hours: {
                ...prev.business_hours,
                [day]: {
                    ...(prev.business_hours?.[day] || DEFAULT_BUSINESS_HOURS[day]),
                    [field]: value,
                },
            },
        }));
    };

    const formatHours = (open, close) => {
        const to12h = (t) => {
            const [h, m] = t.split(':').map(Number);
            const period = h >= 12 ? 'PM' : 'AM';
            const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
        };
        return `${to12h(open)} – ${to12h(close)}`;
    };

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {saveMessage && <span style={{ color: '#30D158', fontSize: '14px' }}>{saveMessage}</span>}
                    <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save All Changes'}</button>
                </div>
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
                        <input type="text" value={settings.business_name} onChange={e => update('business_name', e.target.value)} />
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Base Operations</label>
                            <input type="text" value={settings.location} onChange={e => update('location', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Primary Timezone</label>
                            <select value={settings.timezone} onChange={e => update('timezone', e.target.value)}>
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
                        <input type="text" value={settings.twilio_phone} onChange={e => update('twilio_phone', e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>WhatsApp Specialist Number</label>
                        <input type="text" value={settings.whatsapp_number} onChange={e => update('whatsapp_number', e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>AI Assistant Personality</label>
                        <select value={settings.ai_personality} onChange={e => update('ai_personality', e.target.value)}>
                            <option value="maya">Maya (Elite Concierge)</option>
                            <option value="bruno">Bruno (Rugged Specialist)</option>
                        </select>
                    </div>
                </section>

                {/* Section 3: Business Hours */}
                <section className={`${styles.section} ${styles.fullWidth}`}>
                    <div className={styles.sectionHeader}>
                        <Clock size={20} />
                        <h4>Business Hours</h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(DAY_LABELS).map(([day, label]) => {
                            const hours = settings.business_hours?.[day] || DEFAULT_BUSINESS_HOURS[day];
                            return (
                                <div key={day} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '100px 60px 1fr 60px 1fr 80px',
                                    gap: '8px',
                                    alignItems: 'center',
                                    padding: '8px 12px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500 }}>{label}</span>
                                    <input
                                        type="checkbox"
                                        checked={hours.enabled}
                                        onChange={e => updateBusinessHours(day, 'enabled', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    {hours.enabled ? (
                                        <>
                                            <input
                                                type="time"
                                                value={hours.open}
                                                onChange={e => updateBusinessHours(day, 'open', e.target.value)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '6px',
                                                    padding: '6px 8px',
                                                    color: '#fff',
                                                    fontSize: '0.85rem',
                                                }}
                                            />
                                            <span style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>to</span>
                                            <input
                                                type="time"
                                                value={hours.close}
                                                onChange={e => updateBusinessHours(day, 'close', e.target.value)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '6px',
                                                    padding: '6px 8px',
                                                    color: '#fff',
                                                    fontSize: '0.85rem',
                                                }}
                                            />
                                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
                                                {formatHours(hours.open, hours.close)}
                                            </span>
                                        </>
                                    ) : (
                                        <span style={{ gridColumn: '3 / 6', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>Closed</span>
                                    )}
                                </div>
                            );
                        })}
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
                                    <h5>Gemini AI</h5>
                                    <p>Primary Reasoning Engine</p>
                                </div>
                            </div>
                            <StatusBadge state={status.gemini} />
                        </div>
                        <div className={styles.statusItem}>
                            <div className={styles.providerInfo}>
                                <MessageCircle size={18} />
                                <div>
                                    <h5>Twilio SMS</h5>
                                    <p>Owner Lead Notifications</p>
                                </div>
                            </div>
                            <span className={styles.statusConnected}><CheckCircle2 size={14} /> Available</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
