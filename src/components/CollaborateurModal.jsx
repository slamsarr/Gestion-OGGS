import { useState, useEffect } from "react";
import { creerCollaborateur, loadReferentiel } from "../lib/api";
import { ROLE_LABELS } from "../lib/permissions";
import { T, todayISO } from "../lib/calcul";

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
  const [successData, setSuccessData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [ref, setRef] = useState(null);
  
  // Quart assignment state
  const [showQuartConfig, setShowQuartConfig] = useState(false);
  const [quartAssignment, setQuartAssignment] = useState({
    quarts: [], // ['MATIN', 'APRES-MIDI', 'SOIR', 'NUIT']
    pistolets: [], // ['gasoil1', 'gasoil2', ...]
    date_affectation: todayISO(),
  });

  useEffect(() => {
    if (defaultStationId) {
      setForm((prev) => ({ ...prev, station_id: defaultStationId }));
    }
  }, [defaultStationId]);

  useEffect(() => {
    if (isOpen) {
      loadReferentiel().then(setRef).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setSuccessData(null);
    setCopied(false);
    setErr("");
    onClose();
  };

  const copyCreds = () => {
    if (!successData) return;
    const text = `Identifiants OGGS / Star Energy :\nNom : ${successData.nom}\nProfil : ${ROLE_LABELS[successData.role] || successData.role}\nEmail : ${successData.email}\nMot de passe : ${successData.password}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

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

  const toggleQuart = (quart) => {
    setQuartAssignment((prev) => ({
      ...prev,
      quarts: prev.quarts.includes(quart)
        ? prev.quarts.filter((q) => q !== quart)
        : [...prev.quarts, quart],
    }));
  };

  const togglePistolet = (pistolet) => {
    setQuartAssignment((prev) => ({
      ...prev,
      pistolets: prev.pistolets.includes(pistolet)
        ? prev.pistolets.filter((p) => p !== pistolet)
        : [...prev.pistolets, pistolet],
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
        // Include quart assignment for pompistes
        quart_config: form.role === "pompiste" ? quartAssignment : null,
      });

      if (res.ok) {
        if (onCreated) onCreated(res);
        setSuccessData(res.identifiants);
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
            <span>{successData ? "Compte Collaborateur Créé" : "Nouveau Collaborateur & Création Automatique de Compte"}</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-white/80 hover:text-white font-bold text-base"
          >
            ✕
          </button>
        </div>

        {successData ? (
          <div className="p-6 space-y-4 text-xs">
            <div className="text-center space-y-1.5 pb-2 border-b border-gray-100">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-black shadow-inner">
                ✓
              </div>
              <h3 className="text-base font-black text-gray-900">
                Compte Collaborateur Opérationnel !
              </h3>
              <p className="text-xs text-gray-500">
                Le compte a été créé avec succès et configuré pour le profil <span className="font-bold text-purple-900">{ROLE_LABELS[successData.role] || successData.role}</span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200 space-y-2.5">
              <div className="text-[11px] font-bold text-purple-950 uppercase tracking-wide flex items-center justify-between">
                <span>Identifiants d'accès</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Actif</span>
              </div>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-purple-100">
                  <span className="text-gray-600 font-medium">Nom complet :</span>
                  <span className="font-bold text-gray-900">{successData.nom}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-purple-100">
                  <span className="text-gray-600 font-medium">Profil Métier :</span>
                  <span className="font-bold text-purple-900">{ROLE_LABELS[successData.role] || successData.role}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-purple-100">
                  <span className="text-gray-600 font-medium">Email de connexion :</span>
                  <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-purple-200">{successData.email}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-600 font-medium">Mot de passe temporaire :</span>
                  <span className="font-mono font-black text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">{successData.password}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 italic">
              💡 Transmettez ces identifiants au collaborateur pour qu'il puisse immédiatement se connecter à son interface dédiée.
            </p>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-gray-100">
              <button
                type="button"
                onClick={copyCreds}
                className="px-4 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs flex items-center gap-1.5 transition-colors border border-purple-200"
              >
                <span>{copied ? "✓ Identifiants Copiés !" : "📋 Copier les identifiants"}</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-[#56216C] hover:bg-[#431454] text-white font-bold text-xs shadow-md transition-colors"
              >
                Terminer &amp; Fermer
              </button>
            </div>
          </div>
        ) : (
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
                  onChange={(e) => {
                    setForm({ ...form, role: e.target.value });
                    // Reset quart config when role changes
                    if (e.target.value !== "pompiste") {
                      setShowQuartConfig(false);
                    }
                  }}
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

            {/* Quart Configuration for Pompistes */}
            {form.role === "pompiste" && (
              <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-xs text-amber-900 flex items-center gap-1.5">
                    <span>⏰</span>
                    <span>Configuration des Quarts & Pistolets</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuartConfig(!showQuartConfig)}
                    className="text-xs px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 font-medium hover:bg-amber-100"
                  >
                    {showQuartConfig ? "Masquer" : "Configurer"}
                  </button>
                </div>

                {showQuartConfig && (
                  <div className="space-y-3">
                    {/* Quarts selection */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Quarts de travail</label>
                      <div className="flex flex-wrap gap-2">
                        {["MATIN", "APRES-MIDI", "SOIR", "NUIT"].map((quart) => (
                          <button
                            key={quart}
                            type="button"
                            onClick={() => toggleQuart(quart)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              quartAssignment.quarts.includes(quart)
                                ? "bg-amber-500 text-white border-amber-600"
                                : "bg-white text-gray-700 border-gray-300 hover:border-amber-400"
                            }`}
                          >
                            {quart}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pistolets assignment */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Pistolets assignés</label>
                      <div className="flex flex-wrap gap-2">
                        {ref?.pistolets
                          ?.filter((p) => !form.station_id || p.station_id === form.station_id)
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => togglePistolet(p.code)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                quartAssignment.pistolets.includes(p.code)
                                  ? "bg-blue-500 text-white border-blue-600"
                                  : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                              }`}
                            >
                              {p.code}
                            </button>
                          ))}
                      </div>
                      {quartAssignment.pistolets.length > 0 && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          {quartAssignment.pistolets.length} pistolet(s) sélectionné(s)
                        </p>
                      )}
                    </div>

                    {/* Date d'affectation */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date d'affectation</label>
                      <input
                        type="date"
                        value={quartAssignment.date_affectation}
                        onChange={(e) => setQuartAssignment({ ...quartAssignment, date_affectation: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-xs bg-white"
                        style={{ borderColor: T.line }}
                      />
                    </div>
                  </div>
                )}

                {!showQuartConfig && (
                  <p className="text-[11px] text-gray-500 italic">
                    Cliquez sur "Configurer" pour définir les quarts et pistolets assignés à ce pompiste.
                  </p>
                )}
              </div>
            )}

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
                onClick={handleClose}
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
        )}
      </div>
    </div>
  );
}
