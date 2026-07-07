import styles from './ValueProps.module.css';
import { Award, Timer, Target, Gem } from 'lucide-react';

export default function ValueProps() {
    const props = [
        {
            icon: <Gem size={32} />,
            title: "Concierge Quality",
            desc: "Every inch of your vehicle is treated with boutique-grade products and master precision."
        },
        {
            icon: <Timer size={32} />,
            title: "Time Autonomy",
            desc: "We bring the showroom to you. Stay focused while Maya manages our logistics and scheduling."
        },
        {
            icon: <Target size={32} />,
            title: "Obsessive Detail",
            desc: "From engine bays to door jambs, our signature processes leave no surface untouched."
        },
        {
            icon: <Award size={32} />,
            title: "Certified Protection",
            desc: "Authorized installers of elite ceramic coatings with multi-year performance guarantees."
        }
    ];

    return (
        <section className={styles.section}>
            <div className="container">
                <div className={styles.grid}>
                    {props.map((prop, i) => (
                        <div key={i} className={styles.card}>
                            <div className={styles.icon}>{prop.icon}</div>
                            <h3>{prop.title}</h3>
                            <p>{prop.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
