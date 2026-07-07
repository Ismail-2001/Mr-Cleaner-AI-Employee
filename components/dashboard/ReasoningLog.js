'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './ReasoningLog.module.css';
import { Brain, Cpu, Terminal, Zap, CheckCircle, AlertCircle } from 'lucide-react';

export default function ReasoningLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            if (!supabase) return;

            const { data, error } = await supabase
                .from('usage_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (data) {
                setLogs(data);
                setLoading(false);
            }
        };

        fetchLogs();

        // Real-time subscription for elite live feel
        const channel = supabase
            .channel('usage_logs_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'usage_logs' }, (payload) => {
                setLogs(prev => [payload.new, ...prev].slice(0, 20));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const formatTimestamp = (ts) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.title}>
                    <Brain className={styles.brainIcon} size={24} />
                    <div>
                        <h3>Live Intelligence Feed</h3>
                        <p>Real-time neural activity & tool orchestration</p>
                    </div>
                </div>
                <div className={styles.liveIndicator}>
                    <div className={styles.pulse}></div>
                    LIVE
                </div>
            </div>

            <div className={styles.logList}>
                {loading ? (
                    <div className={styles.loading}>
                        <Cpu className={styles.spin} />
                        Initializing Intelligence Portal...
                    </div>
                ) : logs.length === 0 ? (
                    <div className={styles.empty}>
                        Waiting for Maya neural activity...
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div key={log.id || i} className={styles.logItem}>
                            <div className={styles.logHeader}>
                                <div className={styles.logMeta}>
                                    <span className={styles.time}>{formatTimestamp(log.created_at)}</span>
                                    <span className={styles.tag}>
                                        {log.event_type === 'tool_call' ? (
                                            <><Cpu size={12} /> ACTION</>
                                        ) : (
                                            <><Zap size={12} /> THINKING</>
                                        )}
                                    </span>
                                </div>
                                <span className={styles.sessionId}>ID: {log.session_id?.substring(5, 13)}</span>
                            </div>

                            <div className={styles.logBody}>
                                {log.event_type === 'tool_call' ? (
                                    <div className={styles.toolExecution}>
                                        <div className={styles.toolName}>
                                            <Terminal size={14} />
                                            Executed <code>{log.payload?.tool}</code>
                                        </div>
                                        <div className={styles.args}>
                                            {JSON.stringify(log.payload?.args)}
                                        </div>
                                        <div className={styles.result}>
                                            <CheckCircle size={14} className={styles.success} />
                                            Result: {log.payload?.result?.substring(0, 50)}...
                                        </div>
                                    </div>
                                ) : (
                                    <p className={styles.content}>
                                        {log.payload?.content || "Processing input..."}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
