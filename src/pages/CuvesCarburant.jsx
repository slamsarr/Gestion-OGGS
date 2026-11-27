import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listJaugesCuves,
  saveJaugeCuve,
  listLivraisons,
  saveLivraison,
  listDescentes,
  saveRapportDepotage,
  listRapportsDepotage,
  saveCuve,
  deleteCuve,
  rowMatchesStation,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Loading } from "../components/ui";
import { peutAgirProfil } from "../lib/permissions";

export default function CuvesCarburant() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const peutSaisirJauge = peutAgirProfil(profil, "stock", "ajuster");
  const peutDepotage = peutAgirProfil(profil, "depotage", "creer");
  const peutValiderDepotage = peutAgirProfil(profil, "depotage", "valider");

  const [ref, setRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jauge"); // jauge | depotage | rapports | ecarts
  const [msg, setMsg] = useState({ text: "", type: "ok" });

  // Jauge physique & Rapprochement quotidien multi-cuves
  const [date, setDate] = useState(todayISO());
  const [selectedCuveId, setSelectedCuveId] = useState("");
  const [stockPhysique, setStockPhysique] = useState("");
  const [hauteurCm, setHauteurCm] = useState("");
  const [eauFondCm, setEauFondCm] = useState("");
  const [jauges, setJauges] = useState([]);
  const [descentes, setDescentes] = useState([]);
  const [livraisons, setLivraisons] = useState([]);
  const [rapportsDepotage, setRapportsDepotage] = useState([]);

  // Modal Ajout rapide de Cuve & Filtre historique
  const [showAddCuveModal, setShowAddCuveModal] = useState(false);
  const [newCuveForm, setNewCuveForm] = useState({ nom: "", produit: "GASOIL", capacite_l: 30000 });
  const [filtreHistoriqueCuve, setFiltreHistoriqueCuve] = useState("ALL");

  // ── Formulaire Rapport de Dépotage Complet (En-tête Camion & 5 Étapes) ──
  const genererNumeroDepotage = () => {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(100 + Math.random() * 900);
    return `DEP-${(stationId || "ST").toUpperCase().slice(0, 4)}-${ymd}-${rand}`;
  };

  const [depotageForm, setDepotageForm] = useState({
    numero_depotage: `DEP-${(stationId || "ST").toUpperCase().slice(0, 4)}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`,
    date: todayISO(),
    heure_arrivee: "09:45",
    heure_debut: "10:00",
    heure_fin: "11:15",
    produit: "GASOIL / SUPER",
    cuve_id: "",
    fournisseur: "TOTAL Energies Marketing",
    transporteur: "STT Carburants Sénégal",
    numero_commande: "",
    numero_bl: "",
    immatriculation_camion: "", // Tracteur
    immatriculation_remorque: "", // Citerne / Remorque
    nom_chauffeur: "",
    numero_permis: "",
    agent_controleur: profil?.nom_complet || "Agent Contrôleur",
    responsable_reception: profil?.nom_complet || "Chef de Station",

    // Checklist de Sécurité & Conformité en 10 points (procédure standard de dépotage)
    check_documents_identite: true,
    check_produit_cuve_conforme: true,
    check_capacite_creux_validee: true,
    check_raccords_flexibles_etanches: true,
    check_balisage_extincteurs_prets: true,
    check_prise_de_terre_branchee: true,
    check_moteur_coupe_cales_posees: true,
    check_pistolets_distribution_arretes: true,
    check_absence_fuite_surveillance: true,
    check_test_eau_fond_cuve_negatif: true, // true = absence d'eau (conforme)
    check_test_eau_camion_negatif: true,    // true = absence d'eau (conforme)

    scelles_conformes: true,
    numeros_scelles: "",
    densite_mesuree: "0.835",
    temperature_c: "28",
    observations_chauffeur: "",
    observations: "",
  });

  // ── DÉPOTAGE PILOTÉ PAR LA CUVE (Tank-Centric State) ──
  const [depotageCuveId, setDepotageCuveId] = useState("");
  const [cuveJaugeAvant, setCuveJaugeAvant] = useState({ hauteur_cm: "", volume_l: "" });
  const [cuveJaugeApres, setCuveJaugeApres] = useState({ hauteur_cm: "", volume_l: "" });
  const [eauFondCuveValidee, setEauFondCuveValidee] = useState(true);

  // Compartiments du camion alimentant la cuve sélectionnée (choix libre : C1, C3, C5...)
  const [cuveCompartiments, setCuveCompartiments] = useState([
    {
      id: "comp-1",
      numero_compartiment: "C1",
      numero_scelle: "",
      volume_commande: "10000",
      volume_bl: "10000",
      reste_camion_litres: "0",
      constat_manquant: false,
      manquant_citerne_l: "",
      motif_manquant: "Niveau inférieur au repère flèche",
      prelevement_pompe: false,
      pistolet_code: "",
      pompe_index_depart: "",
      pompe_index_fin: "",
      volume_preleve_pompe: "",
      accord_chauffeur: true,
    },
  ]);

  // Modal Visualisation & Impression Procès-Verbal
  const [pvModal, setPvModal] = useState(null);

  const flash = (text, type = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "ok" }), 4500);
  };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const [j, l, des, rap] = await Promise.all([
        listJaugesCuves(stationId),
        listLivraisons(stationId).catch(() => []),
        listDescentes(stationId).catch(() => []),
        listRapportsDepotage(stationId).catch(() => []),
      ]);
      setJauges(j || []);
      setLivraisons(l || []);
      setDescentes(des || []);
      setRapportsDepotage(rap || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  // Station active (résolution du vrai UUID et code station)
  const activeStation = useMemo(() => {
    return (ref?.stations || []).find((s) => rowMatchesStation(s, stationId, ref?.stations)) || {
      id: stationId,
      code: "HANN",
      nom: profil?.station_nom || "Star Energy Hann Mariste",
    };
  }, [ref, stationId, profil]);

  // Cuves référentiel pour la station active
  const stationCuves = useMemo(() => {
    const list = (ref?.cuves || []).filter((c) => rowMatchesStation(c, stationId, ref?.stations));
    if (list.length > 0) return list;
    return [
      { id: "cuve-gasoil-1", station_id: activeStation?.id || stationId, nom: "Cuve 1 Gasoil", code: "C-GO-1", produit: "GASOIL", capacite_l: 30000 },
      { id: "cuve-super-1", station_id: activeStation?.id || stationId, nom: "Cuve 1 Super", code: "C-SP-1", produit: "SUPER", capacite_l: 20000 },
    ];
  }, [ref, stationId, activeStation]);

  // Cartographie complète de chaque cuve avec son dernier jaugeage et ses jauges
  const cuvesWithLatestJauge = useMemo(() => {
    return stationCuves.map((c) => {
      const lastJ = jauges.find((j) => (j.cuve_id && j.cuve_id === c.id)) ||
                    jauges.find((j) => (!j.cuve_id && j.produit === c.produit)) ||
                    { volume_physique: 0, date: todayISO(), hauteur_cm: "", eau_fond_cm: 0 };
      const vol = n(lastJ.volume_physique) || 0;
      const cap = n(c.capacite_l) || 30000;
      const pct = cap > 0 ? Math.min(100, Math.round((vol / cap) * 100)) : 0;
      const creux = Math.max(0, cap - vol);
      return {
        ...c,
        nom: c.nom || `Cuve ${c.produit}`,
        latestJauge: lastJ,
        volume_physique: vol,
        capacite_l: cap,
        pourcentage: pct,
        creux_disponible: creux,
      };
    });
  }, [stationCuves, jauges]);

  // Synchronisation cuve sélectionnée par défaut
  useEffect(() => {
    if (!selectedCuveId && cuvesWithLatestJauge.length > 0) {
      setSelectedCuveId(cuvesWithLatestJauge[0].id);
    }
  }, [cuvesWithLatestJauge, selectedCuveId]);

  const activeCuve = cuvesWithLatestJauge.find((c) => c.id === selectedCuveId) || cuvesWithLatestJauge[0] || {
    id: "cuve-gasoil-1",
    nom: "Cuve 1 Gasoil",
    produit: "GASOIL",
    capacite_l: 30000,
    volume_physique: 0,
    creux_disponible: 30000,
    pourcentage: 0,
    latestJauge: { volume_physique: 0, hauteur_cm: "", eau_fond_cm: 0 },
  };

  // Totaux consolidés par carburant (plusieurs cuves de Gasoil, plusieurs cuves de Super)
  const gasoilCuves = cuvesWithLatestJauge.filter((c) => c.produit === "GASOIL");
  const superCuves = cuvesWithLatestJauge.filter((c) => c.produit === "SUPER");

  const stockTotalGasoil = gasoilCuves.reduce((s, c) => s + c.volume_physique, 0);
  const capaciteTotaleGasoil = gasoilCuves.reduce((s, c) => s + c.capacite_l, 0);
  const creuxTotalGasoil = Math.max(0, capaciteTotaleGasoil - stockTotalGasoil);
  const pctTotalGasoil = capaciteTotaleGasoil > 0 ? Math.min(100, Math.round((stockTotalGasoil / capaciteTotaleGasoil) * 100)) : 0;

  const stockTotalSuper = superCuves.reduce((s, c) => s + c.volume_physique, 0);
  const capaciteTotaleSuper = superCuves.reduce((s, c) => s + c.capacite_l, 0);
  const creuxTotalSuper = Math.max(0, capaciteTotaleSuper - stockTotalSuper);
  const pctTotalSuper = capaciteTotaleSuper > 0 ? Math.min(100, Math.round((stockTotalSuper / capaciteTotaleSuper) * 100)) : 0;

  // Consommation estimée
  const computeConsoJour = (prod) => {
    const prodDes = descentes.filter((d) => (d.produit || "").toUpperCase() === prod);
    if (prodDes.length === 0) return prod === "GASOIL" ? 2500 : 1800;
    const totalVendu = prodDes.reduce((sum, d) => sum + (n(d.volume_vendu) || 0), 0);
    const uniqueDates = new Set(prodDes.map((d) => d.date)).size || 1;
    return Math.max(100, Math.round(totalVendu / uniqueDates));
  };

  const consoJourGasoil = computeConsoJour("GASOIL");
  const consoJourSuper = computeConsoJour("SUPER");
  const autonomieGasoil = consoJourGasoil > 0 && stockTotalGasoil > 0 ? (stockTotalGasoil / consoJourGasoil).toFixed(1) : 0;
  const autonomieSuper = consoJourSuper > 0 && stockTotalSuper > 0 ? (stockTotalSuper / consoJourSuper).toFixed(1) : 0;

  const capaciteActive = activeCuve.capacite_l;
  const stockTheoriqueEstime = activeCuve.volume_physique;
  const ecartCuve = stockPhysique !== "" ? n(stockPhysique) - stockTheoriqueEstime : 0;
  const tauxCoulagePct = stockPhysique !== "" && stockTheoriqueEstime > 0 ? (ecartCuve / stockTheoriqueEstime) * 100 : 0;
  const toleranceRespectee = Math.abs(tauxCoulagePct) <= 0.3;

  // Prix du jour pour valorisation des manquants (historique officiel)
  const prixGasoil = 755;
  const prixSuper = 990;

  // ── DÉPOTAGE PILOTÉ PAR LA CUVE : SÉLECTION & CALCULS ──
  const targetDepotageCuve = useMemo(() => {
    return (
      cuvesWithLatestJauge.find((c) => c.id === depotageCuveId) ||
      cuvesWithLatestJauge[0] ||
      activeCuve
    );
  }, [cuvesWithLatestJauge, depotageCuveId, activeCuve]);

  // Synchronisation automatique de la cuve et du jaugeage avant initial
  useEffect(() => {
    if (!depotageCuveId && cuvesWithLatestJauge.length > 0) {
      const c = cuvesWithLatestJauge[0];
      setDepotageCuveId(c.id);
      setCuveJaugeAvant({
        hauteur_cm: c.latestJauge?.hauteur_cm != null ? c.latestJauge.hauteur_cm.toString() : "",
        volume_l: c.volume_physique != null ? c.volume_physique.toString() : "0",
      });
    }
  }, [cuvesWithLatestJauge, depotageCuveId]);

  const handleSelectDepotageCuve = (cuve) => {
    setDepotageCuveId(cuve.id);
    setCuveJaugeAvant({
      hauteur_cm: cuve.latestJauge?.hauteur_cm != null ? cuve.latestJauge.hauteur_cm.toString() : "",
      volume_l: cuve.volume_physique != null ? cuve.volume_physique.toString() : "0",
    });
    setCuveJaugeApres({ hauteur_cm: "", volume_l: "" });
    flash(`Cuve ${cuve.nom} (${cuve.produit}) sélectionnée pour le dépotage.`);
  };

  const handlePreRemplirJaugeAvantCuve = () => {
    if (!targetDepotageCuve) return;
    setCuveJaugeAvant({
      hauteur_cm: targetDepotageCuve.latestJauge?.hauteur_cm != null ? targetDepotageCuve.latestJauge.hauteur_cm.toString() : "",
      volume_l: targetDepotageCuve.volume_physique != null ? targetDepotageCuve.volume_physique.toString() : "0",
    });
    flash(`Jauge avant pré-remplie pour ${targetDepotageCuve.nom} (${targetDepotageCuve.volume_physique || 0} L)`);
  };

  // Pistolets de la station filtrés par produit pour prélèvements compensatoires
  const pistoletsStation = useMemo(() => {
    return (ref?.pistolets || []).filter((p) => rowMatchesStation(p, stationId, ref?.stations));
  }, [ref, stationId]);

  const pistoletsProduit = useMemo(() => {
    const prod = targetDepotageCuve?.produit || "GASOIL";
    const filtered = pistoletsStation.filter((p) => (p.produit || "").toUpperCase() === prod);
    if (filtered.length > 0) return filtered;
    return prod === "GASOIL"
      ? [
          { code: "P1-GO", nom: "Pompe 1 Gasoil", produit: "GASOIL" },
          { code: "P2-GO", nom: "Pompe 2 Gasoil", produit: "GASOIL" },
          { code: "P3-GO", nom: "Pompe 3 Gasoil", produit: "GASOIL" },
        ]
      : [
          { code: "P1-SP", nom: "Pompe 1 Super", produit: "SUPER" },
          { code: "P2-SP", nom: "Pompe 2 Super", produit: "SUPER" },
        ];
  }, [pistoletsStation, targetDepotageCuve]);

  // ── CALCULS EN TEMPS RÉEL DU DÉPOTAGE DE LA CUVE ──
  const totalVolumeBlVersCuve = cuveCompartiments.reduce((s, c) => s + (n(c.volume_bl) || 0), 0);
  const totalVolumeCommandeCuve = cuveCompartiments.reduce((s, c) => s + (n(c.volume_commande) || n(c.volume_bl) || 0), 0);
  const stockInitialCuve = n(cuveJaugeAvant.volume_l) || 0;
  const capaciteCuve = targetDepotageCuve?.capacite_l || 30000;
  const creuxDisponibleCuve = Math.max(0, capaciteCuve - stockInitialCuve);
  const risqueDebordementCuve = totalVolumeBlVersCuve > creuxDisponibleCuve && stockInitialCuve > 0;
  const stockTheoriqueApresCuve = stockInitialCuve + totalVolumeBlVersCuve;
  const stockFinalCuve = n(cuveJaugeApres.volume_l) || 0;
  const volumeDepoteReelCuve = stockFinalCuve > 0 ? Math.max(0, stockFinalCuve - stockInitialCuve) : 0;
  const ecartReceptionCuveL = stockFinalCuve > 0 ? stockFinalCuve - stockTheoriqueApresCuve : 0;
  const ecartPctCuve = totalVolumeBlVersCuve > 0 && stockFinalCuve > 0 ? Number(((ecartReceptionCuveL / totalVolumeBlVersCuve) * 100).toFixed(2)) : 0;
  const toleranceRespecteeCuve = Math.abs(ecartPctCuve) <= 0.20;
  const manquantCuveL = ecartReceptionCuveL < 0 ? Math.abs(ecartReceptionCuveL) : 0;
  const manquantAdmissibleCuveL = totalVolumeBlVersCuve * 0.002;
  const manquantLitigeCuveL = Math.max(0, manquantCuveL - manquantAdmissibleCuveL);
  const prixUnitaireCuve = targetDepotageCuve?.produit === "GASOIL" ? prixGasoil : prixSuper;
  const valeurManquantCuveFcfa = manquantCuveL * prixUnitaireCuve;
  const cuveDepotageConforme = toleranceRespecteeCuve || stockFinalCuve === 0;

  // Prélèvement compensatoire aux pompes en cas de manquant constaté en citerne
  const totalVolumePrelevePompes = cuveCompartiments.reduce((s, c) => {
    return s + (c.constat_manquant && c.prelevement_pompe ? (n(c.volume_preleve_pompe) || 0) : 0);
  }, 0);
  const aDesPrelevementsPompes = cuveCompartiments.some(
    (c) => c.constat_manquant && c.prelevement_pompe && n(c.volume_preleve_pompe) > 0
  );

  const handleAddCuveCompartiment = (suggestedComp = null) => {
    const nextIdx = cuveCompartiments.length + 1;
    const defaultCode = suggestedComp || `C${nextIdx <= 8 ? nextIdx : nextIdx}`;
    setCuveCompartiments((prev) => [
      ...prev,
      {
        id: `comp-${Date.now()}-${nextIdx}`,
        numero_compartiment: defaultCode,
        numero_scelle: "",
        volume_commande: "5000",
        volume_bl: "5000",
        reste_camion_litres: "0",
        constat_manquant: false,
        manquant_citerne_l: "",
        motif_manquant: "Niveau inférieur au repère flèche",
        prelevement_pompe: false,
        pistolet_code: pistoletsProduit[0]?.code || "P1-GO",
        pompe_index_depart: "",
        pompe_index_fin: "",
        volume_preleve_pompe: "",
        accord_chauffeur: true,
      },
    ]);
    flash(`Compartiment ${defaultCode} ajouté pour alimenter ${targetDepotageCuve?.nom || "la cuve"}.`);
  };

  const handleRemoveCuveCompartiment = (id) => {
    if (cuveCompartiments.length <= 1) {
      return flash("La cuve doit recevoir du carburant d'au moins un compartiment", "err");
    }
    setCuveCompartiments((prev) => prev.filter((c) => c.id !== id));
    flash("Compartiment retiré.");
  };

  const handleUpdateCuveCompartiment = (id, field, val) => {
    setCuveCompartiments((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: val };
        // Calcul automatique du volume prélevé à la pompe si index saisis
        if (field === "pompe_index_depart" || field === "pompe_index_fin") {
          const dep = field === "pompe_index_depart" ? n(val) : n(c.pompe_index_depart);
          const fin = field === "pompe_index_fin" ? n(val) : n(c.pompe_index_fin);
          if (fin > dep && dep > 0) {
            updated.volume_preleve_pompe = (fin - dep).toFixed(1);
          }
        }
        return updated;
      })
    );
  };

  const handleAlignerPrelevementSurManquant = (id) => {
    setCuveCompartiments((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const manq = n(c.manquant_citerne_l) || 0;
        return {
          ...c,
          volume_preleve_pompe: manq > 0 ? manq.toString() : c.volume_preleve_pompe,
        };
      })
    );
    flash("Volume prélevé à la pompe aligné sur le manquant constaté du compartiment.");
  };

  const handleChainerDepotageAutreCuve = (autreCuveId) => {
    const nextCuve =
      cuvesWithLatestJauge.find((c) => c.id === autreCuveId) ||
      cuvesWithLatestJauge.find((c) => c.id !== targetDepotageCuve?.id) ||
      targetDepotageCuve;

    setDepotageCuveId(nextCuve.id);
    setDepotageForm((prev) => ({
      ...prev,
      numero_depotage: genererNumeroDepotage(),
    }));
    setCuveJaugeAvant({
      hauteur_cm: nextCuve.latestJauge?.hauteur_cm != null ? nextCuve.latestJauge.hauteur_cm.toString() : "",
      volume_l: nextCuve.volume_physique != null ? nextCuve.volume_physique.toString() : "0",
    });
    setCuveJaugeApres({ hauteur_cm: "", volume_l: "" });
    setCuveCompartiments([
      {
        id: `comp-${Date.now()}`,
        numero_compartiment: "C2",
        numero_scelle: "",
        volume_commande: "5000",
        volume_bl: "5000",
        reste_camion_litres: "0",
        constat_manquant: false,
        manquant_citerne_l: "",
        motif_manquant: "Niveau inférieur au repère flèche",
        prelevement_pompe: false,
        pistolet_code: pistoletsProduit[0]?.code || "P1-GO",
        pompe_index_depart: "",
        pompe_index_fin: "",
        volume_preleve_pompe: "",
        accord_chauffeur: true,
      },
    ]);
    setPvModal(null);
    setTab("depotage");
    flash(`Prêt pour le dépotage de ${nextCuve.nom} avec le même camion (BL: ${depotageForm.numero_bl || "--"})`, "ok");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEnregistrerJauge = async (e) => {
    e.preventDefault();
    if (!peutSaisirJauge) return flash("Tu n'as pas le droit d'ajuster une jauge cuve.", "err");
    if (!stockPhysique) return flash("Veuillez saisir le volume physique mesuré", "err");

    const payload = {
      station_id: stationId,
      cuve_id: activeCuve.id,
      cuve_nom: activeCuve.nom,
      date,
      produit: activeCuve.produit,
      hauteur_cm: n(hauteurCm),
      eau_fond_cm: n(eauFondCm) || 0,
      volume_physique: n(stockPhysique),
      stock_theorique: stockTheoriqueEstime,
      ecart_litres: ecartCuve,
      operateur: profil?.nom_complet || "Responsable Stock",
    };

    const res = await saveJaugeCuve(payload);
    if (res.ok) {
      flash(`✓ Jauge ${activeCuve.nom} (${activeCuve.produit}) enregistrée avec succès !`, "ok");
      setStockPhysique("");
      setHauteurCm("");
      setEauFondCm("");
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement de la jauge", "err");
    }
  };

  const handleCreerNouvelleCuve = async (e) => {
    e.preventDefault();
    if (!newCuveForm.nom.trim()) return flash("Veuillez donner un nom à la cuve", "err");
    if (!newCuveForm.capacite_l || n(newCuveForm.capacite_l) <= 0) return flash("Capacité invalide", "err");

    const targetStationId = activeStation?.id || stationId;

    const res = await saveCuve({
      station_id: targetStationId,
      nom: newCuveForm.nom.trim(),
      produit: newCuveForm.produit,
      capacite_l: n(newCuveForm.capacite_l),
    });

    if (res.ok) {
      flash(`✓ Cuve ${newCuveForm.nom} (${newCuveForm.produit}) ajoutée avec succès !`, "ok");
      setShowAddCuveModal(false);
      setNewCuveForm({ nom: "", produit: "GASOIL", capacite_l: 30000 });
      await loadData();
    } else {
      flash("Erreur lors de la création de la cuve : " + (res.error || ""), "err");
    }
  };

  const handleSelectCuveForJauge = (cuveId) => {
    setSelectedCuveId(cuveId);
    setTab("jauge");
    if (typeof window !== "undefined") {
      const el = document.getElementById("form-jauge-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleValiderDepotage = async (e) => {
    e.preventDefault();

    if (!peutValiderDepotage) return flash("Tu n'as pas le droit de valider un dépotage. Cette action est réservée au Gérant / Direction.", "err");
    if (!depotageForm.numero_bl?.trim()) {
      return flash("Le numéro de BL du camion est obligatoire", "err");
    }
    if (!cuveJaugeApres.volume_l || n(cuveJaugeApres.volume_l) <= 0) {
      return flash(`Veuillez saisir la jauge finale après dépotage pour ${targetDepotageCuve?.nom || "la cuve"}`, "err");
    }
    if (totalVolumeBlVersCuve <= 0) {
      return flash("Le volume total BL affecté à cette cuve doit être > 0", "err");
    }

    // Validation des compartiments alimentant cette cuve
    for (const c of cuveCompartiments) {
      if (!c.numero_scelle?.trim()) {
        return flash(`Compartiment ${c.numero_compartiment} : Veuillez saisir le numéro de scellé / plomb de sécurité`, "err");
      }
      if (n(c.volume_bl) <= 0) {
        return flash(`Compartiment ${c.numero_compartiment} : Le volume BL doit être > 0`, "err");
      }
      if (c.constat_manquant && c.prelevement_pompe) {
        if (!c.pistolet_code) {
          return flash(`Compartiment ${c.numero_compartiment} : Veuillez sélectionner la pompe/pistolet pour le prélèvement compensatoire`, "err");
        }
        if (n(c.volume_preleve_pompe) <= 0) {
          return flash(`Compartiment ${c.numero_compartiment} : Veuillez saisir le volume prélevé à la pompe (Litres)`, "err");
        }
      }
    }

    const prelevementsPompes = cuveCompartiments
      .filter((c) => c.constat_manquant && c.prelevement_pompe && n(c.volume_preleve_pompe) > 0)
      .map((c) => ({
        numero_compartiment: c.numero_compartiment,
        manquant_citerne_l: n(c.manquant_citerne_l),
        motif_manquant: c.motif_manquant || "Manquant au repère flèche",
        pistolet_code: c.pistolet_code,
        pompe_index_depart: n(c.pompe_index_depart),
        pompe_index_fin: n(c.pompe_index_fin),
        volume_preleve_pompe: n(c.volume_preleve_pompe),
        accord_chauffeur: c.accord_chauffeur ?? true,
      }));

    const payload = {
      ...depotageForm,
      station_id: stationId,
      station_nom: profil?.station_nom || activeStation?.nom || "Station Hann Maristes",
      numero_depotage: depotageForm.numero_depotage || genererNumeroDepotage(),
      cuve_id: targetDepotageCuve.id,
      cuve_nom: targetDepotageCuve.nom,
      produit: targetDepotageCuve.produit,
      numero_bl: depotageForm.numero_bl.trim(),
      jauge_avant_cm: n(cuveJaugeAvant.hauteur_cm),
      jauge_avant_litres: stockInitialCuve,
      jauge_apres_cm: n(cuveJaugeApres.hauteur_cm),
      jauge_apres_litres: stockFinalCuve,
      volume_commande: totalVolumeCommandeCuve,
      volume_bl: totalVolumeBlVersCuve,
      stock_theorique: stockTheoriqueApresCuve,
      volume_decharge_reel: volumeDepoteReelCuve,
      ecart_litres: ecartReceptionCuveL,
      ecart_pourcentage: ecartPctCuve,
      manquant_litres: manquantCuveL,
      manquant_fcfa: valeurManquantCuveFcfa,
      conformite_ecart: toleranceRespecteeCuve,
      statut: toleranceRespecteeCuve ? "CONFORME" : "LITIGE MANQUANT",
      prelevement_pompe_actif: aDesPrelevementsPompes,
      prelevement_pompe_total_l: totalVolumePrelevePompes,
      prelevements_pompes: prelevementsPompes,
      compartiments: cuveCompartiments.map((c) => ({
        ...c,
        produit: targetDepotageCuve.produit,
        cuve_station_id: targetDepotageCuve.id,
        cuve_nom: targetDepotageCuve.nom,
        volume_bl_num: n(c.volume_bl),
        jauge_cuve_avant_l: stockInitialCuve,
        jauge_cuve_apres_l: stockFinalCuve,
        stock_theorique_apres: stockInitialCuve + n(c.volume_bl),
        volume_decharge_cuve: volumeDepoteReelCuve,
        ecart_litres: ecartReceptionCuveL,
        ecart_pourcentage: ecartPctCuve,
        manquant_litres: manquantCuveL,
        valeur_manquant_fcfa: valeurManquantCuveFcfa,
        tolerance_ok: toleranceRespecteeCuve,
        statut: toleranceRespecteeCuve ? "CONFORME" : "LITIGE",
        constat_manquant: !!c.constat_manquant,
        manquant_citerne_l: n(c.manquant_citerne_l),
        motif_manquant: c.motif_manquant || "",
        prelevement_pompe: !!c.prelevement_pompe,
        pistolet_code: c.pistolet_code || "",
        pompe_index_depart: n(c.pompe_index_depart),
        pompe_index_fin: n(c.pompe_index_fin),
        volume_preleve_pompe: n(c.volume_preleve_pompe),
        accord_chauffeur: c.accord_chauffeur ?? true,
      })),
    };

    const res = await saveRapportDepotage(payload);
    if (res.ok) {
      flash(`✅ Dépotage validé avec succès pour ${targetDepotageCuve.nom} !`, "ok");
      setPvModal(res.rapport);
      // Maintien des informations du convoi camion pour pouvoir dépotter une autre cuve
      setDepotageForm((prev) => ({
        ...prev,
        numero_depotage: genererNumeroDepotage(),
      }));
      setCuveJaugeApres({ hauteur_cm: "", volume_l: "" });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      await loadData();
    } else {
      flash("Erreur lors de l'enregistrement du rapport de dépotage", "err");
    }
  };

  if (loading) return <Loading label="Chargement des Cuves & Dépotages..." />;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3">
      {/* En-tête de page moderne & aéré */}
      <div className="space-y-4 mb-5 pb-4 border-b" style={{ borderColor: T.line }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-2xl">🛢️</span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: T.petrol }}>
                Cuves & Dépotages Carburant
              </h1>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                Rapprochement Pétrolier Multi-Cuves
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Jauges physiques quotidiennes par cuve (Gasoil &amp; Super), contrôle anti-débordement, PV de dépotage citerne et tolérances transport
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddCuveModal(true)}
            className="self-start md:self-auto text-xs px-3.5 py-2 rounded-xl font-bold text-gray-900 shadow-sm transition-all hover:opacity-90 flex items-center gap-1.5"
            style={{ background: T.gold }}
          >
            <span>➕</span>
            <span>Ajouter une Cuve</span>
          </button>
        </div>

        {/* Barre d'onglets de navigation épurée */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            <button
              type="button"
              onClick={() => setTab("jauge")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                tab === "jauge"
                  ? "bg-[#0B2545] text-white shadow-xs ring-1 ring-blue-950"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <span>📏</span>
              <span>Jauge Quotidienne</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("depotage")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                tab === "depotage"
                  ? "bg-[#0B2545] text-white shadow-xs ring-1 ring-blue-950"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <span>🚚</span>
              <span>Nouveau Dépotage (PV)</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("rapports")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                tab === "rapports"
                  ? "bg-[#0B2545] text-white shadow-xs ring-1 ring-blue-950"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <span>📄</span>
              <span>Rapports Dépotage ({rapportsDepotage.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("ecarts")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                tab === "ecarts"
                  ? "bg-[#0B2545] text-white shadow-xs ring-1 ring-blue-950"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <span>📊</span>
              <span>Historique Jauges ({jauges.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Message Flash */}
      {msg.text && (
        <div
          className={`mb-4 p-3 text-xs rounded-lg font-medium border flex items-center justify-between shadow-sm animate-fade-in ${
            msg.type === "err" ? "bg-red-50 text-red-800 border-red-200" : "bg-emerald-50 text-emerald-900 border-emerald-200"
          }`}
        >
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg({ text: "", type: "ok" })} className="text-gray-400 hover:text-gray-600 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* ────────────────── 1. SYNTHÈSE GLOBALE CONSOLIDÉE PAR CARBURANT ────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Total Consolidé Gasoil */}
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 rounded-2xl p-4 text-white shadow-md border border-blue-800/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛢️</span>
              <div>
                <span className="font-black text-sm tracking-wide text-blue-200">STOCK CONSOLIDÉ GASOIL</span>
                <div className="text-[10px] text-blue-300 font-medium">{gasoilCuves.length} cuve(s) physique(s)</div>
              </div>
            </div>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
              Capacité : {F(capaciteTotaleGasoil)} L
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden my-2 border border-slate-700">
            <div
              className="h-full rounded-full transition-all flex items-center justify-end px-2"
              style={{
                width: `${Math.max(pctTotalGasoil, 5)}%`,
                background: pctTotalGasoil < 15 ? "#EF4444" : pctTotalGasoil < 30 ? "#F59E0B" : "#3B82F6",
              }}
            >
              <span className="text-[9px] font-black text-white tabular">{pctTotalGasoil}%</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs mt-2 text-slate-200">
            <span>Stock total : <strong className="text-white text-sm font-black">{F(stockTotalGasoil)} L</strong></span>
            <span>Creux dispo : <strong className="text-emerald-400 font-black">{F(creuxTotalGasoil)} L</strong></span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex justify-between border-t border-slate-700/60 pt-1.5">
            <span>Conso estimée : ~{F(consoJourGasoil)} L/j</span>
            <span>Autonomie totale : <strong className="text-blue-300">~{autonomieGasoil} jours</strong></span>
          </div>
        </div>

        {/* Total Consolidé Super */}
        <div className="bg-gradient-to-br from-emerald-950 to-slate-900 rounded-2xl p-4 text-white shadow-md border border-emerald-800/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛢️</span>
              <div>
                <span className="font-black text-sm tracking-wide text-emerald-200">STOCK CONSOLIDÉ SUPER</span>
                <div className="text-[10px] text-emerald-300 font-medium">{superCuves.length} cuve(s) physique(s)</div>
              </div>
            </div>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              Capacité : {F(capaciteTotaleSuper)} L
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden my-2 border border-slate-700">
            <div
              className="h-full rounded-full transition-all flex items-center justify-end px-2"
              style={{
                width: `${Math.max(pctTotalSuper, 5)}%`,
                background: pctTotalSuper < 15 ? "#EF4444" : pctTotalSuper < 30 ? "#F59E0B" : "#10B981",
              }}
            >
              <span className="text-[9px] font-black text-white tabular">{pctTotalSuper}%</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs mt-2 text-slate-200">
            <span>Stock total : <strong className="text-white text-sm font-black">{F(stockTotalSuper)} L</strong></span>
            <span>Creux dispo : <strong className="text-emerald-400 font-black">{F(creuxTotalSuper)} L</strong></span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex justify-between border-t border-slate-700/60 pt-1.5">
            <span>Conso estimée : ~{F(consoJourSuper)} L/j</span>
            <span>Autonomie totale : <strong className="text-emerald-300">~{autonomieSuper} jours</strong></span>
          </div>
        </div>
      </div>

      {/* ────────────────── 2. GRILLE DÉTAILLÉE PAR CUVE PHYSIQUE ────────────────── */}
      <div className="bg-white rounded-2xl border p-4 mb-5 shadow-xs" style={{ borderColor: T.line }}>
        <div className="flex items-center justify-between pb-3 mb-3 border-b" style={{ borderColor: T.line }}>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
              <span>🛢️</span>
              <span>Détail des Cuves Physiques de la Station ({cuvesWithLatestJauge.length} cuves configurées)</span>
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Chaque cuve dispose de sa propre jauge au barème, de son creux anti-débordement et de sa mesure d'eau au fond
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {cuvesWithLatestJauge.map((c) => {
            const isGasoil = c.produit === "GASOIL";
            const isSelected = c.id === activeCuve.id;
            const eau = n(c.latestJauge?.eau_fond_cm) || 0;

            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isSelected ? "ring-2 ring-blue-600 bg-blue-50/20" : "bg-white hover:border-slate-300"
                }`}
                style={{ borderColor: isSelected ? "#2563eb" : T.line }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🛢️</span>
                    <span className="font-extrabold text-xs text-gray-900">{c.nom}</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-black ${
                      isGasoil ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {c.produit}
                  </span>
                </div>

                <div className="text-[11px] text-gray-500 flex justify-between mb-1">
                  <span>Capacité nominale</span>
                  <strong className="text-gray-800 tabular">{F(c.capacite_l)} L</strong>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden my-1.5 border border-gray-200">
                  <div
                    className="h-full rounded-full transition-all flex items-center justify-end px-1.5"
                    style={{
                      width: `${Math.max(c.pourcentage, 6)}%`,
                      background: c.pourcentage < 15 ? "#EF4444" : c.pourcentage < 30 ? "#F59E0B" : isGasoil ? "#3B82F6" : "#10B981",
                    }}
                  >
                    <span className="text-[9px] font-bold text-white tabular">{c.pourcentage}%</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs mt-2">
                  <span>Stock : <strong className="text-gray-900 font-bold">{F(c.volume_physique)} L</strong></span>
                  <span>Creux : <strong className="text-emerald-700 font-bold">{F(c.creux_disponible)} L</strong></span>
                </div>

                {/* Données dernière jauge & Eau de fond */}
                <div className="text-[10px] text-gray-500 mt-2 pt-2 border-t flex items-center justify-between" style={{ borderColor: T.line }}>
                  <div>
                    {c.latestJauge?.hauteur_cm ? (
                      <span>Latte : <strong>{c.latestJauge.hauteur_cm} cm</strong></span>
                    ) : (
                      <span>Dernière : {fmtDate(c.latestJauge?.date)}</span>
                    )}
                  </div>
                  <div>
                    {eau > 0 ? (
                      <span className="text-red-600 font-bold">⚠️ Eau : {eau} cm</span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">✓ Sans eau</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectCuveForJauge(c.id)}
                  className={`w-full mt-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    isSelected
                      ? "bg-[#0B2545] text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                  }`}
                >
                  <span>📏</span>
                  <span>{isSelected ? "Cuve sélectionnée pour jauge" : "Jauger cette cuve"}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ────────────────── ONGLET 1 : JAUGE QUOTIDIENNE ────────────────── */}
      {tab === "jauge" && (
        <div id="form-jauge-section" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: T.line }}>
                <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
                  Enregistrement de la Jauge Physique Quotidienne
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                  Cuve active : {activeCuve.nom} ({activeCuve.produit})
                </span>
              </div>

              <form onSubmit={handleEnregistrerJauge} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Sélectionner la cuve à jauger *</label>
                    <select
                      value={activeCuve.id}
                      onChange={(e) => setSelectedCuveId(e.target.value)}
                      className="w-full text-xs border rounded p-2 bg-white font-bold text-gray-900"
                      style={{ borderColor: T.line }}
                    >
                      {cuvesWithLatestJauge.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom} — {c.produit} (Capacité : {F(c.capacite_l)} L | Stock actuel : {F(c.volume_physique)} L)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date de la mesure *</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Hauteur à la latte (cm)</label>
                    <input
                      type="number"
                      placeholder="ex: 185"
                      value={hauteurCm}
                      onChange={(e) => setHauteurCm(e.target.value)}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Volume barème (Litres) *</label>
                    <input
                      type="number"
                      placeholder="ex: 18500"
                      value={stockPhysique}
                      onChange={(e) => setStockPhysique(e.target.value)}
                      className="w-full text-xs border rounded p-2 font-bold text-blue-950 bg-blue-50/30"
                      style={{ borderColor: T.line }}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pâte à eau / Trace d'eau (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0 si sans eau"
                      value={eauFondCm}
                      onChange={(e) => setEauFondCm(e.target.value)}
                      className={`w-full text-xs border rounded p-2 font-semibold ${
                        n(eauFondCm) > 0 ? "border-red-400 bg-red-50 text-red-900" : ""
                      }`}
                      style={{ borderColor: n(eauFondCm) > 0 ? "#f87171" : T.line }}
                    />
                  </div>
                </div>

                {n(eauFondCm) > 0 && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-semibold flex items-center gap-2">
                    <span>⚠️</span>
                    <span>Présence d'eau détectée au fond de {activeCuve.nom} ({eauFondCm} cm). Purge recommandée avant toute distribution.</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90 mt-2"
                  style={{ background: T.gold }}
                >
                  ✓ Enregistrer la Jauge de « {activeCuve.nom} » & Valider le Rapprochement
                </button>
              </form>
            </div>
          </div>

          {/* Rapprochement & Coulage */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: T.line }}>
                <h3 className="text-sm font-bold" style={{ color: T.petrol }}>Bilan Coulage : {activeCuve.nom}</h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${activeCuve.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"}`}>
                  {activeCuve.produit}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b" style={{ borderColor: T.line }}>
                  <span className="text-gray-500">Capacité de la cuve :</span>
                  <span className="font-bold tabular">{F(capaciteActive)} L</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: T.line }}>
                  <span className="text-gray-500">Dernier stock théorique :</span>
                  <span className="font-bold tabular">{F(stockTheoriqueEstime)} L</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: T.line }}>
                  <span className="text-gray-500">Stock physique saisi :</span>
                  <span className="font-bold text-blue-900 tabular">{stockPhysique ? F(n(stockPhysique)) : "--"} L</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-800">ÉCART (COULAGE) :</span>
                    <span className={`text-base font-extrabold tabular ${ecartCuve >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {ecartCuve > 0 ? "+" : ""}{stockPhysique ? F(ecartCuve) : 0} L
                    </span>
                  </div>
                  {stockPhysique && (
                    <div className="mt-2 p-2 rounded border bg-gray-50 text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Taux de coulage constaté :</span>
                        <strong className={`tabular ${toleranceRespectee ? "text-green-700" : "text-red-600"}`}>
                          {tauxCoulagePct > 0 ? "+" : ""}{tauxCoulagePct.toFixed(2)} %
                        </strong>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Tolérance admise :</span>
                        <span className="font-semibold">± 0.30 %</span>
                      </div>
                      <div className="pt-1">
                        {toleranceRespectee ? (
                          <div className="text-emerald-700 font-semibold flex items-center gap-1">
                            <span>✅ Conforme (dans la tolérance)</span>
                          </div>
                        ) : (
                          <div className="text-red-700 font-bold">
                            <span>🚨 Coulage Anormal (&gt; ±0.3%)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL AJOUT RAPIDE DE CUVE ────────────────── */}
      {showAddCuveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border text-gray-900" style={{ borderColor: T.line }}>
            <div className="flex justify-between items-center pb-3 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">🛢️</span>
                <h3 className="font-black text-sm text-gray-900">Ajouter une Cuve de Stockage</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCuveModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreerNouvelleCuve} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nom / Numéro de la cuve *</label>
                <input
                  type="text"
                  placeholder="ex: Cuve 2 Gasoil, Cuve 2 Super"
                  value={newCuveForm.nom}
                  onChange={(e) => setNewCuveForm({ ...newCuveForm, nom: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-semibold"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Carburant contenu *</label>
                <select
                  value={newCuveForm.produit}
                  onChange={(e) => setNewCuveForm({ ...newCuveForm, produit: e.target.value })}
                  className="w-full text-xs border rounded p-2 bg-white font-bold"
                  style={{ borderColor: T.line }}
                >
                  <option value="GASOIL">GASOIL</option>
                  <option value="SUPER">SUPER CARBURANT</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Capacité nominale (Litres) *</label>
                <input
                  type="number"
                  placeholder="ex: 20000"
                  value={newCuveForm.capacite_l}
                  onChange={(e) => setNewCuveForm({ ...newCuveForm, capacite_l: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-bold"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCuveModal(false)}
                  className="w-1/3 py-2 rounded-lg text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2 rounded-lg text-xs font-bold text-gray-900 shadow-sm hover:opacity-90"
                  style={{ background: T.gold }}
                >
                  ✓ Enregistrer la Cuve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── ONGLET 2 : NOUVEAU DÉPOTAGE (PILOTÉ PAR LA CUVE) ────────────────── */}
      {tab === "depotage" && (
        <form onSubmit={handleValiderDepotage} className="space-y-4">
          {/* Bannière d'introduction au processus pétrolier piloté par la cuve */}
          <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-amber-950 text-white rounded-2xl p-4 shadow-md border border-blue-900/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl">⛽</span>
                  <h2 className="text-sm sm:text-base font-black tracking-tight uppercase">
                    Procédure de Dépotage Pilotée par la Cuve
                  </h2>
                  <span className="text-[10px] font-extrabold bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    6 Étapes Contrôlées
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl font-medium">
                  La cuve de la station est l'élément central récepteur : son niveau initial et sa capacité disponible (creux) pilotent la réception. Le camion et ses compartiments documentent l'origine du carburant.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] text-amber-300 uppercase font-bold block">N° Dépotage Cuve</span>
                  <span className="text-xs font-mono font-black text-white bg-white/10 px-2.5 py-1 rounded border border-white/20">
                    {depotageForm.numero_depotage}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ÉTAPE 1 : SÉLECTIONNER LA CUVE À DÉPOTTER (ÉLÉMENT PRINCIPAL) ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b mb-3 gap-2" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center text-xs font-black">1</span>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Sélectionner la Cuve de la Station (Élément Principal)
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    C'est cette cuve qui reçoit le carburant et dont le stock physique sera mis à jour.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-600">Cuve active :</span>
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-950 border border-blue-300">
                  {targetDepotageCuve?.nom || "Cuve"} ({targetDepotageCuve?.produit})
                </span>
              </div>
            </div>

            {/* Sélecteur direct déroulant pour le gérant */}
            <div className="mb-3.5 bg-slate-50 p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="text-base">🛢️</span>
                <div>
                  <label className="text-xs font-bold text-gray-900 block">
                    Choix direct de la cuve réceptrice :
                  </label>
                  <span className="text-[10px] text-gray-500">
                    Cliquez sur une cuve ci-dessous ou sélectionnez-la dans la liste
                  </span>
                </div>
              </div>
              <select
                value={targetDepotageCuve?.id || ""}
                onChange={(e) => {
                  const sel = cuvesWithLatestJauge.find((c) => c.id === e.target.value);
                  if (sel) handleSelectDepotageCuve(sel);
                }}
                className="text-xs font-bold border rounded-lg p-2 bg-white text-blue-950 border-blue-400 focus:ring-2 focus:ring-blue-500 max-w-md w-full sm:w-auto shadow-2xs"
              >
                {cuvesWithLatestJauge.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.produit}) — Stock initial: {F(c.volume_physique)} L | Creux dispo: {F(c.creux_disponible)} L
                  </option>
                ))}
              </select>
            </div>

            {/* Grille de sélection visuelle des cuves de la station */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {cuvesWithLatestJauge.map((cuve) => {
                const isSelected = cuve.id === targetDepotageCuve?.id;
                const isGasoil = cuve.produit === "GASOIL";
                return (
                  <button
                    key={cuve.id}
                    type="button"
                    onClick={() => handleSelectDepotageCuve(cuve)}
                    className={`text-left p-3 rounded-xl border-2 transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/20"
                        : "border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div>
                        <div className="text-xs font-black text-gray-950">{cuve.nom}</div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-black mt-0.5 inline-block ${
                            isGasoil ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {cuve.produit}
                        </span>
                      </div>
                      {isSelected ? (
                        <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                          ✓ ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-bold hover:text-gray-700">Choisir</span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>Stock physique :</span>
                        <strong className="text-gray-900">{F(cuve.volume_physique)} L</strong>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Capacité totale :</span>
                        <span className="font-semibold">{F(cuve.capacite_l)} L</span>
                      </div>
                      <div className="flex justify-between font-bold pt-1 border-t text-[11px]" style={{ borderColor: T.line }}>
                        <span className="text-gray-700">Creux dispo :</span>
                        <span className="text-emerald-700 font-black">{F(cuve.creux_disponible)} L</span>
                      </div>
                    </div>

                    {/* Mini barre de jauge */}
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isGasoil ? "bg-blue-600" : "bg-emerald-600"}`}
                        style={{ width: `${Math.min(100, cuve.pourcentage || 0)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── ÉTAPE 2 : NIVEAU INITIAL & CAPACITÉ DISPONIBLE (CONTRÔLE AVANT DÉPOTAGE) ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b mb-3 gap-2" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-800 text-white flex items-center justify-center text-xs font-black">2</span>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Contrôle Préalable de la Cuve : Niveau Initial &amp; Capacité Disponible
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    Vérification obligatoire du creux de la cuve et test de pâte à eau avant toute connexion du flexible.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePreRemplirJaugeAvantCuve}
                className="self-start sm:self-auto text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-bold hover:bg-blue-100 flex items-center gap-1"
                title="Pré-remplir avec la dernière mesure enregistrée"
              >
                <span>🔄 Charger Dernière Jauge</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Saisie Jauge Avant */}
              <div className="bg-slate-50 p-3 rounded-lg border space-y-2" style={{ borderColor: T.line }}>
                <label className="block text-xs font-bold text-gray-900">
                  Mesure Latte Avant Dépotage *
                </label>
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <span className="text-[10px] text-gray-500 block mb-0.5">Hauteur cm</span>
                    <input
                      type="number"
                      placeholder="cm"
                      value={cuveJaugeAvant.hauteur_cm}
                      onChange={(e) => setCuveJaugeAvant({ ...cuveJaugeAvant, hauteur_cm: e.target.value })}
                      className="w-full text-xs border rounded p-2 bg-white"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div className="w-2/3">
                    <span className="text-[10px] text-gray-500 block mb-0.5">Volume initial (Litres) *</span>
                    <input
                      type="number"
                      placeholder="Litres cuve"
                      value={cuveJaugeAvant.volume_l}
                      onChange={(e) => setCuveJaugeAvant({ ...cuveJaugeAvant, volume_l: e.target.value })}
                      className="w-full text-xs border rounded p-2 font-bold bg-white text-blue-950"
                      style={{ borderColor: "#2563EB" }}
                      required
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500">Mesure effectuée à la latte graduée avant ouverture de la vanne.</p>
              </div>

              {/* Rapprochement Capacité / Creux Disponible */}
              <div className="bg-slate-50 p-3 rounded-lg border space-y-1.5 text-xs" style={{ borderColor: T.line }}>
                <div className="text-[11px] font-bold text-gray-800 uppercase mb-1">
                  Capacité &amp; Creux Récepteur
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Capacité totale de la cuve :</span>
                  <strong>{F(capaciteCuve)} L</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Stock initial présent :</span>
                  <span className="font-semibold">{F(stockInitialCuve)} L</span>
                </div>
                <div className="flex justify-between pt-1 border-t font-black" style={{ borderColor: T.line }}>
                  <span className="text-gray-800">Espace disponible (Creux) :</span>
                  <span className="text-emerald-700 text-sm">{F(creuxDisponibleCuve)} L</span>
                </div>
              </div>

              {/* Contrôle Pâte à Eau */}
              <div className="bg-slate-50 p-3 rounded-lg border flex flex-col justify-between" style={{ borderColor: T.line }}>
                <div>
                  <div className="text-[11px] font-bold text-gray-800 uppercase mb-1 flex items-center gap-1.5">
                    <span>💧</span>
                    <span>Test Pâte à Eau (Fond de Cuve)</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mb-2">
                    Appliquer la pâte détectrice d'eau sur le bas de la latte métallique pour vérifier l'absence d'eau décantée.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border" style={{ borderColor: T.line }}>
                  <input
                    type="checkbox"
                    checked={eauFondCuveValidee}
                    onChange={(e) => setEauFondCuveValidee(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-xs font-bold text-emerald-800">
                    {eauFondCuveValidee ? "✓ Absence d'eau validée (Test négatif)" : "⚠️ Présence d'eau détectée !"}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* ── ÉTAPE 3 : RENSEIGNER LE CAMION QUI LIVRE LE CARBURANT (CONVOI RÉUTILISABLE) ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b mb-3 gap-2" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs font-black">3</span>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Convoi Citerne &amp; Informations de Livraison
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    Document fournisseur et camion livreur. Ces données sont conservées en mémoire pour toute autre cuve livrée par ce convoi.
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300">
                Informations Camion Partagées
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-blue-950 mb-1">N° Bon de Livraison (BL) Camion *</label>
                <input
                  type="text"
                  placeholder="ex: BL-TOT-2026-9921"
                  value={depotageForm.numero_bl}
                  onChange={(e) => setDepotageForm({ ...depotageForm, numero_bl: e.target.value })}
                  className="w-full text-xs border rounded p-2 uppercase font-mono font-bold text-blue-950 bg-blue-50/50"
                  style={{ borderColor: "#2563EB" }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">N° Commande / Référence</label>
                <input
                  type="text"
                  placeholder="ex: CMD-2026-084"
                  value={depotageForm.numero_commande}
                  onChange={(e) => setDepotageForm({ ...depotageForm, numero_commande: e.target.value })}
                  className="w-full text-xs border rounded p-2 uppercase font-mono"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Date de Réception *</label>
                <input
                  type="date"
                  value={depotageForm.date}
                  onChange={(e) => setDepotageForm({ ...depotageForm, date: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-medium"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Fournisseur Pétrolier *</label>
                <input
                  type="text"
                  list="fournisseurs-list"
                  placeholder="ex: TOTAL Energies, VIVO..."
                  value={depotageForm.fournisseur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, fournisseur: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-semibold"
                  style={{ borderColor: T.line }}
                  required
                />
                <datalist id="fournisseurs-list">
                  {(ref?.fournisseurs || []).map((f) => (
                    <option key={f.code || f.id} value={f.nom_fournisseur || f.code}>
                      {f.nom_fournisseur || f.code}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* Horaires et Convoi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t" style={{ borderColor: T.line }}>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Société de Transport</label>
                <input
                  type="text"
                  placeholder="ex: STT Sénégal, Diallo Trans"
                  value={depotageForm.transporteur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, transporteur: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-900 mb-1">Tracteur (Immat.) *</label>
                <input
                  type="text"
                  placeholder="ex: DK-4402-A"
                  value={depotageForm.immatriculation_camion}
                  onChange={(e) => setDepotageForm({ ...depotageForm, immatriculation_camion: e.target.value })}
                  className="w-full text-xs border rounded p-2 uppercase font-mono font-bold"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Remorque / Citerne (Immat.)</label>
                <input
                  type="text"
                  placeholder="ex: RM-8821-C"
                  value={depotageForm.immatriculation_remorque}
                  onChange={(e) => setDepotageForm({ ...depotageForm, immatriculation_remorque: e.target.value })}
                  className="w-full text-xs border rounded p-2 uppercase font-mono"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Heures (Arrivée / Début / Fin)</label>
                <div className="flex gap-1">
                  <input
                    type="time"
                    value={depotageForm.heure_arrivee}
                    onChange={(e) => setDepotageForm({ ...depotageForm, heure_arrivee: e.target.value })}
                    className="w-1/3 text-[11px] border rounded p-1.5"
                    title="Heure arrivée"
                  />
                  <input
                    type="time"
                    value={depotageForm.heure_debut}
                    onChange={(e) => setDepotageForm({ ...depotageForm, heure_debut: e.target.value })}
                    className="w-1/3 text-[11px] border rounded p-1.5"
                    title="Heure début"
                  />
                  <input
                    type="time"
                    value={depotageForm.heure_fin}
                    onChange={(e) => setDepotageForm({ ...depotageForm, heure_fin: e.target.value })}
                    className="w-1/3 text-[11px] border rounded p-1.5"
                    title="Heure fin"
                  />
                </div>
              </div>
            </div>

            {/* Chauffeur et Responsables */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t bg-slate-50 p-3 rounded-lg border" style={{ borderColor: T.line }}>
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">Chauffeur Livreur (Nom &amp; Permis)</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Nom du Chauffeur"
                    value={depotageForm.nom_chauffeur}
                    onChange={(e) => setDepotageForm({ ...depotageForm, nom_chauffeur: e.target.value })}
                    className="w-2/3 text-xs border rounded p-2 bg-white"
                    style={{ borderColor: T.line }}
                  />
                  <input
                    type="text"
                    placeholder="N° Permis"
                    value={depotageForm.numero_permis}
                    onChange={(e) => setDepotageForm({ ...depotageForm, numero_permis: e.target.value })}
                    className="w-1/3 text-xs border rounded p-2 bg-white font-mono text-gray-700"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-950 mb-1">Agent Contrôleur (Jaugeur) *</label>
                <input
                  type="text"
                  placeholder="Nom de l'agent jaugeur"
                  value={depotageForm.agent_controleur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, agent_controleur: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-bold bg-white text-blue-900"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-950 mb-1">Responsable Réception (Validation Gérant) *</label>
                <input
                  type="text"
                  placeholder="Gérant ou Chef de Station validateur"
                  value={depotageForm.responsable_reception}
                  onChange={(e) => setDepotageForm({ ...depotageForm, responsable_reception: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-bold bg-white text-amber-950"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
            </div>

            {/* Checklist Sécurité & Contrôles Qualité */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: T.line }}>
              <div className="text-[11px] font-bold text-gray-700 uppercase mb-2 flex items-center justify-between">
                <span>Checklist de Contrôle Sécurité Dépotage (10 Points)</span>
                <button
                  type="button"
                  onClick={() =>
                    setDepotageForm((prev) => ({
                      ...prev,
                      check_documents_identite: true,
                      check_produit_cuve_conforme: true,
                      check_capacite_creux_validee: true,
                      check_raccords_flexibles_etanches: true,
                      check_balisage_extincteurs_prets: true,
                      check_prise_de_terre_branchee: true,
                      check_moteur_coupe_cales_posees: true,
                      check_pistolets_distribution_arretes: true,
                      check_absence_fuite_surveillance: true,
                      check_test_eau_negatif: true,
                    }))
                  }
                  className="text-[10px] text-blue-700 font-bold hover:underline"
                >
                  Tout cocher conforme (10/10)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border" style={{ borderColor: T.line }}>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_documents_identite}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_documents_identite: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>1. Identité du camion et documents de livraison vérifiés (BL / Ordre)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_produit_cuve_conforme}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_produit_cuve_conforme: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>2. Concordance produit livré et cuve de destination (détrompage)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_capacite_creux_validee}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_capacite_creux_validee: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>3. Capacité disponible de la cuve contrôlée (creux suffisant)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_raccords_flexibles_etanches}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_raccords_flexibles_etanches: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>4. État des raccords, flexibles et équipements (étanchéité vérifiée)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_balisage_extincteurs_prets}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_balisage_extincteurs_prets: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>5. Balisage en place et extincteurs à poudre prêts</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_prise_de_terre_branchee}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_prise_de_terre_branchee: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>6. Câble de mise à la terre branché au châssis camion</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_moteur_coupe_cales_posees}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_moteur_coupe_cales_posees: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>7. Moteur coupé, coupe-batterie actionné et cales posées</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_pistolets_distribution_arretes}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_pistolets_distribution_arretes: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>8. Pistolets de distribution de cette cuve mis à l'arrêt</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_absence_fuite_surveillance}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_absence_fuite_surveillance: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>9. Surveillance continue et contrôle d'absence totale de fuite</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                  <input
                    type="checkbox"
                    checked={depotageForm.check_test_eau_negatif}
                    onChange={(e) => setDepotageForm({ ...depotageForm, check_test_eau_negatif: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>10. Test à la pâte à eau négatif en citerne et en cuve</span>
                </label>
              </div>

              {/* Qualité et Scellés */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="scelles-conforme-chk"
                    checked={depotageForm.scelles_conformes}
                    onChange={(e) => setDepotageForm({ ...depotageForm, scelles_conformes: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <label htmlFor="scelles-conforme-chk" className="text-xs font-semibold cursor-pointer">
                    {depotageForm.scelles_conformes ? "✓ Scellés convoi intacts" : "⚠️ Scellés brisés"}
                  </label>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-0.5">N° Scellés notés sur BL</label>
                  <input
                    type="text"
                    placeholder="ex: SC-99182, SC-99183"
                    value={depotageForm.numeros_scelles}
                    onChange={(e) => setDepotageForm({ ...depotageForm, numeros_scelles: e.target.value })}
                    className="w-full text-xs border rounded p-1.5 font-mono"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-0.5">Densité hydromètre</label>
                  <input
                    type="text"
                    placeholder="ex: 0.835"
                    value={depotageForm.densite_mesuree}
                    onChange={(e) => setDepotageForm({ ...depotageForm, densite_mesuree: e.target.value })}
                    className="w-full text-xs border rounded p-1.5 font-semibold"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-0.5">Température (°C)</label>
                  <input
                    type="text"
                    placeholder="ex: 28"
                    value={depotageForm.temperature_c}
                    onChange={(e) => setDepotageForm({ ...depotageForm, temperature_c: e.target.value })}
                    className="w-full text-xs border rounded p-1.5 font-semibold"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── ÉTAPE 4 : COMPARTIMENTS DU CAMION ALIMENTANT CETTE CUVE ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b mb-3 gap-2" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">4</span>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Origine du Carburant : Compartiments du Camion Alimentant {targetDepotageCuve.nom}
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    Sélectionnez le ou les compartiments du camion qui alimentent cette cuve (ex : C1 seul, ou C3, ou C5...).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-gray-500 font-medium">Ajout rapide :</span>
                {["C1", "C2", "C3", "C4", "C5", "C6"].map((cCode) => (
                  <button
                    key={cCode}
                    type="button"
                    onClick={() => handleAddCuveCompartiment(cCode)}
                    className="text-[10px] font-black px-2 py-1 rounded bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300"
                    title={`Ajouter le compartiment ${cCode}`}
                  >
                    +{cCode}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddCuveCompartiment()}
                  className="text-xs px-2.5 py-1 rounded-lg font-bold text-gray-900 shadow-xs hover:opacity-90 flex items-center gap-1 ml-1"
                  style={{ background: T.gold }}
                >
                  <span>➕ Autre</span>
                </button>
              </div>
            </div>

            {/* Liste des compartiments alimentant la cuve */}
            <div className="space-y-3">
              {cuveCompartiments.map((c, idx) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl border bg-slate-50/70 space-y-2.5"
                  style={{ borderColor: T.line }}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b" style={{ borderColor: T.line }}>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-xs font-black bg-gray-900 text-white font-mono shadow-2xs">
                        {c.numero_compartiment || `C${idx + 1}`}
                      </span>
                      <span className="text-xs font-bold text-gray-800">
                        Compartiment #{idx + 1} du convoi → {targetDepotageCuve.nom}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.2 rounded font-black ${
                          targetDepotageCuve.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {targetDepotageCuve.produit}
                      </span>
                    </div>

                    {cuveCompartiments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCuveCompartiment(c.id)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 rounded hover:bg-rose-50"
                      >
                        ✕ Retirer
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                        Sélection Compartiment
                      </label>
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={c.numero_compartiment}
                          onChange={(e) => handleUpdateCuveCompartiment(c.id, "numero_compartiment", e.target.value)}
                          className="w-full text-xs border rounded p-1.5 font-black uppercase font-mono bg-white text-gray-900"
                          style={{ borderColor: T.line }}
                          placeholder="ex: C5"
                        />
                        {/* Badges de sélection directe 1-clic */}
                        <div className="flex gap-1 flex-wrap">
                          {["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"].map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => handleUpdateCuveCompartiment(c.id, "numero_compartiment", code)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition ${
                                c.numero_compartiment === code
                                  ? "bg-blue-950 text-white shadow-2xs"
                                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                              }`}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-amber-950 mb-0.5">N° Scellé (Dôme / Vanne) *</label>
                      <input
                        type="text"
                        value={c.numero_scelle}
                        onChange={(e) => handleUpdateCuveCompartiment(c.id, "numero_scelle", e.target.value)}
                        className="w-full text-xs border rounded p-1.5 uppercase font-mono font-bold text-amber-950 bg-amber-50/50"
                        style={{ borderColor: "#D97706" }}
                        placeholder="ex: SC-10291"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-blue-950 mb-0.5">Quantité BL Allouée (Litres) *</label>
                      <input
                        type="number"
                        value={c.volume_bl}
                        onChange={(e) => handleUpdateCuveCompartiment(c.id, "volume_bl", e.target.value)}
                        className="w-full text-xs border rounded p-1.5 font-black text-blue-950 bg-blue-50/50"
                        style={{ borderColor: "#2563EB" }}
                        placeholder="ex: 10000"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-gray-600 mb-0.5">Reste citerne après vidange (L)</label>
                      <input
                        type="number"
                        value={c.reste_camion_litres}
                        onChange={(e) => handleUpdateCuveCompartiment(c.id, "reste_camion_litres", e.target.value)}
                        className="w-full text-xs border rounded p-1.5 bg-white text-gray-700"
                        style={{ borderColor: T.line }}
                        placeholder="0 L"
                      />
                    </div>
                  </div>

                  {/* ── SOUS-SECTION : MANQUANT CONSTATÉ EN CITERNE & PRÉLÈVEMENT COMPENSATOIRE AUX POMPES ── */}
                  <div className="mt-2 pt-2 border-t rounded-xl p-2.5 bg-amber-50/60 border border-amber-200/90 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!c.constat_manquant}
                          onChange={(e) => handleUpdateCuveCompartiment(c.id, "constat_manquant", e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-xs font-bold text-amber-950">
                          ⚠️ Manquant constaté dans le compartiment {c.numero_compartiment} (Niveau sous le repère flèche)
                        </span>
                      </label>
                      {c.constat_manquant && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-950 self-start sm:self-auto">
                          Procédure de Compensation Pompe
                        </span>
                      )}
                    </div>

                    {c.constat_manquant && (
                      <div className="space-y-2.5 pt-2 border-t border-amber-200/80 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-amber-950 mb-0.5">
                              Litrage manquant constaté dans le compartiment (L) *
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                placeholder="ex: 50 ou 100"
                                value={c.manquant_citerne_l || ""}
                                onChange={(e) => handleUpdateCuveCompartiment(c.id, "manquant_citerne_l", e.target.value)}
                                className="w-full text-xs border rounded p-1.5 font-black text-rose-700 bg-white border-rose-300"
                              />
                              <span className="font-black text-rose-700">L</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">
                              Motif / Constat contradictoire
                            </label>
                            <input
                              type="text"
                              placeholder="ex: Niveau flèche non atteint, déversé avant arrivée..."
                              value={c.motif_manquant || ""}
                              onChange={(e) => handleUpdateCuveCompartiment(c.id, "motif_manquant", e.target.value)}
                              className="w-full text-xs border rounded p-1.5 bg-white border-gray-300"
                            />
                          </div>
                        </div>

                        {/* Bloc Prélèvement compensatoire aux pompes */}
                        <div className="p-2.5 rounded-lg bg-white border border-amber-300 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-950">
                              <input
                                type="checkbox"
                                checked={!!c.prelevement_pompe}
                                onChange={(e) => handleUpdateCuveCompartiment(c.id, "prelevement_pompe", e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span>⛽ Prélever ce volume manquant au niveau des pompes / pistolets de la station</span>
                            </label>
                            {c.prelevement_pompe && n(c.manquant_citerne_l) > 0 && (
                              <button
                                type="button"
                                onClick={() => handleAlignerPrelevementSurManquant(c.id)}
                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-300 hover:bg-blue-100 self-start sm:self-auto"
                              >
                                🔄 Aligner sur les {c.manquant_citerne_l} L manquants
                              </button>
                            )}
                          </div>

                          {c.prelevement_pompe && (
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-200">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                                  Pistolet / Pompe distributeur *
                                </label>
                                <select
                                  value={c.pistolet_code || ""}
                                  onChange={(e) => handleUpdateCuveCompartiment(c.id, "pistolet_code", e.target.value)}
                                  className="w-full text-xs border rounded p-1.5 font-bold bg-slate-50 border-gray-300"
                                >
                                  {pistoletsProduit.map((p) => (
                                    <option key={p.code || p.id} value={p.code || p.nom}>
                                      {p.nom || p.code} ({p.produit})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                  Index Départ Pompe
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="ex: 12450.0"
                                  value={c.pompe_index_depart || ""}
                                  onChange={(e) => handleUpdateCuveCompartiment(c.id, "pompe_index_depart", e.target.value)}
                                  className="w-full text-xs border rounded p-1.5 font-mono bg-white border-gray-300"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                  Index Fin Pompe
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="ex: 12500.0"
                                  value={c.pompe_index_fin || ""}
                                  onChange={(e) => handleUpdateCuveCompartiment(c.id, "pompe_index_fin", e.target.value)}
                                  className="w-full text-xs border rounded p-1.5 font-mono bg-white border-gray-300"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-blue-950 mb-0.5">
                                  Volume Pompé Compensé (L) *
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="Litres"
                                  value={c.volume_preleve_pompe || ""}
                                  onChange={(e) => handleUpdateCuveCompartiment(c.id, "volume_preleve_pompe", e.target.value)}
                                  className="w-full text-xs border rounded p-1.5 font-black text-blue-900 bg-blue-50 border-blue-400"
                                  required={c.prelevement_pompe}
                                />
                              </div>

                              <div className="sm:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-1 text-[11px] text-gray-600">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-900">
                                  <input
                                    type="checkbox"
                                    checked={c.accord_chauffeur ?? true}
                                    onChange={(e) => handleUpdateCuveCompartiment(c.id, "accord_chauffeur", e.target.checked)}
                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span>✓ Accord contradictoire et visa du chauffeur livreur pour ce prélèvement</span>
                                </label>
                                <span className="text-[10px] text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                                  ℹ️ Traçabilité : Consigné sur le PV officiel pour ne pas pénaliser le pompiste en descente
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Synthèse Anti-Débordement & Prélèvements Compensatoires */}
            <div className="mt-3 p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                 style={{
                   borderColor: risqueDebordementCuve ? "#f87171" : "#86efac",
                   background: risqueDebordementCuve ? "#fff1f2" : "#f0fdf4",
                 }}
            >
              <div>
                <div className="text-xs font-bold text-gray-900">
                  Volume Total BL Attendu dans {targetDepotageCuve.nom} :{" "}
                  <strong className="text-blue-950 text-sm">{F(totalVolumeBlVersCuve)} L</strong>
                </div>
                <div className="text-[11px] text-gray-600 mt-0.5">
                  Capacité restante dans la cuve (Creux) : <strong>{F(creuxDisponibleCuve)} L</strong>
                </div>
                {aDesPrelevementsPompes && (
                  <div className="text-[11px] font-bold text-blue-950 mt-1 flex items-center gap-1.5">
                    <span>⛽</span>
                    <span>Total prélevé aux pompes (compensation manquant citerne) : <strong>{F(totalVolumePrelevePompes)} L</strong></span>
                  </div>
                )}
              </div>

              {risqueDebordementCuve ? (
                <div className="text-xs font-black text-rose-700 bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-300 animate-pulse flex items-center gap-1.5">
                  <span>🚨</span>
                  <span>RISQUE DÉBORDEMENT CUVE : Le volume BL dépasse le creux disponible de {F(totalVolumeBlVersCuve - creuxDisponibleCuve)} L !</span>
                </div>
              ) : (
                <div className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-300 flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Capacité de réception validée ({F(creuxDisponibleCuve - totalVolumeBlVersCuve)} L de marge de sécurité)</span>
                </div>
              )}
            </div>
          </div>

          {/* ── ÉTAPE 5 : MESURES APRÈS DÉPOTAGE & BILAN VOLUMÉTRIQUE DE LA CUVE ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center text-xs font-black">5</span>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Mesures Après Dépotage &amp; Bilan Volumétrique de la Cuve
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    Saisie de la jauge finale de la cuve (après 15 min de repos) et calcul des 4 grandeurs réglementaires.
                  </p>
                </div>
              </div>
              <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                toleranceRespecteeCuve
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-rose-50 text-rose-800 border-rose-300"
              }`}>
                {toleranceRespecteeCuve ? "✓ Tolérance Transport Respectée (±0.20%)" : "🚨 Litige Manquant Hors Tolérance"}
              </span>
            </div>

            {/* Saisie Jauge Après */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-200">
                <label className="block text-xs font-bold text-blue-950 mb-1">
                  Jauge Cuve Finale Après Dépotage *
                </label>
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <span className="text-[10px] text-gray-500 block mb-0.5">Hauteur cm</span>
                    <input
                      type="number"
                      placeholder="cm latte"
                      value={cuveJaugeApres.hauteur_cm}
                      onChange={(e) => setCuveJaugeApres({ ...cuveJaugeApres, hauteur_cm: e.target.value })}
                      className="w-full text-xs border rounded p-2 bg-white"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div className="w-2/3">
                    <span className="text-[10px] text-blue-900 font-bold block mb-0.5">Stock Final Mesuré (Litres) *</span>
                    <input
                      type="number"
                      placeholder="Litres après dépotage"
                      value={cuveJaugeApres.volume_l}
                      onChange={(e) => setCuveJaugeApres({ ...cuveJaugeApres, volume_l: e.target.value })}
                      className="w-full text-xs border rounded p-2 font-black text-blue-900 bg-white border-blue-400"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Rapprochement instantané */}
              <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1" style={{ borderColor: T.line }}>
                <div className="text-[11px] font-bold text-gray-800 uppercase mb-1">Formule de Contrôle Station</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Stock Initial Cuve :</span>
                  <strong>{F(stockInitialCuve)} L</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">+ Total Volume BL Attendu :</span>
                  <strong className="text-blue-900">{F(totalVolumeBlVersCuve)} L</strong>
                </div>
                <div className="flex justify-between pt-1 border-t font-black" style={{ borderColor: T.line }}>
                  <span className="text-blue-950">= Stock Théorique Après Réception :</span>
                  <span className="text-blue-950 text-sm">{F(stockTheoriqueApresCuve)} L</span>
                </div>
              </div>
            </div>

            {/* Les 6 Cartes du Bilan Volumétrique Officiel */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="bg-white p-2.5 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                <span className="text-[10px] text-gray-500 uppercase block font-semibold">1. Volume BL</span>
                <strong className="text-gray-900 tabular text-sm">{F(totalVolumeBlVersCuve)} L</strong>
              </div>

              <div className="bg-white p-2.5 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                <span className="text-[10px] text-gray-500 uppercase block font-semibold">2. Stock Théorique</span>
                <strong className="text-blue-950 tabular text-sm">{F(stockTheoriqueApresCuve)} L</strong>
              </div>

              <div className="bg-white p-2.5 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                <span className="text-[10px] text-gray-500 uppercase block font-semibold">3. Stock Final Mesuré</span>
                <strong className="text-blue-900 tabular text-sm">{F(stockFinalCuve)} L</strong>
              </div>

              <div className="bg-white p-2.5 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                <span className="text-[10px] text-gray-500 uppercase block font-semibold">4. Dépoté Réel</span>
                <strong className="text-indigo-900 tabular text-sm">{F(volumeDepoteReelCuve)} L</strong>
              </div>

              <div className="bg-white p-2.5 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                <span className="text-[10px] text-gray-500 uppercase block font-semibold">Écart Constaté</span>
                <strong className={`tabular text-sm ${ecartReceptionCuveL >= 0 ? "text-emerald-700" : "text-rose-700 font-black"}`}>
                  {ecartReceptionCuveL > 0 ? "+" : ""}{F(ecartReceptionCuveL)} L ({ecartPctCuve > 0 ? "+" : ""}{ecartPctCuve}%)
                </strong>
              </div>

              <div className="bg-white p-2.5 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                <span className="text-[10px] text-gray-500 uppercase block font-semibold">Valorisation Litige</span>
                <strong className={`tabular text-sm ${valeurManquantCuveFcfa > 0 ? "text-rose-700 font-black" : "text-gray-600"}`}>
                  {F(valeurManquantCuveFcfa)} FCFA
                </strong>
              </div>
            </div>
          </div>

          {/* ── ÉTAPE 6 : VALIDATION, CLÔTURE DE LA CUVE & ENCHAÎNEMENT ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-black">6</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                  Validation du Dépotage de la Cuve &amp; Double Visa Réglementaire
                </h2>
              </div>
              <span className="text-[11px] font-black text-slate-700">
                Clôture Cuve &amp; Mise à Jour Immédiate du Stock
              </span>
            </div>

            {/* Observations Chauffeur & Réceptionnaire */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Observations du Chauffeur Livreur</label>
                <input
                  type="text"
                  placeholder="ex: Citerne vidée intégralement, temps d'attente 15 min..."
                  value={depotageForm.observations_chauffeur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, observations_chauffeur: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Observations / Réserves du Réceptionnaire</label>
                <input
                  type="text"
                  placeholder="ex: Scellés conformes, test eau négatif, dépotage terminé sans incident."
                  value={depotageForm.observations}
                  onChange={(e) => setDepotageForm({ ...depotageForm, observations: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>

            {/* Action de Validation */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t" style={{ borderColor: T.line }}>
              {!peutValiderDepotage && (
                <div className="flex-1 text-xs text-center p-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-900 font-semibold flex items-center justify-center gap-2">
                  <span>🔒</span>
                  <span>Validation réservée au Gérant / Direction.</span>
                </div>
              )}
              <button
                type="submit"
                disabled={!peutValiderDepotage && !peutDepotage}
                className={`w-full py-3.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 ${
                  !peutValiderDepotage && !peutDepotage ? "opacity-50 cursor-not-allowed" : "hover:opacity-95"
                }`}
                style={{ background: !peutValiderDepotage ? "#94a3b8" : T.gold, color: !peutValiderDepotage ? "white" : "#111827" }}
              >
                <span>📄 Valider le Dépotage de {targetDepotageCuve.nom} &amp; Générer le PV Officiel (A4)</span>
              </button>
            </div>

            {/* Enchaînement convoi camion pour une autre cuve */}
            {cuvesWithLatestJauge.length > 1 && (
              <div className="mt-4 pt-3 border-t bg-slate-50 p-3 rounded-xl border" style={{ borderColor: T.line }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <span>🔄</span>
                    <span>Ce camion livre également une autre cuve de la station ?</span>
                  </div>
                  <span className="text-[11px] text-gray-500">
                    Conserve le camion ({depotageForm.immatriculation_camion || "Tracteur"}), le BL ({depotageForm.numero_bl || "--"}) et le chauffeur.
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {cuvesWithLatestJauge
                    .filter((c) => c.id !== targetDepotageCuve.id)
                    .map((autreCuve) => (
                      <button
                        key={autreCuve.id}
                        type="button"
                        onClick={() => handleChainerDepotageAutreCuve(autreCuve.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-900 hover:bg-blue-50 transition shadow-2xs flex items-center gap-1.5"
                      >
                        <span>⛽</span>
                        <span>Dépotter ensuite {autreCuve.nom} ({autreCuve.produit})</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {/* ────────────────── ONGLET 3 : RAPPORTS DE DÉPOTAGE (HISTORIQUE) ────────────────── */}
      {tab === "rapports" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
                Procès-Verbaux de Dépotage Citerne ({rapportsDepotage.length})
              </h2>
              <p className="text-xs text-gray-500">Archives des réceptions camions et contrôle des écarts fournisseurs</p>
            </div>
            <button
              type="button"
              onClick={() => setTab("depotage")}
              className="text-xs px-3 py-1.5 rounded-lg font-bold text-gray-900 shadow-xs hover:opacity-90"
              style={{ background: T.gold }}
            >
              + Nouveau Dépotage
            </button>
          </div>

          {rapportsDepotage.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucun rapport de dépotage archivé.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2.5">Date & Heures</th>
                    <th className="pb-2.5">N° BL</th>
                    <th className="pb-2.5">Cuve Réceptrice</th>
                    <th className="pb-2.5">Produit</th>
                    <th className="pb-2.5">Camion & Chauffeur</th>
                    <th className="pb-2.5 text-right">Volume BL</th>
                    <th className="pb-2.5 text-right">Volume Reçu</th>
                    <th className="pb-2.5 text-right">Écart Net</th>
                    <th className="pb-2.5 text-center">Statut</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {rapportsDepotage.map((r) => {
                    const isConforme = r.conformite_ecart || Math.abs(r.ecart_pourcentage || 0) <= 0.20;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5">
                          <div className="font-semibold text-gray-900">{fmtDate(r.date)}</div>
                          <div className="text-[10px] text-gray-400">{r.heure_debut || "--"} → {r.heure_fin || "--"}</div>
                        </td>
                        <td className="py-2.5 font-bold font-mono text-gray-800">{r.numero_bl}</td>
                        <td className="py-2.5">
                          <div className="font-bold text-blue-950 text-xs">{r.cuve_nom || "Cuve"}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{r.numero_depotage || "--"}</div>
                        </td>
                        <td className="py-2.5 font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              r.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {r.produit}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="text-gray-900 font-semibold">{r.immatriculation_camion || "--"}</div>
                          <div className="text-[10px] text-gray-500">{r.nom_chauffeur || r.fournisseur}</div>
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular">{F(r.volume_bl)} L</td>
                        <td className="py-2.5 text-right font-bold text-blue-900 tabular">{F(r.volume_decharge_reel)} L</td>
                        <td className={`py-2.5 text-right font-extrabold tabular ${r.ecart_litres >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {r.ecart_litres > 0 ? "+" : ""}{F(r.ecart_litres)} L
                          <div className="text-[10px] text-gray-400">{r.ecart_pourcentage > 0 ? "+" : ""}{r.ecart_pourcentage}%</div>
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              isConforme
                                ? "bg-emerald-100 text-emerald-800"
                                : r.ecart_litres < 0
                                ? "bg-rose-100 text-rose-800 font-extrabold"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {isConforme ? "✓ Conforme" : r.ecart_litres < 0 ? "⚠️ Litige" : "Boni"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setPvModal(r)}
                            className="text-xs px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-300 font-semibold hover:bg-amber-100"
                          >
                            📄 Voir PV
                          </button>
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

      {/* ────────────────── ONGLET 4 : HISTORIQUE DES JAUGES ────────────────── */}
      {tab === "ecarts" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b gap-2" style={{ borderColor: T.line }}>
            <div>
              <h3 className="text-sm font-bold" style={{ color: T.petrol }}>
                Historique des Rapprochements Physiques / Théoriques
              </h3>
              <p className="text-xs text-gray-500">
                Suivi des jauges par cuve, détection de présence d'eau et contrôle de conformité des coulages
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Filtrer par cuve :</span>
              <select
                value={filtreHistoriqueCuve}
                onChange={(e) => setFiltreHistoriqueCuve(e.target.value)}
                className="text-xs border rounded p-1.5 font-bold bg-gray-50"
                style={{ borderColor: T.line }}
              >
                <option value="ALL">Toutes les cuves ({jauges.length})</option>
                {cuvesWithLatestJauge.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.produit})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {jauges.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">Aucune jauge enregistrée pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Date / Opérateur</th>
                    <th className="pb-2">Cuve &amp; Produit</th>
                    <th className="pb-2 text-right">Latte (cm)</th>
                    <th className="pb-2 text-right">Eau fond</th>
                    <th className="pb-2 text-right">Volume Mesuré</th>
                    <th className="pb-2 text-right">Stock Théorique</th>
                    <th className="pb-2 text-right">Écart (Coulage)</th>
                    <th className="pb-2 text-center">Tolérance (±0.3%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {jauges
                    .filter((j) => {
                      if (filtreHistoriqueCuve === "ALL") return true;
                      return j.cuve_id === filtreHistoriqueCuve;
                    })
                    .map((j) => {
                      const taux = j.stock_theorique > 0 ? (j.ecart_litres / j.stock_theorique) * 100 : 0;
                      const okTol = Math.abs(taux) <= 0.3;
                      const cuveTrouvee = cuvesWithLatestJauge.find((c) => c.id === j.cuve_id);
                      const cuveNom = j.cuve_nom || cuveTrouvee?.nom || `Cuve ${j.produit}`;
                      const eau = n(j.eau_fond_cm || j.payload?.eau_fond_cm) || 0;

                      return (
                        <tr key={j.id} className="hover:bg-gray-50">
                          <td className="py-2.5">
                            <div className="font-semibold">{fmtDate(j.date)}</div>
                            <div className="text-[10px] text-gray-400">{j.operateur}</div>
                          </td>
                          <td className="py-2.5">
                            <div className="font-bold text-gray-900">{cuveNom}</div>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                                j.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                              }`}
                            >
                              {j.produit}
                            </span>
                          </td>
                          <td className="py-2.5 text-right tabular text-gray-700 font-semibold">{j.hauteur_cm ? `${j.hauteur_cm} cm` : "--"}</td>
                          <td className="py-2.5 text-right tabular">
                            {eau > 0 ? (
                              <span className="text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                {eau} cm
                              </span>
                            ) : (
                              <span className="text-gray-400">0 cm</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right tabular font-bold text-blue-900">{F(j.volume_physique)} L</td>
                          <td className="py-2.5 text-right tabular text-gray-600">{F(j.stock_theorique)} L</td>
                          <td className={`py-2.5 text-right tabular font-bold ${j.ecart_litres >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {j.ecart_litres > 0 ? "+" : ""}{F(j.ecart_litres)} L
                            <div className="text-[10px] text-gray-400">{taux > 0 ? "+" : ""}{taux.toFixed(2)}%</div>
                          </td>
                          <td className="py-2.5 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                okTol ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800 font-bold"
                              }`}
                            >
                              {okTol ? "✓ Conforme" : "⚠️ Hors norme"}
                            </span>
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

      {/* ────────────────── MODAL PROCÈS-VERBAL IMPRIMABLE (A4) ────────────────── */}
      {pvModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border my-6 text-gray-900" style={{ borderColor: T.line }}>
            {/* Barre d'action supérieure */}
            <div className="flex justify-between items-center pb-3 border-b mb-4" style={{ borderColor: T.line }}>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Procès-Verbal de Dépotage Citerne (Document Légal)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 rounded bg-gray-900 text-white text-xs font-bold hover:bg-black flex items-center gap-1"
                >
                  🖨️ Imprimer PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPvModal(null)}
                  className="text-gray-400 hover:text-gray-600 font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document Imprimable Officiel A4 */}
            <div className="border p-5 rounded-xl space-y-4 print:border-none print:p-0">
              {/* En-tête officiel DAMEL ENERGY / STAR ENERGY */}
              <div className="flex justify-between items-start border-b pb-4" style={{ borderColor: T.line }}>
                <div className="flex items-center gap-3">
                  <div className="h-12 px-3 rounded-xl bg-white shadow-xs border border-blue-400 shrink-0 flex items-center justify-center">
                    <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-7 w-auto object-contain" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#0B4EA2] uppercase tracking-widest flex items-center gap-2">
                      <span>DAMEL ENERGY MANAGEMENT</span>
                      <span className="inline-flex items-center gap-1 text-[9px] text-[#56216C] font-extrabold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                        <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3 h-3 object-contain rounded-xs" />
                        <span>Réseau : STAR ENERGY</span>
                      </span>
                    </div>
                    <h2 className="text-base font-black text-gray-900 mt-0.5">
                      PROCÈS-VERBAL DE RÉCEPTION &amp; DÉPOTAGE CITERNE
                    </h2>
                    <div className="text-xs text-gray-600 flex items-center gap-2 flex-wrap mt-0.5">
                      <span>Station : <strong>{profil?.station_nom || pvModal.station_nom || "Station Hann Maristes"}</strong> (Code: {stationId})</span>
                      {pvModal.cuve_nom && (
                        <span className="font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          🛢️ Cuve Réceptrice : {pvModal.cuve_nom} ({pvModal.produit || "CARBURANT"})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-black text-blue-950 bg-blue-50 px-2.5 py-1 rounded border border-blue-300">
                    N° Dépotage : {pvModal.numero_depotage || "DEP-ST-001"}
                  </div>
                  <div className="text-xs font-mono font-bold text-amber-900 mt-1">
                    N° BL : {pvModal.numero_bl} {pvModal.numero_commande ? `| Cmd: ${pvModal.numero_commande}` : ""}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">Date : {fmtDate(pvModal.date)}</div>
                  <div className="text-[10px] text-gray-400">
                    Arrivée: {pvModal.heure_arrivee || "--"} | Début: {pvModal.heure_debut || "--"} → Fin: {pvModal.heure_fin || "--"}
                  </div>
                </div>
              </div>

              {/* Informations du convoi & Intervenants */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-gray-50 rounded-lg border" style={{ borderColor: T.line }}>
                  <span className="text-[10px] text-gray-500 uppercase font-black block mb-1">1. CONVOI &amp; FOURNISSEUR</span>
                  <div>Fournisseur : <strong>{pvModal.fournisseur || "--"}</strong></div>
                  <div>Transporteur : <strong>{pvModal.transporteur || "--"}</strong></div>
                  <div>Camion Tracteur : <strong className="font-mono">{pvModal.immatriculation_camion || "--"}</strong></div>
                  <div>Citerne / Remorque : <strong className="font-mono">{pvModal.immatriculation_remorque || "--"}</strong></div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border" style={{ borderColor: T.line }}>
                  <span className="text-[10px] text-gray-500 uppercase font-black block mb-1">2. SÉCURITÉ &amp; QUALITÉ</span>
                  <div>Contrôle Sécurité : <strong>✓ 10/10 Points Conformes</strong></div>
                  <div>Mise à la terre &amp; Extincteurs : <strong>✓ En place</strong></div>
                  <div>Scellés Dômes / Vannes : <strong>{pvModal.scelles_conformes ? "✓ Intacts" : "⚠️ Brisé"}</strong> ({pvModal.numeros_scelles || "Vérifiés"})</div>
                  <div>Densité : <strong>{pvModal.densite_mesuree || "--"}</strong> | Temp : <strong>{pvModal.temperature_c ? `${pvModal.temperature_c}°C` : "--"}</strong></div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border" style={{ borderColor: T.line }}>
                  <span className="text-[10px] text-gray-500 uppercase font-black block mb-1">3. INTERVENANTS DÉPOTAGE</span>
                  <div>Chauffeur : <strong>{pvModal.nom_chauffeur || "--"}</strong></div>
                  <div>N° Permis : <strong className="font-mono">{pvModal.numero_permis || "--"}</strong></div>
                  <div>Agent Contrôleur : <strong>{pvModal.agent_controleur || "--"}</strong></div>
                  <div>Responsable Réception : <strong>{pvModal.responsable_reception || "--"}</strong></div>
                </div>
              </div>

              {/* Tableau Multi-Compartiments avec les 4 grandeurs */}
              {Array.isArray(pvModal.compartiments) && pvModal.compartiments.length > 0 ? (
                <div>
                  <span className="text-[11px] font-bold text-gray-800 uppercase tracking-wider block mb-1.5">
                    Détail par Compartiment Camion — ({pvModal.compartiments.length} compartiment{pvModal.compartiments.length > 1 ? "s" : ""})
                  </span>
                  <table className="w-full text-xs border" style={{ borderColor: T.line }}>
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="p-1.5 text-left">Comp.</th>
                        <th className="p-1.5 text-left">Produit</th>
                        <th className="p-1.5 text-left">Cuve Dest.</th>
                        <th className="p-1.5 text-left">N° Scellé</th>
                        <th className="p-1.5 text-right">Vol. BL (L)</th>
                        <th className="p-1.5 text-right">Stock Théorique (L)</th>
                        <th className="p-1.5 text-right">Stock Final (L)</th>
                        <th className="p-1.5 text-right">Dépoté Réel (L)</th>
                        <th className="p-1.5 text-right">Écart Net (L / %)</th>
                        <th className="p-1.5 text-right">Manquant (L)</th>
                        <th className="p-1.5 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.line }}>
                      {pvModal.compartiments.map((c) => {
                        const volBl = c.volume_bl_num ?? c.volume_bl ?? 0;
                        const volRecu = c.volume_decharge_cuve ?? 0;
                        const stockTheo = c.stock_theorique_apres ?? (n(c.jauge_cuve_avant_l) + volBl);
                        const stockFin = n(c.jauge_cuve_apres_l) || 0;
                        const ecartL = c.ecart_litres ?? 0;
                        const ecartPct = c.ecart_pourcentage ?? 0;
                        const manqL = c.manquant_litres ?? 0;
                        const statut = c.statut ?? (Math.abs(ecartPct) <= 0.20 ? "CONFORME" : ecartL < 0 ? "LITIGE" : "BONI");
                        return (
                          <tr key={c.id || c.numero_compartiment} className={statut === "LITIGE" ? "bg-rose-50/70" : "hover:bg-gray-50"}>
                            <td className="p-1.5 font-black text-gray-900">{c.numero_compartiment}</td>
                            <td className="p-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"}`}>
                                {c.produit}
                              </span>
                            </td>
                            <td className="p-1.5 text-gray-800 font-medium">{c.cuve_nom || "Cuve"}</td>
                            <td className="p-1.5 font-mono text-amber-900 font-semibold">{c.numero_scelle || "--"}</td>
                            <td className="p-1.5 text-right tabular font-semibold">{F(volBl)}</td>
                            <td className="p-1.5 text-right tabular text-blue-950 font-medium">{F(stockTheo)}</td>
                            <td className="p-1.5 text-right tabular text-gray-900 font-medium">{F(stockFin)}</td>
                            <td className="p-1.5 text-right tabular font-bold text-blue-900">{F(volRecu)}</td>
                            <td className={`p-1.5 text-right tabular font-bold ${ecartL >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                              {ecartL > 0 ? "+" : ""}{F(ecartL)} / {ecartPct > 0 ? "+" : ""}{ecartPct}%
                            </td>
                            <td className={`p-1.5 text-right tabular font-black ${manqL > 0 ? "text-rose-700" : "text-gray-500"}`}>
                              {F(manqL)}
                            </td>
                            <td className="p-1.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                statut === "CONFORME" ? "bg-emerald-100 text-emerald-800" :
                                statut === "LITIGE" ? "bg-rose-100 text-rose-800" :
                                "bg-blue-100 text-blue-800"
                              }`}>
                                {statut === "CONFORME" ? "✓ Conforme" : statut === "LITIGE" ? "⚠️ Litige" : "ℹ️ Boni"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={4} className="p-2 font-black text-gray-900 text-xs uppercase">TOTAL CONVOI CITERNE</td>
                        <td className="p-2 text-right font-black tabular text-sm">{F(pvModal.volume_bl)}</td>
                        <td colSpan={2} className="p-2 text-center text-gray-500 text-[10px]">Tolérance légale : ±0.20%</td>
                        <td className="p-2 text-right font-black tabular text-sm text-blue-900">{F(pvModal.volume_decharge_reel)}</td>
                        <td className={`p-2 text-right font-black tabular text-sm ${pvModal.ecart_litres >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {pvModal.ecart_litres > 0 ? "+" : ""}{F(pvModal.ecart_litres)} / {pvModal.ecart_pourcentage > 0 ? "+" : ""}{pvModal.ecart_pourcentage}%
                        </td>
                        <td className={`p-2 text-right font-black tabular text-sm ${pvModal.manquant_litres > 0 ? "text-rose-700" : "text-gray-500"}`}>
                          {F(pvModal.manquant_litres ?? 0)}
                        </td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                            Math.abs(pvModal.ecart_pourcentage || 0) <= 0.20
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}>
                            {Math.abs(pvModal.ecart_pourcentage || 0) <= 0.20 ? "✓ CONFORME" : "🚨 LITIGE"}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                /* Rétrocompatibilité mono-produit */
                <div>
                  <span className="text-[11px] font-bold text-gray-800 uppercase tracking-wider block mb-1.5">
                    Bilan Quantitatif &amp; Tolérances Pétrolières ({pvModal.produit})
                  </span>
                  <table className="w-full text-xs border" style={{ borderColor: T.line }}>
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="p-2 text-left">Paramètre Volumétrique</th>
                        <th className="p-2 text-right">Mesure (Litres)</th>
                        <th className="p-2 text-right">Observation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.line }}>
                      <tr>
                        <td className="p-2 text-gray-700">Volume Facturé / Consigné sur le BL</td>
                        <td className="p-2 text-right font-bold tabular">{F(pvModal.volume_bl)} L</td>
                        <td className="p-2 text-right text-gray-500">Document d'expédition</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-gray-700">Stock Cuve Avant Dépotage</td>
                        <td className="p-2 text-right tabular">{F(pvModal.jauge_avant_litres)} L</td>
                        <td className="p-2 text-right text-gray-500">{pvModal.jauge_avant_cm ? `${pvModal.jauge_avant_cm} cm` : "--"}</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-gray-700">Stock Cuve Après Dépotage (Repos 15 min)</td>
                        <td className="p-2 text-right tabular font-semibold">{F(pvModal.jauge_apres_litres)} L</td>
                        <td className="p-2 text-right text-gray-500">{pvModal.jauge_apres_cm ? `${pvModal.jauge_apres_cm} cm` : "--"}</td>
                      </tr>
                      <tr className="bg-amber-50/50">
                        <td className="p-2 font-bold text-gray-900">Volume Réellement Réceptionné (Déchargé)</td>
                        <td className="p-2 text-right font-black text-blue-900 tabular text-sm">{F(pvModal.volume_decharge_reel)} L</td>
                        <td className="p-2 text-right font-medium text-blue-800">Variation nette cuve</td>
                      </tr>
                      <tr className={pvModal.ecart_litres >= 0 ? "bg-emerald-50/70" : "bg-rose-50/70"}>
                        <td className="p-2 font-black text-gray-900">ÉCART CONSTATÉ (RÉEL - BL)</td>
                        <td className={`p-2 text-right font-black tabular text-sm ${pvModal.ecart_litres >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
                          {pvModal.ecart_litres > 0 ? "+" : ""}{F(pvModal.ecart_litres)} L ({pvModal.ecart_pourcentage > 0 ? "+" : ""}{pvModal.ecart_pourcentage}%)
                        </td>
                        <td className="p-2 text-right font-bold">
                          {Math.abs(pvModal.ecart_pourcentage || 0) <= 0.20 ? "✓ Tolérance ±0.20% OK" : "🚨 Écart hors tolérance"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section Prélèvement Compensatoire aux Pompes pour Manquant Citerne */}
              {(pvModal.prelevement_pompe_actif ||
                (Array.isArray(pvModal.compartiments) && pvModal.compartiments.some((c) => c.prelevement_pompe)) ||
                (Array.isArray(pvModal.prelevements_pompes) && pvModal.prelevements_pompes.length > 0)) && (
                <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⛽</span>
                      <span className="text-xs font-black uppercase text-blue-950 tracking-wider">
                        Régularisation : Compensation Manquant Citerne par Prélèvement aux Pompes
                      </span>
                    </div>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-200 text-blue-950">
                      Traçabilité Pompiste Validée
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-900 font-medium">
                    Un manquant de litrage a été constaté contradictoirement au dépotage citerne. Le volume équivalent a été soutiré aux pistolets de distribution de la station avec l'accord formel du chauffeur pour compenser la réception.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border bg-white" style={{ borderColor: T.line }}>
                      <thead className="bg-blue-100/70 text-blue-950">
                        <tr>
                          <th className="p-1.5 text-left">Compartiment</th>
                          <th className="p-1.5 text-right">Manquant Citerne (L)</th>
                          <th className="p-1.5 text-left">Pompe / Pistolet</th>
                          <th className="p-1.5 text-right">Index Départ</th>
                          <th className="p-1.5 text-right">Index Fin</th>
                          <th className="p-1.5 text-right">Volume Pompé (L)</th>
                          <th className="p-1.5 text-center">Accord Chauffeur</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: T.line }}>
                        {(pvModal.prelevements_pompes && pvModal.prelevements_pompes.length > 0
                          ? pvModal.prelevements_pompes
                          : (pvModal.compartiments || []).filter((c) => c.prelevement_pompe)
                        ).map((p, pIdx) => (
                          <tr key={pIdx} className="hover:bg-blue-50/30">
                            <td className="p-1.5 font-black text-gray-900">{p.numero_compartiment || "--"}</td>
                            <td className="p-1.5 text-right font-black text-rose-700">{F(p.manquant_citerne_l || 0)} L</td>
                            <td className="p-1.5 font-bold text-blue-950">{p.pistolet_code || "--"}</td>
                            <td className="p-1.5 text-right font-mono">{p.pompe_index_depart ? F(p.pompe_index_depart) : "--"}</td>
                            <td className="p-1.5 text-right font-mono">{p.pompe_index_fin ? F(p.pompe_index_fin) : "--"}</td>
                            <td className="p-1.5 text-right font-black text-blue-900 tabular">{F(p.volume_preleve_pompe || 0)} L</td>
                            <td className="p-1.5 text-center font-bold text-emerald-800">
                              {p.accord_chauffeur ? "✓ Accord Obtenu" : "⚠️ Sans Accord"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-slate-600 italic">
                    * Mention de régularisation : Ce volume pompé est consigné pour être pris en compte lors de la clôture du poste du pompiste.
                  </div>
                </div>
              )}

              {/* Réserves & Triple Signature Officielle */}
              <div className="pt-2 text-xs">
                <div className="text-[11px] text-gray-600 mb-3 bg-slate-50 p-2.5 rounded border" style={{ borderColor: T.line }}>
                  <div><strong>Observations Chauffeur :</strong> {pvModal.observations_chauffeur || "Aucune observation particulière émise par le chauffeur."}</div>
                  <div className="mt-1"><strong>Observations &amp; Réserves Réceptionnaire :</strong> {pvModal.observations || "Dépotage réalisé conformément aux procédures de sécurité. Aucune fuite constatée."}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t" style={{ borderColor: T.line }}>
                  <div className="text-center p-3 border rounded-lg bg-gray-50/50">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                      1. VISA CHAUFFEUR LIVREUR
                    </span>
                    <div className="text-xs font-bold text-gray-800 mt-1">{pvModal.nom_chauffeur || "Le Chauffeur"}</div>
                    <div className="h-10 flex items-center justify-center text-gray-400 italic text-[10px]">
                      (Signature "Lu et approuvé")
                    </div>
                  </div>

                  <div className="text-center p-3 border rounded-lg bg-gray-50/50">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                      2. VISA AGENT CONTRÔLEUR
                    </span>
                    <div className="text-xs font-bold text-blue-900 mt-1">{pvModal.agent_controleur || "Agent Jaugeur"}</div>
                    <div className="h-10 flex items-center justify-center text-gray-400 italic text-[10px]">
                      (Certifie l'exactitude des jauges)
                    </div>
                  </div>

                  <div className="text-center p-3 border rounded-lg bg-gray-50/50">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                      3. VISA &amp; CACHET GÉRANT
                    </span>
                    <div className="text-xs font-bold text-amber-950 mt-1">{pvModal.responsable_reception || "Chef de Station"}</div>
                    <div className="h-10 flex items-center justify-center text-gray-400 italic text-[10px]">
                      (Cachet station &amp; clôture)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Boutons d'action en bas du PV */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setPvModal(null)}
                className="py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-900 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition order-last sm:order-first"
                title="Fermer cette fenêtre"
              >
                ✕ Fermer le PV
              </button>
              {cuvesWithLatestJauge.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const autre = cuvesWithLatestJauge.find((c) => c.id !== pvModal.cuve_id) || cuvesWithLatestJauge[0];
                    handleChainerDepotageAutreCuve(autre.id);
                  }}
                  className="py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-500 font-black text-xs text-slate-950 flex items-center justify-center gap-1.5 shadow-sm transition"
                  title="Dépotter une autre cuve avec ce même camion citerne"
                >
                  <span>🔄</span>
                  <span>Dépotter une autre cuve avec ce camion</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2.5 px-4 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-800 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-sm"
              >
                🖨️ Imprimer le PV
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `*RAPPORT DE DÉPOTAGE CARBURANT*\nStation: ${profil?.station_nom || pvModal.station_nom || "Hann Maristes"}\nDate: ${pvModal.date}\nN° BL Camion: ${pvModal.numero_bl || "--"}\n${
                    Array.isArray(pvModal.compartiments) && pvModal.compartiments.length > 0
                      ? `Compartiments: ${pvModal.compartiments.map((c) => `${c.numero_compartiment} [${c.produit}] (Scellé: ${c.numero_scelle || "--"}): ${F(c.volume_decharge_cuve || c.volume_bl || 0)}L`).join(", ")}\n`
                      : `Produit: ${pvModal.produit}\n`
                  }Volume BL: ${F(pvModal.volume_bl)} L\nVolume Reçu: ${F(pvModal.volume_decharge_reel)} L\nÉcart: ${pvModal.ecart_litres > 0 ? "+" : ""}${F(pvModal.ecart_litres)} L (${pvModal.ecart_pourcentage}%)\n${
                    pvModal.prelevement_pompe_actif || (Array.isArray(pvModal.compartiments) && pvModal.compartiments.some((c) => c.prelevement_pompe))
                      ? `⛽ *Compensation Pompes :* ${F(pvModal.prelevement_pompe_total_l || (pvModal.compartiments || []).reduce((s, c) => s + (n(c.volume_preleve_pompe) || 0), 0))} L prélevés au pistolet pour manquant citerne (Visa chauffeur OK)\n`
                      : ""
                  }Statut: ${pvModal.statut}\nVisa: ${pvModal.responsable_reception || "Le Gérant"}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold text-center hover:bg-emerald-700 flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>📱 Partager sur WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}