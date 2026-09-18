import { T } from "../lib/calcul";

export function Num({ value, onChange, disabled, placeholder = "0", w = "w-24", right = true, big }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ""))}
      className={`${w} ${right ? "text-right" : ""} ${big ? "text-base py-2 font-bold" : "py-1.5 text-xs"} px-2.5 rounded-lg border bg-white disabled:bg-slate-50/70 disabled:border-transparent disabled:text-slate-500 focus:outline-none focus:ring-2 transition-all`}
      style={{ borderColor: T.line, fontVariantNumeric: "tabular-nums", "--tw-ring-color": T.gold }}
    />
  );
}

export const Row = ({ children, className = "" }) => (
  <div className={`flex items-center justify-between gap-2 py-2.5 border-b border-slate-100 ${className}`}>
    {children}
  </div>
);

export const Section = ({ titre, aside, children }) => (
  <section className="mb-5">
    <div className="flex items-baseline justify-between mb-1.5 px-0.5">
      <h2 className="text-sm font-bold tracking-tight" style={{ color: T.petrol }}>{titre}</h2>
      {aside && <span className="text-xs font-semibold" style={{ color: T.muted }}>{aside}</span>}
    </div>
    <div className="bg-white rounded-xl px-4 py-2 shadow-xs border border-slate-200/90">{children}</div>
  </section>
);

export const Alerte = ({ children, variant = "alert" }) => {
  const bg = variant === "ok" ? "#E3F4EA" : variant === "warn" ? "#FEFCE8" : "#FBEAE5";
  const col = variant === "ok" ? T.ok : variant === "warn" ? "#B7791F" : T.alert;
  return (
    <div className="text-xs font-medium rounded-xl px-3.5 py-2.5 my-2 border border-transparent shadow-xs" style={{ background: bg, color: col }}>
      {children}
    </div>
  );
};

export const Loading = ({ label = "Chargement…" }) => (
  <div className="flex flex-col items-center justify-center gap-3 p-12 text-xs font-medium" style={{ color: T.muted }}>
    <span className="inline-block w-6 h-6 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin" />
    <span>{label}</span>
  </div>
);

export const PageHeader = ({ icon, titre, subtitle, badge, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200/80">
    <div className="flex items-center gap-3">
      {icon && (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-xs bg-white border border-slate-200/90 shrink-0">
          {icon}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">{titre}</h1>
          {badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">{badge}</span>}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const StatCard = ({ label, value, subtext, icon, color = "blue", onClick }) => {
  const colors = {
    blue: { bg: "bg-blue-50/60", text: "text-blue-900", accent: "border-blue-500" },
    emerald: { bg: "bg-emerald-50/60", text: "text-emerald-900", accent: "border-emerald-500" },
    amber: { bg: "bg-amber-50/60", text: "text-amber-900", accent: "border-amber-500" },
    purple: { bg: "bg-purple-50/60", text: "text-purple-900", accent: "border-purple-500" },
    rose: { bg: "bg-rose-50/60", text: "text-rose-900", accent: "border-rose-500" },
  };
  const theme = colors[color] || colors.blue;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs relative overflow-hidden transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <div className={`text-xl font-black tabular tracking-tight ${theme.text}`}>{value}</div>
      {subtext && <div className="text-[10px] text-slate-400 mt-1">{subtext}</div>}
    </div>
  );
};

export const Badge = ({ children, variant = "default", className = "" }) => {
  const map = {
    default: "bg-slate-100 text-slate-700",
    ok: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    alert: "bg-rose-50 text-rose-700 border border-rose-200",
    warn: "bg-amber-50 text-amber-800 border border-amber-200",
    gold: "bg-amber-400 text-slate-950 font-bold",
    petrol: "bg-slate-800 text-white font-semibold",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${map[variant] || map.default} ${className}`}>
      {children}
    </span>
  );
};

export const Card = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 ${onClick ? "cursor-pointer hover:shadow-md hover:border-slate-300 transition-all" : ""} ${className}`}
  >
    {children}
  </div>
);
