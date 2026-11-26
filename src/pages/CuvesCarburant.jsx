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

  // ── Compartiments Camion Citerne (Héritent du BL camion, scellés spécifiques) ──
  const [compartiments, setCompartiments] = useState([
    {
      id: "comp-1",
      numero_compartiment: "C1",
      produit: "GASOIL",
      cuve_station_id: "cuve-gasoil-1",
      cuve_nom: "Cuve 1 Gasoil",
      numero_bl: "",
      numero_scelle: "",
      volume_commande: "15000",
      volume_bl: "15000",
      jauge_camion_avant: "Repère flèche conforme",
      reste_camion_litres: "0",
      jauge_cuve_avant_cm: "",
      jauge_cuve_avant_l: "",
      jauge_cuve_apres_cm: "",
      jauge_cuve_apres_l: "",
    },
    {
      id: "comp-2",
      numero_compartiment: "C2",
      produit: "SUPER",
      cuve_station_id: "cuve-super-1",
      cuve_nom: "Cuve 1 Super",
      numero_bl: "",
      numero_scelle: "",
      volume_commande: "10000",
      volume_bl: "10000",
      jauge_camion_avant: "Repère flèche conforme",
      reste_camion_litres: "0",
      jauge_cuve_avant_cm: "",
      jauge_cuve_avant_l: "",
      jauge_cuve_apres_cm: "",
      jauge_cuve_apres_l: "",
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

  // Cuves référentiel pour la station active
  const stationCuves = useMemo(() => {
    const list = (ref?.cuves || []).filter((c) => !stationId || c.station_id === stationId);
    if (list.length > 0) return list;
    return [
      { id: "cuve-gasoil-1", station_id: stationId, nom: "Cuve 1 Gasoil", code: "C-GO-1", produit: "GASOIL", capacite_l: 30000 },
      { id: "cuve-super-1", station_id: stationId, nom: "Cuve 1 Super", code: "C-SP-1", produit: "SUPER", capacite_l: 20000 },
    ];
  }, [ref, stationId]);

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

  // ── CALCULS EN TEMPS RÉEL MULTI-COMPARTIMENTS DU CAMION ──
  const compartimentsCalcules = useMemo(() => {
    return compartiments.map((c) => {
      const volBl = n(c.volume_bl);
      const volCommande = n(c.volume_commande) || volBl;
      const jAv = n(c.jauge_cuve_avant_l);
      const jAp = n(c.jauge_cuve_apres_l);
      const stockTheoriqueApres = jAv + volBl;
      const volRecu = jAp > 0 && jAp >= jAv ? Math.max(0, jAp - jAv) : 0;
      const ecartL = volRecu > 0 ? volRecu - volBl : 0; // = Stock final mesuré - Stock théorique après réception
      const ecartPct = volBl > 0 && volRecu > 0 ? (ecartL / volBl) * 100 : 0;
      const toleranceOk = Math.abs(ecartPct) <= 0.20;
      const manquantL = ecartL < 0 ? Math.abs(ecartL) : 0;
      const manquantAdmissible = volBl * 0.002; // Tolérance admissible ±0.20%
      const manquantLitigeL = Math.max(0, manquantL - manquantAdmissible);
      const prix = c.produit === "GASOIL" ? prixGasoil : prixSuper;
      const manquantFcfa = manquantL * prix;

      const targetCuve = cuvesWithLatestJauge.find((x) => x.id === c.cuve_station_id) ||
                         cuvesWithLatestJauge.find((x) => x.produit === c.produit) ||
                         { capacite_l: c.produit === "GASOIL" ? 30000 : 20000, nom: `Cuve ${c.produit}` };

      const creuxCuve = Math.max(0, targetCuve.capacite_l - jAv);
      const risqueTropPlein = volBl > creuxCuve && jAv > 0;

      return {
        ...c,
        target_cuve: targetCuve,
        creux_cuve: creuxCuve,
        risque_trop_plein: risqueTropPlein,
        volume_commande_num: volCommande,
        volume_bl_num: volBl,
        stock_theorique_apres: stockTheoriqueApres,
        volume_decharge_cuve: volRecu,
        ecart_litres: ecartL,
        ecart_pourcentage: Number(ecartPct.toFixed(2)),
        manquant_litres: manquantL,
        manquant_admissible_l: Number(manquantAdmissible.toFixed(1)),
        manquant_litige_l: Number(manquantLitigeL.toFixed(1)),
        valeur_manquant_fcfa: manquantFcfa,
        tolerance_ok: toleranceOk,
        statut: volRecu === 0 ? "EN_ATTENTE" : toleranceOk ? "CONFORME" : ecartL < 0 ? "LITIGE" : "BONI",
      };
    });
  }, [compartiments, cuvesWithLatestJauge]);

  // Totaux globaux camion citerne
  const totalVolumeCommandeCamion = compartimentsCalcules.reduce((s, c) => s + c.volume_commande_num, 0);
  const totalVolumeBlCamion = compartimentsCalcules.reduce((s, c) => s + c.volume_bl_num, 0);
  const totalVolumeRecuCamion = compartimentsCalcules.reduce((s, c) => s + c.volume_decharge_cuve, 0);
  const totalEcartCamionL = totalVolumeRecuCamion > 0 ? totalVolumeRecuCamion - totalVolumeBlCamion : 0;
  const totalManquantCamionL = compartimentsCalcules.reduce((s, c) => s + c.manquant_litres, 0);
  const totalManquantCamionFcfa = compartimentsCalcules.reduce((s, c) => s + c.valeur_manquant_fcfa, 0);
  const camionConformeGlobal = compartimentsCalcules.every((c) => c.tolerance_ok || c.statut === "EN_ATTENTE");

  const handleUpdateTruckBl = (bl) => {
    setDepotageForm((prev) => ({ ...prev, numero_bl: bl }));
    setCompartiments((prev) =>
      prev.map((c) => ({
        ...c,
        numero_bl: bl,
      }))
    );
  };

  const handleAddCompartiment = () => {
    const nextNum = compartiments.length + 1;
    const isOdd = nextNum % 2 === 1;
    const prod = isOdd ? "GASOIL" : "SUPER";
    const defaultCuve = cuvesWithLatestJauge.find((c) => c.produit === prod) || cuvesWithLatestJauge[0];

    setCompartiments((prev) => [
      ...prev,
      {
        id: `comp-${Date.now()}-${nextNum}`,
        numero_compartiment: `C${nextNum}`,
        produit: prod,
        cuve_station_id: defaultCuve?.id || (isOdd ? "cuve-gasoil-1" : "cuve-super-1"),
        cuve_nom: defaultCuve?.nom || `Cuve ${prod}`,
        numero_bl: depotageForm.numero_bl || "",
        numero_scelle: "",
        volume_bl: "5000",
        jauge_camion_avant: "Repère flèche conforme",
        reste_camion_litres: "0",
        jauge_cuve_avant_cm: "",
        jauge_cuve_avant_l: "",
        jauge_cuve_apres_cm: "",
        jauge_cuve_apres_l: "",
      },
    ]);
    flash(`Compartiment C${nextNum} ajouté au camion.`);
  };

  const handleRemoveCompartiment = (id) => {
    if (compartiments.length <= 1) {
      return flash("Le camion doit comporter au moins un compartiment", "err");
    }
    setCompartiments((prev) => prev.filter((c) => c.id !== id));
    flash("Compartiment retiré du camion.");
  };

  const handleUpdateCompartiment = (id, field, val) => {
    setCompartiments((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: val };
        if (field === "produit") {
          const matchingCuve = cuvesWithLatestJauge.find((x) => x.produit === val);
          if (matchingCuve) {
            updated.cuve_station_id = matchingCuve.id;
            updated.cuve_nom = matchingCuve.nom;
          }
        }
        if (field === "cuve_station_id") {
          const matchingCuve = cuvesWithLatestJauge.find((x) => x.id === val);
          if (matchingCuve) {
            updated.cuve_nom = matchingCuve.nom;
          }
        }
        return updated;
      })
    );
  };

  const handlePreRemplirJaugeAvantComp = (id, cuveId) => {
    const target = cuvesWithLatestJauge.find((c) => c.id === cuveId) || cuvesWithLatestJauge[0];
    const last = target?.latestJauge || { volume_physique: 0, hauteur_cm: "" };
    handleUpdateCompartiment(id, "jauge_cuve_avant_l", last.volume_physique != null ? last.volume_physique.toString() : "0");
    handleUpdateCompartiment(id, "jauge_cuve_avant_cm", last.hauteur_cm != null ? last.hauteur_cm.toString() : "");
    flash(`Jauge avant pré-remplie pour ${target?.nom || "la cuve"} (${last.volume_physique || 0} L)`);
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

    const res = await saveCuve({
      station_id: stationId,
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

    // Validation des compartiments (héritage BL camion et scellés spécifiques)
    for (const c of compartimentsCalcules) {
      if (!c.numero_scelle?.trim()) {
        return flash(`Compartiment ${c.numero_compartiment} : Veuillez saisir le numéro de scellé / plomb de sécurité`, "err");
      }
      if (c.volume_bl_num <= 0) {
        return flash(`Compartiment ${c.numero_compartiment} : Le volume BL doit être > 0`, "err");
      }
      if (!c.jauge_cuve_apres_l || n(c.jauge_cuve_apres_l) <= 0) {
        return flash(`Compartiment ${c.numero_compartiment} : Veuillez saisir la jauge cuve après dépotage`, "err");
      }
    }

    const payload = {
      ...depotageForm,
      station_id: stationId,
      station_nom: profil?.station_nom || "Station Hann Maristes",
      numero_depotage: depotageForm.numero_depotage || genererNumeroDepotage(),
      produit: Array.from(new Set(compartimentsCalcules.map((c) => c.produit))).join(" / "),
      numero_bl: depotageForm.numero_bl.trim(),
      volume_commande: totalVolumeCommandeCamion,
      volume_bl: totalVolumeBlCamion,
      volume_decharge_reel: totalVolumeRecuCamion,
      ecart_litres: totalEcartCamionL,
      ecart_pourcentage: totalVolumeBlCamion > 0 ? Number(((totalEcartCamionL / totalVolumeBlCamion) * 100).toFixed(2)) : 0,
      manquant_litres: totalManquantCamionL,
      manquant_fcfa: totalManquantCamionFcfa,
      conformite_ecart: camionConformeGlobal,
      statut: camionConformeGlobal ? "CONFORME" : "LITIGE MANQUANT",
      compartiments: compartimentsCalcules,
    };

    const res = await saveRapportDepotage(payload);
    if (res.ok) {
      flash(`✅ Rapport de dépotage convoi validé avec succès !`, "ok");
      setPvModal(res.rapport);
      setDepotageForm({
        numero_depotage: genererNumeroDepotage(),
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
        immatriculation_camion: "",
        immatriculation_remorque: "",
        nom_chauffeur: "",
        numero_permis: "",
        agent_controleur: profil?.nom_complet || "Agent Contrôleur",
        responsable_reception: profil?.nom_complet || "Chef de Station",

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

        scelles_conformes: true,
        numeros_scelles: "",
        densite_mesuree: "0.835",
        temperature_c: "28",
        observations_chauffeur: "",
        observations: "",
      });
      setCompartiments([
        {
          id: "comp-1",
          numero_compartiment: "C1",
          produit: "GASOIL",
          cuve_station_id: "cuve-gasoil-1",
          cuve_nom: "Cuve 1 Gasoil",
          numero_bl: "",
          numero_scelle: "",
          volume_commande: "15000",
          volume_bl: "15000",
          jauge_camion_avant: "Repère flèche conforme",
          reste_camion_litres: "0",
          jauge_cuve_avant_cm: "",
          jauge_cuve_avant_l: "",
          jauge_cuve_apres_cm: "",
          jauge_cuve_apres_l: "",
        },
      ]);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      loadData();
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

      {/* ────────────────── ONGLET 2 : NOUVEAU DÉPOTAGE (PROCESSUS PÉTROLIER EN 5 ÉTAPES) ────────────────── */}
      {tab === "depotage" && (
        <form onSubmit={handleValiderDepotage} className="space-y-4">
          {/* Bannière d'introduction au processus pétrolier */}
          <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-amber-950 text-white rounded-2xl p-4 shadow-md border border-blue-950">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">⛽</span>
                  <h2 className="text-sm sm:text-base font-black tracking-tight uppercase">
                    Procédure Officielle de Dépotage Citerne
                  </h2>
                  <span className="text-[10px] font-extrabold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full uppercase">
                    5 Étapes Contrôlées
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  Contrôle de conformité de livraison, sécurité incendie, vérification anti-débordement des cuves, jaugeages comparatifs et calcul automatique des écarts.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] text-amber-300 uppercase font-bold block">Identifiant Unique</span>
                  <span className="text-xs font-mono font-black text-white bg-white/10 px-2 py-1 rounded border border-white/20">
                    {depotageForm.numero_depotage}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ÉTAPE 1 : PRÉPARATION & IDENTIFICATION DE LA LIVRAISON ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center text-xs font-black">1</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                  Préparation &amp; Informations Générales de Livraison
                </h2>
              </div>
              <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                Convoi Citerne ({compartiments.length} compartiment{compartiments.length > 1 ? "s" : ""})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-blue-950 mb-1">Numéro de Dépotage *</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={depotageForm.numero_depotage}
                    onChange={(e) => setDepotageForm({ ...depotageForm, numero_depotage: e.target.value })}
                    className="w-full text-xs border rounded p-2 uppercase font-mono font-bold bg-gray-50 text-gray-900"
                    style={{ borderColor: T.line }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setDepotageForm({ ...depotageForm, numero_depotage: genererNumeroDepotage() })}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border text-xs font-bold"
                    title="Régénérer le N°"
                  >
                    🔄
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-950 mb-1">N° Bon de Livraison (BL) *</label>
                <input
                  type="text"
                  placeholder="ex: BL-TOT-2026-9921"
                  value={depotageForm.numero_bl}
                  onChange={(e) => handleUpdateTruckBl(e.target.value)}
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Date de l'Opération *</label>
                <input
                  type="date"
                  value={depotageForm.date}
                  onChange={(e) => setDepotageForm({ ...depotageForm, date: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-medium"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
            </div>

            {/* Horaires d'arrivée et d'opération */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: T.line }}>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Heure Arrivée Camion</label>
                <input
                  type="time"
                  value={depotageForm.heure_arrivee}
                  onChange={(e) => setDepotageForm({ ...depotageForm, heure_arrivee: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Heure Début Dépotage</label>
                <input
                  type="time"
                  value={depotageForm.heure_debut}
                  onChange={(e) => setDepotageForm({ ...depotageForm, heure_debut: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Heure Fin Dépotage</label>
                <input
                  type="time"
                  value={depotageForm.heure_fin}
                  onChange={(e) => setDepotageForm({ ...depotageForm, heure_fin: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>

            {/* Convoi et Chauffeur */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t" style={{ borderColor: T.line }}>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Fournisseur / Société Pétrolière *</label>
                <input
                  type="text"
                  list="fournisseurs-list"
                  placeholder="ex: TOTAL, VIVO, OLA, SAR..."
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

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Société de Transport</label>
                <input
                  type="text"
                  placeholder="ex: STT Sénégal, Transport Diallo"
                  value={depotageForm.transporteur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, transporteur: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-900 mb-1">Camion Tracteur (Immat.) *</label>
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
            </div>

            {/* Intervenants : Chauffeur, Agent Contrôleur et Responsable Réception */}
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
                <label className="block text-xs font-bold text-blue-950 mb-1">Agent Contrôleur (Jaugeur / Mesures) *</label>
                <input
                  type="text"
                  placeholder="Nom de l'agent qui effectue les contrôles"
                  value={depotageForm.agent_controleur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, agent_controleur: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-bold bg-white text-blue-900"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-950 mb-1">Responsable Réception (Gérant / Validation) *</label>
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
          </div>

          {/* ── ÉTAPE 2 : CONTRÔLES PRÉALABLES DE SÉCURITÉ & QUALITÉ ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b mb-3 gap-2" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">2</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                  Contrôles Préalables de Sécurité, Conformité &amp; Qualité
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const checkListKeys = [
                    depotageForm.check_documents_identite,
                    depotageForm.check_produit_cuve_conforme,
                    depotageForm.check_capacite_creux_validee,
                    depotageForm.check_raccords_flexibles_etanches,
                    depotageForm.check_balisage_extincteurs_prets,
                    depotageForm.check_prise_de_terre_branchee,
                    depotageForm.check_moteur_coupe_cales_posees,
                    depotageForm.check_pistolets_distribution_arretes,
                    depotageForm.check_absence_fuite_surveillance,
                    depotageForm.check_test_eau_negatif,
                  ];
                  const nbOk = checkListKeys.filter(Boolean).length;
                  const allOk = nbOk === 10;
                  return (
                    <span
                      className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                        allOk ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-amber-50 text-amber-900 border-amber-300"
                      }`}
                    >
                      {allOk ? "✓ 10/10 Sécurité Validée" : `⚠️ ${nbOk}/10 Points de sécurité`}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Checklist Sécurité en 10 points officiels */}
            <div className="text-[11px] font-bold text-gray-700 uppercase mb-2 flex items-center justify-between">
              <span>Checklist de Contrôle Avant Dépotage (10 Points Réglementaires)</span>
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
                Tout cocher conforme
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border" style={{ borderColor: T.line }}>
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
                <span>5. Balisage en place et extincteurs à poudre (9kg / 50kg) prêts</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                <input
                  type="checkbox"
                  checked={depotageForm.check_prise_de_terre_branchee}
                  onChange={(e) => setDepotageForm({ ...depotageForm, check_prise_de_terre_branchee: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>6. Dispositif de mise à la terre branché au châssis camion</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                <input
                  type="checkbox"
                  checked={depotageForm.check_moteur_coupe_cales_posees}
                  onChange={(e) => setDepotageForm({ ...depotageForm, check_moteur_coupe_cales_posees: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>7. Moteur coupé, coupe-batterie actionné et cales de roue posées</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                <input
                  type="checkbox"
                  checked={depotageForm.check_pistolets_distribution_arretes}
                  onChange={(e) => setDepotageForm({ ...depotageForm, check_pistolets_distribution_arretes: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>8. Équipements de distribution / pistolets de la cuve arrêtés</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                <input
                  type="checkbox"
                  checked={depotageForm.check_absence_fuite_surveillance}
                  onChange={(e) => setDepotageForm({ ...depotageForm, check_absence_fuite_surveillance: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>9. Surveillance continue et vérification de l'absence totale de fuite</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium p-1 hover:bg-white rounded transition">
                <input
                  type="checkbox"
                  checked={depotageForm.check_test_eau_negatif}
                  onChange={(e) => setDepotageForm({ ...depotageForm, check_test_eau_negatif: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>10. Test à la pâte à eau négatif (absence d'eau en citerne et cuve)</span>
              </label>
            </div>

            {/* Qualité et Scellés */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t" style={{ borderColor: T.line }}>
              <div>
                <label className="block text-[11px] text-gray-700 font-bold mb-1">
                  Plombs / Scellés Dômes &amp; Vannes
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="scelles-conforme-chk"
                    checked={depotageForm.scelles_conformes}
                    onChange={(e) => setDepotageForm({ ...depotageForm, scelles_conformes: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <label htmlFor="scelles-conforme-chk" className="text-xs font-semibold cursor-pointer">
                    {depotageForm.scelles_conformes ? "✓ Scellés intacts" : "⚠️ Scellés brisés"}
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-600 mb-1">N° Scellés notés sur BL</label>
                <input
                  type="text"
                  placeholder="ex: SC-99182, SC-99183"
                  value={depotageForm.numeros_scelles}
                  onChange={(e) => setDepotageForm({ ...depotageForm, numeros_scelles: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-mono"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Densité mesurée à l'hydromètre</label>
                <input
                  type="text"
                  placeholder="ex: 0.835 (Gasoil) ou 0.745 (Super)"
                  value={depotageForm.densite_mesuree}
                  onChange={(e) => setDepotageForm({ ...depotageForm, densite_mesuree: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-semibold"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Température du produit (°C)</label>
                <input
                  type="text"
                  placeholder="ex: 28"
                  value={depotageForm.temperature_c}
                  onChange={(e) => setDepotageForm({ ...depotageForm, temperature_c: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-semibold"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>
          </div>

          {/* ── ÉTAPE 3 : CONTRÔLE DES CUVES & ANTI-DÉBORDEMENT (AVANT DÉPOTAGE) ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b mb-4 gap-2" style={{ borderColor: T.line }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs font-black">3</span>
                  <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Contrôle des Cuves Réceptrices &amp; Sécurité Anti-Débordement
                  </h2>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Vérifier impérativement que la capacité disponible (creux) de chaque cuve permet de recevoir le volume annoncé sur le BL sans risque de débordement.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddCompartiment}
                className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg font-bold text-gray-900 shadow-sm transition-all hover:opacity-90 flex items-center gap-1.5"
                style={{ background: T.gold }}
              >
                <span>➕ Ajouter un Compartiment Citerne</span>
              </button>
            </div>

            {/* Cartes des Compartiments Camion */}
            <div className="space-y-4">
              {compartimentsCalcules.map((c, idx) => {
                const targetCuve = c.target_cuve;
                const creuxCuve = c.creux_cuve;
                const risqueTropPlein = c.risque_trop_plein;

                return (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl border transition-all"
                    style={{
                      borderColor: risqueTropPlein ? "#f87171" : c.statut === "LITIGE" ? "#fca5a5" : c.statut === "CONFORME" ? "#86efac" : T.line,
                      background: risqueTropPlein ? "#fff1f2" : c.statut === "LITIGE" ? "#fef2f2" : "#fafafa",
                    }}
                  >
                    {/* Header Compartiment */}
                    <div className="flex flex-wrap items-center justify-between pb-2.5 mb-3 border-b gap-2" style={{ borderColor: T.line }}>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs font-black bg-gray-900 text-white">
                          Compartiment #{idx + 1} ({c.numero_compartiment})
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-black ${
                            c.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {c.produit}
                        </span>
                        <span className="text-[11px] font-bold text-gray-800 bg-gray-200/80 px-2 py-0.5 rounded">
                          Cuve Cible : {targetCuve?.nom || c.cuve_nom || "Cuve"}
                        </span>
                        <span className="text-[11px] font-mono text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          BL: {c.numero_bl || depotageForm.numero_bl || "--"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {risqueTropPlein ? (
                          <span className="text-[11px] font-black px-2.5 py-0.5 rounded bg-rose-600 text-white animate-pulse">
                            🚨 RISQUE DÉBORDEMENT CUVE
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                            ✓ Creux Cuve Suffisant ({F(creuxCuve)} L dispo)
                          </span>
                        )}

                        {compartiments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCompartiment(c.id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 rounded hover:bg-rose-50"
                            title="Supprimer ce compartiment"
                          >
                            ✕ Retirer
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Grille interne du compartiment : 3 volets (1. Affectation, 2. Contrôle Cuve Avant, 3. Mesures Citerne & Après) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Volet 1 : Produit, Cuve Cible & Quantités */}
                      <div className="bg-white p-3 rounded-lg border space-y-2 shadow-xs" style={{ borderColor: T.line }}>
                        <div className="text-[11px] font-bold text-gray-700 uppercase flex items-center justify-between">
                          <span>📦 Carburant &amp; Destination</span>
                          <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.2 rounded">Étape 3.1</span>
                        </div>

                        <div>
                          <label className="block text-[11px] text-gray-600 mb-0.5">Produit Réceptionné *</label>
                          <select
                            value={c.produit}
                            onChange={(e) => handleUpdateCompartiment(c.id, "produit", e.target.value)}
                            className="w-full text-xs border rounded p-1.5 font-bold bg-gray-50"
                            style={{ borderColor: T.line }}
                          >
                            <option value="GASOIL">GASOIL</option>
                            <option value="SUPER">SUPER CARBURANT</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-blue-900 font-bold mb-0.5">
                            Cuve Station Réceptrice *
                          </label>
                          <select
                            value={c.cuve_station_id}
                            onChange={(e) => handleUpdateCompartiment(c.id, "cuve_station_id", e.target.value)}
                            className="w-full text-xs border rounded p-1.5 font-bold bg-white text-gray-900 border-blue-400 focus:ring-1 focus:ring-blue-500"
                          >
                            {cuvesWithLatestJauge
                              .filter((x) => x.produit === c.produit)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.nom} — Cap: {F(x.capacite_l)} L (Creux: {F(x.creux_disponible)} L)
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[10px] text-gray-600 mb-0.5">Quantité Commandée (L)</label>
                            <input
                              type="number"
                              placeholder="ex: 15000"
                              value={c.volume_commande || ""}
                              onChange={(e) => handleUpdateCompartiment(c.id, "volume_commande", e.target.value)}
                              className="w-full text-xs border rounded p-1.5 font-semibold"
                              style={{ borderColor: T.line }}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-blue-900 font-bold mb-0.5">Quantité BL (L) *</label>
                            <input
                              type="number"
                              placeholder="ex: 15000"
                              value={c.volume_bl}
                              onChange={(e) => handleUpdateCompartiment(c.id, "volume_bl", e.target.value)}
                              className="w-full text-xs border rounded p-1.5 font-black text-blue-950 bg-blue-50/50"
                              style={{ borderColor: "#2563EB" }}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-amber-950 mb-0.5">
                            N° Scellé(s) Compartiment (Dôme / Vanne) *
                          </label>
                          <input
                            type="text"
                            placeholder="ex: SC-10291 (Dôme) / SC-10292 (Vanne)"
                            value={c.numero_scelle || ""}
                            onChange={(e) => handleUpdateCompartiment(c.id, "numero_scelle", e.target.value)}
                            className="w-full text-xs border rounded p-1.5 uppercase font-mono font-bold text-amber-950 bg-amber-50/40"
                            style={{ borderColor: "#D97706" }}
                            required
                          />
                        </div>
                      </div>

                      {/* Volet 2 : Mesure Cuve Avant Dépotage (Jauge Latte Initiale) */}
                      <div className="bg-white p-3 rounded-lg border space-y-2 shadow-xs" style={{ borderColor: T.line }}>
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-bold text-gray-700 uppercase flex items-center gap-1">
                            <span>📏</span>
                            <span>Jauge Avant Dépotage</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePreRemplirJaugeAvantComp(c.id, c.cuve_station_id)}
                            className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
                          >
                            Dernière jauge
                          </button>
                        </div>

                        <div>
                          <label className="block text-[11px] text-gray-600 mb-0.5">Hauteur &amp; Volume Initial *</label>
                          <div className="flex gap-1.5">
                            <input
                              type="number"
                              placeholder="cm latte"
                              value={c.jauge_cuve_avant_cm}
                              onChange={(e) => handleUpdateCompartiment(c.id, "jauge_cuve_avant_cm", e.target.value)}
                              className="w-1/3 text-xs border rounded p-1.5"
                              style={{ borderColor: T.line }}
                            />
                            <input
                              type="number"
                              placeholder="Litres initiaux"
                              value={c.jauge_cuve_avant_l}
                              onChange={(e) => handleUpdateCompartiment(c.id, "jauge_cuve_avant_l", e.target.value)}
                              className="w-2/3 text-xs border rounded p-1.5 font-bold"
                              style={{ borderColor: T.line }}
                              required
                            />
                          </div>
                        </div>

                        {/* Rapprochement Capacité / Creux Disponible */}
                        <div className="p-2 rounded bg-slate-50 border text-[11px] space-y-1" style={{ borderColor: T.line }}>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Capacité Cuve :</span>
                            <strong>{F(targetCuve?.capacite_l || 0)} L</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Stock Initial Cuve :</span>
                            <span className="font-semibold">{F(c.jauge_cuve_avant_l || 0)} L</span>
                          </div>
                          <div className="flex justify-between font-bold pt-1 border-t" style={{ borderColor: T.line }}>
                            <span className="text-gray-700">Capacité Disponible (Creux) :</span>
                            <span className={creuxCuve < c.volume_bl_num ? "text-rose-700 font-black" : "text-emerald-700 font-black"}>
                              {F(creuxCuve)} L
                            </span>
                          </div>
                        </div>

                        {risqueTropPlein && (
                          <div className="text-[10px] text-red-700 font-black bg-red-50 p-2 rounded border border-red-300">
                            ⛔ ATTENTION DÉBORDEMENT : Le volume BL ({F(c.volume_bl_num)} L) excède la capacité restante ({F(creuxCuve)} L) ! L'opération doit être interrompue.
                          </div>
                        )}
                      </div>

                      {/* Volet 3 : Dépotage Citerne & Mesure Cuve Après Dépotage */}
                      <div className="bg-white p-3 rounded-lg border space-y-2 shadow-xs" style={{ borderColor: T.line }}>
                        <div className="text-[11px] font-bold text-gray-700 uppercase flex items-center justify-between">
                          <span>🏁 Mesures Après Dépotage</span>
                          <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.2 rounded">Étape 4</span>
                        </div>

                        <div>
                          <label className="block text-[11px] text-gray-600 mb-0.5">Reste citerne après vidange (L)</label>
                          <input
                            type="number"
                            placeholder="0 si vidange complète"
                            value={c.reste_camion_litres}
                            onChange={(e) => handleUpdateCompartiment(c.id, "reste_camion_litres", e.target.value)}
                            className="w-full text-xs border rounded p-1.5 font-bold text-gray-800"
                            style={{ borderColor: T.line }}
                          />
                          <p className="text-[10px] text-gray-400 mt-0.5">0 L = Vidange totale du compartiment</p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-blue-950 mb-0.5">
                            Jauge Cuve Après Dépotage (Litres) *
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              type="number"
                              placeholder="cm"
                              value={c.jauge_cuve_apres_cm}
                              onChange={(e) => handleUpdateCompartiment(c.id, "jauge_cuve_apres_cm", e.target.value)}
                              className="w-1/3 text-xs border rounded p-1.5"
                              style={{ borderColor: T.line }}
                            />
                            <input
                              type="number"
                              placeholder="Litres mesurés"
                              value={c.jauge_cuve_apres_l}
                              onChange={(e) => handleUpdateCompartiment(c.id, "jauge_cuve_apres_l", e.target.value)}
                              className="w-2/3 text-xs border rounded p-1.5 font-black text-blue-900 bg-blue-50/40"
                              style={{ borderColor: "#2563EB" }}
                              required
                            />
                          </div>
                        </div>

                        <div className="p-2 rounded bg-blue-50/70 border border-blue-200 text-[11px] text-blue-950">
                          <div className="flex justify-between">
                            <span>Stock Théorique après réception :</span>
                            <strong>{F(c.stock_theorique_apres)} L</strong>
                          </div>
                          <div className="text-[10px] text-blue-700 mt-0.5">
                            (Formule : Stock initial {F(c.jauge_cuve_avant_l || 0)} L + Volume BL {F(c.volume_bl_num)} L)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── ÉTAPE 4 : BILAN DES 4 QUANTITÉS & CALCUL AUTOMATIQUE DES ÉCARTS ── */}
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: T.line }}>
                      <div className="text-[10px] uppercase font-black text-gray-500 mb-2 tracking-wider flex items-center justify-between">
                        <span>Étape 4 : Rapprochement Volumétrique &amp; Tolérances Légales (±0.20%)</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${c.tolerance_ok ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>
                          {c.tolerance_ok ? "✓ Écart Admissible" : "🚨 Litige Hors Tolérance"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                        <div className="bg-white p-2 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-500 uppercase block font-semibold">1. Volume BL</span>
                          <strong className="text-gray-900 tabular text-sm">{F(c.volume_bl_num)} L</strong>
                        </div>

                        <div className="bg-white p-2 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-500 uppercase block font-semibold">2. Stock Théorique</span>
                          <strong className="text-blue-950 tabular text-sm">{F(c.stock_theorique_apres)} L</strong>
                        </div>

                        <div className="bg-white p-2 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-500 uppercase block font-semibold">3. Stock Final Mesuré</span>
                          <strong className="text-blue-900 tabular text-sm">{F(c.jauge_cuve_apres_l || 0)} L</strong>
                        </div>

                        <div className="bg-white p-2 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-500 uppercase block font-semibold">4. Volume Dépoté Réel</span>
                          <strong className="text-indigo-900 tabular text-sm">{F(c.volume_decharge_cuve)} L</strong>
                        </div>

                        <div className="bg-white p-2 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-500 uppercase block font-semibold">Écart de Réception</span>
                          <strong className={`tabular text-sm ${c.ecart_litres >= 0 ? "text-emerald-700" : "text-rose-700 font-black"}`}>
                            {c.ecart_litres > 0 ? "+" : ""}{F(c.ecart_litres)} L ({c.ecart_pourcentage > 0 ? "+" : ""}{c.ecart_pourcentage}%)
                          </strong>
                        </div>

                        <div className="bg-white p-2 rounded-lg border shadow-2xs" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-500 uppercase block font-semibold">Valorisation Manquant</span>
                          <strong className={`tabular text-sm ${c.valeur_manquant_fcfa > 0 ? "text-rose-700 font-black" : "text-gray-600"}`}>
                            {F(c.valeur_manquant_fcfa)} FCFA
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bouton pour ajouter un compartiment supplémentaire */}
            <div className="mt-3 pt-3 border-t flex justify-center" style={{ borderColor: T.line }}>
              <button
                type="button"
                onClick={handleAddCompartiment}
                className="text-xs px-4 py-2 rounded-xl font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 border transition-all flex items-center gap-1.5"
                style={{ borderColor: T.line }}
              >
                <span>➕ Ajouter un autre compartiment au camion citerne</span>
              </button>
            </div>
          </div>

          {/* ── ÉTAPE 5 : CLÔTURE & DOUBLE VALIDATION DU DÉPOTAGE ── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-black">5</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                  Validation, Clôture &amp; Génération du Procès-Verbal Officiel
                </h2>
              </div>
              <span className="text-[11px] font-black text-slate-700">
                Double Visa Réglementaire (Contrôleur + Gérant)
              </span>
            </div>

            {/* Synthèse Totale Camion Citerne */}
            <div className="p-4 rounded-xl border bg-slate-900 text-white shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-700/80">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-black tracking-wide">BILAN CONSOLIDÉ CONVOI CITERNE</span>
                  <span className="text-xs text-gray-400">({compartiments.length} compartiment{compartiments.length > 1 ? "s" : ""})</span>
                </div>
                <div
                  className={`text-xs font-black px-2.5 py-0.5 rounded ${
                    camionConformeGlobal
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      : "bg-rose-950 text-rose-300 border border-rose-700 animate-pulse"
                  }`}
                >
                  {camionConformeGlobal ? "✓ CONVOI CONFORME (TOLÉRANCE RESPECTÉE)" : "🚨 LITIGE MANQUANT CONSTATÉ"}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Volume Commandé</div>
                  <div className="text-base font-bold text-gray-200 tabular">{F(totalVolumeCommandeCamion)} L</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Total Facturé BL</div>
                  <div className="text-lg font-black text-amber-400 tabular">{F(totalVolumeBlCamion)} L</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Total Réceptionné Cuves</div>
                  <div className="text-lg font-black text-emerald-400 tabular">{F(totalVolumeRecuCamion)} L</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Écart Net Global</div>
                  <div className={`text-lg font-black tabular ${totalEcartCamionL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {totalEcartCamionL > 0 ? "+" : ""}{F(totalEcartCamionL)} L
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Valeur Litige Manquant</div>
                  <div className={`text-lg font-black tabular ${totalManquantCamionFcfa > 0 ? "text-rose-400" : "text-gray-300"}`}>
                    {F(totalManquantCamionFcfa)} FCFA
                  </div>
                </div>
              </div>
            </div>

            {/* Observations Chauffeur & Réceptionnaire */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
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
                  placeholder="ex: Scellés conformes, test eau négatif, dépotage terminé à 11h15 sans incident."
                  value={depotageForm.observations}
                  onChange={(e) => setDepotageForm({ ...depotageForm, observations: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>

            {/* Action de Validation Finale */}
            <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-3 border-t" style={{ borderColor: T.line }}>
              {!peutValiderDepotage && (
                <div className="flex-1 text-xs text-center p-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-900 font-semibold flex items-center justify-center gap-2">
                  <span>🔒</span>
                  <span>Validation réservée au Gérant / Direction. Enregistrement en brouillon possible pour les agents.</span>
                </div>
              )}
              <button
                type="submit"
                disabled={!peutValiderDepotage && !peutDepotage}
                className={`w-full py-3.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 ${
                  !peutValiderDepotage && !peutDepotage ? "opacity-50 cursor-not-allowed" : "hover:opacity-95"
                }`}
                style={{ background: !peutValiderDepotage ? "#94a3b8" : T.gold, color: !peutValiderDepotage ? "white" : "#111827" }}
                title={!peutValiderDepotage ? "Réservé au Gérant / Direction" : "Valider le dépotage"}
              >
                {peutValiderDepotage ? (
                  <span>📄 Valider la Clôture du Dépotage &amp; Générer le Procès-Verbal Officiel (A4)</span>
                ) : peutDepotage ? (
                  <span>💾 Enregistrer comme Brouillon (en attente de validation Gérant)</span>
                ) : (
                  <span>⛔ Accès refusé</span>
                )}
              </button>
            </div>
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
                    <div className="text-xs text-gray-600">
                      Station : <strong>{profil?.station_nom || pvModal.station_nom || "Station Hann Maristes"}</strong> (Code: {stationId})
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
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2.5 px-4 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-800 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-sm"
              >
                🖨️ Imprimer le PV
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `*RAPPORT DE DÉPOTAGE CARBURANT*\nStation: ${profil?.station_nom || "Hann Maristes"}\nDate: ${pvModal.date}\nN° BL Camion: ${pvModal.numero_bl || "--"}\n${
                    Array.isArray(pvModal.compartiments) && pvModal.compartiments.length > 0
                      ? `Compartiments: ${pvModal.compartiments.map((c) => `C${c.numero_compartiment} [${c.produit}] (Scellé: ${c.numero_scelle || "--"}): ${F(c.volume_decharge_cuve || 0)}L`).join(", ")}\n`
                      : `Produit: ${pvModal.produit}\n`
                  }Volume BL: ${F(pvModal.volume_bl)} L\nVolume Reçu: ${F(pvModal.volume_decharge_reel)} L\nÉcart: ${pvModal.ecart_litres > 0 ? "+" : ""}${F(pvModal.ecart_litres)} L (${pvModal.ecart_pourcentage}%)\nStatut: ${pvModal.statut}\nVisa: ${pvModal.responsable_reception || "Le Gérant"}`
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