import { T } from "../lib/calcul";
import { useState, useRef, useCallback } from "react";

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  onClick,
  disabled,
  type = "button",
  icon,
  iconRight,
  fullWidth = false,
}) {
  const sizeMap = {
    xs: "px-3 py-2 text-xs rounded-md gap-1.5",
    sm: "px-4 py-2.5 text-sm rounded-lg gap-2",
    md: "px-5 py-3.5 text-sm rounded-xl gap-2",
    lg: "px-6 py-4 text-base rounded-xl gap-2.5",
  };
  const variantMap = {
    primary:
      "bg-damel-blue text-white shadow-button hover:bg-damel-blue-deep hover:shadow-button-hover focus-visible:ring-damel-blue active:scale-[0.98]",
    secondary:
      "bg-white text-slate-700 border border-surface-border shadow-button hover:bg-surface-muted hover:border-surface-border-strong focus-visible:ring-slate-400 active:scale-[0.98]",
    ghost:
      "text-slate-600 hover:bg-slate-100/80 focus-visible:ring-slate-300",
    danger:
      "bg-white text-red-600 border border-red-200 hover:bg-red-50 focus-visible:ring-red-400 active:scale-[0.98]",
    "danger-solid":
      "bg-red-600 text-white shadow-button hover:bg-red-700 focus-visible:ring-red-500 active:scale-[0.98]",
    accent:
      "bg-damel-yellow text-slate-900 shadow-button hover:bg-damel-gold focus-visible:ring-damel-yellow active:scale-[0.98]",
    success:
      "bg-emerald-600 text-white shadow-button hover:bg-emerald-700 focus-visible:ring-emerald-500 active:scale-[0.98]",
    star:
      "bg-star-purple text-white shadow-button hover:bg-star-purple-dark focus-visible:ring-star-purple active:scale-[0.98]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
        sizeMap[size] || sizeMap.md
      } ${variantMap[variant] || variantMap.primary} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
      {iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
}

export function Num({ value, onChange, disabled, placeholder = "0", w = "w-24", right = true, big }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ""))}
      className={`${w} ${right ? "text-right" : ""} ${big ? "text-base py-3 font-bold" : "py-2.5 text-sm"} px-4 rounded-lg border bg-white disabled:bg-surface-muted disabled:border-transparent disabled:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-damel-blue/20 focus:border-damel-blue`}
      style={{ borderColor: disabled ? undefined : T.line, fontVariantNumeric: "tabular-nums" }}
    />
  );
}

