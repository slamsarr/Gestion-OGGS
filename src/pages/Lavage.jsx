import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, createPrestationLavage, listPrestationsLavage, deletePrestationLavage } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function Lavage() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const [tarifs, setTarifs] = useState([]);
  const [prestations, setPrestations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Formulaire d'encaissement direct d'un lavage
  const [date, setDate] = useState(todayISO());
  const [typeVehicule, setTypeVehicule] = useState("BERLINE");
  const [immatriculation, setImmatriculation] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [modePaiement, setModePaiement] = useState("ESPECES");
  const [agent, setAgent] = useState(profil?.nom_complet || "Agent Lavage");
  const [ticketModal, setTicketModal] = useState(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const buildLavageReceiptText = (p) => {
    const dateStr = fmtDate(p.date || todayISO());
    const heureStr = p.created_at ? new Date(p.created_at).toLocaleTimeString().slice(0, 5) : new Date().toLocaleTimeString().slice(0, 5);
    return `*🚿 TICKET DE LAVAGE AUTOMOBILE - STATION ${stationId.replace("st-", "").toUpperCase()}*
----------------------------------------
📅 *Date :* ${dateStr} à ${heureStr}
🚗 *Véhicule :* ${p.libelle_vehicule || p.type_vehicule}
🔢 *Immatriculation :* ${p.immatriculation || "N/A"}
----------------------------------------
💰 *Tarif Unitaire :* ${F(p.tarif_unitaire)} FCFA
📦 *Quantité :* ${p.quantite || 1}
👉 *MONTANT RÉGLÉ :* *${F(p.montant_total)} FCFA*
💳 *Règlement :* ${p.mode_paiement}
👤 *Opérateur :* ${p.agent || "Agent Lavage"}
----------------------------------------
✨ *Merci de votre visite et bonne route !*`;
  };

  const shareLavageWhatsApp = (p) => {
    const text = buildLavageReceiptText(p);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const loadData = async () => {
    try {
      const ref = await loadReferentiel();
      const tfs = ref?.tarifs_lavage || [];
      setTarifs(tfs);
      if (tfs.length > 0 && !typeVehicule) {
        setTypeVehicule(tfs[0].code);
      }
      const p = await listPrestationsLavage(stationId, date);
      setPrestations(p || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId, date]);

  if (loading) return <Loading label="Chargement du module Lavage automobile..." />;

  const currentTarifObj = tarifs.find((t) => t.code === typeVehicule) || tarifs[0] || { tarif: 0, libelle: "" };
  const tarifUnitaire = currentTarifObj?.tarif || 0;
  const montantTotal = (n(quantite) || 1) * tarifUnitaire;

  const handleEnregistrer = async (e) => {
    e.preventDefault();
    const qte = n(quantite) || 1;
    const payload = {
      station_id: stationId,
      date,
      agent,
      type_vehicule: typeVehicule,
      libelle_vehicule: currentTarifObj?.libelle,
      immatriculation: immatriculation.trim().toUpperCase() || "NON RENSEIGNÉE",
      quantite: qte,
      tarif_unitaire: tarifUnitaire,
      montant_total: montantTotal,
      mode_paiement: modePaiement,
    };

    const res = await createPrestationLavage(payload);
    if (res.ok) {
      flash("Prestation de lavage enregistrée ! Reçu généré.");
      setTicketModal(payload);
      setImmatriculation("");
      setQuantite(1);
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement");
    }
  };

  const handleSupprimer = async (id) => {
    if (!confirm("Annuler cette prestation ?")) return;
    await deletePrestationLavage(id);
    flash("Prestation supprimée");
    loadData();
  };

  // Statistiques du jour
  const totalRecetteJour = prestations.reduce((sum, p) => sum + (n(p.montant_total) || 0), 0);
  const totalVehiculesJour = prestations.reduce((sum, p) => sum + (n(p.quantite) || 1), 0);

  const parMode = prestations.reduce((acc, p) => {
    const m = p.mode_paiement || "ESPECES";
    acc[m] = (acc[m] || 0) + (n(p.montant_total) || 0);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
            🚿 Lavage Automobile
          </h1>
          <p className="text-xs" style={{ color: T.muted }}>
            Enregistrement des prestations, encaissement au tarif unitaire et suivi des recettes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium" style={{ color: T.muted }}>Date :</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white"
            style={{ borderColor: T.line }}
          />
        </div>
      </div>

      {msg && (
        <div className="mb-3 p-2.5 text-xs rounded font-medium" style={{ background: "#E3F4EA", color: T.ok }}>
          {msg}
        </div>
      )}

      {/* Cartes KPI du jour */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg p-3 border shadow-sm" style={{ borderColor: T.line }}>
          <span className="text-[11px] font-medium text-gray-500 block">Total Véhicules Lavés</span>
          <span className="text-xl font-extrabold text-blue-900 tabular">{totalVehiculesJour}</span>
        </div>
        <div className="bg-white rounded-lg p-3 border shadow-sm" style={{ borderColor: T.line }}>
          <span className="text-[11px] font-medium text-gray-500 block">Recette Lavage du Jour</span>
          <span className="text-xl font-extrabold text-emerald-700 tabular">{F(totalRecetteJour)} FCFA</span>
        </div>
        <div className="bg-white rounded-lg p-3 border shadow-sm col-span-2 sm:col-span-1" style={{ borderColor: T.line }}>
          <span className="text-[11px] font-medium text-gray-500 block">Ventilation Paiements</span>
          <div className="text-[11px] text-gray-600 mt-0.5 space-y-0.5">
            <div>Espèces : <strong className="tabular">{F(parMode.ESPECES || 0)} F</strong></div>
            <div>Wave / OM : <strong className="tabular">{F((parMode.WAVE || 0) + (parMode.ORANGE_MONEY || 0))} F</strong></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Formulaire de saisie rapide */}
        <div className="md:col-span-1">
          <form onSubmit={handleEnregistrer} className="bg-white rounded-lg border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
              + Nouveau Lavage
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Catégorie Véhicule</label>
                <select
                  value={typeVehicule}
                  onChange={(e) => setTypeVehicule(e.target.value)}
                  className="w-full text-xs border rounded p-2 bg-white"
                  style={{ borderColor: T.line }}
                >
                  {tarifs.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.libelle} ({F(t.tarif)} F)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Immatriculation (optionnel)</label>
                <input
                  type="text"
                  placeholder="ex: AA-123-BB"
                  value={immatriculation}
                  onChange={(e) => setImmatriculation(e.target.value)}
                  className="w-full text-xs border rounded p-2 uppercase"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={quantite}
                    onChange={(e) => setQuantite(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-xs border rounded p-2 text-center"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Paiement</label>
                  <select
                    value={modePaiement}
                    onChange={(e) => setModePaiement(e.target.value)}
                    className="w-full text-xs border rounded p-2 bg-white"
                    style={{ borderColor: T.line }}
                  >
                    <option value="ESPECES">💵 Espèces</option>
                    <option value="WAVE">📲 Wave</option>
                    <option value="ORANGE_MONEY">🍊 Orange Money</option>
                    <option value="CARTE">💳 Carte bancaire</option>
                    <option value="BON_LAVAGE">📝 Bon / Crédit</option>
                  </select>
                </div>
              </div>

              <div className="p-2.5 rounded bg-blue-50 border border-blue-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">Montant à encaisser :</span>
                <span className="text-base font-extrabold text-blue-900 tabular">{F(montantTotal)} FCFA</span>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90"
                style={{ background: T.gold }}
              >
                ✓ Encaisser et Enregistrer
              </button>
            </div>
          </form>
        </div>

        {/* Tableau des prestations de la journée */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg border shadow-sm p-4" style={{ borderColor: T.line }}>
            <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
              Prestations du {fmtDate(date)} ({prestations.length})
            </h2>

            {prestations.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">Aucun lavage enregistré pour cette date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                      <th className="pb-2">Heure / Véhicule</th>
                      <th className="pb-2">Immatriculation</th>
                      <th className="pb-2">Paiement</th>
                      <th className="pb-2 text-right">Montant</th>
                      <th className="pb-2 text-center">Reçu / Ticket</th>
                      <th className="pb-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: T.line }}>
                    {prestations.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="py-2.5">
                          <div className="font-semibold">{p.libelle_vehicule || p.type_vehicule}</div>
                          <div className="text-[10px] text-gray-400">
                            {p.created_at ? new Date(p.created_at).toLocaleTimeString().slice(0, 5) : "--:--"} · {p.agent}
                          </div>
                        </td>
                        <td className="py-2.5 font-mono text-gray-700">{p.immatriculation}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100">
                            {p.mode_paiement}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-bold tabular">{F(p.montant_total)} F</td>
                        <td className="py-2.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setTicketModal(p)}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-white text-gray-700 hover:bg-gray-50 shadow-xs"
                              style={{ borderColor: T.line }}
                              title="Voir / Imprimer le reçu"
                            >
                              🧾 Reçu
                            </button>
                            <button
                              type="button"
                              onClick={() => shareLavageWhatsApp(p)}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                              title="Envoyer le reçu sur WhatsApp"
                            >
                              📲 WhatsApp
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleSupprimer(p.id)}
                            className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 rounded"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL REÇU CLIENT LAVAGE */}
      {ticketModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border border-gray-200">
            <div className="p-3 bg-blue-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🚿</span>
                <span className="font-bold text-xs">Reçu de Caisse Lavage</span>
              </div>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="text-blue-200 hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-5 font-mono text-xs text-gray-800 space-y-3 bg-[#FCFCFC]" id="lavage-ticket">
              <div className="text-center border-b pb-2 border-dashed border-gray-300">
                <div className="text-sm font-black tracking-wider">STATION SERVICE {stationId.replace("st-", "").toUpperCase()}</div>
                <div className="text-[10px] text-gray-500">SERVICE LAVAGE AUTOMOBILE HAUTE PRESSION</div>
                <div className="text-[11px] font-bold mt-1">REÇU DE PAIEMENT CLIENT</div>
                <div className="text-[10px] text-gray-400">
                  {fmtDate(ticketModal.date || todayISO())} · {ticketModal.created_at ? new Date(ticketModal.created_at).toLocaleTimeString() : new Date().toLocaleTimeString()}
                </div>
              </div>

              <div className="space-y-1 border-b pb-2 border-dashed border-gray-300 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Véhicule :</span>
                  <span className="font-bold">{ticketModal.libelle_vehicule || ticketModal.type_vehicule}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Immatriculation :</span>
                  <span className="font-bold">{ticketModal.immatriculation || "NON RENSEIGNÉE"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Agent :</span>
                  <span>{ticketModal.agent || "Agent Lavage"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Paiement :</span>
                  <span className="font-semibold">{ticketModal.mode_paiement}</span>
                </div>
              </div>

              <div className="space-y-1 text-xs pt-1 border-b pb-2 border-dashed border-gray-300">
                <div className="flex justify-between text-gray-600">
                  <span>Prestation Lavage (x{ticketModal.quantite || 1}) :</span>
                  <span className="tabular">{F(ticketModal.tarif_unitaire)} F</span>
                </div>
                <div className="flex justify-between font-black text-blue-950 text-sm pt-1">
                  <span>TOTAL RÉGLÉ :</span>
                  <span className="tabular">{F(ticketModal.montant_total)} FCFA</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-gray-500 pt-1">
                Merci pour votre fidélité ! Bonne route !
              </div>
            </div>

            <div className="p-3 bg-gray-50 border-t flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-800 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-sm"
              >
                🖨️ Imprimer
              </button>
              <button
                type="button"
                onClick={() => shareLavageWhatsApp(ticketModal)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm"
              >
                📲 WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}