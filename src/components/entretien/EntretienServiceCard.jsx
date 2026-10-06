import React from "react";

const CATEGORIE_COLORS = {
  VIDANGE: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
  FREINAGE: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  ELECTRICITE: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  REFROIDISSEMENT: { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300" },
  CLIMATISATION: { bg: "bg-sky-100", text: "text-sky-800", border: "border-sky-300" },
  MOTEUR: { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-300" },
  DIAGNOSTIC: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  DIVERS: { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-300" },
};

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

export default function EntretienServiceCard({ service, selected, onToggle }) {
  const catTheme = CATEGORIE_COLORS[service.categorie] || CATEGORIE_COLORS.DIVERS;

  return (
    <button
      type="button"
      onClick={() => onToggle(service)}
      className={`relative w-full text-left rounded-xl sm:rounded-2xl border-2 p-3 sm:p-4 transition-all duration-200 touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500 ${
        selected
          ? "border-amber-500 bg-amber-50/70 shadow-md scale-[1.01]"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      {selected && (
        <span className="absolute top-2.5 right-2.5 bg-amber-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
          ✓ Inclus
        </span>
      )}

      <div className="flex items-start gap-2.5 sm:gap-3 mb-2 pr-14 sm:pr-0">
        <span className="text-2xl sm:text-3xl flex-shrink-0" role="img" aria-label={service.nom}>
          {service.emoji || "🔧"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${catTheme.bg} ${catTheme.text}`}>
              {service.categorie}
            </span>
            {service.duree_min && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                ⏱ {service.duree_min} min
              </span>
            )}
          </div>
          <h4 className="font-bold text-gray-900 text-sm sm:text-base leading-snug break-words">
            {service.nom}
          </h4>
          <p className="text-gray-500 text-[11px] sm:text-xs leading-snug break-words mt-0.5">
            {service.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
        <span className="text-xs text-gray-500 font-medium">Main d'œuvre</span>
        <span className="text-base sm:text-lg font-black text-amber-700">
          {F(service.prix_base || service.prix || 0)} FCFA
        </span>
      </div>
    </button>
  );
}
