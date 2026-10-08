import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

import {
  listCommandesLavage,
  createCommandeLavage,
  deletePrestationLavage,
  listWashPacks,
  listWashServices,
  listWashBays,
  listWashPricing,
  getWashPriceMap,
  listWashPromotions,
  listWashBons,
  applyCodePromo,
} from "../lib/api";
import { peutAgirProfil, peutVoirToutesLesEntrees } from "../lib/permissions";
import { SEED_WASH_TYPES_VEHICULE, SEED_WASH_PACK_INCLUSIONS } from "../lib/seed";
import WashPackCard from "../components/lavage/WashPackCard";
import WashQueue from "../components/lavage/WashQueue";
import WashConfigPanel from "../components/lavage/WashConfigPanel";
import WashTicket from "../components/lavage/WashTicket";

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
const MODES_PAIEMENT = ["ESPECES", "WAVE", "OM", "TPE", "CREDIT", "BON_LAVAGE"];

// ─── Innovations du module Lavage ─────────────────────────────────────────
// 1. Progression fidélité : 10 lavages → 1 lavage offert (classique station)
const OFFERT_TOUS_LES_X = 10;
const calcPoints = (montant) => Math.floor(Number(montant || 0) / 500);

// 2. Estimation des durées moyennes par type de pack
const DUREE_ESTIMEE_PAR_PACK = {
  ESSENTIEL: 12,
  ECLAT: 22,
  PRESTIGE: 35,
  EXPRESS: 7,
};
const DUREE_PAR_TYPE_VEHICULE = { BERLINE: 1, "4X4_SUV": 1.35, UTILITAIRE: 1.5, MOTO: 0.7, CAMION: 2 };

function estimationMinutes(packId, typeVehicule, addonsCount = 0) {
  const base = DUREE_ESTIMEE_PAR_PACK[packId] || 15;
  const mult = DUREE_PAR_TYPE_VEHICULE[typeVehicule] || 1;
  return Math.round(base * mult + addonsCount * 3);
}

// 3. Checklist de livraison (à valider avant de notifier le client)
const CHECKLIST_LIVRAISON = [
  { key: "carrosserie", label: "Carrosserie / Lavage extérieur", icon: "🚗" },
  { key: "jantes", label: "Jantes et pneus brillants", icon: "🛞" },
  { key: "vitres", label: "Vitres intérieur & extérieur", icon: "🪟" },
  { key: "habitacle", label: "Aspiration habitacle", icon: "🧹" },
  { key: "tableau", label: "Tableau de bord poussière", icon: "📊" },
  { key: "parfum", label: "Désodorisant / Parfum cabine", icon: "🌸" },
  { key: "desinfection", label: "Désinfection volant & levier", icon: "🧼" },
];

// 4. Offres d'abonnement "Wash Pass" FuelOS
const OFFRES_ABONNEMENT_LAVAGE = [
  {
    id: "ABO_ECO",
    nom: "Wash Pass Éco",
    couleur: "emerald",
    icone: "🌿",
    description: "2 lavages Essentiel/mois · Berlines",
    prixMensuel: 10000,
    avantages: ["-25% sur le prix unitaire", "Priorité file d'attente", "Toujours 1 brillance offert"],
  },
  {
    id: "ABO_PRO",
    nom: "Wash Pass Pro",
    couleur: "damel",
    icone: "💎",
    description: "4 lavages Éclat + addons illimités",
    prixMensuel: 25000,
    avantages: ["-35% vs prix unitaire", "Priorité absolue VIP", "2 parfums offerts / mois", "Client tel enregistré"],
  },
  {
    id: "ABO_FROTTE",
    nom: "Wash Pass Flotte",
    couleur: "star",
    icone: "🚛",
    description: "8 lavages Prestige 4x4 + facturation",
    prixMensuel: 55000,
    avantages: ["Compte pro dédié", "Facture DGID", "Suivi flotte par plaque"],
  },
];

