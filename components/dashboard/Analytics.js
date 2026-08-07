'use client';

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import styles from './Analytics.module.css';
import { TrendingUp, Users, DollarSign, Star, Download, ArrowUp, ArrowDown } from 'lucide-react';

import { useState, useEffect } from 'react';

const COLORS = ['var(--gold)', 'var(--platinum)', '#555', '#333'];

export default function Analytics() {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({ revenue: 0, conversion: 0, inspections: 0, bookings: 0 });
    const [data, setData] = useState({ revenueByDay: [], serviceDistribution: [] });
    const [trend, setTrend] = useState({ revenue: { current: 0, previous: 0, change: 0 }, bookings: { current: 0, previous: 0, change: 0 } });
    const [repeatCustomers, setRepeatCustomers] = useState([]);
    const [totalUniqueCustomers, setTotalUniqueCustomers] = useState(0);
    const [dateRange, setDateRange] = useState('30d');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/dashboard/analytics?range=${dateRange}`);
                if (!res.ok) return;
                const json = await res.json();
                setLogs(json.logs || []);
                setStats(prev => ({ ...prev, ...json.stats }));
                setData({ revenueByDay: json.revenueByDay || [], serviceDistribution: json.serviceDistribution || [] });
                setTrend(json.trend || { revenue: { current: 0, previous: 0, change: 0 }, bookings: { current: 0, previous: 0, change: 0 } });
                setRepeatCustomers(json.repeatCustomers || []);
                setTotalUniqueCustomers(json.totalUniqueCustomers || 0);
            } catch {
                // Analytics unavailable - show empty state
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [dateRange]);

    const handleExportCSV = () => {
        window.open('/api/dashboard/analytics/export', '_blank');
    };

    return (
        <div className={styles.container}>
            {/* Date Range Selector */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px',
            }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)' }}>Analytics Overview</h2>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                        { label: '7D', value: '7d' },
                        { label: '30D', value: '30d' },
                        { label: '90D', value: '90d' },
                        { label: 'All', value: 'all' },
                    ].map(({ label, value }) => (
                        <button
                            key={value}
                            onClick={() => setDateRange(value)}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                                background: dateRange === value ? 'rgba(212,175,55,0.2)' : 'transparent',
                                color: dateRange === value ? 'var(--gold)' : 'rgba(255,255,255,0.4)',
                                fontSize: '0.8rem', fontWeight: dateRange === value ? '600' : '400',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >{label}</button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.gold}`}>
                        <DollarSign size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Total Revenue</span>
                        <h3>${stats.revenue.toLocaleString()}</h3>
                        <p className={styles.subtext}>
                            {trend.revenue.change !== 0 && (
                                <span style={{ color: trend.revenue.change > 0 ? '#4ade80' : '#f87171' }}>
                                    {trend.revenue.change > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                    {Math.abs(trend.revenue.change)}% vs last week
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.blue}`}>
                        <TrendingUp size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Total Bookings</span>
                        <h3>{stats.bookings}</h3>
                        <p className={styles.subtext}>
                            {trend.bookings.change !== 0 && (
                                <span style={{ color: trend.bookings.change > 0 ? '#4ade80' : '#f87171' }}>
                                    {trend.bookings.change > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                    {Math.abs(trend.bookings.change)}% vs last week
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.green}`}>
                        <Users size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Unique Customers</span>
                        <h3>{totalUniqueCustomers}</h3>
                        <p className={styles.subtext}>{repeatCustomers.length} repeat customers</p>
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={`${styles.kpiIcon} ${styles.platinum}`}>
                        <Star size={24} />
                    </div>
                    <div className={styles.kpiData}>
                        <span>Tool Executions</span>
                        <h3>{stats.inspections}</h3>
                        <p className={styles.subtext}>AI agent tool calls</p>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className={styles.chartGrid}>
                <div className={styles.chartCard}>
                    <h3>Revenue Trend</h3>
                    <div className={styles.chartHolder}>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={data.revenueByDay}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                <XAxis dataKey="date" stroke="#666" tickFormatter={(v) => v.slice(5)} />
                                <YAxis stroke="#666" />
                                <Tooltip contentStyle={{ backgroundColor: '#1C1C1E', border: '1px solid #333' }} />
                                <Line type="monotone" dataKey="revenue" stroke="var(--gold)" strokeWidth={3} dot={{ fill: 'var(--gold)' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={styles.chartCard}>
                    <h3>Service Mix</h3>
                    <div className={styles.chartHolder}>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={data.serviceDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {data.serviceDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Repeat Customers + CSV Export */}
            <div className={styles.chartGrid}>
                <div className={styles.chartCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Repeat Customers</h3>
                        <button onClick={handleExportCSV} style={{
                            background: 'var(--gold)',
                            color: '#0a0a0a',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}>
                            <Download size={14} /> Export CSV
                        </button>
                    </div>
                    <div className={styles.logList}>
                        {repeatCustomers.length > 0 ? repeatCustomers.map((c, i) => (
                            <div key={i} className={styles.logItem}>
                                <span className={styles.timestamp}>****{c.phone}</span>
                                <span className={styles.event}>{c.count} bookings</span>
                                <span className={styles.outcome}>Returning</span>
                            </div>
                        )) : (
                            <div className={styles.logItem}>
                                <span className={styles.event}>No repeat customers yet</span>
                                <span className={styles.outcome}>—</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.chartCard}>
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
        </div>
    );
}
