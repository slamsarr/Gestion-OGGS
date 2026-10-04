import { useState, useEffect } from "react";
import { creerCollaborateur } from "../lib/api";
import { ROLE_LABELS } from "../lib/permissions";
import { T } from "../lib/calcul";

export default function CollaborateurModal({ isOpen, onClose, stations = [], defaultStationId = "", onCreated }) {
  const [form, setForm] = useState({
    nom_complet: "",
    role: "pompiste",
    station_id: defaultStationId || "",
    telephone: "",
    email: "",
    password: "Star2026!",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (defaultStationId) {
      setForm((prev) => ({ ...prev, station_id: defaultStationId }));
    }
  }, [defaultStationId]);

  if (!isOpen) return null;

  const onNomChange = (nom) => {
    const cleanNom = nom.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, ".");
    const emailSug = cleanNom ? `${cleanNom}@starenergy.sn` : "";
    setForm((prev) => ({
      ...prev,
      nom_complet: nom,
      email: emailSug,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.nom_complet.trim()) {
      setErr("Le nom et prénom sont obligatoires.");
      return;
    }
    setBusy(true);
    try {
      const res = await creerCollaborateur({
        nom_complet: form.nom_complet.trim(),
        role: form.role,
        station_id: form.station_id || null,
        telephone: form.telephone.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
      });

      if (res.ok) {
        if (onCreated) onCreated(res);
        onClose();
      } else {
        setErr(res.error || "Échec de création du collaborateur.");
      }
    } catch (ex) {
      setErr(ex.message || "Erreur lors de la création.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
        <div className="px-5 py-4 bg-[#56216C] text-white flex items-center justify-between">
          <div className="font-bold text-sm flex items-center gap-2">
            <span>👤</span>
            <span>Nouveau Collaborateur &amp; Création Automatique de Compte</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white font-bold text-base"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {err && (
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
              ⚠️ {err}
            </div>
          )}

          <div>
            <label className="block text-gray-700 font-bold mb-1">Nom et Prénom du Collaborateur *</label>
            <input
              type="text"
              required
              placeholder="ex: Mamadou Ndiaye"
              value={form.nom_complet}
              onChange={(e) => onNomChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 bg-white"
              style={{ borderColor: T.line }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-bold mb-1">Profil / Métier *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs bg-white font-medium"
                style={{ borderColor: T.line }}
              >
                <option value="pompiste">⛽ Pompiste (Piste &amp; Descente)</option>
                <option value="lavage">🚿 Agent de Lavage</option>
                <option value="boutique">🛍️ Vendeur Boutique</option>
                <option value="stock">📦 Responsable Stock</option>
                <option value="maintenance">🔧 Technicien Maintenance</option>
                <option value="gerant">📋 Gérant de Station</option>
                <option value="comptable">📊 Comptable</option>
                <option value="commercial">🤝 Commercial</option>
                <option value="superviseur">🛡️ Superviseur Réseau</option>
                <option value="directeur">🏢 Directeur</option>
                <option value="admin">👑 Administrateur</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-1">Station d'affectation</label>
              <select
                value={form.station_id}
                onChange={(e) => setForm({ ...form, station_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs bg-white font-medium"
                style={{ borderColor: T.line }}
              >
                <option value="">(Tout le Réseau / Siège)</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.nom} ({st.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Numéro de Téléphone (Optionnel)</label>
            <input
              type="tel"
              placeholder="ex: 77 123 45 67"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-xs bg-white"
              style={{ borderColor: T.line }}
            />
          </div>

          <div className="pt-2 border-t space-y-2" style={{ borderColor: T.line }}>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Identifiants de Connexion Automatiques
            </div>

            <div>
              <label className="block text-gray-600 font-medium mb-0.5">Adresse e-mail de connexion</label>
              <input
                type="email"
                required
                placeholder="prenom.nom@starenergy.sn"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs font-mono bg-slate-50"
                style={{ borderColor: T.line }}
              />
            </div>

            <div>
              <label className="block text-gray-600 font-medium mb-0.5">Mot de passe temporaire (ou code PIN)</label>
              <input
                type="text"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs font-mono bg-slate-50"
                style={{ borderColor: T.line }}
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Le collaborateur utilisera cet e-mail et ce mot de passe (ou son PIN) pour se connecter immédiatement sur sa session métier.
            </p>
          </div>

          <div className="pt-3 border-t flex items-center justify-end gap-2" style={{ borderColor: T.line }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-lg bg-[#56216C] hover:bg-[#431454] text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50"
            >
              {busy ? "Génération en cours…" : "✓ Créer le Collaborateur & Compte"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
