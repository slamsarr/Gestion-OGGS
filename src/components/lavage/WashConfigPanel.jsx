import { useState } from "react";
import {
  saveWashPack, deleteWashPack,
  saveWashService,
  saveWashBay, deleteWashBay,
  saveWashPricing,
  saveWashPromotion, deleteWashPromotion,
  createWashBon, listWashBons,
} from "../../lib/api";
import { SEED_WASH_TYPES_VEHICULE } from "../../lib/seed";

const TYPES_VEH = SEED_WASH_TYPES_VEHICULE;
const F = (v) => Number(v || 0).toLocaleString("fr-FR");

// ── Sous-onglets Config ─────────────────────────────────────────
const CONFIG_TABS = [
  { id: "packs",    label: "📦 Packs",    },
  { id: "services", label: "🔧 Services", },
  { id: "prix",     label: "💰 Tarifs",   },
  { id: "baies",    label: "🅱️ Baies",   },
  { id: "promos",   label: "🏷️ Promos",  },
  { id: "bons",     label: "📋 Bons B2B", },
];

// ── Composant principal ──────────────────────────────────────────
export default function WashConfigPanel({ stationId, packs, services, pricing, bays, promos, bons, onRefresh }) {
  const [tab, setTab] = useState("packs");

  return (
    <div className="space-y-4">
      {/* Sous-navigation config */}
      <div className="flex gap-2 flex-wrap">
        {CONFIG_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-blue-600 text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === "packs"    && <PacksPanel    stationId={stationId} packs={packs}    onRefresh={onRefresh} />}
      {tab === "services" && <ServicesPanel stationId={stationId} services={services} onRefresh={onRefresh} />}
      {tab === "prix"     && <PrixPanel     stationId={stationId} packs={packs} pricing={pricing} onRefresh={onRefresh} />}
      {tab === "baies"    && <BaiesPanel    stationId={stationId} bays={bays}    onRefresh={onRefresh} />}
      {tab === "promos"   && <PromosPanel   stationId={stationId} promos={promos}  onRefresh={onRefresh} />}
      {tab === "bons"     && <BonsPanel     stationId={stationId} bons={bons}     onRefresh={onRefresh} />}
    </div>
  );
}

