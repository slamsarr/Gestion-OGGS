import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listPrestationsEntretien,
  createPrestationEntretien,
  deletePrestationEntretien,
  listServicesEntretien,
  listBaiesEntretien,
  listCatalogueLubrifiantsEtProduits,
  applyCodePromo,
} from "../lib/api";
import { peutAgirProfil, peutVoirToutesLesEntrees } from "../lib/permissions";
import EntretienServiceCard from "../components/entretien/EntretienServiceCard";
import EntretienQueue from "../components/entretien/EntretienQueue";
import EntretienTicket from "../components/entretien/EntretienTicket";
import EntretienConfigPanel from "../components/entretien/EntretienConfigPanel";

import {
  PageHeader,
  StatCard,
  KpiGrid,
  Section,
  Card,
  Button,
  Badge,
  Alerte,
  EmptyState,
  Row,
  Divider,
  Num,
  InputComptable,
  Loading,
} from "../components/ui";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");
const TODAY = () => new Date().toISOString().slice(0, 10);
const MODES_PAIEMENT = ["ESPECES", "WAVE", "OM", "TPE", "CREDIT", "BON_CARBURANT"];

const TYPES_VEHICULE = [
  { code: "BERLINE", libelle: "Berline / Citadine" },
  { code: "4X4_SUV", libelle: "4x4 / SUV / Pick-up" },
  { code: "UTILITAIRE", libelle: "Minibus / Utilitaire" },
  { code: "MOTO", libelle: "Moto / Deux-roues" },
];

// ─── Innovations module Entretien ─────────────────────────────────────────

// 1. Checklist diagnostic avant intervention (points rapides)
const DIAGNOSTIC_PREABLE = [
  { key: "frein",   label: "Freinage (plaquettes / disques)",  icon: "🛑", categorie: "Securité" },
  { key: "huile",  label: "Niveau d'huile & Couleur",         icon: "🛢️", categorie: "Moteur" },
  { key: "pneu",   label: "Usure des pneus & Pression",       icon: "🛞", categorie: "Securité" },
  { key: "filtre", label: "Filtres (air / habitacle / gasoil)", icon: "🌬️", categorie: "Moteur" },
  { key: "amort",  label: "Amortisseurs & Suspensions",       icon: "🚘", categorie: "Châssis" },
  { key: "batterie", label: "Batterie & Alternateur",          icon: "🔋", categorie: "Electrique" },
  { key: "courroie", label: "Courroie distribution / access.", icon: "⚙️", categorie: "Moteur" },
  { key: "eclairage", label: "Éclairages & Clignotants",       icon: "💡", categorie: "Electrique" },
  { key: "liquide", label: "Liquides (refroidissement / Lave-glace)", icon: "💧", categorie: "Moteur" },
  { key: "carrosserie", label: "Carrosserie visible",           icon: "🚗", categorie: "Esthétique" },
];

// 2. Intervalles préconisés standards (pour l'estimation prochain entretien)
const INTERVALLE_ENTRETIEN_KM = {
  BERLINE: { vidange: 10000, courroie: 100000, freins: 40000, amort: 80000 },
  "4X4_SUV": { vidange: 10000, courroie: 120000, freins: 45000, amort: 90000 },
  UTILITAIRE: { vidange: 8000, courroie: 90000, freins: 35000, amort: 70000 },
  MOTO: { vidange: 5000, courroie: 40000, freins: 20000, amort: 50000 },
};

// 3. Estimation de durée par type de service
const DUREE_MIN_PAR_CATEGORIE = {
  VIDANGE: 25,
  FREINAGE: 45,
  DIAGNOSTIC: 15,
  PNEU: 20,
  CLIM: 35,
  ELECTRIQUE: 30,
  AUTRE: 30,
};

// 4. Garantie FuelOS
const GARANTIE_DEFAUT = { mainOeuvreJours: 90, piecesJours: 365, conditions: "Garantie FuelOS · Non applicable à l'usure normale." };

// 5. Niveau d'alerte stock (consommés souvent)
const SEUIL_STOCK_FAIBLE = 3;

function estimationDureeServices(listeServices) {
  let min = 0;
  for (const s of listeServices || []) {
    const cat = (s.categorie || s.service_categorie || "AUTRE").toUpperCase();
    min += DUREE_MIN_PAR_CATEGORIE[cat] || 20;
  }
  return Math.max(10, min);
}

function prochaineVidangePreconisee(typeVehicule, km) {
  const intervalles = INTERVALLE_ENTRETIEN_KM[typeVehicule] || INTERVALLE_ENTRETIEN_KM.BERLINE;
  const kmCourant = Number(km || 0);
  const prochaine = Math.ceil((kmCourant + 1) / intervalles.vidange) * intervalles.vidange;
  const reste = prochaine - kmCourant;
  const intervalle = intervalles.vidange;
  const pourcentage = kmCourant > 0 ? Math.min(100, Math.round(((intervalle - reste) / intervalle) * 100)) : 0;
  const depassee = kmCourant > 0 && (kmCourant % intervalle !== 0) && (prochaine - intervalle === kmCourant - (kmCourant % intervalle)) && false;
  return { prochaine, reste, intervalle, pourcentage, typeVehicule };
}

