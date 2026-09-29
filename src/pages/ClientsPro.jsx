import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listClientsPro,
  createClientPro,
  listVehicules,
  createVehicule,
  listOperationsCredit,
  saveOperationCredit,
  soldeClient,
  listBonsClient,
  reglerBonsClient,
} from "../lib/api";
import { Section, Row, Num, Loading } from "../components/ui";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";

export default function ClientsPro() {
  const { profil, cloud } = useAuth();
  const [stationId, setStationId] = useState(profil?.station_id || "");
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [selected, setSelected] = useState(null);
  const [subTab, setSubTab] = useState("bons"); // bons | ops | vehicules | reglement
  const [clForm, setClForm] = useState({ code: "", nom_entreprise: "", telephone: "", email: "", plafond_credit: 1000000, station_id: stationId });
  const [veh, setVeh] = useState({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
  const [reglementForm, setReglementForm] = useState({ montant: "", reference: "", mode: "ESPECES", date: todayISO() });
  const [msg, setMsg] = useState("");
  const [soldes, setSoldes] = useState({});
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);

  // Gestion des Bons de Carburant (Règlements & Ventilations)
  const [bonsClient, setBonsClient] = useState([]);
  const [loadingBons, setLoadingBons] = useState(false);
  const [bonFilter, setBonFilter] = useState("TOUS"); // TOUS | IMPAYES | REGLES
  const [reglementBonsModal, setReglementBonsModal] = useState(false);
  const [reglementBonsForm, setReglementBonsForm] = useState({
    montant_verse: "",
    date: todayISO(),
    mode: "ESPECES",
    reference: "",
    allocations: {}, // { [bonId]: number }
  });

  const clients = ref?.clients_pro || [];
  const vehicules = selected ? (ref?.vehicules || []).filter((v) => v.client_code === selected) : [];
  const clientActif = clients.find((c) => c.code === selected);

  const flash = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const cls = r?.clients_pro || [];
      const sMap = {};
      for (const cl of cls) {
        try {
          sMap[cl.code] = await soldeClient(cl.code);
        } catch {}
      }
      setSoldes(sMap);
    } catch (err) {
      console.error("Erreur chargement clients pro:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!stationId && ref?.stations?.length) setStationId(ref.stations[0].code);
  }, [ref, stationId]);

  useEffect(() => {
    loadData();
  }, [cloud]);

  const loadClientOps = async (code) => {
    setLoadingOps(true);
    setLoadingBons(true);
    try {
      const [o, b, s] = await Promise.all([
        listOperationsCredit(code),
        listBonsClient(code, stationId),
        soldeClient(code),
      ]);
      setOps(o || []);
      setBonsClient(b || []);
      setSoldes((prev) => ({ ...prev, [code]: s }));
    } catch (err) {
      console.error("Erreur chargement données client:", err);
    } finally {
      setLoadingOps(false);
      setLoadingBons(false);
    }
  };

  useEffect(() => {
    if (selected) {
      loadClientOps(selected);
    } else {
      setOps([]);
      setBonsClient([]);
    }
  }, [selected]);

  // Statistiques et filtres sur les bons
  const bonsImpayes = useMemo(() => bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) > 0 && n(b.montant_regle || 0) === 0), [bonsClient]);
  const bonsPartiels = useMemo(() => bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) > 0 && n(b.montant_regle || 0) > 0), [bonsClient]);
  const bonsRegles = useMemo(() => bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) === 0), [bonsClient]);

  const totalMontantBons = useMemo(() => bonsClient.reduce((acc, b) => acc + n(b.montant), 0), [bonsClient]);
  const totalRegleBons = useMemo(() => bonsClient.reduce((acc, b) => acc + n(b.montant_regle || 0), 0), [bonsClient]);
  const totalResteBons = useMemo(() => bonsClient.reduce((acc, b) => acc + n(b.reste_a_payer ?? b.montant), 0), [bonsClient]);
  const totalLitresBons = useMemo(() => bonsClient.reduce((acc, b) => acc + n(b.volume_litres || 0), 0), [bonsClient]);

  const filteredBons = useMemo(() => {
    if (bonFilter === "IMPAYES") return bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) > 0);
    if (bonFilter === "REGLES") return bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) === 0);
    return bonsClient;
  }, [bonsClient, bonFilter]);

  // Gestion du modal de règlement
  const openReglementModal = (preselectBonId = null) => {
    if (!selected) return;
    const bon = preselectBonId ? bonsClient.find((b) => b.id === preselectBonId) : null;
    const initialMontant = bon ? n(bon.reste_a_payer ?? bon.montant) : "";
    const initialAlloc = bon ? { [bon.id]: n(bon.reste_a_payer ?? bon.montant) } : {};

    setReglementBonsForm({
      montant_verse: initialMontant ? String(initialMontant) : "",
      date: todayISO(),
      mode: "ESPECES",
      reference: "",
      allocations: initialAlloc,
    });
    setReglementBonsModal(true);
  };

  const handleAutoAllocateFIFO = (montantTotal) => {
    const total = n(montantTotal ?? reglementBonsForm.montant_verse);
    let resteAVentiler = total;
    const newAlloc = {};
    const sorted = [...bonsClient]
      .filter((b) => n(b.reste_a_payer ?? b.montant) > 0)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || ""));

    for (const bon of sorted) {
      if (resteAVentiler <= 0) break;
      const resteBon = n(bon.reste_a_payer ?? bon.montant);
      const alloc = Math.min(resteAVentiler, resteBon);
      newAlloc[bon.id] = alloc;
      resteAVentiler -= alloc;
    }
    setReglementBonsForm((prev) => ({ ...prev, allocations: newAlloc }));
  };

  const handleToggleBon = (bon) => {
    const bonId = bon.id;
    const currentAlloc = n(reglementBonsForm.allocations[bonId] || 0);
    const resteBon = n(bon.reste_a_payer ?? bon.montant);

    if (currentAlloc > 0) {
      setReglementBonsForm((prev) => {
        const next = { ...prev.allocations };
        delete next[bonId];
        return { ...prev, allocations: next };
      });
    } else {
      setReglementBonsForm((prev) => ({
        ...prev,
        allocations: {
          ...prev.allocations,
          [bonId]: resteBon,
        },
      }));
    }
  };

  const handleSetAllocation = (bonId, val, maxVal) => {
    const numVal = Math.max(0, Math.min(n(val), maxVal));
    setReglementBonsForm((prev) => ({
      ...prev,
      allocations: {
        ...prev.allocations,
        [bonId]: numVal,
      },
    }));
  };

  const handleValiderReglementBons = async () => {
    const mtVerse = n(reglementBonsForm.montant_verse);
    if (mtVerse <= 0) return flash("Veuillez saisir un montant versé valide (> 0)");

    const allocationsArray = Object.entries(reglementBonsForm.allocations)
      .filter(([_, amt]) => n(amt) > 0)
      .map(([bon_id, montant_alloue]) => ({ bon_id, montant_alloue: n(montant_alloue) }));

    const totalAlloue = allocationsArray.reduce((acc, curr) => acc + curr.montant_alloue, 0);
    if (totalAlloue > mtVerse) {
      return flash(`Attention : Le total alloué (${F(totalAlloue)} F) dépasse le montant versé (${F(mtVerse)} F)`);
    }

    try {
      const res = await reglerBonsClient({
        client_code: selected,
        station_id: stationId,
        date: reglementBonsForm.date,
        montant_total_recu: mtVerse,
        mode_paiement: reglementBonsForm.mode,
        reference: reglementBonsForm.reference,
        allocations: allocationsArray,
        operateur: profil?.nom || "Gérant",
      });

      if (res?.error) return flash("Erreur : " + res.error);

      flash(`✓ Règlement de ${F(mtVerse)} FCFA enregistré avec succès ! (${allocationsArray.length} bon(s) ventilé(s))`);
      setReglementBonsModal(false);
      await loadClientOps(selected);
    } catch (err) {
      console.error(err);
      flash("Erreur lors de l'enregistrement : " + err.message);
    }
  };

  const save = async () => {
    if (!clForm.nom_entreprise.trim()) return flash("Le nom de l'entreprise est requis");
    const code = clForm.code.trim() || `CP-${clForm.nom_entreprise.trim().slice(0, 4).toUpperCase()}`;
    const res = await createClientPro({ ...clForm, code, station_id: stationId, plafond_credit: n(clForm.plafond_credit) });
    if (res?.error) return flash("Erreur : " + res.error);
    setClForm({ code: "", nom_entreprise: "", telephone: "", email: "", plafond_credit: 1000000, station_id: stationId });
    flash("Client professionnel ajouté avec succès");
    await loadData();
  };

  const saveVeh = async () => {
    if (!selected) return flash("Sélectionnez d'abord un client");
    if (!veh.immatriculation?.trim()) return flash("Immatriculation requise");
    const res = await createVehicule({ ...veh, client_code: selected, station_id: stationId });
    if (res?.error) return flash("Erreur : " + res.error);
    setVeh({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
    flash("Véhicule ajouté à la flotte du client");
    const r = await loadReferentiel();
    setRef(r);
  };

  const saveReglement = async () => {
    if (!selected) return flash("Sélectionnez un client");
    const m = n(reglementForm.montant);
    if (m <= 0) return flash("Montant de règlement invalide");
    try {
      await saveOperationCredit({
        client_code: selected,
        station_id: stationId,
        date_op: reglementForm.date || todayISO(),
        matricule: `Règlement ${reglementForm.mode}${reglementForm.reference ? " - " + reglementForm.reference : ""}`,
        volume_l: 0,
        valeur_cons: 0,
        depot: m,
      });
      flash(`Règlement de ${F(m)} F enregistré avec succès`);
      setReglementForm({ montant: "", reference: "", mode: "ESPECES", date: todayISO() });
      await loadClientOps(selected);
      setSubTab("ops");
    } catch (err) {
      flash("Erreur règlement : " + err.message);
    }
  };

  if (loading) return <Loading label="Chargement des clients professionnels…" />;

  return (
    <div className="space-y-4">
      {/* Entête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: T.petrol }}>
            Portefeuille Clients Professionnels & Flottes
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            Gestion des crédits carburant, suivi des encaissements de bons & suivi des flottes (§33)
          </p>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
          {clients.length} compte(s) B2B actif(s)
        </div>
      </div>

      {msg && <div className="rounded-lg px-3 py-2 text-sm font-semibold shadow-xs" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Formulaire nouveau client */}
      <Section titre="Nouveau Compte Client Entreprise" aside="RBAC : Commercial, Gérant, Direction">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Code Client</div>
            <input value={clForm.code} onChange={(e) => setClForm({ ...clForm, code: e.target.value })} placeholder="ex: CP-TRANSPORT" className="w-full border rounded px-2 py-1 text-sm uppercase" style={{ borderColor: T.line }} />
          </div>
          <div className="col-span-2">
            <div className="text-xs font-medium" style={{ color: T.muted }}>Raison Sociale / Nom Entreprise *</div>
            <input value={clForm.nom_entreprise} onChange={(e) => setClForm({ ...clForm, nom_entreprise: e.target.value })} placeholder="ex: Sococim Industries SA" className="w-full border rounded px-2 py-1 text-sm font-semibold" style={{ borderColor: T.line }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Téléphone Contact</div>
            <input value={clForm.telephone} onChange={(e) => setClForm({ ...clForm, telephone: e.target.value })} placeholder="77 000 00 00" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Email Gestionnaire</div>
            <input value={clForm.email} onChange={(e) => setClForm({ ...clForm, email: e.target.value })} placeholder="flotte@entreprise.sn" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Plafond Crédit Autorisé (F CFA) *</div>
            <Num value={clForm.plafond_credit} onChange={(v) => setClForm({ ...clForm, plafond_credit: v })} w="w-full" />
          </div>
        </div>
        <div className="pt-1 pb-2">
          <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-xs transition-opacity hover:opacity-90" style={{ background: T.petrol }}>
            + Créer le compte client pro
          </button>
        </div>
      </Section>

      {/* Liste des comptes clients pro */}
      <Section titre="Comptes Clients & Encours de Crédit" aside="Cliquez sur un compte pour ouvrir sa fiche détaillée">
        <div className="divide-y" style={{ borderColor: T.line }}>
          {clients.map((c, i) => {
            const rawSolde = soldes[c.code] ?? 0; // solde = depots - consommations
            const detteEnCours = Math.max(0, -rawSolde);
            const plafond = n(c.plafond_credit) || 0;
            const creditRestant = Math.max(0, plafond + rawSolde);
            const ratioConso = plafond > 0 ? (detteEnCours / plafond) * 100 : 0;
            const isSelected = selected === c.code;

            return (
              <div
                key={c.code || c.id || i}
                onClick={() => setSelected(isSelected ? null : c.code)}
                className={`p-3 transition-colors cursor-pointer rounded-lg ${isSelected ? "bg-amber-50/70 border border-amber-300" : "hover:bg-slate-50"}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-gray-900">{c.nom_entreprise}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{c.code}</span>
                      {isSelected && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">Sélectionné</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.telephone && <span>📞 {c.telephone}</span>}
                      {c.email && <span className="ml-2">✉️ {c.email}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-right">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-semibold">Plafond Accordé</div>
                      <div className="font-semibold text-xs tabular">{F(plafond)} F</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: detteEnCours > 0 ? T.alert : T.ok }}>
                        {detteEnCours > 0 ? "Dette (Bons)" : "Avance"}
                      </div>
                      <div className="font-bold text-xs tabular" style={{ color: detteEnCours > 0 ? T.alert : T.ok }}>
                        {rawSolde < 0 ? `${F(detteEnCours)} F` : rawSolde > 0 ? `+${F(rawSolde)} F` : "0 F"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-semibold">Crédit Disponible</div>
                      <div className="font-black text-xs tabular" style={{ color: creditRestant <= 0 ? T.alert : T.petrol }}>
                        {F(creditRestant)} F
                      </div>
                    </div>
                  </div>
                </div>

                {/* Barre d'encours de crédit */}
                {plafond > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, ratioConso)}%`,
                          background: ratioConso >= 100 ? T.alert : ratioConso >= 80 ? "#D97706" : T.green,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 tabular w-10 text-right">
                      {ratioConso.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {clients.length === 0 && <div className="py-4 text-center text-sm" style={{ color: T.muted }}>Aucun client pro enregistré.</div>}
      </Section>

      {/* Détail du compte client sélectionné */}
      {selected && clientActif && (
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b gap-2" style={{ borderColor: T.line }}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏢</span>
                <h2 className="text-base font-bold text-gray-900">{clientActif.nom_entreprise}</h2>
                <span className="text-xs font-mono font-bold text-gray-500">({clientActif.code})</span>
              </div>
              <p className="text-xs text-gray-500">
                Plafond : <strong>{F(clientActif.plafond_credit || 0)} FCFA</strong> · Encours :{" "}
                <strong style={{ color: (soldes[selected] || 0) < 0 ? T.alert : T.ok }}>
                  {(soldes[selected] || 0) < 0 ? `${F(-soldes[selected])} FCFA dus` : `${F(soldes[selected] || 0)} FCFA d'avance`}
                </strong>
              </p>
            </div>

            {/* Onglets d'action */}
            <div className="flex flex-wrap rounded-lg border p-1 bg-gray-50 gap-1 text-xs font-semibold" style={{ borderColor: T.line }}>
              <button
                onClick={() => setSubTab("bons")}
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  subTab === "bons" ? "bg-white shadow-xs text-gray-900" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <span>🎫 Bons Carburant ({bonsClient.length})</span>
                {bonsImpayes.length + bonsPartiels.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded-full leading-none">
                    {bonsImpayes.length + bonsPartiels.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSubTab("ops")}
                className={`px-3 py-1.5 rounded-md transition-colors ${subTab === "ops" ? "bg-white shadow-xs text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
              >
                📋 Grand Livre ({ops.length})
              </button>
              <button
                onClick={() => setSubTab("vehicules")}
                className={`px-3 py-1.5 rounded-md transition-colors ${subTab === "vehicules" ? "bg-white shadow-xs text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
              >
                🚗 Flotte Véhicules ({vehicules.length})
              </button>
              <button
                onClick={() => setSubTab("reglement")}
                className={`px-3 py-1.5 rounded-md transition-colors ${subTab === "reglement" ? "bg-white shadow-xs text-emerald-800" : "text-emerald-700 hover:bg-emerald-50"}`}
              >
                💳 Avance Libre
              </button>
            </div>
          </div>

          {/* Onglet 0 : Bons de Carburant & Ventilation de Règlements */}
          {subTab === "bons" && (
            <div className="space-y-4">
              {/* Synthèse des Bons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 bg-slate-50 border rounded-lg" style={{ borderColor: T.line }}>
                  <div className="text-[10px] font-bold text-gray-500 uppercase">Total Bons Reçus</div>
                  <div className="text-base font-black text-gray-900 tabular mt-0.5">{bonsClient.length} bon(s)</div>
                  <div className="text-[11px] text-gray-500">{F(totalMontantBons)} FCFA</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-[10px] font-bold text-blue-700 uppercase">Volume Carburant</div>
                  <div className="text-base font-black text-blue-900 tabular mt-0.5">{F(totalLitresBons)} L</div>
                  <div className="text-[11px] text-blue-600">Total litres livrés</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Montant Déjà Réglé</div>
                  <div className="text-base font-black text-emerald-800 tabular mt-0.5">{F(totalRegleBons)} FCFA</div>
                  <div className="text-[11px] text-emerald-600">Encaissements gérant</div>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <div className="text-[10px] font-bold text-rose-700 uppercase">Reste Dû (Dette Bons)</div>
                  <div className="text-base font-black text-rose-800 tabular mt-0.5">{F(totalResteBons)} FCFA</div>
                  <div className="text-[11px] text-rose-600">{bonsImpayes.length + bonsPartiels.length} bon(s) en attente</div>
                </div>
              </div>

              {/* Barre d'actions & Filtres */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 font-bold mr-1">Filtrer :</span>
                  <button
                    onClick={() => setBonFilter("TOUS")}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      bonFilter === "TOUS" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    Tous ({bonsClient.length})
                  </button>
                  <button
                    onClick={() => setBonFilter("IMPAYES")}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      bonFilter === "IMPAYES" ? "bg-rose-700 text-white" : "bg-rose-50 text-rose-800 hover:bg-rose-100"
                    }`}
                  >
                    À Régler ({bonsImpayes.length + bonsPartiels.length})
                  </button>
                  <button
                    onClick={() => setBonFilter("REGLES")}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      bonFilter === "REGLES" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    Soldés ({bonsRegles.length})
                  </button>
                </div>

                <button
                  onClick={() => openReglementModal()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <span>💳</span>
                  <span>Encaisser un Règlement de Bons</span>
                </button>
              </div>

              {/* Table des Bons */}
              {loadingBons ? (
                <p className="text-xs text-gray-400 py-4 text-center">Chargement des bons de carburant…</p>
              ) : filteredBons.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-xs text-gray-500 bg-gray-50">
                  <p className="font-semibold text-gray-700">Aucun bon de carburant dans cette vue.</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Les bons enregistrés par les pompistes lors des descentes de caisse s'afficheront automatiquement ici.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg" style={{ borderColor: T.line }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                      <tr>
                        <th className="py-2 px-3 text-left">Date & Origine</th>
                        <th className="py-2 px-3 text-left">N° Bon</th>
                        <th className="py-2 px-3 text-left">Véhicule / Obs</th>
                        <th className="py-2 px-3 text-right">Volume (Litres)</th>
                        <th className="py-2 px-3 text-right">Montant Bon</th>
                        <th className="py-2 px-3 text-right">Réglé</th>
                        <th className="py-2 px-3 text-right">Reste Dû</th>
                        <th className="py-2 px-3 text-center">Statut</th>
                        <th className="py-2 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.line }}>
                      {filteredBons.map((b) => {
                        const reste = n(b.reste_a_payer ?? b.montant);
                        const regle = n(b.montant_regle || 0);
                        const isSolde = reste <= 0;
                        const isPartiel = regle > 0 && reste > 0;

                        return (
                          <tr key={b.id} className={isSolde ? "bg-white hover:bg-gray-50" : isPartiel ? "bg-amber-50/50 hover:bg-amber-50" : "bg-rose-50/40 hover:bg-rose-50/70"}>
                            <td className="py-2 px-3 text-gray-700">
                              <div className="font-bold tabular">{fmtDate(b.date)}</div>
                              <div className="text-[10px] text-gray-400 font-mono">
                                {b.pompiste_nom ? `Pompiste: ${b.pompiste_nom}` : b.descente_numero ? `Descente: ${b.descente_numero}` : "Descente"}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-gray-900">
                              {b.numero_bon || b.id.slice(0, 8)}
                            </td>
                            <td className="py-2 px-3 text-gray-700">
                              <div className="font-semibold text-gray-900">{b.immatriculation || "Non spécifié"}</div>
                              {b.observations && <div className="text-[10px] text-gray-500 italic">{b.observations}</div>}
                            </td>
                            <td className="py-2 px-3 text-right tabular font-bold text-blue-900">
                              {n(b.volume_litres) > 0 ? (
                                <span>{F(b.volume_litres)} L <span className="text-[10px] text-gray-500 font-normal">({b.produit || "CARB"})</span></span>
                              ) : (
                                <span className="text-gray-400 font-normal">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right tabular font-bold text-gray-900">
                              {F(b.montant)} F
                            </td>
                            <td className="py-2 px-3 text-right tabular font-bold text-emerald-700">
                              {regle > 0 ? `${F(regle)} F` : "—"}
                            </td>
                            <td className={`py-2 px-3 text-right tabular font-black ${reste > 0 ? "text-rose-700" : "text-gray-400"}`}>
                              {reste > 0 ? `${F(reste)} F` : "0 F"}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isSolde
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isPartiel
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-rose-100 text-rose-800"
                              }`}>
                                {isSolde ? "✓ Soldé" : isPartiel ? "🟡 Partiel" : "🔴 Impayé"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {reste > 0 ? (
                                <button
                                  onClick={() => openReglementModal(b.id)}
                                  className="px-2.5 py-1 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold text-[11px] shadow-xs transition-colors"
                                >
                                  💳 Régler
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-600 font-bold">✓ Réglé</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Onglet 1 : Historique du Grand Livre Crédit */}
          {subTab === "ops" && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center justify-between">
                <span>Détail des Bons d'encaissement pompiste et Règlements :</span>
                <span className="text-[10px] text-gray-400">Origine : Descentes & Caisses</span>
              </div>

              {loadingOps ? (
                <p className="text-xs text-gray-400 py-3 text-center">Chargement des opérations…</p>
              ) : ops.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">Aucune opération enregistrée pour ce client.</p>
              ) : (
                <div className="overflow-x-auto border rounded-lg" style={{ borderColor: T.line }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                      <tr>
                        <th className="py-2 px-3 text-left">Date</th>
                        <th className="py-2 px-3 text-left">Référence / Matricule / Bon</th>
                        <th className="py-2 px-3 text-right">Bon Carburant (F)</th>
                        <th className="py-2 px-3 text-right">Règlement / Dépôt (F)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.line }}>
                      {ops.map((op, idx) => (
                        <tr key={op.id || idx} className="hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-600 tabular">{fmtDate(op.date_op)}</td>
                          <td className="py-2 px-3 font-semibold text-gray-900">{op.matricule || "Opération crédit"}</td>
                          <td className="py-2 px-3 text-right font-bold tabular" style={{ color: n(op.valeur_cons) > 0 ? T.alert : T.muted }}>
                            {n(op.valeur_cons) > 0 ? `${F(op.valeur_cons)} F` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-bold tabular text-emerald-700">
                            {n(op.depot) > 0 ? `+${F(op.depot)} F` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Onglet 2 : Véhicules de la flotte rattachée */}
          {subTab === "vehicules" && (
            <div className="space-y-3">
              <div className="divide-y border rounded-lg" style={{ borderColor: T.line }}>
                {vehicules.map((v, i) => (
                  <div key={v.id || v.immatriculation || i} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-gray-900 px-2 py-0.5 rounded bg-gray-100">{v.immatriculation}</span>
                      <span className="text-gray-600 font-medium">{v.marque} {v.modele}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800">{v.type || v.type_vehicule}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800">{v.carburant}</span>
                    </div>
                  </div>
                ))}
                {vehicules.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">Aucun véhicule rattaché à ce client.</p>}
              </div>

              {/* Formulaire ajout véhicule */}
              <div className="border rounded-lg p-3 bg-gray-50/70" style={{ borderColor: T.line }}>
                <div className="text-xs font-bold text-gray-700 mb-2">+ Enregistrer un nouveau véhicule à la flotte</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <div className="text-[10px] text-gray-500">Immatriculation *</div>
                    <input value={veh.immatriculation} onChange={(e) => setVeh({ ...veh, immatriculation: e.target.value })} placeholder="DK-1234-AA" className="w-full border rounded px-2 py-1 text-xs uppercase font-mono font-bold" style={{ borderColor: T.line }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Marque</div>
                    <input value={veh.marque} onChange={(e) => setVeh({ ...veh, marque: e.target.value })} placeholder="Toyota" className="w-full border rounded px-2 py-1 text-xs" style={{ borderColor: T.line }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Modèle</div>
                    <input value={veh.modele} onChange={(e) => setVeh({ ...veh, modele: e.target.value })} placeholder="Hilux" className="w-full border rounded px-2 py-1 text-xs" style={{ borderColor: T.line }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Type</div>
                    <select value={veh.type_vehicule} onChange={(e) => setVeh({ ...veh, type_vehicule: e.target.value })} className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }}>
                      {["CAMION", "PICKUP", "BUS", "VOITURE", "MOTO"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Carburant</div>
                    <select value={veh.carburant} onChange={(e) => setVeh({ ...veh, carburant: e.target.value })} className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }}>
                      {["GASOIL", "SUPER", "GAZ"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <button onClick={saveVeh} className="px-3 py-1.5 rounded text-xs font-bold text-white shadow-xs" style={{ background: T.petrol }}>
                    Ajouter le véhicule
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Onglet 3 : Règlement / Dépôt Client */}
          {subTab === "reglement" && (
            <div className="border rounded-lg p-3 bg-emerald-50/40 space-y-3" style={{ borderColor: T.line }}>
              <div className="text-xs font-bold text-emerald-950 flex items-center justify-between">
                <span>Encaisser un règlement de créance client</span>
                <span className="text-[10px] text-emerald-700 font-medium">Réduit la dette du compte</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Date de règlement *</div>
                  <input type="date" value={reglementForm.date} onChange={(e) => setReglementForm({ ...reglementForm, date: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs bg-white" style={{ borderColor: T.line }} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Mode de paiement *</div>
                  <select value={reglementForm.mode} onChange={(e) => setReglementForm({ ...reglementForm, mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs bg-white" style={{ borderColor: T.line }}>
                    {["ESPECES", "CHEQUE", "VIREMENT", "WAVE", "ORANGE_MONEY"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Référence / N° Chèque</div>
                  <input value={reglementForm.reference} onChange={(e) => setReglementForm({ ...reglementForm, reference: e.target.value })} placeholder="ex: CHQ-88192" className="w-full border rounded px-2 py-1.5 text-xs bg-white" style={{ borderColor: T.line }} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Montant encaissé (F CFA) *</div>
                  <Num value={reglementForm.montant} onChange={(v) => setReglementForm({ ...reglementForm, montant: v })} w="w-full" />
                </div>
              </div>
              <div className="pt-2 text-right">
                <button onClick={saveReglement} className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs bg-emerald-700 hover:bg-emerald-800 transition-colors">
                  ✓ Enregistrer l'encaissement de {F(n(reglementForm.montant))} F
                </button>
              </div>
            </div>
          )}

          {/* Modal Encaisser & Ventiler Règlement de Bons */}
          {reglementBonsModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
                {/* Entête Modal */}
                <div className="p-4 border-b bg-emerald-800 text-white flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-base flex items-center gap-2">
                      <span>💳 Encaisser le Règlement des Bons</span>
                    </h3>
                    <p className="text-xs text-emerald-100">
                      Client : <strong>{clientActif?.nom_entreprise}</strong> ({clientActif?.code})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReglementBonsModal(false)}
                    className="text-white hover:text-emerald-200 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-700/50 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Corps Modal */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                  {/* Paramètres du règlement */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 bg-gray-50 border rounded-lg">
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Date Encaissement *</label>
                      <input
                        type="date"
                        value={reglementBonsForm.date}
                        onChange={(e) => setReglementBonsForm({ ...reglementBonsForm, date: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Mode Paiement *</label>
                      <select
                        value={reglementBonsForm.mode}
                        onChange={(e) => setReglementBonsForm({ ...reglementBonsForm, mode: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white font-bold text-gray-800"
                      >
                        {["ESPECES", "CHEQUE", "VIREMENT", "WAVE", "ORANGE_MONEY"].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Référence / N° Chèque</label>
                      <input
                        value={reglementBonsForm.reference}
                        onChange={(e) => setReglementBonsForm({ ...reglementBonsForm, reference: e.target.value })}
                        placeholder="ex: CHQ-88201 / TRF"
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Montant Reçu (FCFA) *</label>
                      <input
                        type="number"
                        min="0"
                        value={reglementBonsForm.montant_verse}
                        onChange={(e) => setReglementBonsForm({ ...reglementBonsForm, montant_verse: e.target.value })}
                        placeholder="0"
                        className="w-full border border-emerald-400 rounded px-2 py-1.5 text-xs font-black text-emerald-950 bg-emerald-50/70 tabular"
                      />
                    </div>
                  </div>

                  {/* Sélection et affectation sur les Bons */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="font-bold text-gray-800 uppercase text-[11px] tracking-wide">
                        Ventilation sur les Bons de Carburant en attente :
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAutoAllocateFIFO()}
                          className="px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] flex items-center gap-1 transition-colors shadow-2xs"
                          title="Distribue automatiquement le montant reçu sur les bons du plus ancien au plus récent"
                        >
                          <span>⚡ Répartition auto (FIFO)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReglementBonsForm((prev) => ({ ...prev, allocations: {} }))}
                          className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[10px] transition-colors"
                        >
                          Réinitialiser
                        </button>
                      </div>
                    </div>

                    {/* Tableau de sélection des bons */}
                    {bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) > 0).length === 0 ? (
                      <div className="p-4 border rounded-lg bg-emerald-50 text-emerald-800 text-center font-semibold">
                        ✓ Ce client n'a aucun bon en attente de paiement !
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-x-auto max-h-64" style={{ borderColor: T.line }}>
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b text-gray-500 uppercase text-[10px]">
                            <tr>
                              <th className="p-2 text-center w-8">✓</th>
                              <th className="p-2 text-left">N° Bon & Date</th>
                              <th className="p-2 text-left">Véhicule / Litrage</th>
                              <th className="p-2 text-right">Total Bon</th>
                              <th className="p-2 text-right">Reste Dû</th>
                              <th className="p-2 text-right w-36">Montant Alloué (F)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y" style={{ borderColor: T.line }}>
                            {bonsClient
                              .filter((b) => n(b.reste_a_payer ?? b.montant) > 0)
                              .map((b) => {
                                const reste = n(b.reste_a_payer ?? b.montant);
                                const currentAlloc = n(reglementBonsForm.allocations[b.id] || 0);
                                const isChecked = currentAlloc > 0;

                                return (
                                  <tr key={b.id} className={isChecked ? "bg-emerald-50/70" : "hover:bg-gray-50"}>
                                    <td className="p-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => handleToggleBon(b)}
                                        className="rounded text-emerald-600 cursor-pointer"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <div className="font-bold text-gray-900 font-mono">{b.numero_bon || b.id.slice(0, 8)}</div>
                                      <div className="text-[10px] text-gray-500">{fmtDate(b.date)}</div>
                                    </td>
                                    <td className="p-2 text-gray-700">
                                      <div className="font-medium">{b.immatriculation || "Véhicule client"}</div>
                                      {n(b.volume_litres) > 0 && (
                                        <div className="text-[10px] text-blue-800 font-semibold">{F(b.volume_litres)} L ({b.produit || "CARB"})</div>
                                      )}
                                    </td>
                                    <td className="p-2 text-right tabular text-gray-600 font-semibold">
                                      {F(b.montant)} F
                                    </td>
                                    <td className="p-2 text-right tabular text-rose-700 font-black">
                                      {F(reste)} F
                                    </td>
                                    <td className="p-2 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={reste}
                                          value={currentAlloc > 0 ? currentAlloc : ""}
                                          onChange={(e) => handleSetAllocation(b.id, e.target.value, reste)}
                                          placeholder="0"
                                          className="w-24 border rounded px-1.5 py-1 text-right text-xs font-bold bg-white text-emerald-900 tabular"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSetAllocation(b.id, reste, reste)}
                                          className="px-1.5 py-1 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                                          title="Régler tout le reste de ce bon"
                                        >
                                          Max
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Barre de récapitulation ventilation */}
                  {(() => {
                    const mtRecu = n(reglementBonsForm.montant_verse);
                    const totalAlloue = Object.values(reglementBonsForm.allocations).reduce((acc, v) => acc + n(v), 0);
                    const diff = mtRecu - totalAlloue;
                    const isTropAlloue = totalAlloue > mtRecu;

                    return (
                      <div className={`p-3 rounded-lg border ${isTropAlloue ? "bg-rose-50 border-rose-300" : "bg-slate-50 border-slate-300"}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600">Montant reçu du client :</span>
                          <span className="font-bold text-gray-900 tabular">{F(mtRecu)} FCFA</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600">Total ventilé sur les bons :</span>
                          <span className="font-bold text-emerald-800 tabular">{F(totalAlloue)} FCFA</span>
                        </div>
                        <div className="border-t pt-1 flex items-center justify-between font-bold text-xs">
                          <span>Contrôle d'imputation :</span>
                          {isTropAlloue ? (
                            <span className="text-rose-700">⚠️ Dépassement de {F(Math.abs(diff))} FCFA</span>
                          ) : diff === 0 && mtRecu > 0 ? (
                            <span className="text-emerald-700">✓ Montant exactement ventilé (0 FCFA)</span>
                          ) : diff > 0 ? (
                            <span className="text-blue-700">ℹ️ Reliquat non alloué : +{F(diff)} FCFA (avance compte)</span>
                          ) : (
                            <span className="text-gray-400">0 FCFA</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Pied Modal */}
                <div className="p-3 bg-gray-50 border-t flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setReglementBonsModal(false)}
                    className="px-4 py-2 rounded-lg border text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleValiderReglementBons}
                    className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors"
                  >
                    ✓ Valider l'encaissement ({F(n(reglementBonsForm.montant_verse))} FCFA)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
