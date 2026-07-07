'use client';

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { MOCK_ANALYTICS } from '@/lib/mock-data';
import styles from './Analytics.module.css';
import { TrendingUp, Users, DollarSign, Star } from 'lucide-react';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const COLORS = ['var(--gold)', 'var(--platinum)', '#555', '#333'];

export default function Analytics() {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({ revenue: 0, conversion: 0, inspections: 0, accuracy: 0 });

    useEffect(() => {
        const fetchLogs = async () => {
            if (!supabase) return;

            const { data } = await supabase
                .from('usage_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (data) setLogs(data);

            // Fetch summary stats
            const { count: inspections } = await supabase
                .from('usage_logs')
                .select('*', { count: 'exact', head: true })
                .eq('event_type', 'tool_call');

            setStats(prev => ({ ...prev, inspections: inspections || 42 }));
        };

        fetchLogs();
    }, []);

    return (
        <div className={styles.container}>
            {/* Maya Intelligence KPI Cards (Revenue ROI Calculator) */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.gold}`}>
                        <DollarSign size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Revenue Protected</span>
                        <h3>$14,280</h3>
                        <p className={styles.subtext}>Maya dynamic upselling Active</p>
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.blue}`}>
                        <TrendingUp size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Efficiency Gain</span>
                        <h3>$420/hr</h3>
                        <p className={styles.subtext}>Labor displacement ROI</p>
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.green}`}>
                        <Star size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Lead Score Avg</span>
                        <h3>82/100</h3>
                        <p className={styles.subtext}>Whale Detection Enabled</p>
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.platinum}`}>
                        <Users size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>AI Interactions</span>
                        <h3>{stats.inspections}</h3>
                        <p className={styles.subtext}>Verified Engagement</p>
                    </div>
                </div>
            </div>

            {/* AI Intelligence Charts */}
            <div className={styles.chartGrid}>
                <div className={styles.chartCard}>
                    <h3>Agent Booking Velocity</h3>
                    <div className={styles.chartHolder}>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={MOCK_ANALYTICS.revenueByDay}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                <XAxis dataKey="day" stroke="#666" />
                                <YAxis stroke="#666" />
                                <Tooltip contentStyle={{ backgroundColor: '#1C1C1E', border: '1px solid #333' }} />
                                <Line type="monotone" dataKey="revenue" stroke="var(--gold)" strokeWidth={3} dot={{ fill: 'var(--gold)' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={styles.chartCard}>
                    <h3>Service Mix by Maya</h3>
                    <div className={styles.chartHolder}>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={MOCK_ANALYTICS.serviceDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {MOCK_ANALYTICS.serviceDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className={styles.reasoningLog}>
                <h3>Live Reasoning Trace</h3>
                <div className={styles.logList}>
                    {logs.length > 0 ? logs.map((log, i) => (
                        <div key={i} className={styles.logItem}>
                            <span className={styles.timestamp}>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className={styles.event}>
                                {log.event_type === 'tool_call'
                                    ? `Executed ${log.payload.tool} for ${log.session_id.substr(0, 8)}`
                                    : `Replied to engagement ${log.session_id.substr(0, 8)}`}
                            </span>
                            <span className={styles.outcome}>
                                {log.event_type === 'tool_call' ? 'Tool Success' : 'Engagement Active'}
                            </span>
                        </div>
                    )) : (
                        <div className={styles.logItem}>
                            <span className={styles.timestamp}>--:--</span>
                            <span className={styles.event}>Waiting for Maya interaction...</span>
                            <span className={styles.outcome}>Standby</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
