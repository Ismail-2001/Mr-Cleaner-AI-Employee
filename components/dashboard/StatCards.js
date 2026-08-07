import styles from './StatCards.module.css';
import { TrendingUp, Users, DollarSign, Target } from 'lucide-react';

export default function StatCards({ bookings = [], analytics = null }) {
    const totalRevenue = bookings.reduce((sum, b) => sum + (parseFloat(b.service_price || b.price || 0)), 0);
    const totalBookings = bookings.length;
    const uniqueCustomers = new Set(bookings.map(b => b.phone).filter(Boolean)).size || totalBookings;

    // Use real analytics trend data when available
    const revenueTrend = analytics?.trend?.revenue;
    const bookingsTrend = analytics?.trend?.bookings;

    const revenueChange = revenueTrend?.change;
    const bookingsChange = bookingsTrend?.change;

    const formatChange = (change) => {
        if (change === undefined || change === null) return null;
        if (change > 0) return `+${change}% this week`;
        if (change < 0) return `${change}% this week`;
        return 'No change';
    };

    const stats = [
        {
            label: "Total Revenue",
            value: `$${totalRevenue.toLocaleString()}`,
            icon: <DollarSign size={20} />,
            color: "#30D158",
            change: formatChange(revenueChange),
        },
        {
            label: "Total Bookings",
            value: totalBookings,
            icon: <Users size={20} />,
            color: "var(--gold)",
            change: bookingsChange !== undefined ? `${bookingsTrend.current} this week` : null,
        },
        {
            label: "Unique Customers",
            value: uniqueCustomers,
            icon: <Target size={20} />,
            color: "#0A84FF",
            change: `${analytics?.totalUniqueCustomers || uniqueCustomers} total`,
        },
        {
            label: "Avg Booking Value",
            value: totalBookings > 0 ? `$${Math.round(totalRevenue / totalBookings)}` : '$0',
            icon: <TrendingUp size={20} />,
            color: "#BF5AF2",
            change: revenueChange !== undefined ? `${revenueChange > 0 ? '+' : ''}${revenueChange}% revenue` : null,
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
                        {stat.change && (
                            <span className={styles.trendNeutral}>
                                {stat.change}
                            </span>
                        )}
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
