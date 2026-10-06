import React, { useState } from "react";
import { updateStatutPrestationEntretien } from "../../lib/api";

const STATUTS = [
  { code: "EN_ATTENTE",  label: "En attente",    color: "bg-gray-100 text-gray-700",    dot: "bg-gray-400" },
  { code: "EN_COURS",    label: "Sur le pont",   color: "bg-amber-100 text-amber-800",  dot: "bg-amber-500" },
  { code: "CONTROLE",    label: "Contrôle / Test", color: "bg-blue-100 text-blue-800",   dot: "bg-blue-500" },
  { code: "TERMINE",     label: "Prêt / Fini",   color: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  { code: "LIVRE",       label: "Livré & Réglé", color: "bg-green-100 text-green-800",   dot: "bg-green-500" },
];

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

function elapsed(created_at) {
  if (!created_at) return "";
  const diff = Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
  if (diff < 1) return "< 1 min";
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h${diff % 60 > 0 ? String(diff % 60).padStart(2, "0") : ""}`;
}

function KanbanCard({ cmd, onStatusChange }) {
  const statut = STATUTS.find((s) => s.code === cmd.statut) || STATUTS[0];
  const idx = STATUTS.findIndex((s) => s.code === cmd.statut);
  const nextStatut = STATUTS[idx + 1];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 space-y-2.5 transition-all hover:shadow-md">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-black text-gray-900 text-sm font-mono tracking-wide">
            {cmd.immatriculation || "—"}
          </div>
          <div className="text-xs text-gray-500">
            {cmd.marque_modele || cmd.type_vehicule}
            {cmd.kilometrage ? ` · ${Number(cmd.kilometrage).toLocaleString()} km` : ""}
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statut.color}`}>
          {statut.label}
        </span>
      </div>

      {/* Services inclus */}
      {cmd.services && cmd.services.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Prestations :</div>
          <div className="flex flex-wrap gap-1">
            {cmd.services.map((s, i) => (
              <span key={i} className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                🔧 {s.service_nom || s.nom}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lubrifiants & produits */}
      {cmd.produits && cmd.produits.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Pièces / Huiles :</div>
          <div className="flex flex-wrap gap-1">
            {cmd.produits.map((p, i) => (
              <span key={i} className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">
                🧴 {p.designation} (x{p.quantite})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center text-xs text-gray-500 pt-1 border-t border-gray-100">
        <span>👤 {cmd.client_nom || "Client"}</span>
        <span>⏱ {elapsed(cmd.created_at)}</span>
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>👨‍🔧 {cmd.technicien || "Non assigné"}</span>
        {cmd.baie_id && <span>🅱️ {cmd.baie_id}</span>}
      </div>

      <div className="flex justify-between items-center pt-1.5 border-t border-gray-100">
        <span className="font-black text-gray-900 text-sm">
          {F(cmd.montant_total)} F
        </span>
        {nextStatut && (
          <button
            onClick={() => onStatusChange(cmd.id, nextStatut.code)}
            className="text-xs bg-amber-600 text-white font-semibold px-2.5 py-1 rounded-lg hover:bg-amber-700 transition-colors shadow-sm"
          >
            → {nextStatut.label}
          </button>
        )}
      </div>
    </div>
  );
}

export default function EntretienQueue({ commandes = [], onRefresh }) {
  const [loading, setLoading] = useState(null);

  const handleStatusChange = async (id, newStatut) => {
    setLoading(id);
    try {
      await updateStatutPrestationEntretien(id, newStatut);
      onRefresh?.();
    } finally {
      setLoading(null);
    }
  };

  const byStatut = STATUTS.reduce((acc, s) => {
    acc[s.code] = commandes.filter((c) => (c.statut || "EN_ATTENTE") === s.code);
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-[1000px]">
        {STATUTS.map((statut) => {
          const items = byStatut[statut.code] || [];
          return (
            <div key={statut.code} className="w-64 flex-shrink-0">
              {/* Entête colonne */}
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${statut.color}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${statut.dot}`} />
                <span className="font-bold text-sm">{statut.label}</span>
                <span className="ml-auto text-xs font-black bg-white/60 px-1.5 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>
              {/* Liste des cartes */}
              <div className="space-y-2.5">
                {items.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-xs">
                    Aucun véhicule
                  </div>
                ) : (
                  items.map((cmd) => (
                    <div key={cmd.id} className={loading === cmd.id ? "opacity-50 pointer-events-none" : ""}>
                      <KanbanCard cmd={cmd} onStatusChange={handleStatusChange} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
