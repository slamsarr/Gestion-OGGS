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
      className={`${w} ${right ? "text-right" : ""} ${big ? "text-lg py-2" : "py-1"} px-2 rounded border bg-white disabled:bg-transparent disabled:border-transparent disabled:text-inherit focus:outline-none focus:ring-2`}
      style={{ borderColor: T.line, fontVariantNumeric: "tabular-nums", "--tw-ring-color": T.gold }}
    />
  );
}

export const Row = ({ children, className = "" }) => (
  <div className={`flex items-center justify-between gap-2 py-2 border-b ${className}`} style={{ borderColor: T.line }}>{children}</div>
);

export const Section = ({ titre, aside, children }) => (
  <section className="mb-5">
    <div className="flex items-baseline justify-between mb-1">
      <h2 className="text-base font-semibold" style={{ color: T.petrol }}>{titre}</h2>
      {aside && <span className="text-sm" style={{ color: T.muted }}>{aside}</span>}
    </div>
    <div className="bg-white rounded-lg px-3" style={{ border: `1px solid ${T.line}` }}>{children}</div>
  </section>
);

export const Alerte = ({ children }) => (
  <div className="text-sm rounded px-3 py-2 my-2" style={{ background: "#FBEAE5", color: T.alert }}>{children}</div>
);

export const Loading = ({ label = "Chargement…" }) => (
  <div className="flex items-center justify-center gap-3 p-8 text-sm" style={{ color: T.muted }}>
    <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: T.line, borderTopColor: T.petrol }} />
    {label}
  </div>
);
