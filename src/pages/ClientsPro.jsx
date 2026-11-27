import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listClientsPro,
  createClientPro,
  updateClientPro,
  listVehicules,
  createVehicule,
  listOperationsCredit,
  saveOperationCredit,
  soldeClient,
  listBonsClient,
  reglerBonsClient,
  listFactures,
  saveFacture,
  marquerFactureReglee,
  nextSequenceFacture,
  listProgrammesBons,
  createProgrammeBons,
  updateProgrammeBons,
  listConsommationsProgramme,
  creerAccesClientPro,
  toggleAccesClientPro,
} from "../lib/api";
import { Section, Row, Num, Loading } from "../components/ui";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { codeClientCanonique, listeClientsCredit } from "../lib/seed";
import { peutAgirProfil } from "../lib/permissions";
import FactureOfficielleModal from "../components/FactureOfficielleModal";
import { calculerFactureFiscale, genererNumeroFacture, FISCAL_CONFIG } from "../lib/facturation";
import DemandeProgrammeModal from "../components/DemandeProgrammeModal";
import InstructionProgrammeModal from "../components/InstructionProgrammeModal";
import ProgrammesBonsSection from "../components/ProgrammesBonsSection";
import {
  ouvrirWhatsApp,
  ouvrirEmail,
  messageFactureOfficielle,
  emailFactureOfficielle,
  messageDistributionTransporteur,
} from "../lib/notifications-client";

