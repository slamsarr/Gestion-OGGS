export default function WashPackCard({ pack, tarif, selected, onSelect, inclusions = [] }) {
  const F = (v) => Number(v || 0).toLocaleString("fr-FR");
  const borderColor = selected ? (pack.couleur || "#3b82f6") : "transparent";
  const bgGradient = selected
    ? `linear-gradient(135deg, ${pack.couleur}18 0%, ${pack.couleur}08 100%)`
    : "transparent";
  return (
    <button type="button" onClick={() => onSelect(pack)}
      className={`relative w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 ${selected ? "shadow-lg scale-[1.02]" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"}`}
      style={{ borderColor, background: bgGradient }}>
      {selected && (
        <span className="absolute top-2 right-2 text-white text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: pack.couleur }}>✓ Sélectionné</span>
      )}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{pack.emoji || "🚿"}</span>
        <div>
          <h3 className="font-bold text-gray-800 text-base leading-tight">{pack.nom}</h3>
          <p className="text-gray-500 text-xs leading-tight">{pack.description}</p>
        </div>
      </div>
      <div className="text-2xl font-black mb-3" style={{ color: pack.couleur || "#3b82f6" }}>
        {tarif != null ? `${F(tarif)} FCFA` : "—"}
      </div>
      {inclusions.length > 0 && (
        <ul className="space-y-1">
          {inclusions.map((inc, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span style={{ color: pack.couleur }}>✓</span><span>{inc}</span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