export default function Lavage() {
  const { profil } = useAuth();
  const stationId = profil?.station_id;
  const stationNom = profil?.station_nom || "Star Energy";
  const canConfig = peutAgirProfil(profil, "lavage", "configurer");
  const canDelete = peutAgirProfil(profil, "lavage", "annuler");
  const canVoirTout = peutVoirToutesLesEntrees(profil?.role);

  // ─── Onglet actif ────────────────────────────────────────────────────────
  const [tab, setTab] = useState("caisse");
  const [checkedList, setCheckedListState] = useState({});
  const toggleCheck = (key) => setCheckedListState((c) => ({ ...c, [key]: !c[key] }));

  // ─── Données chargées ────────────────────────────────────────────────────
  const [commandes, setCommandes] = useState([]);
  const [packs, setPacks] = useState([]);
  const [services, setServices] = useState([]);
  const [bays, setBays] = useState([]);
  const [priceMap, setPriceMap] = useState({});
  const [promos, setPromos] = useState([]);
  const [bons, setBons] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(TODAY());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const operateurId = canVoirTout ? undefined : (profil?.id || undefined);
      const [cmds, pks, svcs, bys, pm, prs, bns, prc] = await Promise.all([
        listCommandesLavage(stationId, date, operateurId).catch(() => []),
        listWashPacks(stationId).catch(() => []),
        listWashServices(stationId).catch(() => []),
        listWashBays(stationId).catch(() => []),
        getWashPriceMap(stationId).catch(() => ({})),
        listWashPromotions(stationId).catch(() => []),
        listWashBons(stationId).catch(() => []),
        listWashPricing(stationId).catch(() => []),
      ]);
      setCommandes(cmds);
      setPacks(pks);
      setServices(svcs);
      setBays(bys);
      setPriceMap(pm);
      setPromos(prs);
      setBons(bns);
      setPricing(prc);
    } finally {
      setLoading(false);
    }
  }, [stationId, date, canVoirTout]);

  useEffect(() => { load(); }, [load]);

  // ─── Innovations : Mémoire véhicule (historique par immat) ─────────────
  const vehiculeMemory = useMemo(() => {
    const map = new Map();
    for (const c of commandes) {
      if (!c.immatriculation) continue;
      if (!map.has(c.immatriculation)) {
        map.set(c.immatriculation, {
          immat: c.immatriculation,
          vehicule: c.type_vehicule,
          client_nom: c.client_nom,
          client_tel: c.client_tel,
          dernier_pack: c.pack_id,
          nb_visites: 0,
          total_depense: 0,
          dernier_addons: c.addons || [],
        });
      }
      const rec = map.get(c.immatriculation);
      rec.nb_visites += 1;
      rec.total_depense += Number(c.montant_total || c.montant || 0);
      if (c.pack_id) rec.dernier_pack = c.pack_id;
      if (c.client_nom) rec.client_nom = c.client_nom;
      if (c.client_tel) rec.client_tel = c.client_tel;
      if (c.addons && c.addons.length) rec.dernier_addons = c.addons;
    }
    return map;
  }, [commandes]);

  // ─── KPIs jour enrichis ──────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ca = commandes.reduce((s, c) => s + Number(c.montant_total || c.montant || 0), 0);
    const nb = commandes.length;
    const livres = commandes.filter((c) => c.statut === "LIVRE").length;
    const enCours = commandes.filter((c) => c.statut && c.statut !== "LIVRE" && c.statut !== "EN_ATTENTE").length;
    const enAttente = commandes.filter((c) => c.statut === "EN_ATTENTE" || !c.statut).length;
    const ticketMoyen = nb > 0 ? Math.round(ca / nb) : 0;

    // Temps moyen de traitement (livrés seulement)
    let tempsMoyenMin = 0;
    const livreesDatées = commandes.filter((c) => c.statut === "LIVRE" && c.created_at && c.updated_at);
    if (livreesDatées.length > 0) {
      const total = livreesDatées.reduce((s, c) => {
        const diff = (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 60000;
        return s + Math.max(0, diff);
      }, 0);
      tempsMoyenMin = Math.round(total / livreesDatées.length);
    }

    // Top pack
    const packCount = {};
    for (const c of commandes) if (c.pack_id) packCount[c.pack_id] = (packCount[c.pack_id] || 0) + 1;
    const topPack = Object.entries(packCount).sort((a, b) => b[1] - a[1])[0];
    const topPackNom = topPack ? (packs.find((p) => p.id === topPack[0])?.nom || topPack[0]) : "—";

    // Mode paiement top
    const modeCount = {};
    for (const c of commandes) modeCount[c.mode_paiement] = (modeCount[c.mode_paiement] || 0) + 1;
    const topMode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    return { ca, nb, livres, enCours, enAttente, ticketMoyen, tempsMoyenMin, topPackNom, topMode };
  }, [commandes, packs]);

  // ─── Formulaire nouvelle commande ────────────────────────────────────────
  const initForm = {
    type_vehicule: "BERLINE",
    immatriculation: "",
    pack_id: null,
    addons: [],
    mode_paiement: "ESPECES",
    client_nom: "",
    client_tel: "",
    baie_id: "",
    code_promo: "",
    reduction_promo: 0,
    bon_lavage_id: null,
    membre_fidelite_id: null,
    abonnement_id: null,
  };
  const [form, setForm] = useState(initForm);
  const [promoMsg, setPromoMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState(null);

  // ─── Innovation : Auto-complétion immatriculation (mémoire véhicule) ──
  const suggestionsImmat = useMemo(() => {
    if (!form.immatriculation || form.immatriculation.length < 2) return [];
    const q = form.immatriculation.toUpperCase();
    return Array.from(vehiculeMemory.values())
      .filter((v) => v.immat.toUpperCase().includes(q) || (v.client_nom || "").toUpperCase().includes(q))
      .slice(0, 5);
  }, [form.immatriculation, vehiculeMemory]);

  const chargerMemoireVehicule = (rec) => {
    setForm((f) => ({
      ...f,
      immatriculation: rec.immat,
      type_vehicule: rec.vehicule || f.type_vehicule,
      client_nom: rec.client_nom || f.client_nom,
      client_tel: rec.client_tel || f.client_tel,
      pack_id: rec.dernier_pack || f.pack_id,
      addons: rec.dernier_addons?.length ? [...rec.dernier_addons] : f.addons,
    }));
    setVehiculeConnu(rec);
  };

  const [vehiculeConnu, setVehiculeConnu] = useState(null);
  useEffect(() => {
    if (form.immatriculation && vehiculeMemory.has(form.immatriculation.toUpperCase())) {
      setVehiculeConnu(vehiculeMemory.get(form.immatriculation.toUpperCase()));
    } else {
      setVehiculeConnu(null);
    }
  }, [form.immatriculation, vehiculeMemory]);

  // Progression fidélité (pour le véhicule actuellement saisi)
  const progressionFidelite = vehiculeConnu ? vehiculeConnu.nb_visites % OFFERT_TOUS_LES_X : 0;
  const estLavageOffert = vehiculeConnu && progressionFidelite === 0 && vehiculeConnu.nb_visites > 0 && vehiculeConnu.nb_visites % OFFERT_TOUS_LES_X === 0;

  // Tarifs
  const tarifPack = form.pack_id && form.type_vehicule
    ? (priceMap[`${form.pack_id}_${form.type_vehicule}`] || 0)
    : 0;

  const addonServices = services.filter((s) => s.categorie === "ADDON" && s.actif !== false);
  const montantAddons = form.addons.reduce((s, a) => s + (a.prix_unitaire || 0), 0);
  const reductionFidelite = estLavageOffert ? tarifPack + montantAddons : 0;
  const montantTotal = Math.max(0, tarifPack + montantAddons - form.reduction_promo - reductionFidelite);
  const pointsGagnes = calcPoints(montantTotal);

  const minutesEstimees = estimationMinutes(form.pack_id, form.type_vehicule, form.addons.length);

  const packInclusions = useMemo(() => {
    if (!form.pack_id) return [];
    const codes = SEED_WASH_PACK_INCLUSIONS[form.pack_id] || [];
    return codes.map((c) => services.find((s) => s.code === c)?.nom || c);
  }, [form.pack_id, services]);

  const toggleAddon = (svc) => {
    const already = form.addons.find((a) => a.service_id === svc.id);
    if (already) {
      setForm((f) => ({ ...f, addons: f.addons.filter((a) => a.service_id !== svc.id) }));
    } else {
      setForm((f) => ({
        ...f,
        addons: [...f.addons, { service_id: svc.id, service_nom: svc.nom, prix_unitaire: svc.prix_unitaire || 0 }],
      }));
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!form.pack_id) { setErr("Veuillez sélectionner un pack."); return; }
    if (!form.type_vehicule) { setErr("Veuillez choisir un type de véhicule."); return; }
    setSaving(true);
    try {
      const selectedPack = packs.find((p) => p.id === form.pack_id);
      const res = await createCommandeLavage({
        station_id: stationId,
        date,
        agent: profil?.nom_complet || profil?.email || "—",
        agent_id: profil?.id,
        operateur_id: profil?.id,
        user_id: profil?.id,
        type_vehicule: form.type_vehicule,
        immatriculation: form.immatriculation?.toUpperCase(),
        pack_id: form.pack_id,
        pack_nom: selectedPack?.nom || "",
        addons: form.addons,
        montant_pack: tarifPack,
        montant_addons: montantAddons,
        reduction_promo: form.reduction_promo + reductionFidelite,
        code_promo: estLavageOffert ? `FIDELITE-OFFERT-${OFFERT_TOUS_LES_X}` : form.code_promo,
        mode_paiement: form.mode_paiement,
        client_nom: form.client_nom,
        client_tel: form.client_tel,
        baie_id: form.baie_id || null,
        bon_lavage_id: form.bon_lavage_id || null,
        membre_fidelite_id: form.membre_fidelite_id || null,
        abonnement_id: form.abonnement_id || null,
        duree_estimee_min: minutesEstimees,
        points_gagnes: pointsGagnes,
        statut: "EN_ATTENTE",
        heure: new Date().toTimeString().slice(0, 5),
      });
      if (res.ok) {
        setTicket({ ...res.commande, pack_nom: selectedPack?.nom, heure: new Date().toTimeString().slice(0, 5), points_gagnes: pointsGagnes });
        setForm(initForm);
        setPromoMsg(null);
        setVehiculeConnu(null);
        load();
      }
    } catch (ex) {
      setErr(ex.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette prestation ?")) return;
    await deletePrestationLavage(id);
    load();
  };

  const TABS = [
    { id: "caisse",   label: "🧾 Caisse & Nouvelle Commande", icon: "🧾", always: true },
    { id: "queue",    label: "📋 File d'attente & Suivi",     icon: "📋", always: true },
    { id: "abos",     label: "💎 Wash Pass & Abonnements",    icon: "💎", always: true },
    { id: "fidelite", label: "⭐ Fidélité & Clients connus",  icon: "⭐", always: true },
    { id: "config",   label: "⚙️ Configuration",              icon: "⚙️", always: false, cond: canConfig },
  ].filter((t) => t.always || t.cond);

  return (
    <div className="pb-10">
      <PageHeader
        icon="🚿"
        titre="Centre de Lavage & Carrosserie"
        subtitle={`DAMEL CAR WASH SERVICES · Station ${stationNom} · ${date}`}
        badge={`⏱ ${kpis.tempsMoyenMin > 0 ? `${kpis.tempsMoyenMin} min/voiture` : "Attendez 15 min"}`}
        breadcrumb="Pilotage > Opérations > Centre de Lavage"
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
        <StatCard
          label="CA du Jour"
          value={`${F(kpis.ca)} F`}
          icon="💰"
          color="damel"
          subtext={`${kpis.nb} lavages · Ticket moyen ${F(kpis.ticketMoyen)} F`}
          trend={kpis.nb >= 10 ? 12 : 4}
          trendLabel="vs. prévision"
        />
        <StatCard
          label="File d'attente"
          value={`${kpis.enAttente} en attente`}
          icon="⏳"
          color="amber"
          subtext={`${kpis.enCours} en cours de lavage`}
        />
        <StatCard
          label="Voitures livrées"
          value={kpis.livres}
          icon="✅"
          color="emerald"
          subtext={`Top pack : ${kpis.topPackNom}`}
        />
        <StatCard
          label="Règlement préféré"
          value={kpis.topMode}
          icon="💳"
          color="blue"
          subtext={`Temps moyen : ${kpis.tempsMoyenMin || "~15"} min`}
        />
      </KpiGrid>

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

      {loading && tab === "caisse" && <Loading label="Chargement du centre de lavage…" />}

      {/* ══ ONGLET CAISSE & NOUVELLE COMMANDE ═══════════════════════════════ */}
      {tab === "caisse" && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Formulaire */}
          <div className="lg:col-span-7 space-y-5">
            <Section titre="1. Client & Véhicule" icon="👤" aside={vehiculeConnu ? "Client reconnu ✓" : undefined}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="relative">
                  <label className="label block mb-1">Immatriculation</label>
                  <input
                    value={form.immatriculation}
                    onChange={(e) => setForm({ ...form, immatriculation: e.target.value.toUpperCase() })}
                    placeholder="Ex: DK-1234-AB"
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
                            <div className="text-[11px] text-slate-500">{s.client_nom || "Client enregistré"}</div>
                          </div>
                          <span className="text-[10.5px] text-damel-blue font-bold bg-fuelos-50 px-2 py-1 rounded-full border border-fuelos-100">
                            {s.nb_visites} visites
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label block mb-1">Type véhicule</label>
                  <select
                    value={form.type_vehicule}
                    onChange={(e) => setForm({ ...form, type_vehicule: e.target.value })}
                    className="input-base !py-2.5 text-sm font-semibold"
                  >
                    {SEED_WASH_TYPES_VEHICULE.map((t) => (
                      <option key={t.code} value={t.code}>{t.libelle}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Nom client</label>
                  <input
                    value={form.client_nom}
                    onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                    placeholder="Nom du client"
                    className="input-base !py-2.5"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Téléphone (WhatsApp)</label>
                  <input
                    value={form.client_tel}
                    onChange={(e) => setForm({ ...form, client_tel: e.target.value })}
                    placeholder="Ex: +221 77 000 00 00"
                    className="input-base !py-2.5"
                  />
                </div>
              </div>

              {vehiculeConnu && (
                <div className="mt-4">
                  <Alerte variant="info" icon="⭐">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-extrabold">Client fidèle</span> : {vehiculeConnu.client_nom || "visiteur régulier"} ·
                        <span className="ml-1 font-bold text-fuelos-900">{vehiculeConnu.nb_visites} visites</span> ·
                        <span className="ml-1"> Total dépensé : <b className="text-emerald-700">{F(vehiculeConnu.total_depense)} F</b></span>
                      </div>
                      <Badge variant="gold">
                        {estLavageOffert
                          ? `🎁 LAVAGE OFFERT ! (tous les ${OFFERT_TOUS_LES_X})`
                          : `Prochain offert dans ${OFFERT_TOUS_LES_X - progressionFidelite}`}
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 bg-fuelos-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${estLavageOffert ? "bg-gradient-to-r from-damel-yellow to-damel-gold" : "bg-gradient-to-r from-damel-blue to-fuelos-500"}`}
                        style={{ width: `${(progressionFidelite / OFFERT_TOUS_LES_X) * 100}%` }}
                      />
                    </div>
                  </Alerte>
                </div>
              )}
            </Section>

            <Section titre="2. Pack & Services" icon="📦" aside={form.pack_id ? `~ ${minutesEstimees} min` : "Durée estimée"}>
              {packs.length === 0 ? (
                <EmptyState
                  icon="📦"
                  title="Aucun pack configuré"
                  description={canConfig ? "Configurez des packs dans l'onglet ⚙️ Configuration du module." : "Contactez votre gérant pour configurer les packs de lavage."}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {packs.map((pack) => {
                    const tarif = priceMap[`${pack.id}_${form.type_vehicule}`];
                    const inclusions = (SEED_WASH_PACK_INCLUSIONS[pack.id] || [])
                      .map((c) => services.find((s) => s.code === c)?.nom || c);
                    return (
                      <WashPackCard
                        key={pack.id}
                        pack={pack}
                        tarif={tarif}
                        selected={form.pack_id === pack.id}
                        onSelect={(p) => setForm((f) => ({ ...f, pack_id: p.id }))}
                        inclusions={inclusions}
                      />
                    );
                  })}
                </div>
              )}
            </Section>

            {addonServices.length > 0 && (
              <Section titre="3. Options & Add-ons" icon="➕" aside={`${form.addons.length} option(s)`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {addonServices.map((svc) => {
                    const checked = form.addons.some((a) => a.service_id === svc.id);
                    return (
                      <label
                        key={svc.id}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                          checked
                            ? "border-damel-blue bg-fuelos-50 shadow-card"
                            : "border-surface-border bg-white hover:border-surface-border-strong hover:bg-surface-muted"
                        }`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleAddon(svc)} className="w-4 h-4 accent-damel-blue" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">{svc.nom}</div>
                          {svc.description && <div className="text-[11px] text-slate-500 truncate">{svc.description}</div>}
                        </div>
                        <span className="text-sm font-black text-damel-blue tabular">+{F(svc.prix_unitaire)} F</span>
                      </label>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section titre="4. Baie & Règlement" icon="💳">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="label block mb-1">Baie affectée</label>
                  <select
                    value={form.baie_id}
                    onChange={(e) => setForm({ ...form, baie_id: e.target.value })}
                    className="input-base"
                  >
                    <option value="">— Auto-affectation</option>
                    {bays.map((b) => <option key={b.id} value={b.code_baie}>{b.nom_baie || b.code_baie}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Mode de paiement</label>
                  <select
                    value={form.mode_paiement}
                    onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}
                    className="input-base"
                  >
                    {MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label block mb-1">Code Promo / Bon</label>
                  <div className="flex gap-2">
                    <input
                      value={form.code_promo}
                      onChange={(e) => { setForm({ ...form, code_promo: e.target.value.toUpperCase(), reduction_promo: 0 }); setPromoMsg(null); }}
                      placeholder="Code promo (ex: CARWASH25)"
                      className="input-base uppercase"
                    />
                    <Button variant="accent" type="button" onClick={handleApplyPromo}>Appliquer</Button>
                  </div>
                  {promoMsg && (
                    <p className={`mt-1.5 text-[11.5px] font-semibold ${promoMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{promoMsg.txt}</p>
                  )}
                  {bons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[10.5px] font-bold text-slate-500 self-center">Bons valides :</span>
                      {bons.slice(0, 6).map((b) => (
                        <Badge key={b.id} variant="damel" className="cursor-pointer" onClick={() => { setForm((f) => ({ ...f, bon_lavage_id: b.id })); }}>
                          {b.code || b.type}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* Total final */}
            <Card className="!p-5 bg-gradient-to-br from-fuelos-950 to-fuelos-900 text-white shadow-pop border-fuelos-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-fuelos-100 flex items-center gap-2 text-base">
                  <span>💵</span> Récapitulatif Commande
                </h3>
                {form.pack_id && (
                  <Badge variant="default" className="!bg-white/10 !text-amber-200 !border-white/20">
                    ⏱ ≈ {minutesEstimees} min
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5 text-sm">
                {form.pack_id && (
                  <div className="flex justify-between items-center">
                    <span className="text-fuelos-200">
                      Pack {packs.find((p) => p.id === form.pack_id)?.nom || form.pack_id}
                      {packInclusions.length > 0 && <span className="ml-1 text-[11px] text-fuelos-300">({packInclusions.length} inclusions)</span>}
                    </span>
                    <span className="font-bold tabular">{F(tarifPack)} F</span>
                  </div>
                )}
                {montantAddons > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-fuelos-200">Options add-on ({form.addons.length})</span>
                    <span className="font-bold tabular">+{F(montantAddons)} F</span>
                  </div>
                )}
                {estLavageOffert && (
                  <div className="flex justify-between items-center text-damel-yellow font-bold">
                    <span>🎁 Lavage offert fidélité (tous les {OFFERT_TOUS_LES_X})</span>
                    <span>-{F(reductionFidelite)} F</span>
                  </div>
                )}
                {form.reduction_promo > 0 && !estLavageOffert && (
                  <div className="flex justify-between items-center text-emerald-300 font-bold">
                    <span>🏷️ Réduction promo</span>
                    <span>-{F(form.reduction_promo)} F</span>
                  </div>
                )}
                <div className="pt-2 mt-1 border-t border-white/15 flex justify-between items-center">
                  <span className="text-base font-black tracking-tight">TOTAL</span>
                  <span className="text-2xl font-black tabular text-amber-300">{F(montantTotal)} F</span>
                </div>
                {pointsGagnes > 0 && !estLavageOffert && (
                  <div className="text-center text-[11.5px] font-semibold text-amber-200 pt-1">
                    ⭐ +{pointsGagnes} points fidélité · Progression offert : {progressionFidelite}/{OFFERT_TOUS_LES_X}
                  </div>
                )}
              </div>

              <Divider className="!my-4 !border-white/10" />

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="!mb-0 label !text-fuelos-200 !normal-case !tracking-normal !text-[11.5px]">
                    ✅ Checklist avant notification client
                  </label>
                  <span className="text-[10.5px] text-fuelos-300 font-semibold">
                    {Object.values(checkedList).filter(Boolean).length}/{CHECKLIST_LIVRAISON.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {CHECKLIST_LIVRAISON.map((c) => (
                    <label
                      key={c.key}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-[11.5px] ${
                        checkedList[c.key] ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/30" : "bg-white/5 text-fuelos-100 border border-white/10"
                      }`}
                    >
                      <input type="checkbox" checked={!!checkedList[c.key]} onChange={() => toggleCheck(c.key)} className="w-3.5 h-3.5 accent-emerald-400" />
                      <span className="mr-1">{c.icon}</span>
                      <span className="font-semibold">{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {err && <div className="mt-4 p-3 rounded-xl bg-red-500/20 text-red-200 border border-red-400/30 text-xs font-medium">⚠️ {err}</div>}

              <Button
                variant="accent"
                size="lg"
                type="submit"
                onClick={handleSubmit}
                disabled={saving || !form.pack_id}
                fullWidth
                icon={saving ? "⏳" : "✓"}
                className="!mt-5"
              >
                {saving ? "Enregistrement…" : `Valider la commande · ${F(montantTotal)} FCFA`}
              </Button>
            </Card>
          </div>

          {/* Colonne droite : liste + statistiques */}
          <div className="lg:col-span-5 space-y-5">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📋</span> Prestations du jour
                </h3>
                <Badge variant="primary">{commandes.length} au total</Badge>
              </div>

              {loading ? (
                <Loading label="Chargement des prestations…" />
              ) : commandes.length === 0 ? (
                <EmptyState icon="🚿" title="Aucune prestation aujourd'hui" description="Enregistrez un premier client avec le formulaire à gauche." />
              ) : (
                <div className="space-y-1.5 max-h-[680px] overflow-y-auto pr-1">
                  {commandes.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl border border-surface-border hover:border-fuelos-200 hover:shadow-card transition-all bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-fuelos-900 text-sm tracking-wide">
                              {c.immatriculation || "Sans plaque"}
                            </span>
                            <Badge
                              variant={
                                c.statut === "LIVRE" ? "success" :
                                c.statut === "EN_ATTENTE" ? "warn" :
                                c.statut === "TERMINE" ? "info" : "primary"
                              }
                              dot
                            >
                              {c.statut || "En attente"}
                            </Badge>
                          </div>
                          <div className="text-[11.5px] text-slate-500 mt-0.5">
                            {c.pack_nom || "Lavage"} · {c.type_vehicule} · {c.heure || (c.created_at?.slice(11, 16) || "—")}
                          </div>
                          {c.client_nom && <div className="text-[11px] text-slate-400 mt-0.5">👤 {c.client_nom}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-black text-fuelos-900 tabular">{F(c.montant_total || c.montant)} F</div>
                          <Badge variant={
                            c.mode_paiement === "ESPECES" ? "success" :
                            c.mode_paiement === "CREDIT" ? "warn" : "damel"
                          }>
                            {c.mode_paiement}
                          </Badge>
                        </div>
                      </div>
                      {(c.addons?.length > 0 || c.mode_paiement) && (
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-surface-border/70">
                          <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
                            {c.baie_id && <span className="text-slate-500">🅱️ {c.baie_id}</span>}
                            {c.addons?.map((a, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-fuelos-50 text-fuelos-700 rounded border border-fuelos-100 font-semibold">
                                +{a.service_nom}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setTicket(c)}
                              className="text-[11px] text-damel-blue font-bold hover:underline"
                              title="Voir le ticket"
                            >
                              📄 Fiche
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(c.id)}
                                className="text-[11px] text-red-500 font-bold hover:text-red-700"
                                title="Supprimer"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="!bg-gradient-to-br from-amber-50 to-white !border-amber-200/70">
              <h3 className="font-extrabold text-amber-950 flex items-center gap-2 mb-3">
                <span>📈</span> Performance du jour
              </h3>
              <div className="space-y-2 text-sm">
                <Row><span className="text-slate-600">CA du jour</span><b className="tabular">{F(kpis.ca)} F</b></Row>
                <Row><span className="text-slate-600">Ticket moyen</span><b className="tabular text-damel-blue">{F(kpis.ticketMoyen)} F</b></Row>
                <Row><span className="text-slate-600">Temps moyen</span><b className="tabular text-fuelos-900">{kpis.tempsMoyenMin || 15} min</b></Row>
                <Row><span className="text-slate-600">Pack préféré</span><b>{kpis.topPackNom}</b></Row>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-200/70">
                <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-1.5">Répartition mode paiement</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(["ESPECES", "OM", "WAVE", "TPE", "CREDIT", "BON_LAVAGE"].reduce((acc, m) => {
                    const count = commandes.filter((c) => c.mode_paiement === m).length;
                    if (count > 0) acc[m] = count;
                    return acc;
                  }, {})).map(([mode, count]) => {
                    const pct = Math.round((count / commandes.length) * 100);
                    return (
                      <div key={mode} className="flex-1 min-w-[90px] bg-white rounded-lg p-2 border border-amber-200/60">
                        <div className="text-[10px] text-amber-700 font-bold">{mode}</div>
                        <div className="flex items-end justify-between mt-1">
                          <span className="font-black tabular text-amber-950">{count}</span>
                          <span className="text-[10px] text-amber-700">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-damel-yellow to-amber-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {commandes.length === 0 && <div className="text-[11px] text-slate-400 w-full text-center">En attente de données…</div>}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ══ ONGLET FILE D'ATTENTE ══════════════════════════════════════════ */}
      {tab === "queue" && (
        <Section titre="Flux Production & File d'attente" icon="📋" aside={`${date} · Rafraîchi toutes les 30s`}>
          {loading ? (
            <Loading label="Chargement de la file d'attente…" />
          ) : commandes.length === 0 ? (
            <EmptyState icon="📋" title="Aucun véhicule en file" description="Passez à l'onglet 🧾 Caisse pour enregistrer votre premier lavage." />
          ) : (
            <WashQueue commandes={commandes} onRefresh={load} />
          )}
        </Section>
      )}

      {/* ══ ONGLET WASH PASS ═══════════════════════════════════════════════ */}
      {tab === "abos" && (
        <Section titre="Wash Pass — Abonnements FuelOS" icon="💎" aside="Fidélité & récurrence">
          <div className="mb-4">
            <Alerte variant="info" icon="💡">
              Les Wash Pass FuelOS transforment vos clients occasionnels en abonnés mensuels garantis. 3 niveaux pour 3 usages : Éco, Pro & Flotte.
            </Alerte>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {OFFRES_ABONNEMENT_LAVAGE.map((offre, i) => (
              <Card
                key={offre.id}
                className={`relative overflow-hidden ${i === 1 ? "!border-damel-blue !shadow-card-hover" : ""}`}
              >
                {i === 1 && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-gradient-to-r from-damel-blue to-fuelos-700 text-white text-[10.5px] font-extrabold px-3 py-1 rounded-bl-xl tracking-wider">
                      LE PLUS VENDU
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-3xl mb-2">{offre.icone}</div>
                    <h3 className="font-black text-lg text-fuelos-950 leading-tight">{offre.nom}</h3>
                    <p className="text-[11.5px] text-slate-500 mt-1">{offre.description}</p>
                  </div>
                  <Badge variant={offre.couleur}>{offre.id.replace("ABO_", "")}</Badge>
                </div>
                <div className="py-3 mb-3 border-y border-surface-border">
                  <div className="text-[11px] text-slate-500 font-semibold mb-0.5">TARIF / MOIS</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black tabular text-fuelos-950">{F(offre.prixMensuel)}</span>
                    <span className="text-sm font-bold text-slate-500">FCFA</span>
                  </div>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {offre.avantages.map((av, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[12px] text-slate-700">
                      <span className="text-emerald-600 font-bold mt-0.5">✓</span>
                      <span>{av}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={i === 1 ? "primary" : "secondary"}
                  fullWidth
                  icon="🎟️"
                  onClick={() => {
                    setForm((f) => ({ ...f, abonnement_id: offre.id }));
                    setTab("caisse");
                  }}
                >
                  Proposer à un client
                </Button>
              </Card>
            ))}
          </div>

          <Divider label="Véhicules éligibles aujourd'hui" className="!my-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from(vehiculeMemory.values())
              .filter((v) => v.nb_visites >= 3)
              .sort((a, b) => b.nb_visites - a.nb_visites)
              .slice(0, 6)
              .map((v) => {
                const reco = v.nb_visites >= 8 ? "ABO_PRO" : v.nb_visites >= 5 ? "ABO_ECO" : "ABO_FROTTE";
                const recoNom = OFFRES_ABONNEMENT_LAVAGE.find((o) => o.id === reco)?.nom || "Wash Pass Éco";
                return (
                  <Card key={v.immat} className="!p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-black text-fuelos-900">{v.immat}</span>
                      <Badge variant="gold">TOP {v.nb_visites}</Badge>
                    </div>
                    <div className="text-[11.5px] text-slate-600">
                      {v.client_nom || "Client fidèle"} · {v.vehicule}
                    </div>
                    <div className="mt-2 p-2 rounded-lg bg-fuelos-50 border border-fuelos-100">
                      <div className="text-[10px] font-bold text-damel-blue uppercase tracking-wider mb-0.5">💎 Recommandé</div>
                      <div className="text-[12px] font-bold text-fuelos-900">{recoNom}</div>
                    </div>
                  </Card>
                );
              })}
            {Array.from(vehiculeMemory.values()).filter((v) => v.nb_visites >= 3).length === 0 && (
              <div className="md:col-span-3">
                <EmptyState icon="💎" title="Pas encore de clients fidèles" description="Dès 3 lavages sur une plaque, FuelOS propose automatiquement un Wash Pass adapté." />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ══ ONGLET FIDÉLITÉ ════════════════════════════════════════════════ */}
      {tab === "fidelite" && (
        <Section titre="Clients Réguliers & Fidélité" icon="⭐" aside={`${vehiculeMemory.size} véhicules enregistrés`}>
          {vehiculeMemory.size === 0 ? (
            <EmptyState icon="⭐" title="Aucun client fidèle pour l'instant" description="Au fur et à mesure des lavages, FuelOS mémorise véhicules, préférences et dépenses totales." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-surface-muted">
                    <th className="px-3 py-2.5 text-left rounded-l-lg">Immatriculation</th>
                    <th className="px-3 py-2.5 text-left">Véhicule</th>
                    <th className="px-3 py-2.5 text-left">Client</th>
                    <th className="px-3 py-2.5 text-right">Visites</th>
                    <th className="px-3 py-2.5 text-right">Total dépensé</th>
                    <th className="px-3 py-2.5 text-left rounded-r-lg">Prochain lavage offert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {Array.from(vehiculeMemory.values())
                    .sort((a, b) => b.nb_visites - a.nb_visites)
                    .slice(0, 50)
                    .map((v) => {
                      const prog = v.nb_visites % OFFERT_TOUS_LES_X;
                      const estOffert = prog === 0 && v.nb_visites >= OFFERT_TOUS_LES_X;
                      return (
                        <tr
                          key={v.immat}
                          onClick={() => chargerMemoireVehicule(v)}
                          className="hover:bg-fuelos-50/70 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2.5 font-mono font-extrabold text-fuelos-900">{v.immat}</td>
                          <td className="px-3 py-2.5 text-slate-600">{v.vehicule}</td>
                          <td className="px-3 py-2.5 text-slate-700">
                            {v.client_nom || <span className="text-slate-400 italic">Anonyme</span>}
                            {v.client_tel && <div className="text-[11px] text-slate-400">{v.client_tel}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular">
                            {v.nb_visites}
                          </td>
                          <td className="px-3 py-2.5 text-right font-black tabular text-emerald-700">
                            {F(v.total_depense)} F
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 max-w-[120px] h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${estOffert ? "bg-gradient-to-r from-damel-yellow to-damel-gold" : "bg-gradient-to-r from-damel-blue to-fuelos-500"}`}
                                  style={{ width: `${(prog / OFFERT_TOUS_LES_X) * 100}%` }}
                                />
                              </div>
                              <Badge variant={estOffert ? "gold" : "damel"}>
                                {estOffert ? "🎁 Offert !" : `${OFFERT_TOUS_LES_X - prog}/${OFFERT_TOUS_LES_X}`}
                              </Badge>
                            </div>
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

      {/* ══ ONGLET CONFIG (gérant/admin seulement) ════════════════════════ */}
      {tab === "config" && canConfig && (
        <Section titre="Configuration du Centre de Lavage" icon="⚙️">
          <WashConfigPanel
            stationId={stationId}
            packs={packs}
            services={services}
            pricing={pricing}
            bays={bays}
            promos={promos}
            bons={bons}
            onRefresh={load}
          />
        </Section>
      )}

      {/* Modal ticket */}
      {ticket && (
        <WashTicket
          commande={ticket}
          stationNom={stationNom}
          onClose={() => setTicket(null)}
        />
      )}
    </div>
  );
}

// ── Fin du composant Lavage ──────────────────────────────────────────────
