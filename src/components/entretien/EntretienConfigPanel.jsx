import React, { useState } from "react";
import {
  saveServiceEntretien,
  deleteServiceEntretien,
  saveBaieEntretien,
  deleteBaieEntretien,
} from "../../lib/api";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

const CATEGORIES = [
  "VIDANGE",
  "FREINAGE",
  "ELECTRICITE",
  "REFROIDISSEMENT",
  "CLIMATISATION",
  "MOTEUR",
  "DIAGNOSTIC",
  "DIVERS",
];

export default function EntretienConfigPanel({ stationId, services = [], bays = [], onRefresh }) {
  const [tab, setTab] = useState("services");

  // Formulaire Service
  const [editingService, setEditingService] = useState(null);
  const [serviceSaving, setServiceSaving] = useState(false);

  // Formulaire Baie
  const [editingBay, setEditingBay] = useState(null);
  const [baySaving, setBaySaving] = useState(false);

  const handleSaveService = async (e) => {
    e.preventDefault();
    if (!editingService.nom) return;
    setServiceSaving(true);
    try {
      const id = editingService.id || `srv-${Date.now()}`;
      await saveServiceEntretien({
        ...editingService,
        id,
        prix_base: Number(editingService.prix_base || 0),
        duree_min: Number(editingService.duree_min || 30),
        station_id: stationId || null,
      });
      setEditingService(null);
      onRefresh?.();
    } finally {
      setServiceSaving(false);
    }
  };

  const handleDeleteService = async (id) => {
    if (!confirm("Supprimer cette prestation d'entretien ?")) return;
    await deleteServiceEntretien(id);
    onRefresh?.();
  };

  const handleSaveBay = async (e) => {
    e.preventDefault();
    if (!editingBay.code_baie) return;
    setBaySaving(true);
    try {
      const id = editingBay.id || `${stationId || "st"}-${editingBay.code_baie.toLowerCase()}`;
      await saveBaieEntretien({
        ...editingBay,
        id,
        station_id: stationId || null,
      });
      setEditingBay(null);
      onRefresh?.();
    } finally {
      setBaySaving(false);
    }
  };

  const handleDeleteBay = async (id) => {
    if (!confirm("Supprimer ce pont / cette baie ?")) return;
    await deleteBaieEntretien(id);
    onRefresh?.();
  };

  return (
    <div className="space-y-6">
      {/* Sous-onglets */}
      <div className="flex gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setTab("services")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === "services"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          🔧 Prestations & Forfaits ({services.length})
        </button>
        <button
          onClick={() => setTab("baies")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === "baies"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          🅱️ Ponts & Baies Atelier ({bays.length})
        </button>
      </div>

      {/* ── ONGLET SERVICES ── */}
      {tab === "services" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">
              Gérez les forfaits de main-d'œuvre et prestations proposées par les mécaniciens.
            </p>
            <button
              onClick={() =>
                setEditingService({
                  code: "",
                  nom: "",
                  description: "",
                  categorie: "VIDANGE",
                  prix_base: 5000,
                  duree_min: 30,
                  emoji: "🔧",
                  actif: true,
                })
              }
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-colors shadow-sm"
            >
              + Nouveau Forfait
            </button>
          </div>

          {/* Modal / Formulaire d'édition */}
          {editingService && (
            <form
              onSubmit={handleSaveService}
              className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-5 space-y-3"
            >
              <h4 className="font-bold text-gray-800 text-sm">
                {editingService.id ? "Modifier la prestation" : "Créer une nouvelle prestation"}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Nom de la prestation *</label>
                  <input
                    required
                    value={editingService.nom}
                    onChange={(e) => setEditingService({ ...editingService, nom: e.target.value })}
                    placeholder="ex. Remplacement Filtre à Carburant"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Catégorie</label>
                  <select
                    value={editingService.categorie}
                    onChange={(e) => setEditingService({ ...editingService, categorie: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Prix Main d'œuvre (FCFA) *</label>
                  <input
                    type="number"
                    required
                    value={editingService.prix_base}
                    onChange={(e) => setEditingService({ ...editingService, prix_base: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Durée estimée (minutes)</label>
                  <input
                    type="number"
                    value={editingService.duree_min}
                    onChange={(e) => setEditingService({ ...editingService, duree_min: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Emoji / Icône</label>
                  <input
                    value={editingService.emoji}
                    onChange={(e) => setEditingService({ ...editingService, emoji: e.target.value })}
                    placeholder="ex. ⚙️"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Code unique</label>
                  <input
                    value={editingService.code}
                    onChange={(e) => setEditingService({ ...editingService, code: e.target.value.toUpperCase() })}
                    placeholder="ex. FILTRE_CARBURANT"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-semibold text-gray-600 block mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingService.description}
                    onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                    placeholder="Détails des contrôles et opérations incluses..."
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={serviceSaving}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-sm"
                >
                  {serviceSaving ? "Enregistrement..." : "Enregistrer le forfait"}
                </button>
              </div>
            </form>
          )}

          {/* Tableau des services */}
          <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4 text-left">Prestation</th>
                  <th className="py-3 px-4 text-left">Catégorie</th>
                  <th className="py-3 px-4 text-left">Durée</th>
                  <th className="py-3 px-4 text-right">Tarif M.O</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{s.emoji || "🔧"}</span>
                        <div>
                          <div className="font-bold text-gray-900">{s.nom}</div>
                          <div className="text-gray-400 text-xs">{s.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-semibold">
                        {s.categorie}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-medium">
                      ⏱ {s.duree_min || 30} min
                    </td>
                    <td className="py-3 px-4 text-right font-black text-amber-700">
                      {F(s.prix_base)} F
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditingService(s)}
                          className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 font-semibold text-xs"
                        >
                          ✏️ Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteService(s.id)}
                          className="px-2 py-1 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-semibold text-xs"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ONGLET BAIES & PONTS ── */}
      {tab === "baies" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">
              Configurez les ponts élévateurs, fosses et baies de travail de la station.
            </p>
            <button
              onClick={() =>
                setEditingBay({
                  code_baie: "",
                  nom_baie: "",
                  type: "ELEVATEUR",
                  actif: true,
                })
              }
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-colors shadow-sm"
            >
              + Nouveau Pont / Baie
            </button>
          </div>

          {editingBay && (
            <form
              onSubmit={handleSaveBay}
              className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-5 space-y-3"
            >
              <h4 className="font-bold text-gray-800 text-sm">
                {editingBay.id ? "Modifier le pont / la baie" : "Ajouter un pont ou une baie"}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Code Baie *</label>
                  <input
                    required
                    value={editingBay.code_baie}
                    onChange={(e) => setEditingBay({ ...editingBay, code_baie: e.target.value.toUpperCase() })}
                    placeholder="PONT-1"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Nom / Description *</label>
                  <input
                    required
                    value={editingBay.nom_baie}
                    onChange={(e) => setEditingBay({ ...editingBay, nom_baie: e.target.value })}
                    placeholder="Pont 1 (Élévateur 4T)"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 block mb-1">Type d'équipement</label>
                  <select
                    value={editingBay.type}
                    onChange={(e) => setEditingBay({ ...editingBay, type: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value="ELEVATEUR">Pont Élévateur (4T / Colonnes)</option>
                    <option value="CISEAUX">Pont Ciseaux (Vidange Rapide)</option>
                    <option value="FOSSE">Fosse de visite</option>
                    <option value="SOL">Baie au sol (Diagnostic / Batterie)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBay(null)}
                  className="px-4 py-2 bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={baySaving}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-sm"
                >
                  {baySaving ? "Enregistrement..." : "Enregistrer la baie"}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {bays.map((b) => (
              <div key={b.id || b.code_baie} className="bg-white border border-gray-200 rounded-2xl p-4 flex justify-between items-start shadow-sm">
                <div>
                  <span className="text-xl">🅱️</span>
                  <div className="font-black text-gray-900 text-base mt-1">{b.nom_baie || b.code_baie}</div>
                  <div className="text-xs text-gray-500 font-mono">{b.code_baie} · {b.type || "Pont"}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingBay(b)}
                    className="p-1.5 text-xs text-amber-700 hover:bg-amber-50 rounded-lg"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteBay(b.id || b.code_baie)}
                    className="p-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
