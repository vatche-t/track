import { motion } from "framer-motion";
import { C } from "../core/constants";
import { fmt, money } from "../core/date";

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  style,
  title,
  type = "button",
}) {
  return (
    <button
      type={type}
      className={"btn " + variant}
      disabled={disabled}
      onClick={onClick}
      style={style}
      title={title}
    >
      {children}
    </button>
  );
}

export function Input({ value, onChange, options, ...props }) {
  if (options) {
    return (
      <select
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}

export function Textarea({ value, onChange, ...props }) {
  return (
    <textarea
      className="field textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function Card({ children, className = "", style, ...props }) {
  return (
    <motion.section
      className={("card " + className).trim()}
      style={style}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      whileHover={{ borderColor: C.green }}
      {...props}
    >
      {children}
    </motion.section>
  );
}

export function CardGrid({ children, className = "cards-grid" }) {
  return (
    <motion.div
      className={className}
      variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function MotionCheck({ className, onClick, children, title }) {
  return (
    <motion.button
      className={className}
      onClick={onClick}
      title={title}
      whileTap={{ scale: 0.7 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
    >
      {children}
    </motion.button>
  );
}

export function SectionTitle({ icon, title, action }) {
  return (
    <div className="section-title">
      <div className="section-heading">
        {icon}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, color = C.muted }) {
  return (
    <span className="pill" style={{ color, background: color + "22" }}>
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Stat({
  label,
  value,
  color = C.text,
  moneyValue,
  suffix = "",
}) {
  const displayValue = typeof value === "string" ? value : fmt(value) + suffix;
  return (
    <Card className="stat">
      <span>{label}</span>
      <strong style={{ color }}>
        {moneyValue ? money(value) : displayValue}
      </strong>
    </Card>
  );
}

export function ChartTip({ active, payload, label, moneyValue, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label && <b>{label}</b>}
      {payload.map((item) => (
        <div key={item.name} style={{ color: item.color || item.fill }}>
          {item.name}: {formatter ? formatter(item.value) : moneyValue ? money(item.value) : fmt(item.value)}
        </div>
      ))}
    </div>
  );
}
