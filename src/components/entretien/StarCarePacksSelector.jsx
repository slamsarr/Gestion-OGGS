import React from "react";
import { Badge } from "../ui";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

export const STAR_PACKS = [
  {
    id: "PACK_ESSENTIEL",
    nom: "Pack Essentiel",
    titreCourt: "Essentiel",
    sousTitre: "Sécurité & Niveaux",
    prix: 40000,
    ptsControle: 20,
    emoji: "🛡️",
    huile: "CEPSA Genuine 15W40 MAX (5L)",
    huileCode: "LUB-CEPSA-15W40-5L",
    huilePrix: 16000,
    filtres: "Filtre à huile moteur",
    pointsDescription: "20 points de contrôle (sécurité et niveaux)",
    optionGrade: {
      label: "+ Option 10W40 MAX (+10 000 F)",
      supplement: 10000,
      huileAltCode: "LUB-CEPSA-10W40-5L",
      huileAlt: "CEPSA Genuine 10W40 MAX (5L)",
    },
    serviceCode: "PACK_ESSENTIEL",
  },
  {
    id: "PACK_CONFORT",
    nom: "Pack Confort",
    titreCourt: "Confort",
    sousTitre: "Sécurité & Préventif",
    prix: 75000,
    ptsControle: 40,
    emoji: "⭐",
    populaire: true,
    badge: "Plus populaire",
    huile: "CEPSA Genuine 10W40 MAX (5L)",
    huileCode: "LUB-CEPSA-10W40-5L",
    huilePrix: 25000,
    filtres: "3 Filtres : Huile + Air + Habitacle",
    pointsDescription: "40 points de contrôle (sécurité & préventif)",
    serviceCode: "PACK_CONFORT",
  },
  {
    id: "PACK_PREMIUM",
    nom: "Pack Premium",
    titreCourt: "Premium",
    sousTitre: "Diagnostic Électronique & OBD",
    prix: 90000,
    ptsControle: 60,
    emoji: "👑",
    excellence: true,
    badge: "Formule Complète",
    huile: "CEPSA Genuine 10W40 MAX (5L)",
    huileCode: "LUB-CEPSA-10W40-5L",
    huilePrix: 25000,
    filtres: "4 Filtres : Huile + Air + Habitacle + Carburant",
    pointsDescription: "60 points complets + Diag valise électronique OBD",
    serviceCode: "PACK_PREMIUM",
  },
];

export default function StarCarePacksSelector({
  selectedPackId,
  option10w40 = false,
  onSelectPack,
  onToggleOption10w40,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span>Forfaits Officiels Star Care</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                Vidange &amp; Check-up
              </span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Forfaits clés en main incluant huile certifiée CEPSA, filtres et points de contrôle.
            </p>
          </div>
        </div>

        {selectedPackId && (
          <button
            type="button"
            onClick={() => onSelectPack(null)}
            className="text-[11px] text-slate-400 hover:text-red-600 font-bold underline"
          >
            Désélectionner le forfait
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STAR_PACKS.map((pack) => {
          const isSelected = selectedPackId === pack.id;
          const prixFinal =
            isSelected && pack.id === "PACK_ESSENTIEL" && option10w40
              ? pack.prix + pack.optionGrade.supplement
              : pack.prix;

          return (
            <div
              key={pack.id}
              onClick={() => onSelectPack(isSelected ? null : pack)}
              className={`relative rounded-2xl border-2 p-3.5 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? "border-amber-500 bg-gradient-to-b from-amber-50/80 to-white shadow-md ring-2 ring-amber-400/20"
                  : pack.populaire
                  ? "border-amber-300/80 bg-white hover:border-amber-400 hover:shadow-card"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              {/* Badge supérieur */}
              <div className="flex items-start justify-between gap-1 mb-2">
                <span className="text-2xl">{pack.emoji}</span>
                <div className="flex items-center gap-1">
                  {pack.badge && (
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        pack.populaire
                          ? "bg-amber-500 text-white shadow-sm"
                          : "bg-fuelos-900 text-amber-200"
                      }`}
                    >
                      {pack.badge}
                    </span>
                  )}
                  {isSelected && (
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                      ✓ Choisi
                    </span>
                  )}
                </div>
              </div>

              {/* Titre & détails */}
              <div className="flex-1">
                <div className="text-sm font-black text-slate-900">{pack.nom}</div>
                <div className="text-[11px] font-bold text-amber-800 mb-2">
                  {pack.sousTitre}
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                  <div className="flex items-start gap-1.5">
                    <span className="text-amber-600 text-xs">🛢️</span>
                    <span className="text-[11px] font-medium leading-snug">
                      {isSelected && pack.id === "PACK_ESSENTIEL" && option10w40
                        ? pack.optionGrade.huileAlt
                        : pack.huile}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-amber-600 text-xs">📦</span>
                    <span className="text-[11px] font-medium leading-snug">{pack.filtres}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-600 text-xs font-bold">✓</span>
                    <span className="text-[11px] font-bold text-emerald-800 leading-snug">
                      {pack.pointsDescription}
                    </span>
                  </div>
                </div>

                {/* Option 10W40 pour le pack essentiel */}
                {pack.optionGrade && isSelected && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 p-2 bg-amber-100/70 border border-amber-300 rounded-xl flex items-center justify-between"
                  >
                    <label className="text-[10.5px] font-extrabold text-amber-950 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={option10w40}
                        onChange={() => onToggleOption10w40 && onToggleOption10w40()}
                        className="rounded accent-amber-600 w-3.5 h-3.5"
                      />
                      <span>Option 10W40 (+10 000 F)</span>
                    </label>
                    <span className="text-[10px] text-amber-800 font-bold">Semi-synthèse</span>
                  </div>
                )}
              </div>

              {/* Prix */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-lg font-black text-slate-900 tabular">
                    {F(prixFinal)} F CFA
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold">TTC Fournitures incluses</div>
                </div>

                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-900"
                  }`}
                >
                  {isSelected ? "Sélectionné" : "Choisir"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
