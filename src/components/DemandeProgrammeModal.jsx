import { useState, useMemo } from "react";
import { F, n, todayISO, prixDuJour } from "../lib/calcul";
import { genererNumeroProgramme, MODES_GESTION_PROGRAMME } from "../lib/programmes-bons";

export default function DemandeProgrammeModal({
  client = null,
  clientCode = "",
  clientNom = "",
  programmeInitial = null,
  programmeEnEdition = null,
  stations = [],
  prixCarburant = [],
  onClose,
  onSave,
  isClient = true,
}) {
  const progInit = programmeInitial || programmeEnEdition || null;
  const clientObj = client || {
    code: clientCode,
    nom_entreprise: clientNom || clientCode,
    nom: clientNom || clientCode,
  };
  const isEdit = !!progInit;
  const isClientPro = isClient;

  const [numeroProgramme] = useState(
    progInit?.numero_programme || genererNumeroProgramme(progInit?.date_debut || todayISO())
  );
  const [objetDemande, setObjetDemande] = useState(progInit?.objet_demande || progInit?.objet || "");
  const [demandeurNom, setDemandeurNom] = useState(
    progInit?.demandeur_nom || clientObj?.responsable_compte?.nom || clientObj?.nom_entreprise || clientObj?.nom || ""
  );
  const [demandeurContact, setDemandeurContact] = useState(
    progInit?.demandeur_contact || clientObj?.responsable_compte?.telephone || clientObj?.telephone || ""
  );
  const [dateDebut, setDateDebut] = useState(progInit?.date_debut || todayISO());
  const [dateFin, setDateFin] = useState(
    progInit?.date_fin ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [produit, setProduit] = useState(progInit?.produit || progInit?.type_carburant || "GASOIL");
  const [volumeDemande, setVolumeDemande] = useState(
    progInit?.volume_demande_l ? progInit.volume_demande_l.toString() : progInit?.volume_total_demande ? progInit.volume_total_demande.toString() : "5000"
  );
  const [modeGestion, setModeGestion] = useState(
    progInit?.mode_gestion || "VOLUME_GLOBAL"
  );
  const [conditionsParticulieres, setConditionsParticulieres] = useState(
    progInit?.conditions_particulieres || ""
  );

  // Flotte Transporteurs / Véhicules
  const [transporteurs, setTransporteurs] = useState(
    Array.isArray(progInit?.transporteurs) && progInit.transporteurs.length > 0
      ? progInit.transporteurs
      : [
          {
            id: `tr-${Date.now()}-1`,
            nom_prenom: "",
            telephone: "",
            immatriculation: "",
            type_vehicule: "CAMION",
            carburant: progInit?.produit || progInit?.type_carburant || "GASOIL",
            volume_alloue_l: "5000",
            observations: "",
            actif: true,
          },
        ]
  );

  const [activeStep, setActiveStep] = useState(1); // 1: Général & Carburant, 2: Flotte Transporteurs, 3: Récapitulatif
  const [errorMsg, setErrorMsg] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Prix unitaire et montant estimé
  const pu = useMemo(() => {
    return prixDuJour(prixCarburant || [], produit, dateDebut) || (produit === "GASOIL" ? 755 : 990);
  }, [prixCarburant, produit, dateDebut]);

  const montantEstime = useMemo(() => {
    return Math.round(n(volumeDemande) * pu);
  }, [volumeDemande, pu]);

  // Somme des volumes alloués aux transporteurs
  const sommeVolumesTransporteurs = useMemo(() => {
    return transporteurs.reduce((acc, t) => acc + (n(t.volume_alloue_l) || 0), 0);
  }, [transporteurs]);

  const volumeTotal = n(volumeDemande);
  const ecartRepartition = volumeTotal - sommeVolumesTransporteurs;
  const isRepartitionCoherente = modeGestion === "VOLUME_GLOBAL" || ecartRepartition === 0;

  // Gestion des transporteurs
  const handleAddTransporteur = () => {
    const nextIdx = transporteurs.length + 1;
    const resteAAttribuer = Math.max(0, ecartRepartition);
    setTransporteurs([
      ...transporteurs,
      {
        id: `tr-${Date.now()}-${nextIdx}`,
        nom_prenom: "",
        telephone: "",
        immatriculation: "",
        type_vehicule: "CAMION",
        carburant: produit,
        volume_alloue_l: resteAAttribuer > 0 ? resteAAttribuer.toString() : "0",
        observations: "",
        actif: true,
      },
    ]);
  };

  const handleUpdateTransporteur = (id, field, value) => {
    setTransporteurs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const handleRemoveTransporteur = (id) => {
    if (transporteurs.length <= 1) {
      setErrorMsg("Le programme doit comporter au moins un transporteur / véhicule autorisé.");
      return;
    }
    setTransporteurs((prev) => prev.filter((t) => t.id !== id));
  };

  // Validation avant soumission
  const validerFormulaire = () => {
    setErrorMsg("");
    if (!objetDemande.trim()) {
      setErrorMsg("Veuillez renseigner l'objet ou le motif de la demande (ex: Chantier TER, Flotte Camions...)");
      return false;
    }
    if (volumeTotal <= 0) {
      setErrorMsg("Le volume total demandé doit être supérieur à 0 litre.");
      return false;
    }
    if (dateDebut > dateFin) {
      setErrorMsg("La date de début ne peut pas être postérieure à la date de fin.");
      return false;
    }
    if (transporteurs.length === 0) {
      setErrorMsg("Veuillez déclarer au moins un transporteur ou véhicule habilité.");
      return false;
    }
    for (let i = 0; i < transporteurs.length; i++) {
      const t = transporteurs[i];
      if (!t.immatriculation?.trim() && !t.nom_prenom?.trim()) {
        setErrorMsg(`Transporteur #${i + 1} : Veuillez renseigner au moins l'immatriculation du véhicule ou le nom du chauffeur.`);
        return false;
      }
      if (modeGestion === "PLAFONDS_INDIVIDUELS" && n(t.volume_alloue_l) <= 0) {
        setErrorMsg(`Transporteur #${i + 1} (${t.immatriculation || t.nom_prenom}) : En mode plafonds individuels, le quota alloué doit être > 0.`);
        return false;
      }
    }
    if (modeGestion === "PLAFONDS_INDIVIDUELS" && ecartRepartition !== 0) {
      setErrorMsg(`En mode plafonds individuels, la somme des quotas des transporteurs (${F(sommeVolumesTransporteurs)} L) doit être exactement égale au volume total demandé (${F(volumeTotal)} L). Écart constaté : ${ecartRepartition > 0 ? "+" : ""}${F(ecartRepartition)} L.`);
      return false;
    }
    return true;
  };

  const handleSoumettre = (estBrouillon = false) => {
    if (!estBrouillon && !validerFormulaire()) return;

    const payload = {
      ...progInit,
      client_id: clientObj?.id || clientObj?.code,
      client_code: clientObj?.code,
      client_nom: clientObj?.nom_entreprise || clientObj?.nom,
      numero_programme: numeroProgramme,
      objet_demande: objetDemande.trim(),
      demandeur_nom: demandeurNom.trim(),
      demandeur_contact: demandeurContact.trim(),
      date_debut: dateDebut,
      date_fin: dateFin,
      date_demande: progInit?.date_demande || todayISO(),
      produit,
      volume_demande_l: volumeTotal,
      volume_autorise_l: progInit?.volume_autorise_l || volumeTotal,
      mode_gestion: modeGestion,
      conditions_particulieres: conditionsParticulieres.trim(),
      montant_estime_fcfa: montantEstime,
      prix_unitaire_estime: pu,
      transporteurs: transporteurs.map((t) => ({
        ...t,
        volume_alloue_l: n(t.volume_alloue_l),
        immatriculation: (t.immatriculation || "").trim().toUpperCase(),
        carburant: t.carburant || produit,
      })),
      statut: estBrouillon
        ? "BROUILLON"
        : progInit?.statut === "A_CORRIGER" || progInit?.statut === "INFO_DEMANDEE"
        ? "EN_ATTENTE"
        : "EN_ATTENTE",
    };

    onSave(payload, estBrouillon);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-2xl border my-6 text-gray-900 border-gray-200 flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="flex justify-between items-start pb-3 border-b mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⛽</span>
              <h2 className="text-base sm:text-lg font-black text-gray-900">
                {isEdit ? `Modifier la Demande — ${numeroProgramme}` : "Nouvelle Demande de Programme de Bons de Carburant"}
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Client : <strong className="text-blue-950 font-bold">{client?.nom_entreprise}</strong> ({client?.code}) · Station Hann Maristes
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

        {/* Étapes de navigation */}
        <div className="grid grid-cols-3 gap-2 pb-3 mb-3 border-b text-xs">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              activeStep === 1 ? "bg-[#0B2545] text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>1.</span>
            <span>Général & Carburant</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              activeStep === 2 ? "bg-[#0B2545] text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>2.</span>
            <span>Flotte Transporteurs ({transporteurs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (validerFormulaire()) setActiveStep(3);
            }}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              activeStep === 3 ? "bg-[#0B2545] text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>3.</span>
            <span>Récapitulatif & Envoi</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Corps formulaire selon l'étape */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
          {/* ── ÉTAPE 1 : GÉNÉRAL & CARBURANT ── */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">N° de Demande</span>
                  <div className="font-mono font-black text-sm text-blue-950 bg-white p-2 rounded border border-blue-200">
                    {numeroProgramme}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Date Début Souhaitée *</label>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Date Fin Souhaitée *</label>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300 font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-900 mb-1">
                    Objet / Motif de la Demande de Programme *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Approvisionnement Flotte Chantier TER — Phase 2 Décembre"
                    value={objetDemande}
                    onChange={(e) => setObjetDemande(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2.5 font-bold text-gray-900 border-gray-300 focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Nom du Responsable Demandeur *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Mamadou Dia (Directeur Logistique)"
                    value={demandeurNom}
                    onChange={(e) => setDemandeurNom(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Contact Téléphonique Demandeur
                  </label>
                  <input
                    type="text"
                    placeholder="ex: +221 77 000 00 00"
                    value={demandeurContact}
                    onChange={(e) => setDemandeurContact(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t">
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-1">Type de Carburant *</label>
                  <select
                    value={produit}
                    onChange={(e) => setProduit(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-blue-400 font-bold text-blue-950"
                  >
                    <option value="GASOIL">GASOIL (755 FCFA/L)</option>
                    <option value="SUPER">SUPER (990 FCFA/L)</option>
                    <option value="MULTI">MULTI-CARBURANTS (Gasoil + Super)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-blue-950 mb-1">Volume Total Demandé (Litres) *</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      step="any"
                      placeholder="ex: 10000"
                      value={volumeDemande}
                      onChange={(e) => setVolumeDemande(e.target.value)}
                      className="w-full text-xs border rounded-lg p-2 font-black text-blue-950 bg-blue-50/50 border-blue-400"
                      required
                    />
                    <span className="font-black text-xs text-gray-700">L</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Montant Estimatif HT</span>
                  <div className="font-mono font-black text-sm text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                    {F(montantEstime)} FCFA
                  </div>
                </div>
              </div>

              {/* Choix du mode de gestion */}
              <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 space-y-2">
                <span className="text-xs font-bold text-gray-900 block">
                  Mode de Gestion Souhaité pour la Flotte :
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`p-2.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      modeGestion === "VOLUME_GLOBAL"
                        ? "border-blue-600 bg-blue-50/80 shadow-2xs"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="radio"
                        name="modeGestion"
                        checked={modeGestion === "VOLUME_GLOBAL"}
                        onChange={() => setModeGestion("VOLUME_GLOBAL")}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-black text-xs text-gray-900">1. Enveloppe Globale Partagée</span>
                    </div>
                    <p className="text-[11px] text-gray-600 pl-5">
                      Tous les transporteurs autorisés puisent dans l'enveloppe commune des {F(volumeTotal)} L jusqu'à épuisement du solde.
                    </p>
                  </label>

                  <label
                    className={`p-2.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      modeGestion === "PLAFONDS_INDIVIDUELS"
                        ? "border-blue-600 bg-blue-50/80 shadow-2xs"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="radio"
                        name="modeGestion"
                        checked={modeGestion === "PLAFONDS_INDIVIDUELS"}
                        onChange={() => setModeGestion("PLAFONDS_INDIVIDUELS")}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-black text-xs text-gray-900">2. Plafonds Individuels Stricts</span>
                    </div>
                    <p className="text-[11px] text-gray-600 pl-5">
                      Chaque transporteur se voit attribuer un quota maximal strict en litres. Le distributeur bloque tout dépassement.
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Conditions Particulières / Instructions de Service
                </label>
                <textarea
                  rows={2}
                  placeholder="ex: Ravitaillement uniquement du lundi au samedi entre 06h et 20h. Présentation obligatoire de la carte chauffeur."
                  value={conditionsParticulieres}
                  onChange={(e) => setConditionsParticulieres(e.target.value)}
                  className="w-full text-xs border rounded-lg p-2 bg-white border-gray-300"
                />
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2 : FLOTTE DES TRANSPORTEURS / VÉHICULES ── */}
          {activeStep === 2 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b gap-2">
                <div>
                  <h3 className="font-black text-xs text-gray-900 uppercase tracking-wider">
                    Transporteurs &amp; Véhicules Habilités à la Pompe ({transporteurs.length})
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Seuls ces chauffeurs et immatriculations seront autorisés à prendre du carburant sur ce programme.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddTransporteur}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs shadow-2xs flex items-center gap-1.5"
                >
                  <span>➕ Ajouter un Transporteur / Véhicule</span>
                </button>
              </div>

              {/* Rapprochement de volume en mode plafonds individuels */}
              {modeGestion === "PLAFONDS_INDIVIDUELS" && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                    isRepartitionCoherente
                      ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                      : "bg-amber-50 border-amber-300 text-amber-950"
                  }`}
                >
                  <div>
                    <span className="font-bold">Contrôle de répartition des quotas :</span>{" "}
                    Total alloué aux chauffeurs : <strong>{F(sommeVolumesTransporteurs)} L</strong> / Total demandé : <strong>{F(volumeTotal)} L</strong>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      isRepartitionCoherente ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-950"
                    }`}
                  >
                    {isRepartitionCoherente ? "✓ Répartition 100% cohérente" : `Écart : ${ecartRepartition > 0 ? "+" : ""}${F(ecartRepartition)} L`}
                  </span>
                </div>
              )}

              {/* Liste des cartes transporteurs */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {transporteurs.map((t, idx) => (
                  <div
                    key={t.id || idx}
                    className="p-3 bg-slate-50 border rounded-xl border-gray-200 space-y-2 relative"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-xs text-gray-900">
                          {t.immatriculation ? `Véhicule ${t.immatriculation}` : `Transporteur #${idx + 1}`}
                        </span>
                        {t.nom_prenom && <span className="text-[11px] text-gray-500 font-medium">({t.nom_prenom})</span>}
                      </div>

                      {transporteurs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTransporteur(t.id)}
                          className="text-rose-600 hover:text-rose-800 font-bold text-[11px] px-2 py-0.5 rounded hover:bg-rose-50"
                        >
                          ✕ Retirer
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                          Immatriculation Véhicule *
                        </label>
                        <input
                          type="text"
                          placeholder="ex: DK-4501-AA"
                          value={t.immatriculation}
                          onChange={(e) => handleUpdateTransporteur(t.id, "immatriculation", e.target.value.toUpperCase())}
                          className="w-full text-xs border rounded p-1.5 uppercase font-mono font-bold bg-white border-gray-300"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                          Nom &amp; Prénom Chauffeur *
                        </label>
                        <input
                          type="text"
                          placeholder="ex: Abdoulaye Diallo"
                          value={t.nom_prenom}
                          onChange={(e) => handleUpdateTransporteur(t.id, "nom_prenom", e.target.value)}
                          className="w-full text-xs border rounded p-1.5 font-semibold bg-white border-gray-300"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                          Téléphone Chauffeur
                        </label>
                        <input
                          type="text"
                          placeholder="ex: 77 123 45 67"
                          value={t.telephone}
                          onChange={(e) => handleUpdateTransporteur(t.id, "telephone", e.target.value)}
                          className="w-full text-xs border rounded p-1.5 font-mono bg-white border-gray-300"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-blue-950 mb-0.5">
                          {modeGestion === "PLAFONDS_INDIVIDUELS" ? "Plafond Quota (Litres) *" : "Litrage Indicatif (L)"}
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="ex: 2000"
                          value={t.volume_alloue_l}
                          onChange={(e) => handleUpdateTransporteur(t.id, "volume_alloue_l", e.target.value)}
                          className={`w-full text-xs border rounded p-1.5 font-bold ${
                            modeGestion === "PLAFONDS_INDIVIDUELS"
                              ? "bg-blue-50 text-blue-950 border-blue-400 font-black"
                              : "bg-white text-gray-700 border-gray-300"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Type de Véhicule</label>
                        <select
                          value={t.type_vehicule}
                          onChange={(e) => handleUpdateTransporteur(t.id, "type_vehicule", e.target.value)}
                          className="w-full text-xs border rounded p-1.5 bg-white border-gray-300"
                        >
                          <option value="CAMION">CAMION</option>
                          <option value="CITERNE">CITERNE</option>
                          <option value="BENNE">BENNE</option>
                          <option value="FOURGON">FOURGON</option>
                          <option value="PICKUP">PICKUP</option>
                          <option value="BUS">BUS / MINIBUS</option>
                          <option value="AUTRE">AUTRE VÉHICULE</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">Observations / Affectation</label>
                        <input
                          type="text"
                          placeholder="ex: Chauffeur principal de nuit, badge remorque N° 04..."
                          value={t.observations}
                          onChange={(e) => handleUpdateTransporteur(t.id, "observations", e.target.value)}
                          className="w-full text-xs border rounded p-1.5 bg-white border-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ÉTAPE 3 : RÉCAPITULATIF COMPLET AVANT CONFIRMATION ── */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <span className="font-bold text-xs uppercase text-blue-950 tracking-wider">
                    Récapitulatif de la Demande avant Soumission Officielle
                  </span>
                  <span className="font-mono font-black text-xs text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-300">
                    {numeroProgramme}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Client B2B</span>
                    <strong>{client?.nom_entreprise}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Période Validité</span>
                    <strong>{dateDebut} → {dateFin}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Carburant</span>
                    <strong className="text-blue-900">{produit}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Volume Total Demandé</span>
                    <strong className="text-blue-950 text-sm font-black">{F(volumeTotal)} Litres</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-blue-200 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Objet</span>
                    <div className="font-medium text-gray-800">{objetDemande}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block uppercase">Mode de Gestion</span>
                    <strong className="text-gray-900">
                      {modeGestion === "VOLUME_GLOBAL" ? "Enveloppe Globale Partagée" : "Plafonds Individuels Stricts"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Table récapitulative des transporteurs */}
              <div>
                <span className="text-xs font-bold text-gray-800 uppercase tracking-wider block mb-1">
                  Flotte Habilitée ({transporteurs.length} transporteur{transporteurs.length > 1 ? "s" : ""}) :
                </span>
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-2 text-left">Immatriculation</th>
                      <th className="p-2 text-left">Chauffeur</th>
                      <th className="p-2 text-left">Type Véhicule</th>
                      <th className="p-2 text-right">Quota Alloué (L)</th>
                      <th className="p-2 text-left">Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {transporteurs.map((t, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="p-2 font-mono font-bold text-gray-900">{t.immatriculation || "--"}</td>
                        <td className="p-2 font-medium">{t.nom_prenom || "--"}</td>
                        <td className="p-2 text-gray-600">{t.type_vehicule || "CAMION"}</td>
                        <td className="p-2 text-right font-black tabular text-blue-950">
                          {modeGestion === "PLAFONDS_INDIVIDUELS" ? `${F(n(t.volume_alloue_l))} L` : "Partagé"}
                        </td>
                        <td className="p-2 text-gray-500 italic">{t.observations || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs flex items-center gap-2">
                <span className="text-lg">ℹ️</span>
                <div>
                  <strong>Information de transmission :</strong> Une fois transmise, votre demande sera examinée par la direction de la station-service. Vous serez notifié dès sa validation et pourrez suivre les consommations de vos véhicules en temps réel.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page et boutons d'action */}
        <div className="pt-3 border-t mt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition text-xs w-full sm:w-auto"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handleSoumettre(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition text-xs w-full sm:w-auto border border-slate-300"
              title="Enregistrer comme brouillon sans envoyer au gérant"
            >
              💾 Enregistrer Brouillon
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {activeStep > 1 && (
              <button
                type="button"
                onClick={() => setActiveStep(activeStep - 1)}
                className="px-3.5 py-2 rounded-xl border border-gray-300 text-gray-800 font-bold hover:bg-gray-100 transition text-xs"
              >
                ← Précédent
              </button>
            )}

            {activeStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (activeStep === 1 || validerFormulaire()) {
                    setActiveStep(activeStep + 1);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-blue-900 text-white font-bold transition text-xs shadow-xs"
              >
                Suivant →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black transition text-xs shadow-md flex items-center gap-1.5"
              >
                <span>🚀 Confirmer &amp; Soumettre au Gérant</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal de Confirmation explicite avant soumission */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3 shadow-2xl border text-center animate-fade-in">
              <span className="text-4xl block">📋</span>
              <h3 className="text-base font-black text-gray-900">
                Confirmer l'envoi de la demande ?
              </h3>
              <p className="text-xs text-gray-600">
                Vous êtes sur le point de soumettre la demande de programme <strong className="font-mono text-blue-950">{numeroProgramme}</strong> pour un volume de <strong className="text-blue-950">{F(volumeTotal)} Litres</strong> avec <strong className="text-blue-950">{transporteurs.length} transporteur(s)</strong>.
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    handleSoumettre(false);
                  }}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 shadow-sm"
                >
                  Oui, Soumettre
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