export default function Entretien() {
  const { profil } = useAuth();
  const stationId = profil?.station_id;
  const stationNom = profil?.station_nom || "Star Energy";
  const canConfig = peutAgirProfil(profil, "entretien", "configurer");
  const canDelete = peutAgirProfil(profil, "entretien", "annuler");
  const canVoirTout = peutVoirToutesLesEntrees(profil?.role);

  const [tab, setTab] = useState("caisse");
  const [date, setDate] = useState(TODAY());
  const [loading, setLoading] = useState(true);

  const [prestations, setPrestations] = useState([]);
  const [services, setServices] = useState([]);
  const [bays, setBays] = useState([]);
  const [catalogueProduits, setCatalogueProduits] = useState([]);

  // Checklist diagnostic state
  const [checklistDiag, setChecklistDiag] = useState({});
  const toggleDiag = (k) => setChecklistDiag((c) => ({ ...c, [k]: !c[k] }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const operateurId = canVoirTout ? undefined : (profil?.id || undefined);
      const [prest, srvs, bys, prods] = await Promise.all([
        listPrestationsEntretien(stationId, date, operateurId).catch(() => []),
        listServicesEntretien(stationId).catch(() => []),
        listBaiesEntretien(stationId).catch(() => []),
        listCatalogueLubrifiantsEtProduits(stationId).catch(() => []),
      ]);
      setPrestations(prest);
      setServices(srvs);
      setBays(bys);
      setCatalogueProduits(prods);
    } finally {
      setLoading(false);
    }
  }, [stationId, date, canVoirTout]);

  useEffect(() => { load(); }, [load]);

  // ─── Mémoire véhicule (historique entretien par immat) ─────────────────
  const vehiculeMemory = useMemo(() => {
    const map = new Map();
    for (const p of prestations) {
      if (!p.immatriculation || p.immatriculation === "VENTE-COMPTOIR") continue;
      if (!map.has(p.immatriculation)) {
        map.set(p.immatriculation, {
          immat: p.immatriculation,
          type: p.type_vehicule,
          marque: p.marque_modele,
          client: p.client_nom,
          client_tel: p.client_tel,
          kmMax: Number(p.kilometrage || 0),
          nbVisites: 0,
          totalDepense: 0,
          dernierKm: Number(p.kilometrage || 0),
          dernierServices: [],
          dernierProduits: [],
          historique: [],
        });
      }
      const rec = map.get(p.immatriculation);
      rec.nbVisites += 1;
      rec.totalDepense += Number(p.montant_total || 0);
      const km = Number(p.kilometrage || 0);
      if (km > rec.kmMax) rec.kmMax = km;
      if (km > 0) rec.dernierKm = km;
      if (p.marque_modele) rec.marque = p.marque_modele;
      if (p.client_nom) rec.client = p.client_nom;
      if (p.client_tel) rec.client_tel = p.client_tel;
      if (p.type_vehicule) rec.type = p.type_vehicule;
      if (p.services?.length) rec.dernierServices = p.services.map((s) => s.service_nom || s.nom);
      if (p.produits?.length) rec.dernierProduits = p.produits.map((pr) => pr.designation);
      rec.historique.push({ date: p.date, km, prestation: p });
    }
    return map;
  }, [prestations]);

  // ─── KPIs enrichis ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ca = prestations.reduce((s, p) => s + Number(p.montant_total || 0), 0);
    const nb = prestations.filter((p) => p.immatriculation !== "VENTE-COMPTOIR").length;
    const enCours = prestations.filter((p) => p.statut === "EN_COURS" || p.statut === "CONTROLE").length;
    const livres = prestations.filter((p) => p.statut === "LIVRE" || p.statut === "TERMINE").length;
    const caComptoir = prestations.filter((p) => p.immatriculation === "VENTE-COMPTOIR").reduce((s, p) => s + Number(p.montant_total || 0), 0);
    const nbComptoir = prestations.filter((p) => p.immatriculation === "VENTE-COMPTOIR").length;
    const ticketMoyen = nb > 0 ? Math.round(ca / nb) : 0;

    // Temps moyen traitement (livres)
    let tempsMoy = 0;
    const liveesDates = prestations.filter((p) => (p.statut === "LIVRE" || p.statut === "TERMINE") && p.created_at && p.updated_at);
    if (liveesDates.length) {
      const total = liveesDates.reduce((s, p) => {
        const diff = (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / 60000;
        return s + Math.max(0, diff);
      }, 0);
      tempsMoy = Math.round(total / liveesDates.length);
    }

    // Top 5 services
    const srvCount = {};
    for (const p of prestations) for (const s of p.services || []) {
      const n = s.service_nom || s.nom;
      if (n) srvCount[n] = (srvCount[n] || 0) + 1;
    }
    const topService = Object.entries(srvCount).sort((a, b) => b[1] - a[1])[0];

    // Top produits
    const prodCount = {};
    for (const p of prestations) for (const pr of p.produits || []) {
      if (pr.designation) prodCount[pr.designation] = (prodCount[pr.designation] || 0) + Number(pr.quantite || 1);
    }
    const topProduit = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0];

    return { ca, nb, enCours, livres, caComptoir, nbComptoir, ticketMoyen, tempsMoy,
      topServiceNom: topService?.[0] || "—", topServiceCount: topService?.[1] || 0,
      topProduitNom: topProduit?.[0] || "—", topProduitQte: topProduit?.[1] || 0,
    };
  }, [prestations]);

  // ─── Stock faible ───────────────────────────────────────────────────────
  const stocksFaibles = useMemo(() => {
    return catalogueProduits.filter((p) => (Number(p.stock || p.qte_stock || 0) <= SEUIL_STOCK_FAIBLE)).slice(0, 6);
  }, [catalogueProduits]);

  // ─── Formulaire intervention atelier ───────────────────────────────────
  const initForm = {
    immatriculation: "",
    marque_modele: "",
    kilometrage: "",
    type_vehicule: "BERLINE",
    client_nom: "",
    client_tel: "",
    technicien: profil?.nom_complet || "",
    baie_id: "",
    selectedServices: [],
    selectedProduits: [],
    mode_paiement: "ESPECES",
    code_promo: "",
    reduction_promo: 0,
    notes_diagnostic: "",
  };

  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [promoMsg, setPromoMsg] = useState(null);
  const [err, setErr] = useState(null);

  const [selProdCode, setSelProdCode] = useState("");
  const [selProdQte, setSelProdQte] = useState(1);

  // Auto-complétion immat
  const suggestionsImmat = useMemo(() => {
    if (!form.immatriculation || form.immatriculation.length < 2) return [];
    const q = form.immatriculation.toUpperCase();
    return Array.from(vehiculeMemory.values())
      .filter((v) => v.immat.toUpperCase().includes(q) || (v.client || "").toUpperCase().includes(q))
      .slice(0, 5);
  }, [form.immatriculation, vehiculeMemory]);

  const [vehiculeConnu, setVehiculeConnu] = useState(null);
  useEffect(() => {
    if (form.immatriculation && vehiculeMemory.has(form.immatriculation.toUpperCase())) {
      setVehiculeConnu(vehiculeMemory.get(form.immatriculation.toUpperCase()));
    } else {
      setVehiculeConnu(null);
    }
  }, [form.immatriculation, vehiculeMemory]);

  const chargerMemoireVehicule = (rec) => {
    setForm((f) => ({
      ...f,
      immatriculation: rec.immat,
      type_vehicule: rec.type || f.type_vehicule,
      client_nom: rec.client || f.client_nom,
      client_tel: rec.client_tel || f.client_tel,
      marque_modele: rec.marque || f.marque_modele,
      kilometrage: rec.dernierKm ? String(rec.dernierKm) : f.kilometrage,
    }));
    setVehiculeConnu(rec);
  };

  // Prévision prochain entretien (vidange)
  const prevVidange = useMemo(() => {
    const km = Number(form.kilometrage || vehiculeConnu?.dernierKm || 0);
    if (!km) return null;
    return prochaineVidangePreconisee(form.type_vehicule, km);
  }, [form.kilometrage, form.type_vehicule, vehiculeConnu]);

  // Auto-suggestion de services à partir du diagnostic
  const servicesSuggeresParDiag = useMemo(() => {
    const map = {
      frein: ["FREIN", "FREINAGE", "PLAQUETTE", "DISQUE"],
      huile: ["VIDANGE", "HUILE", "FILTRE"],
      pneu: ["PNEU", "ROUE", "ALIGNEMENT"],
      filtre: ["FILTRE", "VIDANGE"],
      amort: ["AMORT", "SUSPENSION"],
      batterie: ["BATTERIE", "ELECTRIQUE"],
      courroie: ["COURROIE", "DISTRIBUTION"],
      eclairage: ["ECLAIR", "AMPOULE"],
      liquide: ["LIQUIDE", "REFROIDISSEMENT", "VIDANGE"],
      carrosserie: ["CARROSSERIE", "ESTHETIQUE"],
    };
    const codes = Object.keys(checklistDiag).filter((k) => checklistDiag[k]);
    const keywords = new Set();
    for (const c of codes) for (const kw of (map[c] || [])) keywords.add(kw.toLowerCase());
    return services.filter((s) => {
      const haystack = `${s.nom || ""} ${s.categorie || ""}`.toLowerCase();
      return Array.from(keywords).some((kw) => haystack.includes(kw));
    });
  }, [checklistDiag, services]);

  // Totaux formulaire
  const montantServices = useMemo(() =>
    form.selectedServices.reduce((sum, s) => sum + Number(s.prix_base || s.prix || 0), 0),
  [form.selectedServices]);

  const montantProduits = useMemo(() =>
    form.selectedProduits.reduce((sum, p) => sum + Number(p.total || p.prix_unitaire * p.quantite || 0), 0),
  [form.selectedProduits]);

  const montantTotal = Math.max(0, montantServices + montantProduits - form.reduction_promo);
  const pointsGagnes = Math.floor(montantTotal / 500);
  const dureeEstimee = estimationDureeServices(form.selectedServices);

  const toggleService = (srv) => {
    const exists = form.selectedServices.some((s) => s.id === srv.id);
    if (exists) {
      setForm((f) => ({ ...f, selectedServices: f.selectedServices.filter((s) => s.id !== srv.id) }));
    } else {
      setForm((f) => ({ ...f, selectedServices: [...f.selectedServices, srv] }));
    }
  };

  const handleAddProduct = () => {
    if (!selProdCode) return;
    const prod = catalogueProduits.find((p) => p.code === selProdCode);
    if (!prod) return;

    const qte = Math.max(1, Number(selProdQte || 1));
    const prix = Number(prod.prix_vente || 0);

    const existsIndex = form.selectedProduits.findIndex((p) => p.code === prod.code);
    if (existsIndex >= 0) {
      const updated = [...form.selectedProduits];
      updated[existsIndex].quantite += qte;
      updated[existsIndex].total = updated[existsIndex].quantite * prix;
      setForm((f) => ({ ...f, selectedProduits: updated }));
    } else {
      setForm((f) => ({
        ...f,
        selectedProduits: [
          ...f.selectedProduits,
          { code: prod.code, designation: prod.designation, prix_unitaire: prix, quantite: qte, total: prix * qte },
        ],
      }));
    }
    setSelProdCode("");
    setSelProdQte(1);
  };

  const handleRemoveProduct = (code) => {
    setForm((f) => ({ ...f, selectedProduits: f.selectedProduits.filter((p) => p.code !== code) }));
  };

  const handleApplyPromo = async () => {
    if (!form.code_promo) return;
    const res = await applyCodePromo(stationId, form.code_promo, montantTotal);
    if (res.ok) {
      setForm((f) => ({ ...f, reduction_promo: res.reduction }));
      setPromoMsg({ ok: true, txt: `✓ Réduction de ${F(res.reduction)} FCFA appliquée` });
    } else {
      setPromoMsg({ ok: false, txt: res.message });
    }
  };

  const handleSubmitIntervention = async (e) => {
    e.preventDefault();
    setErr(null);
    if (form.selectedServices.length === 0 && form.selectedProduits.length === 0) {
      setErr("Veuillez sélectionner au moins une prestation ou un produit.");
      return;
    }
    if (!form.immatriculation) {
      setErr("Veuillez renseigner l'immatriculation du véhicule.");
      return;
    }

    setSaving(true);
    try {
      const res = await createPrestationEntretien({
        station_id: stationId,
        date,
        immatriculation: form.immatriculation?.toUpperCase(),
        marque_modele: form.marque_modele,
        kilometrage: form.kilometrage,
        type_vehicule: form.type_vehicule,
        client_nom: form.client_nom,
        client_tel: form.client_tel,
        technicien: form.technicien,
        technicien_id: profil?.id,
        operateur_id: profil?.id,
        user_id: profil?.id,
        baie_id: form.baie_id || null,
        services: form.selectedServices.map((s) => ({
          service_id: s.id, service_nom: s.nom,
          prix: Number(s.prix_base || s.prix || 0), categorie: s.categorie,
        })),
        produits: form.selectedProduits,
        montant_services: montantServices,
        montant_produits: montantProduits,
        reduction_promo: form.reduction_promo,
        code_promo: form.code_promo,
        mode_paiement: form.mode_paiement,
        notes_diagnostic: form.notes_diagnostic,
        diagnostic_checklist: checklistDiag,
        duree_estimee_min: dureeEstimee,
        prochaine_vidange_km: prevVidange?.prochaine,
        garantie: GARANTIE_DEFAUT,
        statut: "EN_ATTENTE",
        points_gagnes: pointsGagnes,
      });

      if (res.ok) {
        setTicket(res.prestation);
        setForm(initForm);
        setChecklistDiag({});
        setPromoMsg(null);
        setVehiculeConnu(null);
        load();
      }
    } catch (ex) {
      setErr(ex.message || "Erreur lors de l'enregistrement de l'intervention.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Vente Comptoir ─────────────────────────────────────────────────────
  const [comptoirCart, setComptoirCart] = useState([]);
  const [comptoirClient, setComptoirClient] = useState("");
  const [comptoirPaiement, setComptoirPaiement] = useState("ESPECES");
  const [comptoirSaving, setComptoirSaving] = useState(false);

  const addComptoirItem = (prod) => {
    const existing = comptoirCart.find((c) => c.code === prod.code);
    const prix = Number(prod.prix_vente || 0);
    if (existing) {
      setComptoirCart(comptoirCart.map((c) =>
        c.code === prod.code ? { ...c, quantite: c.quantite + 1, total: (c.quantite + 1) * prix } : c
      ));
    } else {
      setComptoirCart([...comptoirCart, { code: prod.code, designation: prod.designation, prix_unitaire: prix, quantite: 1, total: prix }]);
    }
  };

  const removeComptoirItem = (code) => {
    setComptoirCart(comptoirCart.filter((c) => c.code !== code));
  };

  const totalComptoir = comptoirCart.reduce((sum, c) => sum + c.total, 0);

  const handleValiderComptoir = async () => {
    if (comptoirCart.length === 0) return;
    setComptoirSaving(true);
    try {
      const res = await createPrestationEntretien({
        station_id: stationId, date,
        immatriculation: "VENTE-COMPTOIR",
        marque_modele: "Achat direct", type_vehicule: "COMPTOIR",
        client_nom: comptoirClient || "Client Comptoir",
        technicien: profil?.nom_complet || "Comptoir",
        technicien_id: profil?.id, operateur_id: profil?.id, user_id: profil?.id,
        services: [], produits: comptoirCart,
        montant_services: 0, montant_produits: totalComptoir,
        mode_paiement: comptoirPaiement,
        garantie: GARANTIE_DEFAUT,
        statut: "LIVRE",
      });
      if (res.ok) {
        setTicket(res.prestation);
        setComptoirCart([]);
        setComptoirClient("");
        load();
      }
    } finally {
      setComptoirSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette intervention ?")) return;
    await deletePrestationEntretien(id);
    load();
  };

  const TABS = [
    { id: "caisse",   label: "🧾 Prise en charge & OR", icon: "🧾" },
    { id: "queue",    label: "📋 Suivi des Ponts", icon: "📋" },
    { id: "comptoir", label: "🧴 Vente Lubrifiants", icon: "🧴" },
    { id: "fid",      label: "🚙 Véhicules & Prévisions", icon: "🚙" },
    { id: "config",   label: "⚙️ Configuration", icon: "⚙️", cond: canConfig },
  ].filter((t) => !t.cond || t.cond);

  return (
    <div className="pb-10">
      <PageHeader
        icon="🔧"
        titre="Baie d'Entretien, Vidange & Mécanique Rapide"
        subtitle={`DAMEL SERVICES AUTO & BAIE · Station ${stationNom} · ${date}`}
        badge={stocksFaibles.length > 0 ? `⚠ Stock faible : ${stocksFaibles.length} produit(s)` : `⏱ Temps moyen ${kpis.tempsMoy || 30} min`}
        breadcrumb="Pilotage > Opérations > Centre Entretien"
        actions={
          <>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-base !w-auto !px-3 !py-1.5 text-xs font-semibold"
            />
            <Button variant="secondary" icon="🔄" onClick={load} size="sm">Actualiser</Button>
          </>
        }
      />

      <KpiGrid cols={4}>
        <StatCard label="CA Atelier" value={`${F(kpis.ca)} F`} icon="💰" color="damel"
          subtext={`${kpis.nb} interventions · Ticket ${F(kpis.ticketMoyen)} F`} trend={5} />
        <StatCard label="CA Comptoir" value={`${F(kpis.caComptoir)} F`} icon="🧴" color="blue"
          subtext={`${kpis.nbComptoir} vente(s) au comptoir`} />
        <StatCard label="Sur les ponts" value={kpis.enCours} icon="🛠️" color="amber"
          subtext={`Top service : ${kpis.topServiceNom} (${kpis.topServiceCount})`} />
        <StatCard label="Livrés / Terminés" value={kpis.livres} icon="✅" color="emerald"
          subtext={`Top produit : ${kpis.topProduitNom} ×${kpis.topProduitQte}`} />
      </KpiGrid>

      {stocksFaibles.length > 0 && (
        <Alerte variant="warn" icon="⚠️">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b>Stock faible</b> — Pensez à réapprovisionner avant rupture :
              {stocksFaibles.map((p, i) => (
                <span key={p.code} className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                  {p.designation} : {Number(p.stock || p.qte_stock || 0)} en stock
                </span>
              ))}
            </div>
          </div>
        </Alerte>
      )}

      {/* Onglets */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5 bg-surface-card border border-surface-border/80 p-1.5 rounded-2xl shadow-card max-w-full overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-[11.5px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              tab === t.id
                ? "bg-gradient-to-br from-damel-blue to-fuelos-700 text-white shadow-button"
                : "text-slate-600 hover:bg-surface-muted"
            }`}
          >
            <span className="text-base">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {loading && tab === "caisse" && <Loading label="Chargement de la baie d'entretien…" />}

      {/* ══ ONGLET CAISSE & OR ═══════════════════════════════════════════════ */}
      {tab === "caisse" && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Formulaire 7 cols */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Véhicule */}
            <Section titre="1. Véhicule" icon="🚗" aside={vehiculeConnu ? "Fiche connue ✓" : undefined}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="relative">
                  <label className="label block mb-1">Immatriculation *</label>
                  <input
                    required
                    value={form.immatriculation}
                    onChange={(e) => setForm({ ...form, immatriculation: e.target.value.toUpperCase() })}
                    placeholder="Ex: DK-5512-AB"
                    className="input-base !py-2.5 font-mono font-bold uppercase"
                  />
                  {suggestionsImmat.length > 0 && form.immatriculation.length >= 2 && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-fuelos-100 bg-white shadow-pop p-1.5 animate-subtle-in">
                      {suggestionsImmat.map((s) => (
                        <button
                          key={s.immat}
                          type="button"
                          onClick={() => chargerMemoireVehicule(s)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-fuelos-50 transition-colors text-left"
                        >
                          <div>
                            <span className="font-mono font-extrabold text-fuelos-900">{s.immat}</span>
                            <div className="text-[11px] text-slate-500">{s.client || "Anonyme"} · {s.marque || s.type}</div>
                          </div>
                          <div className="text-right">
                            <Badge variant="damel">{s.nbVisites} OR</Badge>
                            <div className="text-[10.5px] text-emerald-700 font-bold mt-0.5 tabular">
                              {Number(s.dernierKm || 0).toLocaleString()} km
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label block mb-1">Marque & Modèle</label>
                  <input
                    value={form.marque_modele}
                    onChange={(e) => setForm({ ...form, marque_modele: e.target.value })}
                    placeholder="Toyota Hilux / Peugeot 308…"
                    className="input-base !py-2.5"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Kilométrage</label>
                  <input
                    type="number"
                    value={form.kilometrage}
                    onChange={(e) => setForm({ ...form, kilometrage: e.target.value })}
                    placeholder="125 000"
                    className="input-base !py-2.5 font-bold tabular"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Catégorie véhicule</label>
                  <select
                    value={form.type_vehicule}
                    onChange={(e) => setForm({ ...form, type_vehicule: e.target.value })}
                    className="input-base !py-2.5"
                  >
                    {TYPES_VEHICULE.map((t) => (
                      <option key={t.code} value={t.code}>{t.libelle}</option>
                    ))}
                  </select>
                </div>
              </div>

              {prevVidange && (
                <div className="mt-3 p-3 rounded-xl border-2 border-damel-blue/30 bg-fuelos-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-damel-blue uppercase tracking-wider">
                        🛢️ Prévision FuelOS · Prochaine vidange
                      </div>
                      <div className="text-[13px] font-bold text-fuelos-950 mt-0.5">
                        Prévue à <b className="tabular">{F(prevVidange.prochaine)} km</b>
                        {prevVidange.reste > 0
                          ? <span className="text-slate-600"> — encore <b className="text-emerald-700">{F(prevVidange.reste)} km</b></span>
                          : <span className="ml-1 text-red-700 bg-red-100 px-2 py-0.5 rounded-full text-[10.5px] font-bold animate-pulse">⚠ DÉPASSÉ</span>}
                      </div>
                    </div>
                    <Badge variant="info">Intervalle : {F(prevVidange.intervalle)} km</Badge>
                  </div>
                  <div className="mt-2 h-2.5 bg-white rounded-full overflow-hidden border border-fuelos-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        prevVidange.pourcentage >= 90
                          ? "bg-gradient-to-r from-red-500 to-red-700"
                          : prevVidange.pourcentage >= 70
                          ? "bg-gradient-to-r from-amber-400 to-amber-600"
                          : "bg-gradient-to-r from-damel-blue to-fuelos-600"
                      }`}
                      style={{ width: `${prevVidange.pourcentage}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10.5px] text-slate-500 font-semibold flex justify-between">
                    <span>{prevVidange.pourcentage}% de l'intervalle réalisé</span>
                    <span className="tabular">{Number(form.kilometrage || 0).toLocaleString()} km actuel</span>
                  </div>
                </div>
              )}

              {vehiculeConnu && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-white border border-amber-200/70">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">⭐ Véhicule fidèle</div>
                      <div className="text-[13px] font-bold text-amber-950 mt-0.5">
                        {vehiculeConnu.client || "Client enregistré"} ·
                        <span className="ml-1 tabular">{vehiculeConnu.nbVisites} intervention(s)</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Total atelier : <b className="text-emerald-700">{F(vehiculeConnu.totalDepense)} F</b>
                      </div>
                    </div>
                    {vehiculeConnu.dernierServices?.length > 0 && (
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dernier passage</div>
                        <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                          {vehiculeConnu.dernierServices.slice(0, 4).map((n, i) => (
                            <Badge key={i} variant="star">🔧 {n}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* 2. Client & Baie */}
            <Section titre="2. Client & Affectation" icon="👤">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <input value={form.client_nom} onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                  placeholder="Nom du client" className="input-base" />
                <input value={form.client_tel} onChange={(e) => setForm({ ...form, client_tel: e.target.value })}
                  placeholder="Téléphone (WhatsApp)" className="input-base" />
                <div>
                  <label className="label block mb-1">Pont / Baie</label>
                  <select value={form.baie_id} onChange={(e) => setForm({ ...form, baie_id: e.target.value })}
                    className="input-base">
                    <option value="">— Auto (1er pont libre)</option>
                    {bays.map((b) => <option key={b.id} value={b.code_baie}>{b.nom_baie || b.code_baie}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Technicien en charge</label>
                  <input value={form.technicien} onChange={(e) => setForm({ ...form, technicien: e.target.value })}
                    placeholder="Nom technicien" className="input-base" />
                </div>
              </div>
            </Section>

            {/* 3. Diagnostic préalable */}
            <Section titre="3. Diagnostic préalable (10 points)" icon="🔍"
              aside={`${Object.values(checklistDiag).filter(Boolean).length}/10 vérifiés`}>
              <p className="text-[11.5px] text-slate-500 mb-3">
                Cochez les anomalies détectées — FuelOS suggère automatiquement les services associés.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DIAGNOSTIC_PREABLE.map((d) => {
                  const checked = !!checklistDiag[d.key];
                  return (
                    <label
                      key={d.key}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                        checked
                          ? "border-red-400 bg-red-50 shadow-card"
                          : "border-surface-border bg-white hover:border-damel-blue/40 hover:bg-fuelos-50/60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDiag(d.key)}
                        className={`w-4 h-4 ${checked ? "accent-red-500" : "accent-damel-blue"}`}
                      />
                      <span className="text-base">{d.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[12px] font-bold ${checked ? "text-red-800" : "text-slate-800"} truncate`}>
                          {d.label}
                        </div>
                        <div className="text-[10.5px] text-slate-400">{d.categorie}</div>
                      </div>
                      {checked && <Badge variant="danger">Anomalie</Badge>}
                    </label>
                  );
                })}
              </div>
              {servicesSuggeresParDiag.length > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-damel-yellow/10 border-2 border-dashed border-damel-gold/50">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1.5">
                    💡 FuelOS Suggest — Prestations recommandées ({servicesSuggeresParDiag.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {servicesSuggeresParDiag.map((s) => {
                      const selected = form.selectedServices.some((x) => x.id === s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleService(s)}
                          className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all border ${
                            selected
                              ? "bg-damel-blue text-white border-damel-blue shadow-button"
                              : "bg-white text-amber-900 border-amber-300 hover:bg-amber-50"
                          }`}
                        >
                          {selected ? "✓ " : "+ "}{s.nom}
                          <span className="ml-1.5 opacity-80 tabular">{F(Number(s.prix_base || s.prix || 0))} F</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>

            {/* 4. Prestations */}
            <Section titre="4. Prestations d'entretien" icon="🛠️"
              aside={`${form.selectedServices.length} prestation(s) · ≈ ${dureeEstimee} min`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {services.map((srv) => (
                  <EntretienServiceCard
                    key={srv.id}
                    service={srv}
                    selected={form.selectedServices.some((s) => s.id === srv.id)}
                    onToggle={toggleService}
                  />
                ))}
                {services.length === 0 && (
                  <div className="sm:col-span-2">
                    <EmptyState icon="🛠️" title="Aucun service configuré"
                      description={canConfig ? "Ajoutez des services dans l'onglet ⚙️ Configuration." : "Contactez votre gérant."} />
                  </div>
                )}
              </div>
            </Section>

            {/* 5. Produits */}
            <Section titre="5. Pièces, Huiles & Consommables" icon="🧴" aside={`${F(montantProduits)} F`}>
              <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3 flex flex-wrap gap-2 items-center">
                <select
                  value={selProdCode}
                  onChange={(e) => setSelProdCode(e.target.value)}
                  className="flex-1 min-w-[220px] input-base !py-2 bg-white text-xs sm:text-sm"
                >
                  <option value="">Sélectionner un produit / lubrifiant…</option>
                  {catalogueProduits.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.designation} — {F(p.prix_vente)} F ({p.categorie})
                      {Number(p.stock || p.qte_stock || 0) <= SEUIL_STOCK_FAIBLE ? " ⚠ stock faible" : ""}
                    </option>
                  ))}
                </select>
                <input type="number" min={1} value={selProdQte} onChange={(e) => setSelProdQte(e.target.value)}
                  className="input-base !w-20 !py-2 text-center tabular" />
                <Button variant="primary" type="button" onClick={handleAddProduct} icon="➕" size="sm">Ajouter</Button>
              </div>

              {form.selectedProduits.length > 0 && (
                <div className="mt-3 rounded-2xl bg-surface-muted border border-surface-border divide-y divide-surface-border">
                  {form.selectedProduits.map((p) => (
                    <div key={p.code} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{p.designation}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.quantite} × {F(p.prix_unitaire)} F · {p.code}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-black tabular text-damel-blue">{F(p.total)} F</span>
                        <button type="button" onClick={() => handleRemoveProduct(p.code)}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700 font-bold">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 6. Paiement & Total */}
            <Card className="!p-5 bg-gradient-to-br from-amber-950 via-fuelos-900 to-fuelos-950 text-white shadow-pop border-fuelos-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-amber-100 flex items-center gap-2 text-base">
                  <span>📋</span> Ordre de Réparation
                </h3>
                <Badge variant="default" className="!bg-white/10 !text-amber-200 !border-white/15">
                  ⏱ ≈ {dureeEstimee} min de main d'œuvre
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label block mb-1 !text-fuelos-200">Mode règlement</label>
                  <select
                    value={form.mode_paiement}
                    onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}
                    className="input-base !bg-white/10 !border-white/20 !text-white focus:!border-damel-yellow focus:!ring-damel-yellow/20"
                  >
                    {MODES_PAIEMENT.map((m) => <option key={m} className="!bg-fuelos-900 !text-white">{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1 !text-fuelos-200">Code Promo / Remise</label>
                  <div className="flex gap-2">
                    <input
                      value={form.code_promo}
                      onChange={(e) => {
                        setForm({ ...f => ({ ...f, code_promo: e.target.value.toUpperCase(), reduction_promo: 0 }) });
                        setPromoMsg(null);
                      }}
                      placeholder="Code promo…"
                      className="input-base !bg-white/10 !border-white/20 !text-white !placeholder:text-fuelos-300 uppercase focus:!border-damel-yellow"
                    />
                    <Button variant="accent" type="button" onClick={handleApplyPromo} size="sm">Appliquer</Button>
                  </div>
                  {promoMsg && (
                    <p className={`mt-1.5 text-[11.5px] font-semibold ${promoMsg.ok ? "text-emerald-300" : "text-red-300"}`}>
                      {promoMsg.txt}
                    </p>
                  )}
                </div>
              </div>

              <textarea
                value={form.notes_diagnostic}
                onChange={(e) => setForm({ ...form, notes_diagnostic: e.target.value })}
                placeholder="📝 Notes complémentaires — ex : Bruit à l'avant droit, pression pneus ajustée, client demande rappel…"
                className="w-full bg-white/10 border border-white/20 text-white placeholder:text-fuelos-300 rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:border-damel-yellow focus:ring-2 focus:ring-damel-yellow/20 transition-all resize-y min-h-[70px]"
              />

              <div className="mt-4 space-y-1.5 text-sm bg-white/5 rounded-xl p-3.5 border border-white/10">
                <div className="flex justify-between">
                  <span className="text-fuelos-200">Main d'œuvre ({form.selectedServices.length})</span>
                  <span className="font-bold tabular">{F(montantServices)} F</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fuelos-200">Pièces & Lubrifiants ({form.selectedProduits.length})</span>
                  <span className="font-bold tabular">{F(montantProduits)} F</span>
                </div>
                {form.reduction_promo > 0 && (
                  <div className="flex justify-between text-emerald-300 font-bold">
                    <span>Remise</span>
                    <span>-{F(form.reduction_promo)} F</span>
                  </div>
                )}
                <div className="pt-2 mt-1 border-t border-white/15 flex justify-between items-baseline">
                  <span className="text-base font-black text-amber-100 tracking-tight">TOTAL OR</span>
                  <span className="text-2xl font-black tabular text-amber-300">{F(montantTotal)} FCFA</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10.5px] text-fuelos-200/80">
                    ✅ Garantie FuelOS : {GARANTIE_DEFAUT.mainOeuvreJours}j main d'œuvre · {GARANTIE_DEFAUT.piecesJours}j pièces
                  </span>
                  {pointsGagnes > 0 && (
                    <Badge variant="gold" className="!bg-amber-400 !text-amber-950 !border-amber-500/50">
                      ⭐ +{pointsGagnes} pts
                    </Badge>
                  )}
                </div>
              </div>

              {err && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/20 text-red-200 border border-red-400/30 text-xs font-medium">
                  ⚠️ {err}
                </div>
              )}

              <Button
                variant="accent"
                size="lg"
                type="submit"
                onClick={handleSubmitIntervention}
                disabled={saving}
                fullWidth
                icon={saving ? "⏳" : "🧰"}
                className="!mt-5"
              >
                {saving ? "Enregistrement…" : `Valider l'Ordre de Réparation · ${F(montantTotal)} FCFA`}
              </Button>
            </Card>
          </div>

          {/* Colonne 5 : Liste + Top services + Mémoire Véhicule */}
          <div className="lg:col-span-5 space-y-5">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📋</span> OR du jour
                </h3>
                <div className="flex items-center gap-1.5">
                  <Badge variant="primary">{prestations.filter(p => p.immatriculation !== "VENTE-COMPTOIR").length} atelier</Badge>
                  <Badge variant="info">{kpis.nbComptoir} comptoir</Badge>
                </div>
              </div>

              {loading ? (
                <Loading label="Chargement des ordres…" />
              ) : prestations.filter(p => p.immatriculation !== "VENTE-COMPTOIR").length === 0 ? (
                <EmptyState icon="🔧" title="Aucun véhicule à l'atelier" description="Enregistrez une nouvelle intervention via le formulaire." />
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {prestations.filter(p => p.immatriculation !== "VENTE-COMPTOIR").map((p) => (
                    <div key={p.id} className="p-3 rounded-xl border border-surface-border bg-white hover:border-damel-blue/40 hover:shadow-card transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-fuelos-900 text-sm tracking-wide">{p.immatriculation}</span>
                            <Badge
                              variant={
                                p.statut === "LIVRE" ? "success" :
                                p.statut === "EN_COURS" ? "warn" :
                                p.statut === "TERMINE" ? "info" : "default"
                              }
                              dot
                            >
                              {p.statut || "En attente"}
                            </Badge>
                          </div>
                          <div className="text-[11.5px] text-slate-500 mt-0.5">
                            {p.marque_modele || p.type_vehicule}
                            {p.kilometrage ? ` · ${Number(p.kilometrage).toLocaleString()} km` : ""}
                          </div>
                          {p.client_nom && <div className="text-[11px] text-slate-400 mt-0.5">👤 {p.client_nom}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-black text-fuelos-900 tabular">{F(p.montant_total)} F</div>
                          <Badge variant={
                            p.mode_paiement === "ESPECES" ? "success" :
                            p.mode_paiement === "CREDIT" ? "warn" : "damel"
                          }>
                            {p.mode_paiement}
                          </Badge>
                        </div>
                      </div>
                      {(p.services?.length || p.produits?.length) > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.services?.slice(0, 3).map((s, i) => (
                            <Badge key={`svc-${i}`} variant="default" className="!bg-amber-50 !text-amber-900 !border-amber-200">
                              🔧 {s.service_nom || s.nom}
                            </Badge>
                          ))}
                          {p.services?.length > 3 && (
                            <Badge variant="default" className="!bg-amber-50 !text-amber-800 !border-amber-200">
                              +{p.services.length - 3}
                            </Badge>
                          )}
                          {p.produits?.slice(0, 2).map((pr, i) => (
                            <Badge key={`pr-${i}`} variant="info" className="!bg-blue-50 !text-blue-800 !border-blue-200">
                              🧴 {pr.designation}×{pr.quantite}
                            </Badge>
                          ))}
                          {p.produits?.length > 2 && (
                            <Badge variant="info" className="!bg-blue-50 !text-blue-700 !border-blue-200">
                              +{p.produits.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11.5px] text-slate-500 mt-2.5 pt-2 border-t border-surface-border/70">
                        <span>👨‍🔧 {p.technicien || "Non assigné"} {p.baie_id ? `· 🅱️ ${p.baie_id}` : ""}</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setTicket(p)} className="text-amber-700 font-bold hover:underline">📄 Fiche</button>
                          {canDelete && (
                            <button onClick={() => handleDelete(p.id)} className="text-red-500 font-bold hover:text-red-700">🗑️</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="!bg-gradient-to-br from-fuelos-50 to-white">
              <h3 className="font-extrabold text-fuelos-950 flex items-center gap-2 mb-3">
                <span>🚙</span> Véhicules à entretenir prochainement
              </h3>
              {Array.from(vehiculeMemory.values()).length === 0 ? (
                <EmptyState icon="🚙" title="Aucun véhicule mémorisé" description="Les prochains OR alimentent automatiquement cette alerte." />
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {Array.from(vehiculeMemory.values())
                    .filter((v) => v.dernierKm > 0)
                    .map((v) => {
                      const prev = prochaineVidangePreconisee(v.type, v.dernierKm);
                      const urgent = prev.pourcentage >= 85;
                      return (
                        <button
                          key={v.immat}
                          type="button"
                          onClick={() => chargerMemoireVehicule(v)}
                          className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                            urgent ? "border-red-300 bg-red-50 hover:bg-red-100" : "border-surface-border bg-white hover:bg-fuelos-50 hover:border-fuelos-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${urgent ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                            <div className="min-w-0">
                              <span className="font-mono font-black text-[13px] text-fuelos-900 block truncate">{v.immat}</span>
                              <span className="text-[10.5px] text-slate-500">
                                {v.marque || v.type} · {F(v.dernierKm)} km
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                              urgent ? "bg-red-200 text-red-800" : "bg-emerald-100 text-emerald-800"
                            }`}>
                              {urgent
                                ? <><b>URGENT</b> · {F(v.dernierKm - prev.prochaine + prev.intervalle).replace("-", "")}km dépassés</>
                                : `Dans ${F(prev.reste)} km`}
                            </span>
                          </div>
                        </button>
                      );
                    })
                    .sort((a, b) => 0)
                  }
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ══ ONGLET SUIVI DES PONTS & KANBAN ════════════════════════════════ */}
      {tab === "queue" && (
        <Section titre="Flux Atelier & Véhicules sur Ponts" icon="📋" aside={`${date} · Temps moyen ${kpis.tempsMoy || 30} min`}>
          {loading ? (
            <Loading label="Chargement du flux atelier…" />
          ) : (
            <EntretienQueue commandes={prestations} onRefresh={load} />
          )}
        </Section>
      )}

      {/* ══ ONGLET COMPTOIR ════════════════════════════════════════════════ */}
      {tab === "comptoir" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 bg-surface-card rounded-2xl shadow-card border border-surface-border/80 p-5 space-y-4">
            <div>
              <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
                <span>🧴</span> Catalogue Lubrifiants & Consommables
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cliquez sur un produit pour l'ajouter au panier de vente au comptoir (sans véhicule).
              </p>
            </div>

            {catalogueProduits.length === 0 ? (
              <EmptyState icon="🧴" title="Catalogue vide" description="Ajoutez des produits dans l'onglet ⚙️ Configuration." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[620px] overflow-y-auto pr-1">
                {catalogueProduits.map((prod) => {
                  const stock = Number(prod.stock || prod.qte_stock || 0);
                  const faible = stock <= SEUIL_STOCK_FAIBLE;
                  return (
                    <div
                      key={prod.code}
                      onClick={() => addComptoirItem(prod)}
                      className={`border rounded-2xl p-3.5 cursor-pointer transition-all bg-white flex flex-col justify-between gap-2 ${
                        faible
                          ? "border-red-300 hover:border-red-500 hover:shadow-card-hover"
                          : "border-surface-border hover:border-damel-blue hover:shadow-card-hover"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-2xl">{prod.categorie === "LUBRIFIANT" ? "🛢️" : prod.categorie === "FILTRE" ? "🌀" : "🧴"}</span>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="default">{prod.categorie || "AUTRE"}</Badge>
                            {faible && <Badge variant="danger">Stock {stock}</Badge>}
                          </div>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mt-2 line-clamp-2">{prod.designation}</h4>
                      </div>
                      <div className="flex items-end justify-between pt-2 border-t border-surface-border/70">
                        <div>
                          <div className="text-[10.5px] text-slate-400 font-mono">{prod.code}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black tabular text-fuelos-900">{F(prod.prix_vente)} F</div>
                          <div className="text-[10.5px] text-damel-blue font-bold hover:underline">+ Ajouter</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-white rounded-2xl shadow-pop border border-surface-border/80 p-5 flex flex-col">
            <div className="space-y-3.5 flex-1">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><span>🛒</span> Panier Comptoir</h3>
                  <span className="text-[11.5px] text-slate-500">{comptoirCart.length} article(s)</span>
                </div>
                <Badge variant="star">HUILES</Badge>
              </div>

              <input
                value={comptoirClient}
                onChange={(e) => setComptoirClient(e.target.value)}
                placeholder="Nom client comptoir (optionnel)"
                className="input-base"
              />

              <div className="divide-y divide-surface-border max-h-72 overflow-y-auto">
                {comptoirCart.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Panier vide.<br />Cliquez sur un produit à gauche.
                  </div>
                ) : (
                  comptoirCart.map((item) => (
                    <div key={item.code} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                      <div className="pr-2 min-w-0">
                        <div className="font-bold text-slate-900 truncate">{item.designation}</div>
                        <div className="text-[11px] text-slate-500">{item.quantite} × {F(item.prix_unitaire)} F</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black tabular text-amber-700">{F(item.total)} F</span>
                        <button onClick={() => removeComptoirItem(item.code)}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700 font-bold">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div>
                <label className="label block mb-1">Mode règlement</label>
                <select
                  value={comptoirPaiement}
                  onChange={(e) => setComptoirPaiement(e.target.value)}
                  className="input-base"
                >
                  {MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-surface-border space-y-3 mt-3">
              <div className="flex justify-between items-baseline">
                <span className="text-base font-black text-fuelos-950 tracking-tight">TOTAL COMPTOIR</span>
                <span className="text-2xl font-black tabular text-amber-700">{F(totalComptoir)} F</span>
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                ✅ Garantie FuelOS : {GARANTIE_DEFAUT.piecesJours}j sur les pièces vendues.
              </p>
              <Button
                variant="primary"
                onClick={handleValiderComptoir}
                disabled={comptoirSaving || comptoirCart.length === 0}
                fullWidth
                icon={comptoirSaving ? "⏳" : "💵"}
              >
                {comptoirSaving ? "Encaissement…" : `Encaisser ${F(totalComptoir)} FCFA`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ONGLET VÉHICULES & PRÉVISIONS ════════════════════════════════════ */}
      {tab === "fid" && (
        <Section titre="Fiches Véhicules & Prévisions Maintenance" icon="🚙"
          aside={`${vehiculeMemory.size} véhicules dans la base FuelOS`}>
          {vehiculeMemory.size === 0 ? (
            <EmptyState icon="🚙" title="Aucune fiche véhicule" description="Chaque ordre de réparation enregistré alimente automatiquement cette base." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-surface-border">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-gradient-to-br from-fuelos-50 to-white text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Immat</th>
                    <th className="px-4 py-3 text-left">Véhicule</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-right">Passages</th>
                    <th className="px-4 py-3 text-right">Km derniers</th>
                    <th className="px-4 py-3 text-right">CA total</th>
                    <th className="px-4 py-3 text-left">Prochaine vidange</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-white">
                  {Array.from(vehiculeMemory.values())
                    .sort((a, b) => b.nbVisites - a.nbVisites)
                    .slice(0, 100)
                    .map((v) => {
                      const prev = prochaineVidangePreconisee(v.type, v.dernierKm || 0);
                      const urgent = v.dernierKm > 0 && prev.pourcentage >= 85;
                      return (
                        <tr key={v.immat} className="hover:bg-fuelos-50/70 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-extrabold text-fuelos-900">{v.immat}</td>
                          <td className="px-4 py-2.5 text-slate-700">{v.marque || v.type}</td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {v.client || <span className="text-slate-400 italic">—</span>}
                            {v.client_tel && <div className="text-[11px] text-slate-400">{v.client_tel}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold tabular">{v.nbVisites}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular">{F(v.dernierKm)} km</td>
                          <td className="px-4 py-2.5 text-right font-black tabular text-emerald-700">{F(v.totalDepense)} F</td>
                          <td className="px-4 py-2.5">
                            {v.dernierKm === 0 ? (
                              <span className="text-slate-400 italic text-xs">Pas de km saisis</span>
                            ) : (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[11px] font-bold tabular ${urgent ? "text-red-700" : "text-slate-700"}`}>
                                    {F(prev.prochaine)} km
                                  </span>
                                  <span className="text-[10.5px] text-slate-500">{prev.pourcentage}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${urgent ? "bg-gradient-to-r from-red-500 to-red-700 animate-pulse" : "bg-gradient-to-r from-damel-blue to-fuelos-600"}`}
                                    style={{ width: `${Math.min(100, prev.pourcentage)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Button size="xs" variant="secondary" icon="🧰" onClick={() => {
                              chargerMemoireVehicule(v);
                              setTab("caisse");
                            }}>
                              Nouvel OR
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* ══ ONGLET CONFIG ══════════════════════════════════════════════════ */}
      {tab === "config" && canConfig && (
        <Section titre="Configuration de la Baie d'Entretien" icon="⚙️">
          <EntretienConfigPanel stationId={stationId} services={services} bays={bays} onRefresh={load} />
        </Section>
      )}

      {ticket && (
        <EntretienTicket
          prestation={ticket}
          stationNom={stationNom}
          onClose={() => setTicket(null)}
        />
      )}
    </div>
  );
}
