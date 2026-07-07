import styles from './Sidebar.module.css';
import { LayoutDashboard, Calendar, BarChart3, Settings, LogOut, Brain } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
    const menuItems = [
        { id: 'bookings', label: 'Bookings', icon: LayoutDashboard },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'intelligence', label: 'Intelligence', icon: Brain },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <div className={styles.icon}>MC</div>
                <h2>Mr. Cleaner</h2>
            </div>

            <nav className={styles.nav}>
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
                        onClick={() => setActiveTab(item.id)}
                    >
                        <item.icon size={20} />
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className={styles.footer}>
                <button
                    className={styles.logout}
                    onClick={async () => {
                        await fetch('/api/dashboard/logout', { method: 'POST' });
                        window.location.href = '/dashboard/login';
                    }}
                >
                    <LogOut size={20} />
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
