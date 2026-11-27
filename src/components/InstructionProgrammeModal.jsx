import { useState, useMemo } from "react";
import { F, n, todayISO } from "../lib/calcul";
import { badgeStatutProgramme } from "../lib/programmes-bons";

export default function InstructionProgrammeModal({
  programme,
  onClose,
  onInstruction,
}) {
  if (!programme) return null;

  const [modeAction, setModeAction] = useState("VALIDER"); // VALIDER | AJUSTER | INFO_DEMANDEE | CORRIGER | REFUSER | SUSPENDRE | REACTIVER | CLOTURER
  const [volumeAutorise, setVolumeAutorise] = useState(
    (programme.volume_autorise_l ?? programme.volume_demande_l ?? 5000).toString()
  );
  const [dateDebut, setDateDebut] = useState(programme.date_debut || todayISO());
  const [dateFin, setDateFin] = useState(programme.date_fin || todayISO());
  const [modeGestion, setModeGestion] = useState(programme.mode_gestion || "VOLUME_GLOBAL");
  const [conditionsParticulieres, setConditionsParticulieres] = useState(
    programme.conditions_particulieres || ""
  );
  const [motifAction, setMotifAction] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Transporteurs
  const [transporteurs, setTransporteurs] = useState(
    Array.isArray(programme.transporteurs) ? programme.transporteurs : []
  );

  const totalAutorise = n(volumeAutorise);
  const sommeQuotas = useMemo(() => {
    return transporteurs.reduce((acc, t) => acc + (n(t.volume_alloue_l) || 0), 0);
  }, [transporteurs]);
  const ecartQuota = totalAutorise - sommeQuotas;

  const handleUpdateTrans = (id, field, value) => {
    setTransporteurs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const handleToggleActifTrans = (id) => {
    setTransporteurs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, actif: !t.actif } : t))
    );
  };

  const handleExecuterDecision = () => {
    setErrorMsg("");

    if (modeAction === "REFUSER" && !motifAction.trim()) {
      setErrorMsg("Veuillez obligatoirement motiver le refus pour en informer le client.");
      return;
    }
    if ((modeAction === "INFO_DEMANDEE" || modeAction === "CORRIGER") && !motifAction.trim()) {
      setErrorMsg("Veuillez préciser au client quelles informations ou corrections sont attendues.");
      return;
    }
    if ((modeAction === "VALIDER" || modeAction === "AJUSTER") && totalAutorise <= 0) {
      setErrorMsg("Le volume autorisé doit être supérieur à 0 L.");
      return;
    }
    if (
      (modeAction === "VALIDER" || modeAction === "AJUSTER") &&
      modeGestion === "PLAFONDS_INDIVIDUELS" &&
      ecartQuota !== 0
    ) {
      setErrorMsg(`En mode plafonds individuels, la somme des quotas attribués (${F(sommeQuotas)} L) doit être égale au volume autorisé (${F(totalAutorise)} L).`);
      return;
    }

    let nouveauStatut = programme.statut;
    if (modeAction === "VALIDER" || modeAction === "AJUSTER") {
      nouveauStatut = "ACTIF";
    } else if (modeAction === "INFO_DEMANDEE") {
      nouveauStatut = "INFO_DEMANDEE";
    } else if (modeAction === "CORRIGER") {
      nouveauStatut = "A_CORRIGER";
    } else if (modeAction === "REFUSER") {
      nouveauStatut = "REFUSE";
    } else if (modeAction === "SUSPENDRE") {
      nouveauStatut = "SUSPENDU";
    } else if (modeAction === "REACTIVER") {
      nouveauStatut = "ACTIF";
    } else if (modeAction === "CLOTURER") {
      nouveauStatut = "CLOTURE";
    }

    const patch = {
      statut: nouveauStatut,
      volume_autorise_l: totalAutorise,
      date_debut: dateDebut,
      date_fin: dateFin,
      mode_gestion: modeGestion,
      conditions_particulieres: conditionsParticulieres.trim(),
      motif_action: motifAction.trim(),
      transporteurs: transporteurs.map((t) => ({
        ...t,
        volume_alloue_l: n(t.volume_alloue_l),
      })),
      action_log: `DECISION_${modeAction}`,
    };

    onInstruction(programme.id, patch);
  };

  const badge = badgeStatutProgramme(programme.statut);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-2xl border my-6 text-gray-900 border-gray-200 flex flex-col max-h-[92vh]">
        {/* Entête */}
        <div className="flex justify-between items-start pb-3 border-b mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">⚖️</span>
              <h2 className="text-base sm:text-lg font-black text-gray-900">
                Instruction Gérant — Programme {programme.numero_programme}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badge.color}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Client : <strong className="text-blue-950 font-bold">{programme.client_nom}</strong> ({programme.client_code})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1 rounded-lg hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Corps */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
          {/* Onglets de décision */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setModeAction("VALIDER")}
              className={`py-1.5 px-3 rounded-lg font-black transition ${
                modeAction === "VALIDER" ? "bg-emerald-600 text-white shadow-xs" : "text-gray-700 hover:bg-white"
              }`}
            >
              ✅ Valider &amp; Activer
            </button>
            <button
              type="button"
              onClick={() => setModeAction("AJUSTER")}
              className={`py-1.5 px-3 rounded-lg font-black transition ${
                modeAction === "AJUSTER" ? "bg-blue-600 text-white shadow-xs" : "text-gray-700 hover:bg-white"
              }`}
            >
              ✏️ Ajuster Quota / Flotte
            </button>
            <button
              type="button"
              onClick={() => setModeAction("INFO_DEMANDEE")}
              className={`py-1.5 px-3 rounded-lg font-black transition ${
                modeAction === "INFO_DEMANDEE" ? "bg-sky-600 text-white shadow-xs" : "text-gray-700 hover:bg-white"
              }`}
            >
              💬 Demander Infos
            </button>
            <button
              type="button"
              onClick={() => setModeAction("CORRIGER")}
              className={`py-1.5 px-3 rounded-lg font-black transition ${
                modeAction === "CORRIGER" ? "bg-orange-600 text-white shadow-xs" : "text-gray-700 hover:bg-white"
              }`}
            >
              ↩️ À Corriger
            </button>
            <button
              type="button"
              onClick={() => setModeAction("REFUSER")}
              className={`py-1.5 px-3 rounded-lg font-black transition ${
                modeAction === "REFUSER" ? "bg-rose-600 text-white shadow-xs" : "text-gray-700 hover:bg-white"
              }`}
            >
              ❌ Refuser
            </button>
            {programme.statut === "ACTIF" && (
              <button
                type="button"
                onClick={() => setModeAction("SUSPENDRE")}
                className={`py-1.5 px-3 rounded-lg font-black transition ${
                  modeAction === "SUSPENDRE" ? "bg-rose-700 text-white shadow-xs" : "text-gray-700 hover:bg-white"
                }`}
              >
                ⏸️ Suspendre
              </button>
            )}
            {programme.statut === "SUSPENDU" && (
              <button
                type="button"
                onClick={() => setModeAction("REACTIVER")}
                className={`py-1.5 px-3 rounded-lg font-black transition ${
                  modeAction === "REACTIVER" ? "bg-emerald-700 text-white shadow-xs" : "text-gray-700 hover:bg-white"
                }`}
              >
                ▶️ Réactiver
              </button>
            )}
          </div>

          {/* Synthèse de la demande client */}
          <div className="p-3 bg-slate-50 border rounded-xl border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <span className="text-[10px] text-gray-500 uppercase block font-semibold">Volume Demandé</span>
              <strong className="text-gray-900 text-sm font-black">{F(programme.volume_demande_l)} L</strong>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block font-semibold">Volume Consommé</span>
              <strong className="text-blue-900 text-sm font-black">{F(programme.volume_consomme_l || 0)} L</strong>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block font-semibold">Carburant</span>
              <strong className="text-gray-900">{programme.produit}</strong>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block font-semibold">Objet</span>
              <span className="font-semibold text-gray-800 line-clamp-1">{programme.objet_demande}</span>
            </div>
          </div>

          {/* Formulaire de validation / ajustement */}
          {(modeAction === "VALIDER" || modeAction === "AJUSTER") && (
            <div className="space-y-3 p-3 bg-blue-50/50 border border-blue-200 rounded-xl">
              <span className="font-bold text-xs uppercase text-blue-950 tracking-wider block">
                Paramètres d'Autorisation Définitifs Fixés par le Gérant
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-blue-950 uppercase mb-1">
                    Volume Autorisé Accordé (Litres) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={volumeAutorise}
                    onChange={(e) => setVolumeAutorise(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 font-black text-blue-950 bg-white border-blue-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Date Début Validité</label>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Date Expiration</label>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300 font-semibold"
                  />
                </div>
              </div>

              {/* Mode de gestion */}
              <div>
                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">
                  Mode de Gestion à la Pompe
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`p-2 rounded-lg border cursor-pointer font-bold flex items-center gap-2 ${
                    modeGestion === "VOLUME_GLOBAL" ? "bg-blue-100 border-blue-500 text-blue-950" : "bg-white border-gray-300"
                  }`}>
                    <input
                      type="radio"
                      name="instModeGestion"
                      checked={modeGestion === "VOLUME_GLOBAL"}
                      onChange={() => setModeGestion("VOLUME_GLOBAL")}
                    />
                    <span>1. Enveloppe Globale Partagée</span>
                  </label>
                  <label className={`p-2 rounded-lg border cursor-pointer font-bold flex items-center gap-2 ${
                    modeGestion === "PLAFONDS_INDIVIDUELS" ? "bg-blue-100 border-blue-500 text-blue-950" : "bg-white border-gray-300"
                  }`}>
                    <input
                      type="radio"
                      name="instModeGestion"
                      checked={modeGestion === "PLAFONDS_INDIVIDUELS"}
                      onChange={() => setModeGestion("PLAFONDS_INDIVIDUELS")}
                    />
                    <span>2. Plafonds Individuels Stricts</span>
                  </label>
                </div>
              </div>

              {/* Ajustement des transporteurs */}
              <div className="pt-2">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-bold text-[11px] text-gray-900 uppercase">
                    Transporteurs &amp; Quotas Individuels ({transporteurs.length}) :
                  </span>
                  {modeGestion === "PLAFONDS_INDIVIDUELS" && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                      ecartQuota === 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    }`}>
                      Somme Quotas : {F(sommeQuotas)} L / {F(totalAutorise)} L (Écart : {ecartQuota} L)
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {transporteurs.map((t, idx) => (
                    <div key={t.id || idx} className="p-2 bg-white border rounded-lg flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="checkbox"
                          checked={t.actif !== false}
                          onChange={() => handleToggleActifTrans(t.id)}
                          title="Habiliter / Suspendre ce transporteur"
                        />
                        <div>
                          <strong className="font-mono text-xs">{t.immatriculation}</strong>
                          <span className="text-[11px] text-gray-600 ml-1.5">({t.nom_prenom})</span>
                        </div>
                      </div>

                      {modeGestion === "PLAFONDS_INDIVIDUELS" && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">Quota (L) :</span>
                          <input
                            type="number"
                            value={t.volume_alloue_l}
                            onChange={(e) => handleUpdateTrans(t.id, "volume_alloue_l", e.target.value)}
                            className="w-20 text-xs border rounded p-1 font-bold text-right"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Saisie de message pour le client si refus / demande d'infos / correction */}
          {(modeAction === "INFO_DEMANDEE" || modeAction === "CORRIGER" || modeAction === "REFUSER") && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-amber-950">
                {modeAction === "REFUSER"
                  ? "Motif du Refus (transmis au client) *"
                  : modeAction === "INFO_DEMANDEE"
                  ? "Informations complémentaires demandées au client *"
                  : "Corrections attendues du client *"}
              </label>
              <textarea
                rows={3}
                placeholder={
                  modeAction === "REFUSER"
                    ? "ex: Dépassement de la limite d'encours de crédit autorisée. Veuillez régulariser les factures antérieures."
                    : "ex: Veuillez préciser le numéro de téléphone et la copie de la carte grise pour le véhicule SD-4501."
                }
                value={motifAction}
                onChange={(e) => setMotifAction(e.target.value)}
                className="w-full text-xs border rounded-lg p-2 bg-white border-amber-300"
                required
              />
            </div>
          )}

          {/* Historique des validations passées */}
          {Array.isArray(programme.historique_validations) && programme.historique_validations.length > 0 && (
            <div className="pt-2 border-t">
              <span className="font-bold text-[11px] text-gray-600 uppercase block mb-1.5">
                Historique des Décisions &amp; Échanges :
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {programme.historique_validations.map((h, hIdx) => (
                  <div key={hIdx} className="p-2 bg-gray-50 border rounded-lg text-[11px] flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-gray-900">{h.action || "Action"}</strong>
                      <span className="text-gray-500 ml-1.5">par {h.auteur || "Gérant"}</span>
                      {h.motif && <p className="text-gray-700 italic mt-0.5">« {h.motif} »</p>}
                    </div>
                    <span className="text-gray-400 font-mono text-[10px] shrink-0">
                      {h.date ? new Date(h.date).toLocaleDateString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Boutons d'action */}
        <div className="pt-3 border-t mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition text-xs"
          >
            Fermer
          </button>

          <button
            type="button"
            onClick={handleExecuterDecision}
            className={`px-5 py-2 rounded-xl text-white font-black text-xs shadow-md transition flex items-center gap-1.5 ${
              modeAction === "VALIDER" || modeAction === "REACTIVER"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : modeAction === "REFUSER" || modeAction === "SUSPENDRE"
                ? "bg-rose-600 hover:bg-rose-700"
                : modeAction === "CLOTURER"
                ? "bg-gray-800 hover:bg-black"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <span>⚡ Exécuter la Décision ({modeAction})</span>
          </button>
        </div>
      </div>
    </div>
  );
}
