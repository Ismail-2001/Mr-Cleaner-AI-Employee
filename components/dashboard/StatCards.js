import styles from './StatCards.module.css';
import { TrendingUp, Users, DollarSign, Target } from 'lucide-react';

export default function StatCards({ bookings = [] }) {
    const totalRevenue = bookings.reduce((sum, b) => sum + (parseFloat(b.service_price || b.price || 0)), 0);
    const totalBookings = bookings.length;
    const aiInteractions = 42; // Fallback or mock
    const conversionRate = totalBookings > 0 ? ((totalBookings / aiInteractions) * 100).toFixed(1) : 0;

    const stats = [
        {
            label: "Expected Revenue",
            value: `$${totalRevenue.toLocaleString()}`,
            icon: <DollarSign size={20} />,
            color: "#30D158",
            desc: "+12.5% from last month"
        },
        {
            label: "Elite Bookings",
            value: totalBookings,
            icon: <Users size={20} />,
            color: "var(--gold)",
            desc: "Active reservations"
        },
        {
            label: "Conversion Rate",
            value: `${conversionRate}%`,
            icon: <Target size={20} />,
            color: "#0A84FF",
            desc: "AI-qualified leads"
        },
        {
            label: "Growth Index",
            value: "2.4x",
            icon: <TrendingUp size={20} />,
            color: "#BF5AF2",
            desc: "Network expansion"
        }
    ];

    return (
        <div className={styles.grid}>
            {stats.map((stat, i) => (
                <div key={i} className={styles.card}>
                    <div className={styles.header}>
                        <div className={styles.icon} style={{ color: stat.color, backgroundColor: `${stat.color}15` }}>
                            {stat.icon}
                        </div>
                        <span className={stat.desc.includes('+') ? styles.trendUp : styles.trendNeutral}>
                            {stat.desc}
                        </span>
                    </div>
                    <div className={styles.body}>
                        <h3>{stat.value}</h3>
                        <p>{stat.label}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