export function InputComptable({
  value,
  onChange,
  label,
  unit = "FCFA",
  placeholder = "0",
  min = 0,
  max,
  required = false,
  disabled = false,
  className = "",
  hint,
  decimals = 0,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const numericValue = parseFloat(String(value).replace(/\s/g, "").replace(",", ".")) || 0;
  const isEmpty = value === "" || value === null || value === undefined;
  const isInvalid = !isEmpty && (numericValue < min || (max !== undefined && numericValue > max) || (required && numericValue <= 0));
  const isValid = !isEmpty && !isInvalid && (required ? numericValue > 0 : true);

  const formatForDisplay = useCallback((v) => {
    const num = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    if (isNaN(num)) return "";
    return decimals > 0
      ? num.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: decimals })
      : Math.round(num).toLocaleString("fr-FR");
  }, [decimals]);

  const handleChange = (e) => {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    const final = decimals === 0 ? cleaned.replace(".", "") : cleaned;
    onChange(final);
  };

  const badgeColor = isEmpty
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : isInvalid
    ? "bg-red-50 text-red-700 border-red-200"
    : isValid
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-slate-50 text-slate-500 border-slate-200";

  const badgeIcon = isEmpty ? "—" : isInvalid ? "✕" : isValid ? "✓" : "·";

  const borderClass = disabled
    ? "border-slate-200"
    : isFocused
    ? "border-damel-blue ring-2 ring-damel-blue/15"
    : isInvalid
    ? "border-red-300"
    : isValid
    ? "border-emerald-300"
    : "border-surface-border";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="label flex items-center gap-1">
          {label}
          {required && <span className="text-red-500 font-black">*</span>}
        </label>
      )}
      <div
        className={`relative flex items-center rounded-xl border transition-all overflow-hidden shadow-inner-soft bg-white ${borderClass}`}
      >
        <span className={`shrink-0 w-10 text-center text-xs font-black border-r py-3.5 ${badgeColor} transition-colors`}>
          {badgeIcon}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          value={isFocused ? (value ?? "") : formatForDisplay(value)}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => {
            setIsFocused(true);
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onBlur={() => setIsFocused(false)}
          onChange={handleChange}
          className="flex-1 px-4 py-3.5 text-right text-base font-mono font-bold bg-transparent disabled:text-slate-400 outline-none tabular-nums"
          style={{
            color: disabled ? "#94A3B8" : isInvalid ? "#DC2626" : "#0F172A",
            fontVariantNumeric: "tabular-nums",
          }}
        />
        {unit && (
          <span className="shrink-0 px-4 py-3.5 text-xs font-bold text-slate-500 bg-slate-50 border-l border-surface-border">
            {unit}
          </span>
        )}
      </div>
      {isInvalid && (
        <p className="text-xs text-red-600 font-semibold mt-1">
          {numericValue < min
            ? `Valeur minimum : ${min.toLocaleString("fr-FR")} ${unit}`
            : max !== undefined && numericValue > max
            ? `Valeur maximum : ${max.toLocaleString("fr-FR")} ${unit}`
            : "Valeur invalide"}
        </p>
      )}
      {hint && !isInvalid && (
        <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

export const Row = ({ children, className = "" }) => (
  <div className={`flex items-center justify-between gap-4 py-4 border-b border-surface-border last:border-b-0 ${className}`}>
    {children}
  </div>
);

export const Section = ({ titre, aside, children, icon }) => (
  <section className="mb-8 animate-subtle-in">
    <div className="flex items-baseline justify-between mb-3 px-0.5">
      <h2 className="text-base font-extrabold tracking-tight text-ink flex items-center gap-2" style={{ color: T.primaryInk }}>
        {icon && <span className="text-lg">{icon}</span>}
        {titre}
      </h2>
      {aside && <span className="text-sm font-semibold" style={{ color: T.muted }}>{aside}</span>}
    </div>
    <div className="bg-surface-card rounded-2xl px-5 sm:px-6 py-5 shadow-card border border-surface-border/80">
      {children}
    </div>
  </section>
);

export const Alerte = ({ children, variant = "alert", icon }) => {
  const variants = {
    ok: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200", icon: icon || "✓" },
    warn: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", icon: icon || "⚠" },
    alert: { bg: "bg-red-50", text: "text-red-800", border: "border-red-200", icon: icon || "✕" },
    info: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200", icon: icon || "ℹ" },
  };
  const v = variants[variant] || variants.alert;
  return (
    <div className={`text-sm font-medium rounded-xl px-5 py-4 my-4 border ${v.bg} ${v.text} ${v.border} shadow-card flex items-start gap-3`}>
      <span className="text-lg leading-none mt-0.5">{v.icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
};

export const Loading = ({ label = "Chargement…" }) => (
  <div className="flex flex-col items-center justify-center gap-6 p-20 text-sm font-medium" style={{ color: T.muted }}>
    <div className="relative">
      <span className="inline-block w-12 h-12 rounded-full border-[3px] border-slate-200 border-t-damel-blue animate-spin" />
    </div>
    <div className="flex flex-col items-center gap-2">
      <span className="text-base font-semibold text-slate-600">{label}</span>
      <span className="text-xs text-slate-400">FuelOS · DAMEL ENERGY</span>
    </div>
  </div>
);

export const PageHeader = ({ icon, titre, subtitle, badge, actions, breadcrumb }) => (
  <div className="mb-6 pb-4 border-b border-surface-border animate-subtle-in">
    {breadcrumb && (
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {breadcrumb}
      </div>
    )}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-card bg-gradient-to-br from-fuelos-50 to-fuelos-100 border border-fuelos-200/60 shrink-0">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink" style={{ color: T.primaryInk }}>{titre}</h1>
            {badge && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-damel-yellow/20 text-damel-gold border border-damel-yellow/40">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  </div>
);

export const StatCard = ({ label, value, subtext, icon, color = "blue", onClick, trend, trendLabel }) => {
  const colors = {
    blue: {
      bg: "from-fuelos-50 to-white",
      border: "border-fuelos-100",
      text: "text-fuelos-900",
      accentBg: "bg-fuelos-100",
      accentText: "text-fuelos-700",
      ring: "hover:ring-fuelos-200",
    },
    emerald: {
      bg: "from-emerald-50 to-white",
      border: "border-emerald-100",
      text: "text-emerald-900",
      accentBg: "bg-emerald-100",
      accentText: "text-emerald-700",
      ring: "hover:ring-emerald-200",
    },
    amber: {
      bg: "from-amber-50 to-white",
      border: "border-amber-100",
      text: "text-amber-900",
      accentBg: "bg-amber-100",
      accentText: "text-amber-700",
      ring: "hover:ring-amber-200",
    },
    purple: {
      bg: "from-purple-50 to-white",
      border: "border-purple-100",
      text: "text-purple-900",
      accentBg: "bg-purple-100",
      accentText: "text-purple-700",
      ring: "hover:ring-purple-200",
    },
    rose: {
      bg: "from-rose-50 to-white",
      border: "border-rose-100",
      text: "text-rose-900",
      accentBg: "bg-rose-100",
      accentText: "text-rose-700",
      ring: "hover:ring-rose-200",
    },
    star: {
      bg: "from-purple-50 to-white",
      border: "border-purple-100",
      text: "text-star-purple-dark",
      accentBg: "bg-purple-100",
      accentText: "text-star-purple",
      ring: "hover:ring-purple-200",
    },
    damel: {
      bg: "from-fuelos-50 to-white",
      border: "border-fuelos-200/70",
      text: "text-fuelos-950",
      accentBg: "bg-damel-blue/10",
      accentText: "text-damel-blue",
      ring: "hover:ring-damel-blue/20",
    },
  };
  const theme = colors[color] || colors.damel;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden transition-all duration-200 rounded-2xl p-4 sm:p-5 border bg-gradient-to-br ${theme.bg} ${theme.border} shadow-card ${
        onClick ? `cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 hover:ring-2 ${theme.ring}` : ""
      }`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04] bg-current -mt-10 -mr-10" style={{ color: theme.text.replace("text-", "") }} />
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${theme.accentBg} ${theme.accentText}`}>
            {icon}
          </div>
        )}
      </div>
      <div className={`text-2xl sm:text-3xl font-black tabular tracking-tight ${theme.text}`}>{value}</div>
      {(subtext || trend !== undefined) && (
        <div className="flex items-center justify-between mt-2">
          {subtext && <div className="text-[11px] text-slate-400">{subtext}</div>}
          {trend !== undefined && (
            <div className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-md ${
              trend >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}>
              <span>{trend >= 0 ? "↑" : "↓"}</span>
              <span>{Math.abs(trend)}%</span>
              {trendLabel && <span className="opacity-70 font-medium">· {trendLabel}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const Badge = ({ children, variant = "default", className = "", dot }) => {
  const map = {
    default: "bg-slate-100 text-slate-700 border border-slate-200",
    ok: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    alert: "bg-red-50 text-red-700 border border-red-200",
    danger: "bg-red-50 text-red-700 border border-red-200",
    warn: "bg-amber-50 text-amber-800 border border-amber-200",
    warning: "bg-amber-50 text-amber-800 border border-amber-200",
    gold: "bg-damel-yellow text-slate-950 border border-damel-gold/40 font-bold",
    petrol: "bg-fuelos-900 text-white border border-fuelos-800 font-semibold",
    info: "bg-blue-50 text-blue-700 border border-blue-200",
    primary: "bg-fuelos-50 text-fuelos-800 border border-fuelos-200",
    damel: "bg-damel-blue/10 text-damel-blue border border-damel-blue/20 font-semibold",
    star: "bg-star-purple/10 text-star-purple border border-star-purple/25 font-semibold",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded-full ${map[variant] || map.default} ${className}`}>
      {dot !== undefined && (
        <span className={`w-1.5 h-1.5 rounded-full ${dot ? "bg-emerald-500" : "bg-slate-300"}`} />
      )}
      {children}
    </span>
  );
};

export const Card = ({ children, className = "", onClick, hover = true }) => (
  <div
    onClick={onClick}
    className={`bg-surface-card rounded-2xl border border-surface-border/80 shadow-card p-4 sm:p-5 ${
      onClick && hover ? "cursor-pointer hover:shadow-card-hover hover:border-surface-border-strong hover:-translate-y-0.5 transition-all duration-200" : ""
    } ${className}`}
  >
    {children}
  </div>
);

export function EmptyState({ icon = "📭", title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-8 rounded-2xl border-2 border-dashed border-surface-border bg-white/40">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-6 bg-gradient-to-br from-surface-muted to-white border border-surface-border shadow-card">
        {icon}
      </div>
      <h3 className="text-base font-extrabold text-slate-800 mb-2">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-md mb-6">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function KpiGrid({ children, cols = 4 }) {
  const colsMap = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  };
  return (
    <div className={`grid grid-cols-1 ${colsMap[cols] || colsMap[4]} gap-3 sm:gap-4 mb-6`}>
      {children}
    </div>
  );
}

export function Divider({ label, className = "" }) {
  if (label) {
    return (
      <div className={`flex items-center gap-3 my-5 ${className}`}>
        <div className="flex-1 h-px bg-surface-border" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="flex-1 h-px bg-surface-border" />
      </div>
    );
  }
  return <hr className={`my-5 border-0 border-t border-surface-border ${className}`} />;
}
