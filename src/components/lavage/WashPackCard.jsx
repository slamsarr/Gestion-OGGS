function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== "string") return `rgba(59, 130, 246, ${alpha})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    if (!isNaN(num)) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return hex;
}

export default function WashPackCard({ pack, tarif, selected, onSelect, inclusions = [] }) {
  const F = (v) => Number(v || 0).toLocaleString("fr-FR");
  const color = pack.couleur || "#3b82f6";
  const bgStyle = selected
    ? {
        borderColor: color,
        background: `linear-gradient(135deg, ${hexToRgba(color, 0.12)} 0%, ${hexToRgba(color, 0.04)} 100%), #ffffff`,
      }
    : {
        borderColor: "#e5e7eb",
        backgroundColor: "#ffffff",
      };

  return (
    <button
      type="button"
      onClick={() => onSelect(pack)}
      className={`relative w-full text-left rounded-xl sm:rounded-2xl border-2 p-3.5 sm:p-4 transition-all duration-200 touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
        selected ? "shadow-md scale-[1.01]" : "hover:border-gray-300 hover:shadow-sm"
      }`}
      style={bgStyle}
    >
      {selected && (
        <span
          className="absolute top-2.5 right-2.5 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-sm"
          style={{ backgroundColor: color }}
        >
          ✓ Sélectionné
        </span>
      )}
      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3 pr-16 sm:pr-0">
        <span className="text-2xl sm:text-3xl flex-shrink-0" role="img" aria-label={pack.nom}>
          {pack.emoji || "🚿"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-800 text-sm sm:text-base leading-snug break-words">
            {pack.nom}
          </h3>
          <p className="text-gray-500 text-[11px] sm:text-xs leading-snug break-words">
            {pack.description}
          </p>
        </div>
      </div>
      <div
        className="text-lg sm:text-2xl font-black mb-2 sm:mb-3 leading-tight tracking-tight"
        style={{ color }}
      >
        {tarif != null ? `${F(tarif)} FCFA` : "—"}
      </div>
      {inclusions.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-gray-100">
          {inclusions.map((inc, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] sm:text-xs text-gray-600 leading-tight">
              <span className="flex-shrink-0 font-bold" style={{ color }}>✓</span>
              <span className="break-words">{inc}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