// ── Panel Packs ──────────────────────────────────────────────────
function PacksPanel({ stationId, packs, onRefresh }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = { code: "", nom: "", description: "", couleur: "#3b82f6", emoji: "🚿", ordre: (packs?.length || 0) + 1, actif: true };

  const handleSave = async () => {
    if (!form.nom) return;
    setSaving(true);
    try {
      await saveWashPack({ ...form, id: form.id || `pack-${Date.now()}`, station_id: stationId });
      setForm(null); onRefresh?.();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce pack ?")) return;
    await deleteWashPack(id); onRefresh?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Packs de lavage ({packs?.length || 0})</h3>
        <button onClick={() => setForm(emptyForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">+ Nouveau pack</button>
      </div>

      {/* Formulaire */}
      {form && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-blue-800">{form.id ? "Modifier" : "Nouveau"} pack</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 block mb-1">Emoji</label>
              <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Couleur</label>
              <input type="color" value={form.couleur} onChange={(e) => setForm({ ...form, couleur: e.target.value })} className="w-full h-9 border rounded-lg cursor-pointer" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Nom *</label>
              <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex. Premium" className="w-full border rounded-lg px-3 py-1.5 text-sm" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Ordre</label>
              <input type="number" value={form.ordre} onChange={(e) => setForm({ ...form, ordre: Number(e.target.value) })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} className="w-4 h-4" />Actif</label></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200">Annuler</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? "..." : "Enregistrer"}</button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(packs || []).map((p) => (
          <div key={p.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{p.emoji}</span>
              <div>
                <div className="font-semibold text-gray-800 text-sm">{p.nom}</div>
                <div className="text-xs text-gray-500">{p.description}</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setForm(p)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">✏️</button>
              <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-sm">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Panel Services ───────────────────────────────────────────────
function ServicesPanel({ stationId, services, onRefresh }) {
  const [form, setForm] = useState(null);
  const empty = { code: "", nom: "", categorie: "EXTERRIEUR", prix_unitaire: null, actif: true };
  const cats = ["EXTERRIEUR", "INTERIEUR", "FINITION", "ADDON"];

  const handleSave = async () => {
    if (!form.nom) return;
    await saveWashService({ ...form, id: form.id || `ws-${Date.now()}`, station_id: stationId });
    setForm(null); onRefresh?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Catalogue services ({services?.length || 0})</h3>
        <button onClick={() => setForm(empty)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">+ Service</button>
      </div>
      {form && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Nom *</label>
              <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="w-full border rounded-lg px-3 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Catégorie</label>
              <select value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                {cats.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="text-xs text-gray-500 block mb-1">Prix addon (FCFA)</label>
              <input type="number" value={form.prix_unitaire || ""} onChange={(e) => setForm({ ...form, prix_unitaire: e.target.value ? Number(e.target.value) : null })} className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="Laisser vide si inclus" /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">Annuler</button>
            <button onClick={handleSave} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Enregistrer</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 text-xs border-b"><th className="py-2">Service</th><th>Catégorie</th><th>Prix addon</th><th></th></tr></thead>
          <tbody>
            {(services || []).map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 font-medium text-gray-800">{s.nom}</td>
                <td><span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{s.categorie}</span></td>
                <td className="text-gray-600">{s.prix_unitaire ? `${F(s.prix_unitaire)} F` : "Inclus"}</td>
                <td><button onClick={() => setForm(s)} className="p-1 rounded hover:bg-gray-100 text-sm">✏️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Panel Prix ───────────────────────────────────────────────────
function PrixPanel({ stationId, packs, pricing, onRefresh }) {
  const [localPricing, setLocalPricing] = useState(null);
  const [saving, setSaving] = useState(false);
  const active = localPricing || pricing || [];

  const getPrice = (packId, typeVeh) => {
    const row = active.find((r) => r.pack_id === packId && r.type_vehicule === typeVeh);
    return row?.tarif ?? "";
  };

  const setPrice = (packId, typeVeh, tarif) => {
    const next = [...active];
    const idx = next.findIndex((r) => r.pack_id === packId && r.type_vehicule === typeVeh);
    const entry = { id: `wp-${packId}-${typeVeh}`, pack_id: packId, type_vehicule: typeVeh, tarif: Number(tarif), station_id: stationId };
    if (idx >= 0) next[idx] = entry; else next.push(entry);
    setLocalPricing(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try { await saveWashPricing(active); onRefresh?.(); setLocalPricing(null); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Matrice prix Pack × Type véhicule (FCFA)</h3>
        <button onClick={handleSave} disabled={saving} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          {saving ? "Sauvegarde..." : "💾 Sauvegarder"}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-2 px-3 text-left text-gray-500 font-medium">Pack ↓  /  Véhicule →</th>
              {TYPES_VEH.map((t) => <th key={t.code} className="py-2 px-3 text-center text-gray-600 font-medium">{t.libelle}</th>)}
            </tr>
          </thead>
          <tbody>
            {(packs || []).map((pack) => (
              <tr key={pack.id} className="border-t border-gray-100">
                <td className="py-2 px-3 font-semibold text-gray-700">
                  {pack.emoji} {pack.nom}
                </td>
                {TYPES_VEH.map((t) => (
                  <td key={t.code} className="py-2 px-3 text-center">
                    <input type="number" value={getPrice(pack.id, t.code)}
                      onChange={(e) => setPrice(pack.id, t.code, e.target.value)}
                      className="w-24 border rounded-lg px-2 py-1 text-sm text-center focus:border-blue-400 focus:outline-none" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Panel Baies ──────────────────────────────────────────────────
function BaiesPanel({ stationId, bays, onRefresh }) {
  const [form, setForm] = useState(null);
  const empty = { code_baie: "", nom_baie: "", actif: true };

  const handleSave = async () => {
    if (!form.code_baie) return;
    await saveWashBay({ ...form, id: form.id || `bay-${stationId}-${form.code_baie}`, station_id: stationId });
    setForm(null); onRefresh?.();
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette baie ?")) return;
    await deleteWashBay(id); onRefresh?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Baies de lavage ({bays?.length || 0})</h3>
        <button onClick={() => setForm(empty)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">+ Baie</button>
      </div>
      {form && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 block mb-1">Code *</label>
              <input value={form.code_baie} onChange={(e) => setForm({ ...form, code_baie: e.target.value })} placeholder="ex. B1" className="w-full border rounded-lg px-3 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Nom</label>
              <input value={form.nom_baie} onChange={(e) => setForm({ ...form, nom_baie: e.target.value })} placeholder="ex. Baie principale" className="w-full border rounded-lg px-3 py-1.5 text-sm" /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">Annuler</button>
            <button onClick={handleSave} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Enregistrer</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(bays || []).map((b) => (
          <div key={b.id} className="flex items-center justify-between bg-white border rounded-xl p-3">
            <div><div className="font-bold text-gray-800">🅱️ {b.code_baie}</div><div className="text-xs text-gray-500">{b.nom_baie}</div></div>
            <div className="flex gap-1">
              <button onClick={() => setForm(b)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">✏️</button>
              <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-sm">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Panel Promotions ─────────────────────────────────────────────
function PromosPanel({ stationId, promos, onRefresh }) {
  const [form, setForm] = useState(null);
  const empty = { code_promo: "", description: "", type_reduction: "MONTANT", valeur: 0, date_debut: "", date_fin: "", actif: true };

  const handleSave = async () => {
    if (!form.code_promo) return;
    await saveWashPromotion({ ...form, id: form.id || `promo-${Date.now()}`, station_id: stationId });
    setForm(null); onRefresh?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Promotions ({promos?.length || 0})</h3>
        <button onClick={() => setForm(empty)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">+ Promo</button>
      </div>
      {form && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 block mb-1">Code promo *</label>
              <input value={form.code_promo} onChange={(e) => setForm({ ...form, code_promo: e.target.value.toUpperCase() })} placeholder="ex. ETE2026" className="w-full border rounded-lg px-3 py-1.5 text-sm uppercase" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Type réduction</label>
              <select value={form.type_reduction} onChange={(e) => setForm({ ...form, type_reduction: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                <option value="MONTANT">Montant fixe (FCFA)</option>
                <option value="POURCENTAGE">Pourcentage (%)</option>
              </select></div>
            <div><label className="text-xs text-gray-500 block mb-1">Valeur</label>
              <input type="number" value={form.valeur} onChange={(e) => setForm({ ...form, valeur: Number(e.target.value) })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Date début</label>
              <input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Date fin</label>
              <input type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} className="w-4 h-4" />Active</label></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">Annuler</button>
            <button onClick={handleSave} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Enregistrer</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {(promos || []).map((p) => (
          <div key={p.id} className="flex items-center justify-between bg-white border rounded-xl p-3">
            <div>
              <div className="font-bold text-gray-800">🏷️ {p.code_promo}</div>
              <div className="text-xs text-gray-500">
                {p.type_reduction === "POURCENTAGE" ? `-${p.valeur}%` : `-${F(p.valeur)} FCFA`}
                {p.date_debut && ` · du ${p.date_debut}`}{p.date_fin && ` au ${p.date_fin}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${p.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {p.actif ? "Active" : "Inactive"}</span>
              <button onClick={() => setForm(p)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">✏️</button>
              <button onClick={() => { deleteWashPromotion(p.id); onRefresh?.(); }} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-sm">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Panel Bons B2B ───────────────────────────────────────────────
function BonsPanel({ stationId, bons, onRefresh }) {
  const [form, setForm] = useState(null);
  const empty = { client_code: "", pack_id: "", nombre_lavages: 1, montant_total: 0, statut: "ACTIF" };
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createWashBon({ ...form, station_id: stationId });
      setForm(null); onRefresh?.();
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Bons de lavage B2B ({bons?.length || 0})</h3>
        <button onClick={() => setForm(empty)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">+ Créer bon</button>
      </div>
      {form && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 block mb-1">Code client *</label>
              <input value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value })} placeholder="ex. CP-ITS" className="w-full border rounded-lg px-3 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Nb lavages</label>
              <input type="number" min="1" value={form.nombre_lavages} onChange={(e) => setForm({ ...form, nombre_lavages: Number(e.target.value) })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Montant total (FCFA)</label>
              <input type="number" value={form.montant_total} onChange={(e) => setForm({ ...form, montant_total: Number(e.target.value) })} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">Annuler</button>
            <button onClick={handleCreate} disabled={creating} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
              {creating ? "..." : "Créer"}</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 text-xs border-b">
            <th className="py-2">Numéro</th><th>Client</th><th>Lavages</th><th>Montant</th><th>Statut</th>
          </tr></thead>
          <tbody>
            {(bons || []).map((b) => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 font-mono text-xs">{b.numero_bon}</td>
                <td className="text-gray-700">{b.client_code}</td>
                <td className="text-gray-600">{b.nombre_lavages || "—"}</td>
                <td className="font-semibold">{F(b.montant_total)} F</td>
                <td><span className={`text-xs px-2 py-0.5 rounded-full ${b.statut === "ACTIF" ? "bg-green-100 text-green-700" : b.statut === "UTILISE" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{b.statut}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