export default function ClientsPro() {
  const { profil, cloud } = useAuth();
  const isClient = profil?.role === "client_pro";
  const peutCreerClient = peutAgirProfil(profil, "client_pro", "creer") && !isClient;
  const peutEncaisserCredit = peutAgirProfil(profil, "credit", "encaisser") && !isClient;
  const [searchParams] = useSearchParams();
  const [stationId, setStationId] = useState(profil?.station_id || "");
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [selected, setSelected] = useState(null);
  const [subTab, setSubTab] = useState(isClient ? "programmes" : "bons"); // bons | programmes | ops | vehicules | reglement | factures
  const [clForm, setClForm] = useState({
    code: "",
    nom_entreprise: "",
    nom_commercial: "",
    ninea: "",
    rccm: "",
    adresse: "",
    ville: "Dakar",
    telephone: "",
    email: "",
    representant_legal_nom: "",
    representant_legal_contact: "",
    responsable_compte_nom: "",
    responsable_compte_contact: "",
    responsable_financier_nom: "",
    responsable_financier_contact: "",
    infos_complementaires: "",
    creer_acces: true,
    password_acces: "Client2026!",
    plafond_credit: 1000000,
    station_id: stationId,
  });
  const [veh, setVeh] = useState({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
  const [reglementForm, setReglementForm] = useState({ montant: "", reference: "", mode: "ESPECES", date: todayISO() });
  const [msg, setMsg] = useState("");
  const [soldes, setSoldes] = useState({});
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);

  // Programmes de Bons de Carburant & Consommations
  const [programmesClient, setProgrammesClient] = useState([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [consommationsClient, setConsommationsClient] = useState([]);
  const [loadingConsommations, setLoadingConsommations] = useState(false);
  const [tousProgrammesStation, setTousProgrammesStation] = useState([]);
  const [loadingTousProgrammes, setLoadingTousProgrammes] = useState(false);

  // Modals de Programmes
  const [showDemandeModal, setShowDemandeModal] = useState(false);
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [selectedProgrammeInstruction, setSelectedProgrammeInstruction] = useState(null);
  const [programmeEnEdition, setProgrammeEnEdition] = useState(null);

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

  // Factures Officielles OHADA / Sénégal
  const [mainTab, setMainTab] = useState(searchParams.get("tab") === "factures" ? "factures" : searchParams.get("tab") === "programmes" ? "programmes_tous" : "clients"); // clients | factures | programmes_tous
  const [toutesFactures, setToutesFactures] = useState([]);
  const [loadingToutesFactures, setLoadingToutesFactures] = useState(false);
  const [filtreStatutFacture, setFiltreStatutFacture] = useState("TOUS");
  const [facturesClient, setFacturesClient] = useState([]);
  const [loadingFactures, setLoadingFactures] = useState(false);
  const [factureAffichee, setFactureAffichee] = useState(null);
  const [selectedBonsIds, setSelectedBonsIds] = useState(new Set());

  const clients = useMemo(() => {
    let list = listeClientsCredit(ref);
    if (isClient) {
      const mine = codeClientCanonique(profil?.client_code);
      const cleanEmail = (profil?.email || "").toLowerCase().trim();
      list = list.filter((c) => {
        if (mine && c.code === mine) return true;
        if (cleanEmail && (c.email || "").toLowerCase().trim() === cleanEmail) return true;
        return false;
      });
      // Fallback si le compte vient d'être créé et n'est pas encore rechargé dans le référentiel
      if (list.length === 0) {
        const fallbackCode = mine || `CP-${(profil?.nom_complet || "CLIENT").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}`;
        list = [{
          id: profil?.id,
          code: fallbackCode,
          nom: profil?.nom_complet || "Mon Entreprise",
          nom_entreprise: profil?.nom_complet || "Mon Entreprise",
          email: profil?.email || "",
          telephone: profil?.telephone || "",
          plafond_credit: 1000000,
          plafond: 1000000,
          actif: true,
          aliases: [],
        }];
      }
    }
    return list.map((c) => ({ ...c, nom_entreprise: c.nom_entreprise || c.nom }));
  }, [ref, profil, isClient]);

  const vehicules = selected ? (ref?.vehicules || []).filter((v) => v.client_code === selected) : [];
  const clientActif = clients.find((c) => c.code === selected) || (isClient ? clients[0] : null);

  // Synthèse litrage globale des programmes du client
  const syntheseLitresClient = useMemo(() => {
    let volumeTotal = 0;
    let volumeConso = 0;
    for (const p of programmesClient) {
      const volDemande = n(p.volume_demande_l || p.volume_demande);
      const volAccorde = n(p.volume_accorde_l || p.volume_accorde || volDemande);
      const volConsomme = n(p.volume_consomme_l || p.volume_consomme || 0);
      volumeTotal += volAccorde;
      volumeConso += volConsomme;
    }
    const volumeRestant = Math.max(0, volumeTotal - volumeConso);
    const pct = volumeTotal > 0 ? Math.min(100, Math.round((volumeConso / volumeTotal) * 100)) : 0;
    return { volumeTotal, volumeConso, volumeRestant, pct };
  }, [programmesClient]);

  const flash = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const cls = listeClientsCredit(r);
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
    if (!stationId && ref?.stations?.length) setStationId(ref.stations[0].id);
  }, [ref, stationId]);

  const loadToutesFactures = async () => {
    setLoadingToutesFactures(true);
    try {
      const facs = await listFactures();
      setToutesFactures(facs || []);
    } catch (e) {
      console.error("Erreur chargement factures:", e);
    } finally {
      setLoadingToutesFactures(false);
    }
  };

  const loadTousProgrammes = async () => {
    setLoadingTousProgrammes(true);
    try {
      const progs = await listProgrammesBons(stationId ? { station_id: stationId } : {});
      setTousProgrammesStation(progs || []);
    } catch (e) {
      console.error("Erreur chargement tous programmes:", e);
    } finally {
      setLoadingTousProgrammes(false);
    }
  };

  useEffect(() => {
    loadData();
    loadToutesFactures();
    loadTousProgrammes();
  }, [cloud, stationId]);

  useEffect(() => {
    const fromUrl = searchParams.get("client");
    if (fromUrl) {
      setSelected(fromUrl);
      setSubTab("programmes");
      setMainTab("clients");
    }
    if (searchParams.get("tab") === "factures") {
      setMainTab("factures");
      loadToutesFactures();
    }
    if (searchParams.get("tab") === "programmes") {
      setMainTab("programmes_tous");
      loadTousProgrammes();
    }
  }, [searchParams]);

  // Sélection automatique du compte lorsque l'utilisateur connecté est un Client Professionnel
  useEffect(() => {
    if (isClient && clients.length > 0) {
      if (!selected || !clients.some((c) => c.code === selected)) {
        setSelected(clients[0].code);
        setSubTab("programmes");
      }
    }
  }, [isClient, clients, selected]);

  const handleToggleAcces = async (client) => {
    try {
      const nouvelEtat = !client.acces_actif;
      const res = await toggleAccesClientPro(client.code, nouvelEtat);
      if (res.ok) {
        flash(nouvelEtat ? "✓ Accès portail client activé avec succès" : "✓ Accès portail client suspendu");
        await loadData();
      } else {
        flash("Erreur bascule accès : " + (res.error || "Inconnu"));
      }
    } catch (e) {
      flash("Erreur : " + e.message);
    }
  };

  const handleSaveDemandeProgramme = async (demandeData) => {
    try {
      const res = await createProgrammeBons(demandeData);
      if (res?.error) {
        flash("Erreur création programme : " + res.error);
        return;
      }
      flash(
        demandeData.statut === "BROUILLON"
          ? "✓ Demande enregistrée en brouillon"
          : "✓ Demande de programme soumise avec succès au gérant !"
      );
      setShowDemandeModal(false);
      setProgrammeEnEdition(null);
      if (selected) await loadClientOps(selected);
      await loadTousProgrammes();
    } catch (e) {
      flash("Erreur : " + e.message);
    }
  };

  const handleDecisionGerant = async (decision) => {
    try {
      const res = await updateProgrammeBons(decision.programme_id, decision);
      if (res?.error) {
        flash("Erreur instruction programme : " + res.error);
        return;
      }
      flash("✓ Décision enregistrée : Statut " + decision.nouveau_statut);
      setShowInstructionModal(false);
      setSelectedProgrammeInstruction(null);
      if (selected) await loadClientOps(selected);
      await loadTousProgrammes();
    } catch (e) {
      flash("Erreur : " + e.message);
    }
  };

  const handleActiverDirect = async (programme) => {
    try {
      await updateProgrammeBons(programme.id, {
        nouveau_statut: "ACTIF",
        motif: "Activation directe par le gérant",
        instruction_par_nom: profil?.nom_complet || profil?.nom || "Gérant",
      });
      flash(`✓ Programme ${programme.numero_programme} activé avec succès`);
      if (selected) await loadClientOps(selected);
      await loadTousProgrammes();
    } catch (e) {
      flash("Erreur : " + e.message);
    }
  };

  const loadClientOps = async (code) => {
    setLoadingOps(true);
    setLoadingBons(true);
    setLoadingFactures(true);
    setLoadingProgrammes(true);
    setLoadingConsommations(true);
    try {
      const [o, b, s, facs, progs, consos] = await Promise.all([
        listOperationsCredit(code),
        listBonsClient(code, stationId),
        soldeClient(code),
        listFactures({ client_code: code }),
        listProgrammesBons({ client_code: code }),
        listConsommationsProgramme({ client_code: code }),
      ]);
      setOps(o || []);
      setBonsClient(b || []);
      setSoldes((prev) => ({ ...prev, [code]: s }));
      setFacturesClient(facs || []);
      setProgrammesClient(progs || []);
      setConsommationsClient(consos || []);
      setSelectedBonsIds(new Set());
    } catch (err) {
      console.error("Erreur chargement données client:", err);
    } finally {
      setLoadingOps(false);
      setLoadingBons(false);
      setLoadingFactures(false);
      setLoadingProgrammes(false);
      setLoadingConsommations(false);
    }
  };

  useEffect(() => {
    if (selected) {
      loadClientOps(selected);
    } else {
      setOps([]);
      setBonsClient([]);
      setFacturesClient([]);
      setSelectedBonsIds(new Set());
    }
  }, [selected]);

  // Sélection de bons pour facturation
  const toggleSelectBon = (bonId) => {
    setSelectedBonsIds((prev) => {
      const next = new Set(prev);
      if (next.has(bonId)) next.delete(bonId);
      else next.add(bonId);
      return next;
    });
  };

  const selectAllBonsImpayes = () => {
    const impayes = bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) > 0);
    setSelectedBonsIds(new Set(impayes.map((b) => b.id)));
  };

  // Génération d'une Facture Officielle conforme OHADA
  const handleGenererFacture = async (bonsCibles = null, autoSendWhatsApp = false) => {
    if (!clientActif) {
      flash("⚠️ Veuillez sélectionner un client d'abord.");
      return;
    }

    let bonsAFacturer = [];
    if (bonsCibles && bonsCibles.length > 0) {
      bonsAFacturer = bonsCibles;
    } else if (selectedBonsIds.size > 0) {
      bonsAFacturer = bonsClient.filter((b) => selectedBonsIds.has(b.id));
    } else {
      // Par défaut : tous les bons impayés ou partiels
      bonsAFacturer = bonsClient.filter((b) => n(b.reste_a_payer ?? b.montant) > 0);
    }

    if (bonsAFacturer.length === 0) {
      flash("⚠️ Aucun bon sélectionné ou disponible à facturer pour ce client.");
      return;
    }

    try {
      const station = (ref?.stations || []).find((s) => s.id === stationId) || ref?.stations?.[0] || { code: "HANN", nom: "HANN MARISTE" };
      
      console.log("Génération facture - Station:", station);
      console.log("Bons à facturer:", bonsAFacturer);
      
      const seq = await nextSequenceFacture(station.code, todayISO());
      console.log("Séquence:", seq);
      
      const numeroFacture = genererNumeroFacture(station.code, todayISO(), seq);
      console.log("Numéro facture:", numeroFacture);

      // Construction des lignes de facture
      const lignesBrutes = bonsAFacturer.map((b) => ({
        designation: b.produit ? `Carburant ${b.produit}` : "Consommation carburant à la pompe",
        bon_numero: b.numero_bon || b.id?.slice(0, 8),
        immatriculation: b.immatriculation || b.matricule || "—",
        quantite: n(b.volume_litres || (n(b.montant) > 0 ? Math.round(n(b.montant) / 990) : 1)),
        prix_unitaire_ttc: n(b.prix_unitaire) > 0 ? n(b.prix_unitaire) : (n(b.montant) > 0 ? Math.round(n(b.montant) / Math.max(1, n(b.volume_litres || 1))) : 990),
        montant_ttc: n(b.montant),
        date: b.date || todayISO(),
      }));

      const calculFiscal = calculerFactureFiscale(lignesBrutes);
      console.log("Calcul fiscal:", calculFiscal);

      const nouvelleFacture = {
        id: uuid(),
        numero_facture: numeroFacture,
        station_id: station.id || stationId,
        station_nom: station.nom || "STAR ENERGY HANN MARISTE",
        client_code: clientActif.code,
        client_nom: clientActif.nom_entreprise || clientActif.nom,
        client_ninea: clientActif.ninea || clientActif.rccm || "Non renseigné",
        client_telephone: clientActif.telephone || "",
        client_email: clientActif.email || "",
        date_emission: todayISO(),
        date_echeance: todayISO(), // Échéance à réception par défaut
        objet: `Règlement des bons de carburant (${bonsAFacturer.length} bon(s)) — ${clientActif.nom_entreprise || clientActif.nom}`,
        lignes: calculFiscal.lignes,
        montant_ht: calculFiscal.totalHT,
        montant_tva: calculFiscal.totalTVA,
        montant_ttc: calculFiscal.totalTTC,
        total_en_lettres: calculFiscal.totalEnLettres,
        bons_ids: bonsAFacturer.map((b) => b.id),
        statut: "EMISE",
        created_at: new Date().toISOString(),
      };

      console.log("Facture à sauvegarder:", nouvelleFacture);
      
      await saveFacture(nouvelleFacture);
      setFacturesClient((prev) => [nouvelleFacture, ...prev]);
      setToutesFactures((prev) => [nouvelleFacture, ...prev]);
      setFactureAffichee(nouvelleFacture);
      setSelectedBonsIds(new Set());
      flash(`✓ Facture officielle ${numeroFacture} générée avec succès (${F(calculFiscal.totalTTC)} FCFA)`);

      if (autoSendWhatsApp) {
        const msg = messageFactureOfficielle({
          facture: nouvelleFacture,
          clientNom: clientActif.nom_entreprise,
        });
        ouvrirWhatsApp(clientActif.telephone || "", msg);
      }
    } catch (e) {
      console.error("Erreur génération facture:", e);
      flash("Erreur génération facture : " + (e.message || e));
    }
  };

  const handleEnvoyerFactureWhatsApp = (fac) => {
    const msg = messageFactureOfficielle({
      facture: fac,
      clientNom: fac.client_nom || clientActif?.nom_entreprise,
    });
    const tel = fac.client_telephone || clientActif?.telephone || "";
    ouvrirWhatsApp(tel, msg);
  };

  const handleEnvoyerFactureEmail = (fac) => {
    const { sujet, corps } = emailFactureOfficielle({
      facture: fac,
      clientNom: fac.client_nom || clientActif?.nom_entreprise,
    });
    const mailDest = fac.client_email || clientActif?.email || "";
    ouvrirEmail(mailDest, sujet, corps);
  };

  const handleNotifierBonWhatsApp = (b) => {
    const msg = messageDistributionTransporteur({
      clientNom: clientActif?.nom_entreprise || b.client_nom || "Client Partenaire",
      stationNom: (ref?.stations || []).find((s) => s.id === stationId)?.nom || "STAR ENERGY HANN MARISTE",
      bonNumero: b.numero_bon || b.id?.slice(0, 8),
      date: b.date || todayISO(),
      produit: b.produit || "GASOIL",
      volumeLitres: b.volume_litres,
      montant: b.montant,
      transporteurNom: b.transporteur_nom || b.observations || "",
      immatriculation: b.immatriculation || b.matricule || "",
      programmeNumero: b.programme_numero || "",
      pompisteNom: b.pompiste_nom || "Pompiste",
    });
    const tel = clientActif?.telephone || "";
    ouvrirWhatsApp(tel, msg);
  };

  const handleNotifierBonEmail = (b) => {
    const msg = messageDistributionTransporteur({
      clientNom: clientActif?.nom_entreprise || b.client_nom || "Client Partenaire",
      stationNom: (ref?.stations || []).find((s) => s.id === stationId)?.nom || "STAR ENERGY HANN MARISTE",
      bonNumero: b.numero_bon || b.id?.slice(0, 8),
      date: b.date || todayISO(),
      produit: b.produit || "GASOIL",
      volumeLitres: b.volume_litres,
      montant: b.montant,
      transporteurNom: b.transporteur_nom || b.observations || "",
      immatriculation: b.immatriculation || b.matricule || "",
      programmeNumero: b.programme_numero || "",
      pompisteNom: b.pompiste_nom || "Pompiste",
    });
    const sujet = `Avis prise de carburant N° ${b.numero_bon || b.id?.slice(0, 8)} - ${clientActif?.nom_entreprise}`;
    ouvrirEmail(clientActif?.email || "", sujet, msg);
  };

  const handleMarquerFactureReglee = async (factureId) => {
    try {
      const res = await marquerFactureReglee(factureId);
      if (res.ok) {
        setFacturesClient((prev) =>
          prev.map((f) => (f.id === factureId ? { ...f, statut: "REGLEE", date_reglement: todayISO() } : f))
        );
        setToutesFactures((prev) =>
          prev.map((f) => (f.id === factureId ? { ...f, statut: "REGLEE", date_reglement: todayISO() } : f))
        );
        if (factureAffichee?.id === factureId) {
          setFactureAffichee((prev) => ({ ...prev, statut: "REGLEE", date_reglement: todayISO() }));
        }
        flash("✓ Facture marquée comme réglée");
      }
    } catch (e) {
      flash("Erreur règlement facture : " + (e.message || e));
    }
  };

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
    if (!peutEncaisserCredit) return flash("Tu n'as pas le droit d'encaisser un crédit client.");
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
      setReglementBonsForm({
        montant_verse: "",
        date: todayISO(),
        mode: "ESPECES",
        reference: "",
        allocations: {},
      });
      await loadClientOps(selected);
    } catch (err) {
      console.error(err);
      flash("Erreur lors de l'enregistrement : " + err.message);
    }
  };

  const save = async () => {
    if (!peutCreerClient) return flash("Tu n'as pas le droit de créer un client professionnel.");
    if (!clForm.nom_entreprise.trim()) return flash("Le nom de l'entreprise est requis");
    const code = clForm.code.trim() || `CP-${clForm.nom_entreprise.trim().slice(0, 4).toUpperCase()}`;
    const payload = {
      ...clForm,
      code,
      station_id: stationId,
      plafond_credit: n(clForm.plafond_credit),
    };
    const res = await createClientPro(payload);
    if (res?.error) return flash("Erreur : " + res.error);

    // Créer ou activer les identifiants d'accès si demandé
    if (clForm.creer_acces && clForm.email) {
      try {
        await creerAccesClientPro({
          client: payload,
          password: clForm.password_acces || "Client2026!",
          station_id: stationId,
        });
      } catch (accErr) {
        console.warn("Création accès client:", accErr);
      }
    }

    setClForm({
      code: "",
      nom_entreprise: "",
      nom_commercial: "",
      ninea: "",
      rccm: "",
      adresse: "",
      ville: "Dakar",
      telephone: "",
      email: "",
      representant_legal_nom: "",
      representant_legal_contact: "",
      responsable_compte_nom: "",
      responsable_compte_contact: "",
      responsable_financier_nom: "",
      responsable_financier_contact: "",
      infos_complementaires: "",
      creer_acces: true,
      password_acces: "Client2026!",
      plafond_credit: 1000000,
      station_id: stationId,
    });
    flash("✓ Client professionnel et compte d'accès créés avec succès");
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
    if (!peutEncaisserCredit) return flash("Tu n'as pas le droit d'encaisser un crédit client.");
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
      {msg && <div className="rounded-lg px-3 py-2 text-sm font-semibold shadow-xs" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {isClient ? (
        /* === ESPACE CLIENT PROFESSIONNEL B2B DÉDIÉ === */
        <div className="space-y-4">
          {/* Header Espace Entreprise */}
          <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-purple-500/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                  <span className="text-2xl">🏢</span>
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight">{clientActif?.nom_entreprise || "Mon Entreprise"}</h1>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                    {clientActif?.code}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Espace Entreprise Partenaire
                  </span>
                </div>
                <div className="text-xs text-purple-200/80 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {clientActif?.telephone && <span>📞 {clientActif.telephone}</span>}
                  {clientActif?.email && <span>✉️ {clientActif.email}</span>}
                  {clientActif?.ninea && <span>📄 NINEA : <strong className="text-white">{clientActif.ninea}</strong></span>}
                  {clientActif?.rccm && <span>🏢 RCCM : <strong className="text-white">{clientActif.rccm}</strong></span>}
                </div>
              </div>

              {/* Bouton d'action principal pour demander un programme */}
              <button
                type="button"
                onClick={() => {
                  setProgrammeEnEdition(null);
                  setShowDemandeModal(true);
                }}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 self-start md:self-auto cursor-pointer"
              >
                <span className="text-lg">➕</span>
                <span>Demander un Programme de Bons</span>
              </button>
            </div>

            {/* Cartes KPI Litrage & Encours */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-white/10">
              <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-200">Volume Total Accordé</div>
                <div className="text-lg sm:text-xl font-black text-white mt-0.5 tabular">{F(syntheseLitresClient.volumeTotal)} L</div>
                <div className="text-[10px] text-purple-300/70">{programmesClient.length} programme(s)</div>
              </div>

              <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-200">Volume Consommé</div>
                <div className="text-lg sm:text-xl font-black text-amber-300 mt-0.5 tabular">{F(syntheseLitresClient.volumeConso)} L</div>
                <div className="text-[10px] text-amber-300/70">{syntheseLitresClient.pct}% distribué</div>
              </div>

              <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-200">Volume Restant Disponible</div>
                <div className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5 tabular">{F(syntheseLitresClient.volumeRestant)} L</div>
                <div className="text-[10px] text-emerald-300/70">Solde à la pompe</div>
              </div>

              <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-200">Plafond Crédit</div>
                <div className="text-lg sm:text-xl font-black text-white mt-0.5 tabular">{F(clientActif?.plafond_credit || 1000000)} F</div>
                <div className="text-[10px] text-purple-300/70">
                  {(soldes[selected] || 0) < 0 ? `${F(-soldes[selected])} F facturés` : `${F(soldes[selected] || 0)} F disponible`}
                </div>
              </div>
            </div>
          </div>

          {/* Onglets de navigation Client B2B */}
          <div className="flex flex-wrap items-center gap-1.5 border-b pb-2" style={{ borderColor: T.line }}>
            <button
              type="button"
              onClick={() => setSubTab("programmes")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "programmes"
                  ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-300"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>⛽</span>
              <span>Mes Programmes de Bons ({programmesClient.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab("bons")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "bons"
                  ? "bg-purple-900 text-white shadow-md ring-2 ring-purple-300"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>🎫</span>
              <span>Suivi des Bons &amp; Consommations ({bonsClient.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab("vehicules")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "vehicules"
                  ? "bg-blue-900 text-white shadow-md ring-2 ring-blue-300"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>🚚</span>
              <span>Ma Flotte &amp; Véhicules ({vehicules.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab("factures")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "factures"
                  ? "bg-emerald-800 text-white shadow-md ring-2 ring-emerald-300"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>📄</span>
              <span>Mes Factures Officielles ({facturesClient.length})</span>
            </button>
          </div>

          {/* Contenu de l'onglet actif pour le client */}
          {subTab === "programmes" && (
            <div className="space-y-4">
              <ProgrammesBonsSection
                clientCode={selected}
                programmes={programmesClient}
                client={clientActif}
                consommations={consommationsClient}
                onOpenDemande={() => {
                  setProgrammeEnEdition(null);
                  setShowDemandeModal(true);
                }}
                onOpenInstruction={() => {}}
                onActiverDirect={() => {}}
                isGerant={false}
              />
            </div>
          )}

          {subTab === "bons" && (
            <div className="space-y-4">
              {/* Synthèse des Bons client */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 bg-slate-50 border rounded-lg" style={{ borderColor: T.line }}>
                  <div className="text-[10px] font-bold text-gray-500 uppercase">Total Bons Délivrés</div>
                  <div className="text-base font-black text-gray-900 tabular mt-0.5">{bonsClient.length} bon(s)</div>
                  <div className="text-[11px] text-gray-500">{F(totalMontantBons)} FCFA</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-[10px] font-bold text-blue-700 uppercase">Volume Carburant Servis</div>
                  <div className="text-base font-black text-blue-900 tabular mt-0.5">{F(totalLitresBons)} L</div>
                  <div className="text-[11px] text-blue-600">Total litres livrés à la pompe</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Montant Réglé</div>
                  <div className="text-base font-black text-emerald-800 tabular mt-0.5">{F(totalRegleBons)} FCFA</div>
                  <div className="text-[11px] text-emerald-600">Règlements enregistrés</div>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <div className="text-[10px] font-bold text-rose-700 uppercase">En Attente de Facturation / Règlement</div>
                  <div className="text-base font-black text-rose-800 tabular mt-0.5">{F(totalResteBons)} FCFA</div>
                  <div className="text-[11px] text-rose-600">{bonsImpayes.length + bonsPartiels.length} bon(s) en cours</div>
                </div>
              </div>

              {/* Tableau détaillé des bons de carburant */}
              <div className="bg-white border rounded-xl overflow-hidden shadow-xs" style={{ borderColor: T.line }}>
                <div className="p-3 bg-gray-50 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2" style={{ borderColor: T.line }}>
                  <div className="font-bold text-xs text-gray-800">
                    Historique des prises de carburant par vos transporteurs ({filteredBons.length})
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
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
                      En cours ({bonsImpayes.length + bonsPartiels.length})
                    </button>
                    <button
                      onClick={() => setBonFilter("REGLES")}
                      className={`px-2.5 py-1 rounded font-bold transition-colors ${
                        bonFilter === "REGLES" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      Facturés / Réglés ({bonsRegles.length})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/75 text-gray-600 border-b font-semibold" style={{ borderColor: T.line }}>
                      <tr>
                        <th className="py-2.5 px-3">N° Bon</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Immatriculation</th>
                        <th className="py-2.5 px-3">Chauffeur</th>
                        <th className="py-2.5 px-3">Produit</th>
                        <th className="py-2.5 px-3 text-right">Litres</th>
                        <th className="py-2.5 px-3 text-right">P.U.</th>
                        <th className="py-2.5 px-3 text-right">Montant Total</th>
                        <th className="py-2.5 px-3">Pompiste</th>
                        <th className="py-2.5 px-3">Statut</th>
                        <th className="py-2.5 px-3 text-center">Avis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredBons.map((b) => {
                        const montantTotal = n(b.montant || b.valeur || b.montant_total);
                        const estRegle = b.statut === "REGLE" || b.solde_restant <= 0;
                        return (
                          <tr key={b.id || b.numero_bon} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3 font-mono font-bold text-gray-900">{b.numero_bon || b.numero || "—"}</td>
                            <td className="py-2 px-3 text-gray-600">{fmtDate(b.date)}</td>
                            <td className="py-2 px-3 font-mono font-bold text-blue-900">{b.immatriculation || "—"}</td>
                            <td className="py-2 px-3 text-gray-800">{b.chauffeur || "—"}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                (b.produit || b.carburant) === "SUPER" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-900"
                              }`}>
                                {b.produit || b.carburant || "GASOIL"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-black text-gray-900 tabular">{F(b.volume_l || b.litres || 0)} L</td>
                            <td className="py-2 px-3 text-right text-gray-500 tabular">{F(b.prix_unitaire || 0)} F</td>
                            <td className="py-2 px-3 text-right font-black text-emerald-900 tabular">{F(montantTotal)} FCFA</td>
                            <td className="py-2 px-3 text-gray-500">{b.pompiste || "—"}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                estRegle ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {estRegle ? "✓ Facturé / Réglé" : "⏳ En cours"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleNotifierBonWhatsApp(b)}
                                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300"
                                title="Reçu WhatsApp"
                              >
                                📲 Reçu
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredBons.length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-6 text-center text-gray-400">
                            Aucun bon de carburant trouvé.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {subTab === "vehicules" && (
            <div className="space-y-4">
              {/* Formulaire ajout véhicule */}
              <div className="p-4 bg-gray-50 rounded-xl border" style={{ borderColor: T.line }}>
                <div className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
                  ➕ Déclarer un Nouveau Véhicule dans votre Flotte
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input
                    value={veh.immatriculation}
                    onChange={(e) => setVeh({ ...veh, immatriculation: e.target.value.toUpperCase() })}
                    placeholder="Immatriculation (ex: AA-123-BB)"
                    className="border rounded px-2.5 py-1.5 text-xs font-mono font-bold uppercase bg-white"
                    style={{ borderColor: T.line }}
                  />
                  <input
                    value={veh.marque}
                    onChange={(e) => setVeh({ ...veh, marque: e.target.value })}
                    placeholder="Marque (ex: Renault, Toyota)"
                    className="border rounded px-2.5 py-1.5 text-xs bg-white"
                    style={{ borderColor: T.line }}
                  />
                  <input
                    value={veh.modele}
                    onChange={(e) => setVeh({ ...veh, modele: e.target.value })}
                    placeholder="Modèle (ex: Kerax, Hilux)"
                    className="border rounded px-2.5 py-1.5 text-xs bg-white"
                    style={{ borderColor: T.line }}
                  />
                  <select
                    value={veh.carburant}
                    onChange={(e) => setVeh({ ...veh, carburant: e.target.value })}
                    className="border rounded px-2.5 py-1.5 text-xs bg-white"
                    style={{ borderColor: T.line }}
                  >
                    <option value="GASOIL">Gasoil</option>
                    <option value="SUPER">Super</option>
                  </select>
                  <button
                    type="button"
                    onClick={saveVeh}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                  >
                    Enregistrer Véhicule
                  </button>
                </div>
              </div>

              {/* Liste des véhicules */}
              <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: T.line }}>
                <div className="p-3 bg-gray-50 border-b font-bold text-xs text-gray-800" style={{ borderColor: T.line }}>
                  Véhicules et Transporteurs Autorisés ({vehicules.length})
                </div>
                <div className="divide-y divide-gray-100">
                  {vehicules.map((v, idx) => (
                    <div key={v.id || idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🚛</span>
                        <div>
                          <span className="font-mono font-black text-sm text-gray-900">{v.immatriculation}</span>
                          <span className="text-gray-500 ml-2">{v.marque} {v.modele}</span>
                          <span className="text-gray-400 ml-2 text-[11px]">({v.type_vehicule || "CAMION"})</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900">
                        {v.carburant || "GASOIL"}
                      </span>
                    </div>
                  ))}
                  {vehicules.length === 0 && (
                    <div className="p-6 text-center text-gray-400 text-xs">
                      Aucun véhicule déclaré pour le moment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {subTab === "factures" && (
            <div className="space-y-4">
              <div className="bg-white border rounded-xl overflow-hidden shadow-xs" style={{ borderColor: T.line }}>
                <div className="p-3 bg-gray-50 border-b flex items-center justify-between" style={{ borderColor: T.line }}>
                  <div className="font-bold text-xs text-gray-800">
                    Vos Factures Officielles OHADA émises par la station ({facturesClient.length})
                  </div>
                </div>

                <div className="divide-y divide-gray-100">
                  {facturesClient.map((f) => (
                    <div key={f.id || f.numero_facture} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-blue-950">{f.numero_facture}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            f.statut === "PAYEE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {f.statut === "PAYEE" ? "✓ Payée" : "⏳ Émise / En attente"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Date : <strong>{fmtDate(f.date_emission)}</strong> · {f.lignes_bons?.length || 0} bon(s) rattaché(s)
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Total TTC</div>
                          <div className="font-black text-sm text-gray-900 tabular">{F(f.total_ttc || f.totalTTC || 0)} FCFA</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setFactureAffichee(f)}
                          className="px-3.5 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                        >
                          <span>👁️ Visualiser &amp; Imprimer A4</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {facturesClient.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      Aucune facture officielle enregistrée pour le moment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* === PORTAIL MULTI-CLIENTS GÉRANCE / DIRECTION === */
        <div className="space-y-4">
          {/* ── SÉLECTEUR D'ONGLET RACINE : CLIENTS VS PROGRAMMES BONS VS FACTURATION OHADA ── */}
          <div className="flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: T.line }}>
        <button
          type="button"
          onClick={() => setMainTab("clients")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
            mainTab === "clients"
              ? "bg-[#56216C] text-white shadow-md ring-2 ring-purple-300"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>👥</span>
          <span>Portefeuille Clients &amp; Comptes B2B ({clients.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMainTab("programmes_tous");
            loadTousProgrammes();
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
            mainTab === "programmes_tous"
              ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-300"
              : "bg-white text-amber-900 hover:bg-amber-50 border border-amber-200"
          }`}
        >
          <span>⛽</span>
          <span>Programmes de Bons de Carburant ({tousProgrammesStation.length})</span>
          {tousProgrammesStation.filter((p) => p.statut === "EN_ATTENTE").length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
              {tousProgrammesStation.filter((p) => p.statut === "EN_ATTENTE").length} en attente
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setMainTab("factures");
            loadToutesFactures();
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
            mainTab === "factures"
              ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
              : "bg-white text-blue-800 hover:bg-blue-50 border border-blue-200"
          }`}
        >
          <span>📄</span>
          <span>Facturation Officielle OHADA (Certifiée QR Code)</span>
          {toutesFactures.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900">
              {toutesFactures.length}
            </span>
          )}
        </button>
      </div>

      {msg && <div className="rounded-lg px-3 py-2 text-sm font-semibold shadow-xs" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* ── VUE 1 : PORTEFEUILLE CLIENTS B2B ── */}
      {mainTab === "clients" && (
        <div className="space-y-4">
          {/* Entête */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: T.line }}>
            <div>
              <h1 className="text-xl font-black tracking-tight" style={{ color: T.petrol }}>
                Portefeuille Clients Professionnels &amp; Flottes
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Gestion des crédits carburant, suivi des encaissements de bons, programmes &amp; flottes (§33)
              </p>
            </div>
            <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
              {clients.length} compte(s) B2B actif(s)
            </div>
          </div>

      {/* Formulaire nouveau client professionnel */}
      {peutCreerClient && (
      <Section titre="Nouveau Compte Client Entreprise" aside="RBAC : Commercial, Gérant, Direction">
        <div className="space-y-3 py-2">
          {/* Ligne 1 : Identification & Dénomination */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Code Client *</div>
              <input value={clForm.code} onChange={(e) => setClForm({ ...clForm, code: e.target.value })} placeholder="ex: CP-SOCOCIM" className="w-full border rounded px-2.5 py-1.5 text-xs uppercase font-mono font-bold" style={{ borderColor: T.line }} />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs font-medium" style={{ color: T.muted }}>Raison Sociale *</div>
              <input value={clForm.nom_entreprise} onChange={(e) => setClForm({ ...clForm, nom_entreprise: e.target.value })} placeholder="ex: Sococim Industries SA" className="w-full border rounded px-2.5 py-1.5 text-xs font-bold" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Nom Commercial / Enseigne</div>
              <input value={clForm.nom_commercial} onChange={(e) => setClForm({ ...clForm, nom_commercial: e.target.value })} placeholder="ex: Sococim Ciments" className="w-full border rounded px-2.5 py-1.5 text-xs" style={{ borderColor: T.line }} />
            </div>
          </div>

          {/* Ligne 2 : Données légales (NINEA, RCCM) & Localisation */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>NINEA (Sénégal)</div>
              <input value={clForm.ninea} onChange={(e) => setClForm({ ...clForm, ninea: e.target.value })} placeholder="ex: 0012345672V2" className="w-full border rounded px-2.5 py-1.5 text-xs font-mono" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>RCCM</div>
              <input value={clForm.rccm} onChange={(e) => setClForm({ ...clForm, rccm: e.target.value })} placeholder="SN-DKR-2022-B-1234" className="w-full border rounded px-2.5 py-1.5 text-xs font-mono" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Adresse du siège</div>
              <input value={clForm.adresse} onChange={(e) => setClForm({ ...clForm, adresse: e.target.value })} placeholder="Km 4, Bd du Centenaire" className="w-full border rounded px-2.5 py-1.5 text-xs" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Ville / Région</div>
              <input value={clForm.ville} onChange={(e) => setClForm({ ...clForm, ville: e.target.value })} placeholder="Dakar / Rufisque" className="w-full border rounded px-2.5 py-1.5 text-xs" style={{ borderColor: T.line }} />
            </div>
          </div>

          {/* Ligne 3 : Contacts (Général, Représentant légal, Responsable compte, Responsable financier) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-gray-50 border" style={{ borderColor: T.line }}>
            <div>
              <div className="text-[11px] font-bold text-gray-700 uppercase mb-1">Représentant Légal</div>
              <input value={clForm.representant_legal_nom} onChange={(e) => setClForm({ ...clForm, representant_legal_nom: e.target.value })} placeholder="Nom & Prénom" className="w-full border rounded px-2 py-1 text-xs mb-1 bg-white" style={{ borderColor: T.line }} />
              <input value={clForm.representant_legal_contact} onChange={(e) => setClForm({ ...clForm, representant_legal_contact: e.target.value })} placeholder="Tél / Contact" className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-[11px] font-bold text-gray-700 uppercase mb-1">Responsable Compte / Flotte</div>
              <input value={clForm.responsable_compte_nom} onChange={(e) => setClForm({ ...clForm, responsable_compte_nom: e.target.value })} placeholder="Nom Gestionnaire Flotte" className="w-full border rounded px-2 py-1 text-xs mb-1 bg-white" style={{ borderColor: T.line }} />
              <input value={clForm.responsable_compte_contact} onChange={(e) => setClForm({ ...clForm, responsable_compte_contact: e.target.value })} placeholder="Tél / Email" className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-[11px] font-bold text-gray-700 uppercase mb-1">Responsable Financier</div>
              <input value={clForm.responsable_financier_nom} onChange={(e) => setClForm({ ...clForm, responsable_financier_nom: e.target.value })} placeholder="Nom DAF / Comptable" className="w-full border rounded px-2 py-1 text-xs mb-1 bg-white" style={{ borderColor: T.line }} />
              <input value={clForm.responsable_financier_contact} onChange={(e) => setClForm({ ...clForm, responsable_financier_contact: e.target.value })} placeholder="Tél / Email" className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }} />
            </div>
          </div>

          {/* Ligne 4 : Plafond de crédit & Accès sécurisé espace client */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Téléphone principal</div>
              <input value={clForm.telephone} onChange={(e) => setClForm({ ...clForm, telephone: e.target.value })} placeholder="77 000 00 00" className="w-full border rounded px-2.5 py-1.5 text-xs" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Email principal (Login) *</div>
              <input value={clForm.email} onChange={(e) => setClForm({ ...clForm, email: e.target.value })} placeholder="contact@entreprise.sn" className="w-full border rounded px-2.5 py-1.5 text-xs font-semibold" style={{ borderColor: T.line }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Plafond Crédit Autorisé (F CFA) *</div>
              <Num value={clForm.plafond_credit} onChange={(v) => setClForm({ ...clForm, plafond_credit: v })} w="w-full" />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: T.muted }}>Mot de passe initial portail</div>
              <input value={clForm.password_acces} onChange={(e) => setClForm({ ...clForm, password_acces: e.target.value })} placeholder="Client2026!" className="w-full border rounded px-2.5 py-1.5 text-xs font-mono" style={{ borderColor: T.line }} />
            </div>
          </div>

          {/* Option d'accès sécurisé */}
          <div className="flex items-center gap-2 p-2 rounded bg-purple-50/70 border border-purple-200">
            <input
              type="checkbox"
              id="creer_acces_check"
              checked={clForm.creer_acces}
              onChange={(e) => setClForm({ ...clForm, creer_acces: e.target.checked })}
              className="rounded text-purple-700 cursor-pointer"
            />
            <label htmlFor="creer_acces_check" className="text-xs font-semibold text-purple-950 cursor-pointer">
              Activer immédiatement un compte d'accès sécurisé pour ce client (Rôle : <code>client_pro</code>)
            </label>
          </div>
        </div>

        <div className="pt-2 pb-2">
          <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-xs transition-opacity hover:opacity-90 flex items-center gap-1.5" style={{ background: T.petrol }}>
            <span>➕</span>
            <span>Créer le compte client &amp; Activer l'accès</span>
          </button>
        </div>
      </Section>
      )}

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-gray-900">{c.nom_entreprise}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{c.code}</span>
                      {isSelected && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">Sélectionné</span>}
                      
                      {/* Statut d'accès au portail */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                          c.acces_actif !== false
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${c.acces_actif !== false ? "bg-emerald-600" : "bg-rose-600"}`} />
                        <span>{c.acces_actif !== false ? "Accès Portail Actif" : "Accès Suspendu"}</span>
                      </span>

                      {peutCreerClient && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAcces(c);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${
                            c.acces_actif !== false
                              ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                          }`}
                          title="Activer ou suspendre l'accès portail de ce client"
                        >
                          {c.acces_actif !== false ? "Suspendre accès" : "Activer accès"}
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-2">
                      {c.telephone && <span>📞 {c.telephone}</span>}
                      {c.email && <span>✉️ {c.email}</span>}
                      {c.ninea && <span className="font-mono text-gray-400">NINEA: {c.ninea}</span>}
                      {c.adresse && <span>📍 {c.adresse}</span>}
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
                {clientActif.ninea && <span> · NINEA: <strong>{clientActif.ninea}</strong></span>}
              </p>
            </div>

            {/* Onglets d'action */}
            <div className="flex flex-wrap rounded-lg border p-1 bg-gray-50 gap-1 text-xs font-semibold" style={{ borderColor: T.line }}>
              <button
                onClick={() => setSubTab("programmes")}
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  subTab === "programmes" ? "bg-amber-600 text-white font-bold shadow-xs" : "text-amber-800 hover:bg-amber-100"
                }`}
              >
                <span>⛽ Programmes de Bons ({programmesClient.length})</span>
                {programmesClient.filter((p) => p.statut === "ACTIF").length > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-black rounded-full leading-none">
                    {programmesClient.filter((p) => p.statut === "ACTIF").length}
                  </span>
                )}
              </button>
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
              <button
                onClick={() => setSubTab("factures")}
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  subTab === "factures" ? "bg-white shadow-xs text-blue-900 font-bold" : "text-blue-700 hover:bg-blue-50"
                }`}
              >
                <span>📄 Factures OHADA ({facturesClient.length})</span>
              </button>
            </div>
          </div>

          {/* Onglet Programmes de Bons de Carburant & Flotte */}
          {subTab === "programmes" && (
            <div className="space-y-4">
              <ProgrammesBonsSection
                clientCode={selected}
                programmes={programmesClient}
                consommations={consommationsClient}
                onNouvelleDemande={() => {
                  setProgrammeEnEdition(null);
                  setShowDemandeModal(true);
                }}
                onEditerDemande={(p) => {
                  setProgrammeEnEdition(p);
                  setShowDemandeModal(true);
                }}
                onInstruireDemande={(p) => {
                  setSelectedProgrammeInstruction(p);
                  setShowInstructionModal(true);
                }}
                onActiverDirect={handleActiverDirect}
                isGerant={profil?.role !== "client_pro"}
              />
            </div>
          )}

          {/* Onglet Bons de Carburant & Ventilation de Règlements */}
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleGenererFacture(null, false)}
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Générer une facture officielle conforme OHADA avec QR code"
                  >
                    <span>📄</span>
                    <span>
                      {selectedBonsIds.size > 0
                        ? `Facturer ${selectedBonsIds.size} bon(s)`
                        : `Établir Facture (${bonsImpayes.length + bonsPartiels.length} bon(s))`}
                    </span>
                  </button>

                  <button
                    onClick={() => handleGenererFacture(null, true)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Établir la facture des bons sélectionnés et l'envoyer directement au client par WhatsApp"
                  >
                    <span>📲</span>
                    <span>
                      {selectedBonsIds.size > 0
                        ? `Facturer & Envoyer WhatsApp (${selectedBonsIds.size})`
                        : `Facturer & Envoyer WhatsApp`}
                    </span>
                  </button>

                  <button
                    onClick={() => openReglementModal()}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                  >
                    <span>💳</span>
                    <span>Encaisser un Règlement</span>
                  </button>
                </div>
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
                        <th className="py-2 px-2 text-center w-8">
                          <input
                            type="checkbox"
                            aria-label="Sélectionner tous les bons"
                            checked={bonsImpayes.length > 0 && selectedBonsIds.size === bonsImpayes.length}
                            onChange={selectAllBonsImpayes}
                            className="rounded text-blue-600 cursor-pointer"
                            title="Sélectionner tous les bons impayés"
                          />
                        </th>
                        <th className="py-2 px-3 text-left">Date & Origine</th>
                        <th className="py-2 px-3 text-left">N° Bon</th>
                        <th className="py-2 px-3 text-left">Véhicule / Obs</th>
                        <th className="py-2 px-3 text-right">Volume (Litres)</th>
                        <th className="py-2 px-3 text-right">Montant Bon</th>
                        <th className="py-2 px-3 text-right">Réglé</th>
                        <th className="py-2 px-3 text-right">Reste Dû</th>
                        <th className="py-2 px-3 text-center">Statut</th>
                        <th className="py-2 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.line }}>
                      {filteredBons.map((b) => {
                        const reste = n(b.reste_a_payer ?? b.montant);
                        const regle = n(b.montant_regle || 0);
                        const isSolde = reste <= 0;
                        const isPartiel = regle > 0 && reste > 0;
                        const isSelected = selectedBonsIds.has(b.id);

                        return (
                          <tr key={b.id} className={isSelected ? "bg-blue-50/80 hover:bg-blue-100/80" : isSolde ? "bg-white hover:bg-gray-50" : isPartiel ? "bg-amber-50/50 hover:bg-amber-50" : "bg-rose-50/40 hover:bg-rose-50/70"}>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Sélectionner bon ${b.numero_bon || b.id}`}
                                checked={isSelected}
                                onChange={() => toggleSelectBon(b.id)}
                                className="rounded text-blue-600 cursor-pointer"
                              />
                            </td>
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
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleGenererFacture([b], false)}
                                  className="px-2 py-1 rounded bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 font-bold text-[10.5px] transition-colors"
                                  title="Générer une facture officielle pour ce bon"
                                >
                                  📄 Facture
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNotifierBonWhatsApp(b)}
                                  className="px-1.5 py-1 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold text-[10.5px] transition-colors flex items-center gap-0.5"
                                  title="Notifier le client par WhatsApp de cette prise de carburant"
                                >
                                  <span>📲</span>
                                  <span className="hidden xl:inline">WhatsApp</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNotifierBonEmail(b)}
                                  className="px-1.5 py-1 rounded bg-sky-50 border border-sky-300 text-sky-800 hover:bg-sky-100 font-bold text-[10.5px] transition-colors"
                                  title="Notifier le client par Email"
                                >
                                  <span>✉️</span>
                                </button>
                                {reste > 0 ? (
                                  <button
                                    onClick={() => openReglementModal(b.id)}
                                    className="px-2 py-1 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold text-[10.5px] shadow-xs transition-colors"
                                  >
                                    💳 Régler
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-bold">✓ Réglé</span>
                                )}
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

          {/* Onglet 4 : Factures Officielles OHADA / Sénégal */}
          {subTab === "factures" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                <div>
                  <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                    <span>📄 Facturation Officielle Conforme OHADA & DGID</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-200/60 text-blue-800 font-extrabold">
                      {facturesClient.length} facture(s)
                    </span>
                  </h3>
                  <p className="text-xs text-blue-800/80 mt-0.5">
                    Émission de factures numérotées, certifiées avec QR code fiscal et mention légale en toutes lettres.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenererFacture()}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
                >
                  <span>➕</span>
                  <span>Générer Facture sur Bons</span>
                </button>
              </div>

              {loadingFactures ? (
                <p className="text-xs text-gray-400 py-6 text-center">Chargement des factures du client…</p>
              ) : facturesClient.length === 0 ? (
                <div className="border rounded-xl p-8 text-center bg-gray-50 text-xs text-gray-500 space-y-2">
                  <span className="text-3xl block">📑</span>
                  <p className="font-bold text-gray-800 text-sm">Aucune facture émise pour ce client pour le moment.</p>
                  <p className="max-w-md mx-auto text-gray-500 text-[11px]">
                    Vous pouvez sélectionner un ou plusieurs bons de carburant dans l'onglet « Bons Carburant » puis cliquer sur « Établir Facture Officielle OHADA ».
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleGenererFacture()}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
                    >
                      <span>📄</span>
                      <span>Établir une première facture</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-xl" style={{ borderColor: T.line }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                      <tr>
                        <th className="py-2.5 px-3 text-left">N° Facture</th>
                        <th className="py-2.5 px-3 text-left">Émission</th>
                        <th className="py-2.5 px-3 text-left">Objet / Détail</th>
                        <th className="py-2.5 px-3 text-right">Montant HT</th>
                        <th className="py-2.5 px-3 text-right">Total TTC (FCFA)</th>
                        <th className="py-2.5 px-3 text-center">Statut</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {facturesClient.map((fac) => (
                        <tr key={fac.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-900">
                            {fac.numero_facture}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                            {fmtDate(fac.date_emission)}
                          </td>
                          <td className="py-2.5 px-3 text-gray-800">
                            <div className="font-semibold">{fac.objet || "Consommation carburant"}</div>
                            <div className="text-[10px] text-gray-400">
                              {(fac.lignes || []).length} ligne(s) • Station : {fac.station_nom || "HANN"}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                            {F(fac.montant_ht)} F
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                            {F(fac.montant_ttc)} F
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                fac.statut === "REGLEE"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : "bg-blue-100 text-blue-800 border border-blue-300"
                              }`}
                            >
                              {fac.statut === "REGLEE" ? "✓ RÉGLÉE" : "ÉMISE"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setFactureAffichee(fac)}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors"
                                title="Afficher et imprimer le PDF avec QR code"
                              >
                                <span>👁️</span>
                                <span>Voir PDF</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEnvoyerFactureWhatsApp(fac)}
                                className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[11px] flex items-center gap-1 transition-colors"
                                title="Envoyer le récapitulatif de cette facture par WhatsApp au client"
                              >
                                <span>📲</span>
                                <span className="hidden sm:inline">WhatsApp</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEnvoyerFactureEmail(fac)}
                                className="px-2 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-[11px] flex items-center gap-1 transition-colors"
                                title="Envoyer cette facture par Email au client"
                              >
                                <span>✉️</span>
                              </button>
                              {fac.statut !== "REGLEE" && (
                                <button
                                  type="button"
                                  onClick={() => handleMarquerFactureReglee(fac.id)}
                                  className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-[11px] transition-colors"
                                  title="Marquer cette facture comme soldée/réglée"
                                >
                                  ✓
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Modal Encaisser & Ventiler Règlement de Bons */}
          {reglementBonsModal && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3"
              onClick={(e) => e.stopPropagation()}
            >
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
      )}

      {/* ── VUE 2 : FACTURATION OFFICIELLE OHADA GLOBALE ── */}
      {mainTab === "factures" && (
        <div className="space-y-4">
          {/* Bannière de conformité fiscale */}
          <div className="bg-gradient-to-r from-[#1B3A57] via-[#2A4D6F] to-[#12263A] text-white rounded-2xl p-5 shadow-lg border-2 border-blue-400/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📑</span>
                  <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                    <span>Facturation Officielle Réseau — Conforme OHADA &amp; DGID</span>
                  </h2>
                </div>
                <p className="text-xs text-blue-200/90 max-w-2xl">
                  Factures certifiées avec calcul automatique HT / TVA (18%), montant légal en toutes lettres et QR Code de vérification fiscale conforme aux normes de la Direction Générale des Impôts et Domaines du Sénégal.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    🇸🇳 Conforme DGID Sénégal
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 font-bold border border-blue-400/30">
                    ⚖️ Acte Uniforme SYSCOHADA
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 font-bold border border-purple-400/30">
                    📱 QR Code Signature SHA-256
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setMainTab("clients");
                    if (clients.length > 0 && !selected) setSelected(clients[0].code);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <span>➕</span>
                  <span>Émettre une Facture</span>
                </button>
                <button
                  type="button"
                  onClick={loadToutesFactures}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                >
                  <span>🔄</span>
                  <span>Actualiser</span>
                </button>
              </div>
            </div>

            {/* Statistiques globales de facturation */}
            {(() => {
              const totalTTC = toutesFactures.reduce((acc, f) => acc + n(f.montant_ttc || 0), 0);
              const totalHT = toutesFactures.reduce((acc, f) => acc + n(f.montant_ht || 0), 0);
              const totalTVA = toutesFactures.reduce((acc, f) => acc + n(f.montant_tva || 0), 0);
              const totalRegle = toutesFactures.filter((f) => f.statut === "REGLEE").reduce((acc, f) => acc + n(f.montant_ttc || 0), 0);
              const totalReste = toutesFactures.filter((f) => f.statut !== "REGLEE").reduce((acc, f) => acc + n(f.montant_ttc || 0), 0);

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4">
                  <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-blue-200">Total Facturé TTC</div>
                    <div className="text-base sm:text-lg font-black text-white tabular mt-0.5">{F(totalTTC)} F</div>
                    <div className="text-[10px] text-gray-300">Dont HT : {F(totalHT)} F</div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-purple-200">TVA Collectée (18%)</div>
                    <div className="text-base sm:text-lg font-black text-purple-300 tabular mt-0.5">{F(totalTVA)} F</div>
                    <div className="text-[10px] text-gray-300">Crédit TVA légal</div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-emerald-300">Factures Réglées</div>
                    <div className="text-base sm:text-lg font-black text-emerald-400 tabular mt-0.5">{F(totalRegle)} F</div>
                    <div className="text-[10px] text-gray-300">
                      {toutesFactures.filter((f) => f.statut === "REGLEE").length} facture(s) soldée(s)
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-amber-300">Encours à Recouvrer</div>
                    <div className="text-base sm:text-lg font-black text-amber-400 tabular mt-0.5">{F(totalReste)} F</div>
                    <div className="text-[10px] text-gray-300">
                      {toutesFactures.filter((f) => f.statut !== "REGLEE").length} facture(s) en attente
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Filtres & Recherche de factures */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border" style={{ borderColor: T.line }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-gray-500 mr-1">Filtrer statut :</span>
              <button
                type="button"
                onClick={() => setFiltreStatutFacture("TOUS")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  filtreStatutFacture === "TOUS" ? "bg-[#1B3A57] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Toutes ({toutesFactures.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltreStatutFacture("EMISE")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  filtreStatutFacture === "EMISE" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                }`}
              >
                En Attente ({toutesFactures.filter((f) => f.statut === "EMISE").length})
              </button>
              <button
                type="button"
                onClick={() => setFiltreStatutFacture("REGLEE")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  filtreStatutFacture === "REGLEE" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                Réglées ({toutesFactures.filter((f) => f.statut === "REGLEE").length})
              </button>
            </div>
            <div className="text-xs text-gray-400">
              Mise à jour automatique
            </div>
          </div>

          {/* Liste des factures */}
          {loadingToutesFactures ? (
            <p className="text-xs text-gray-400 py-8 text-center">Chargement des factures…</p>
          ) : (() => {
            const listAAfficher = toutesFactures.filter((f) => {
              if (filtreStatutFacture === "EMISE") return f.statut === "EMISE";
              if (filtreStatutFacture === "REGLEE") return f.statut === "REGLEE";
              return true;
            });

            if (listAAfficher.length === 0) {
              return (
                <div className="border rounded-2xl p-10 text-center bg-white text-xs text-gray-500 space-y-3" style={{ borderColor: T.line }}>
                  <span className="text-4xl block">📑</span>
                  <p className="font-bold text-gray-800 text-base">Aucune facture officielle enregistrée pour le moment.</p>
                  <p className="max-w-md mx-auto text-gray-500 text-xs">
                    Pour émettre votre première facture certifiée OHADA avec QR code, cliquez sur le bouton ci-dessous, sélectionnez une entreprise partenaire et validez ses bons de carburant.
                  </p>
                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMainTab("clients");
                        if (clients.length > 0) {
                          setSelected(clients[0].code);
                          setSubTab("factures");
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md inline-flex items-center gap-2"
                    >
                      <span>➕</span>
                      <span>Émettre une facture pour {clients[0]?.nom_entreprise || "un client"}</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-white rounded-xl border shadow-xs overflow-hidden" style={{ borderColor: T.line }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                      <tr>
                        <th className="py-3 px-3 text-left">N° Facture</th>
                        <th className="py-3 px-3 text-left">Date</th>
                        <th className="py-3 px-3 text-left">Client B2B</th>
                        <th className="py-3 px-3 text-right">Montant HT</th>
                        <th className="py-3 px-3 text-right">TVA (18%)</th>
                        <th className="py-3 px-3 text-right">Total TTC (FCFA)</th>
                        <th className="py-3 px-3 text-center">Statut</th>
                        <th className="py-3 px-3 text-center">Certification &amp; PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {listAAfficher.map((fac) => (
                        <tr key={fac.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                            {fac.numero_facture}
                          </td>
                          <td className="py-3 px-3 text-gray-700 whitespace-nowrap">
                            {fmtDate(fac.date_emission)}
                          </td>
                          <td className="py-3 px-3 text-gray-900">
                            <div className="font-bold">{fac.client_nom}</div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              Code : {fac.client_code} · NINEA : {fac.client_ninea || "—"}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-gray-600">
                            {F(fac.montant_ht)} F
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-purple-700 font-semibold">
                            {F(fac.montant_tva)} F
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-gray-900">
                            {F(fac.montant_ttc)} F
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                fac.statut === "REGLEE"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : "bg-amber-100 text-amber-800 border border-amber-300"
                              }`}
                            >
                              {fac.statut === "REGLEE" ? "✓ RÉGLÉE" : "⏳ ÉMISE"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setFactureAffichee(fac)}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                                title="Afficher la facture A4 certifiée avec QR Code"
                              >
                                <span>🖨️</span>
                                <span>PDF A4 (QR Code)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEnvoyerFactureWhatsApp(fac)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs flex items-center gap-1 transition-colors"
                                title="Envoyer le détail par WhatsApp au client"
                              >
                                <span>📲</span>
                                <span className="hidden sm:inline">WhatsApp</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEnvoyerFactureEmail(fac)}
                                className="px-2.5 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs flex items-center gap-1 transition-colors"
                                title="Envoyer par Email au client"
                              >
                                <span>✉️</span>
                              </button>
                              {fac.statut !== "REGLEE" && (
                                <button
                                  type="button"
                                  onClick={() => handleMarquerFactureReglee(fac.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-xs transition-colors"
                                  title="Marquer comme encaissée / réglée"
                                >
                                  ✓ Réglée
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal Facture Officielle OHADA / Sénégal avec QR Code (Accessible universellement) */}
      {factureAffichee && (
        <FactureOfficielleModal
          facture={factureAffichee}
          onClose={() => setFactureAffichee(null)}
          onMarquerReglee={handleMarquerFactureReglee}
        />
      )}

      {/* ── VUE 3 : TOUS LES PROGRAMMES DE BONS DE LA STATION ── */}
      {mainTab === "programmes_tous" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-900 via-amber-800 to-amber-950 text-white p-5 rounded-2xl shadow-lg border border-amber-700/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⛽</span>
                <h2 className="text-lg font-black tracking-tight text-white">
                  Gestion Réseau des Programmes de Bons de Carburant
                </h2>
              </div>
              <p className="text-xs text-amber-200 mt-1 max-w-2xl">
                Suivi centralisé des demandes, plafonds autorisés et consommations en temps réel pour l'ensemble des flottes et entreprises clientes de la station.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setProgrammeEnEdition(null);
                  setShowDemandeModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>Nouvelle Demande Programme</span>
              </button>
              <button
                type="button"
                onClick={loadTousProgrammes}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors flex items-center gap-1"
              >
                <span>🔄</span>
                <span>Actualiser</span>
              </button>
            </div>
          </div>

          <ProgrammesBonsSection
            clientCode={null}
            programmes={tousProgrammesStation}
            consommations={[]}
            onNouvelleDemande={() => {
              setProgrammeEnEdition(null);
              setShowDemandeModal(true);
            }}
            onEditerDemande={(p) => {
              setProgrammeEnEdition(p);
              setShowDemandeModal(true);
            }}
            onInstruireDemande={(p) => {
              setSelectedProgrammeInstruction(p);
              setShowInstructionModal(true);
            }}
            onActiverDirect={handleActiverDirect}
            isGerant={profil?.role !== "client_pro"}
          />
        </div>
      )}
        </div>
      )}

      {/* Modals de Demande & d'Instruction de Programme */}
      {showDemandeModal && (
        <DemandeProgrammeModal
          client={clientActif}
          clientCode={selected || (clients.length > 0 ? clients[0].code : "")}
          clientNom={clientActif?.nom_entreprise || (clients.length > 0 ? clients[0].nom_entreprise : "")}
          programmeEnEdition={programmeEnEdition}
          onClose={() => {
            setShowDemandeModal(false);
            setProgrammeEnEdition(null);
          }}
          onSave={handleSaveDemandeProgramme}
          isClient={isClient}
        />
      )}

      {showInstructionModal && selectedProgrammeInstruction && (
        <InstructionProgrammeModal
          programme={selectedProgrammeInstruction}
          onClose={() => {
            setShowInstructionModal(false);
            setSelectedProgrammeInstruction(null);
          }}
          onDecision={handleDecisionGerant}
          gerantNom={profil?.nom_complet || profil?.nom || "Gérant"}
        />
      )}
    </div>
  );
}
