import { useState } from "react";
import { updateStatutCommandeLavage } from "../../lib/api";

const STATUTS = [
  { code: "EN_ATTENTE",  label: "En attente",  color: "bg-gray-100 text-gray-700",   dot: "bg-gray-400"   },
  { code: "RECU",        label: "Reçu",        color: "bg-blue-100 text-blue-700",   dot: "bg-blue-400"   },
  { code: "EN_LAVAGE",   label: "En lavage",   color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-400" },
  { code: "CONTROLE",    label: "Contrôle",    color: "bg-purple-100 text-purple-700", dot: "bg-purple-400" },
  { code: "TERMINE",     label: "Terminé",     color: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  { code: "LIVRE",       label: "Livré",       color: "bg-green-100 text-green-700", dot: "bg-green-400"   },
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-bold text-gray-800 text-sm">{cmd.immatriculation || "—"}</div>
          <div className="text-xs text-gray-500">{cmd.type_vehicule}</div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statut.color}`}>
          {statut.label}
        </span>
      </div>
      <div className="text-sm text-blue-700 font-medium">{cmd.pack_nom || cmd.type_prestation || "Lavage"}</div>
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>👤 {cmd.client_nom || cmd.agent}</span>
        <span>⏱ {elapsed(cmd.created_at)}</span>
      </div>
      {cmd.baie_id && <div className="text-xs text-gray-400">🅱️ Baie {cmd.baie_id}</div>}
      <div className="flex justify-between items-center pt-1">
        <span className="font-bold text-gray-700 text-sm">{F(cmd.montant_total || cmd.montant)} F</span>
        {nextStatut && (
          <button
            onClick={() => onStatusChange(cmd.id, nextStatut.code)}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-colors"
          >
            → {nextStatut.label}
          </button>
        )}
      </div>
    </div>
  );
}

export default function WashQueue({ commandes, onRefresh }) {
  const [loading, setLoading] = useState(null);

  const handleStatusChange = async (id, newStatut) => {
    setLoading(id);
    try {
      await updateStatutCommandeLavage(id, newStatut);
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
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max pb-4">
        {STATUTS.map((statut) => {
          const items = byStatut[statut.code] || [];
          return (
            <div key={statut.code} className="w-56 flex-shrink-0">
              {/* Colonne header */}
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${statut.color}`}>
                <span className={`w-2 h-2 rounded-full ${statut.dot}`} />
                <span className="font-semibold text-sm">{statut.label}</span>
                <span className="ml-auto text-xs font-bold">{items.length}</span>
              </div>
              {/* Cards */}
              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-xs">
                    Aucune
                  </div>
                ) : (
                  items.map((cmd) => (
                    <div key={cmd.id} className={loading === cmd.id ? "opacity-50" : ""}>
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
