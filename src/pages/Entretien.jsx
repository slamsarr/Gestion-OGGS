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

const F = (v) => Number(v || 0).toLocaleString("fr-FR");
const TODAY = () => new Date().toISOString().slice(0, 10);
const MODES_PAIEMENT = ["ESPECES", "WAVE", "OM", "TPE", "CREDIT", "BON_CARBURANT"];

const TYPES_VEHICULE = [
  { code: "BERLINE", libelle: "Berline / Citadine" },
  { code: "4X4_SUV", libelle: "4x4 / SUV / Pick-up" },
  { code: "UTILITAIRE", libelle: "Minibus / Utilitaire" },
  { code: "MOTO", libelle: "Moto / Deux-roues" },
];

export default function Entretien() {
  const { profil } = useAuth();
  const stationId = profil?.station_id;
  const stationNom = profil?.station_nom || "Star Energy";
  const canConfig = peutAgirProfil(profil, "entretien", "configurer");
  const canDelete = peutAgirProfil(profil, "entretien", "annuler");
  // Un mécanicien ne voit que ses propres interventions ; gérant et profils avancés voient tout
  const canVoirTout = peutVoirToutesLesEntrees(profil?.role);

  // ─── Onglet principal ──────────────────────────────────────────────────
  const [tab, setTab] = useState("caisse"); // caisse | queue | comptoir | config
  const [date, setDate] = useState(TODAY());
  const [loading, setLoading] = useState(true);

  // ─── Données ───────────────────────────────────────────────────────────
  const [prestations, setPrestations] = useState([]);
  const [services, setServices] = useState([]);
  const [bays, setBays] = useState([]);
  const [catalogueProduits, setCatalogueProduits] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Restriction de visibilité : un mécanicien ne voit que ses propres ordres de réparation
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

  useEffect(() => {
    load();
  }, [load]);

  // ─── KPIs du jour ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ca = prestations.reduce((s, p) => s + Number(p.montant_total || 0), 0);
    const nb = prestations.length;
    const enCours = prestations.filter((p) => p.statut === "EN_COURS" || p.statut === "CONTROLE").length;
    const livres = prestations.filter((p) => p.statut === "LIVRE" || p.statut === "TERMINE").length;
    return { ca, nb, enCours, livres };
  }, [prestations]);

  // ─── Formulaire Intervention Atelier ───────────────────────────────────
  const initForm = {
    immatriculation: "",
    marque_modele: "",
    kilometrage: "",
    type_vehicule: "BERLINE",
    client_nom: "",
    client_tel: "",
    technicien: profil?.nom_complet || "Ousmane Sow",
    baie_id: "",
    selectedServices: [], // [service]
    selectedProduits: [], // [{ code, designation, prix_unitaire, quantite, total }]
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

  // Sélecteur temporaire de produit à ajouter
  const [selProdCode, setSelProdCode] = useState("");
  const [selProdQte, setSelProdQte] = useState(1);

  // Calcul totaux
  const montantServices = useMemo(() => {
    return form.selectedServices.reduce((sum, s) => sum + Number(s.prix_base || s.prix || 0), 0);
  }, [form.selectedServices]);

  const montantProduits = useMemo(() => {
    return form.selectedProduits.reduce((sum, p) => sum + Number(p.total || p.prix_unitaire * p.quantite || 0), 0);
  }, [form.selectedProduits]);

  const montantTotal = Math.max(0, montantServices + montantProduits - form.reduction_promo);
  const pointsGagnes = Math.floor(montantTotal / 500);

  // Basculer un service
  const toggleService = (srv) => {
    const exists = form.selectedServices.some((s) => s.id === srv.id);
    if (exists) {
      setForm((f) => ({ ...f, selectedServices: f.selectedServices.filter((s) => s.id !== srv.id) }));
    } else {
      setForm((f) => ({ ...f, selectedServices: [...f.selectedServices, srv] }));
    }
  };

  // Ajouter un lubrifiant / produit
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
          {
            code: prod.code,
            designation: prod.designation,
            prix_unitaire: prix,
            quantite: qte,
            total: prix * qte,
          },
        ],
      }));
    }
    setSelProdCode("");
    setSelProdQte(1);
  };

  const handleRemoveProduct = (code) => {
    setForm((f) => ({
      ...f,
      selectedProduits: f.selectedProduits.filter((p) => p.code !== code),
    }));
  };

  // Code promo
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

  // Enregistrer intervention
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
        immatriculation: form.immatriculation,
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
          service_id: s.id,
          service_nom: s.nom,
          prix: Number(s.prix_base || s.prix || 0),
          categorie: s.categorie,
        })),
        produits: form.selectedProduits,
        montant_services: montantServices,
        montant_produits: montantProduits,
        reduction_promo: form.reduction_promo,
        code_promo: form.code_promo,
        mode_paiement: form.mode_paiement,
        notes_diagnostic: form.notes_diagnostic,
        statut: "EN_ATTENTE",
        points_gagnes: pointsGagnes,
      });

      if (res.ok) {
        setTicket(res.prestation);
        setForm(initForm);
        setPromoMsg(null);
        load();
      }
    } catch (ex) {
      setErr(ex.message || "Erreur lors de l'enregistrement de l'intervention.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Vente Comptoir Lubrifiants (Sans véhicule à l'atelier) ────────────
  const [comptoirCart, setComptoirCart] = useState([]);
  const [comptoirClient, setComptoirClient] = useState("");
  const [comptoirPaiement, setComptoirPaiement] = useState("ESPECES");
  const [comptoirSaving, setComptoirSaving] = useState(false);

  const addComptoirItem = (prod) => {
    const existing = comptoirCart.find((c) => c.code === prod.code);
    const prix = Number(prod.prix_vente || 0);
    if (existing) {
      setComptoirCart(
        comptoirCart.map((c) =>
          c.code === prod.code ? { ...c, quantite: c.quantite + 1, total: (c.quantite + 1) * prix } : c
        )
      );
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
        station_id: stationId,
        date,
        immatriculation: "VENTE-COMPTOIR",
        marque_modele: "Achat direct",
        type_vehicule: "COMPTOIR",
        client_nom: comptoirClient || "Client Comptoir",
        technicien: profil?.nom_complet || "Comptoir",
        technicien_id: profil?.id,
        operateur_id: profil?.id,
        user_id: profil?.id,
        services: [],
        produits: comptoirCart,
        montant_services: 0,
        montant_produits: totalComptoir,
        mode_paiement: comptoirPaiement,
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
    { id: "caisse",   label: "🧾 Prise en charge & OR",  icon: "🧾" },
    { id: "queue",    label: "📋 Suivi des Ponts",        icon: "📋" },
    { id: "comptoir", label: "🧴 Vente Lubrifiants",      icon: "🧴" },
    { id: "config",   label: "⚙️ Configuration",         icon: "⚙️", cond: canConfig },
  ].filter((t) => !t.cond || t.cond);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* ── EN-TÊTE ──────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#102A43] via-[#0B4EA2] to-[#08336D] px-4 py-5 text-white shadow-md border-b-2 border-amber-400">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <div className="h-6 px-2 bg-white rounded-md flex items-center justify-center">
                  <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-3.5 w-auto object-contain" />
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500 text-white uppercase tracking-wider">
                  DAMEL SERVICES AUTO &amp; BAIE
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-black/40 text-amber-300 px-2 py-0.5 rounded-full border border-purple-400/40">
                  <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3 h-3 object-contain rounded-xs" />
                  <span>Station {stationNom}</span>
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                <span>🔧</span> Baie d'Entretien, Vidange &amp; Mécanique Rapide
              </h1>
              <p className="text-blue-200 text-xs sm:text-sm mt-0.5">
                Prestations techniques certifiées DAMEL ENERGY · Forfaits rapides &amp; vente de lubrifiants
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-white/20 border border-white/30 text-white rounded-xl px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:bg-white/30 font-semibold"
              />
              <button
                onClick={load}
                className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-colors"
              >
                🔄
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            {[
              { label: "CA Entretien & Huiles", val: `${F(kpis.ca)} F`, icon: "💰" },
              { label: "Interventions Jour", val: kpis.nb, icon: "🚗" },
              { label: "Sur les ponts", val: kpis.enCours, icon: "⏳" },
              { label: "Terminés & Livrés", val: kpis.livres, icon: "✅" },
            ].map((k) => (
              <div key={k.label} className="bg-white/15 rounded-2xl p-2.5 sm:p-3 text-center backdrop-blur-sm border border-white/10">
                <div className="text-lg sm:text-xl">{k.icon}</div>
                <div className="font-black text-base sm:text-xl leading-tight truncate">{k.val}</div>
                <div className="text-amber-100 text-[11px] sm:text-xs">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Navigation Onglets */}
          <div className="flex gap-1.5 sm:gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  tab === t.id
                    ? "bg-white text-amber-700 shadow-md scale-[1.02]"
                    : "text-amber-100 hover:bg-white/20"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENU PRINCIPAL ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ══ ONGLET CAISSE & PRISE EN CHARGE ATELIER ═══════════════════════ */}
        {tab === "caisse" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Colonne Formulaire (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <span>📋</span> Prise en Charge Véhicule / Ordre de Réparation
                </h2>
                <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                  Nouveau véhicule
                </span>
              </div>

              <form onSubmit={handleSubmitIntervention} className="p-5 space-y-5">
                {/* 1. Véhicule */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🚗</span> 1. Identification du Véhicule
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Immatriculation *</label>
                      <input
                        required
                        value={form.immatriculation}
                        onChange={(e) => setForm({ ...form, immatriculation: e.target.value.toUpperCase() })}
                        placeholder="ex. DK-5512-AB"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono font-bold uppercase focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Marque & Modèle</label>
                      <input
                        value={form.marque_modele}
                        onChange={(e) => setForm({ ...form, marque_modele: e.target.value })}
                        placeholder="ex. Toyota Hilux / Peugeot 308"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Kilométrage Compteur</label>
                      <input
                        type="number"
                        value={form.kilometrage}
                        onChange={(e) => setForm({ ...form, kilometrage: e.target.value })}
                        placeholder="ex. 125000"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Type de véhicule</label>
                      <select
                        value={form.type_vehicule}
                        onChange={(e) => setForm({ ...form, type_vehicule: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      >
                        {TYPES_VEHICULE.map((t) => (
                          <option key={t.code} value={t.code}>{t.libelle}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Client & Affectation Baie/Technicien */}
                <div className="space-y-2 pt-3 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>👤</span> 2. Client & Technicien
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={form.client_nom}
                      onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                      placeholder="Nom du client (optionnel)"
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    />
                    <input
                      value={form.client_tel}
                      onChange={(e) => setForm({ ...form, client_tel: e.target.value })}
                      placeholder="Téléphone (WhatsApp)"
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    />
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Pont / Baie de travail</label>
                      <select
                        value={form.baie_id}
                        onChange={(e) => setForm({ ...form, baie_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">— Non attribuée</option>
                        {bays.map((b) => (
                          <option key={b.code_baie} value={b.code_baie}>{b.nom_baie || b.code_baie}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Technicien en charge</label>
                      <input
                        value={form.technicien}
                        onChange={(e) => setForm({ ...form, technicien: e.target.value })}
                        placeholder="Ousmane Sow"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Choix des prestations d'entretien */}
                <div className="space-y-2.5 pt-3 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🛠️</span> 3. Prestations d'Entretien & Forfaits ({form.selectedServices.length} sélectionnée(s))
                    </h3>
                    <span className="text-xs font-black text-amber-700">{F(montantServices)} FCFA</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                    {services.map((srv) => (
                      <EntretienServiceCard
                        key={srv.id}
                        service={srv}
                        selected={form.selectedServices.some((s) => s.id === srv.id)}
                        onToggle={toggleService}
                      />
                    ))}
                  </div>
                </div>

                {/* 4. Lubrifiants & Consommables */}
                <div className="space-y-2.5 pt-3 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🧴</span> 4. Huiles, Lubrifiants & Pièces
                    </h3>
                    <span className="text-xs font-black text-blue-700">{F(montantProduits)} FCFA</span>
                  </div>

                  {/* Sélecteur d'ajout */}
                  <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3 flex flex-wrap gap-2 items-center">
                    <select
                      value={selProdCode}
                      onChange={(e) => setSelProdCode(e.target.value)}
                      className="flex-1 min-w-[200px] border border-gray-300 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Sélectionner un lubrifiant ou une pièce...</option>
                      {catalogueProduits.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.designation} — {F(p.prix_vente)} F ({p.categorie})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={selProdQte}
                      onChange={(e) => setSelProdQte(e.target.value)}
                      className="w-16 border border-gray-300 rounded-xl px-2 py-2 text-center text-xs sm:text-sm bg-white"
                      title="Quantité"
                    />
                    <button
                      type="button"
                      onClick={handleAddProduct}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-sm transition-colors"
                    >
                      + Ajouter
                    </button>
                  </div>

                  {/* Liste des produits ajoutés */}
                  {form.selectedProduits.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-2.5 space-y-1.5 divide-y divide-gray-200">
                      {form.selectedProduits.map((p) => (
                        <div key={p.code} className="flex justify-between items-center pt-1.5 first:pt-0 text-xs sm:text-sm">
                          <div>
                            <span className="font-bold text-gray-800">{p.designation}</span>
                            <span className="text-gray-500 text-xs block">
                              {p.quantite} × {F(p.prix_unitaire)} F
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-blue-700">{F(p.total)} F</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(p.code)}
                              className="text-red-500 hover:text-red-700 text-xs font-bold px-1"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Règlement & Remise */}
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Mode de règlement</label>
                      <select
                        value={form.mode_paiement}
                        onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      >
                        {MODES_PAIEMENT.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Code Promo / Remise</label>
                      <div className="flex gap-2">
                        <input
                          value={form.code_promo}
                          onChange={(e) => {
                            setForm({ ...form, code_promo: e.target.value.toUpperCase(), reduction_promo: 0 });
                            setPromoMsg(null);
                          }}
                          placeholder="Code promo"
                          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm uppercase focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          className="px-3 py-2 bg-amber-100 text-amber-800 rounded-xl text-xs font-bold hover:bg-amber-200"
                        >
                          Appliquer
                        </button>
                      </div>
                      {promoMsg && (
                        <p className={`text-xs mt-1 ${promoMsg.ok ? "text-green-600" : "text-red-500"}`}>
                          {promoMsg.txt}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Notes / Diagnostic préalable</label>
                    <input
                      value={form.notes_diagnostic}
                      onChange={(e) => setForm({ ...form, notes_diagnostic: e.target.value })}
                      placeholder="ex. Plaquettes usées à 80%, bruit à l'avant gauche, vidange effectuée..."
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs sm:text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Récap total */}
                  <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-2 border-amber-300 rounded-2xl p-4">
                    <div className="space-y-1 text-xs sm:text-sm">
                      <div className="flex justify-between text-gray-700">
                        <span>Total Main d'œuvre</span>
                        <span className="font-semibold">{F(montantServices)} F</span>
                      </div>
                      <div className="flex justify-between text-gray-700">
                        <span>Total Lubrifiants & Pièces</span>
                        <span className="font-semibold">{F(montantProduits)} F</span>
                      </div>
                      {form.reduction_promo > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Remise Promo</span>
                          <span>-{F(form.reduction_promo)} F</span>
                        </div>
                      )}
                      <div className="border-t border-amber-300/80 pt-1.5 flex justify-between items-baseline text-lg sm:text-xl font-black text-amber-900">
                        <span>TOTAL À REGLER</span>
                        <span className="text-amber-700">{F(montantTotal)} FCFA</span>
                      </div>
                      {pointsGagnes > 0 && (
                        <div className="text-[11px] text-amber-800 font-bold text-center pt-1">
                          ⭐ +{pointsGagnes} points fidélité crédités
                        </div>
                      )}
                    </div>
                  </div>

                  {err && (
                    <p className="bg-red-50 border border-red-200 text-red-600 text-xs sm:text-sm p-3 rounded-xl font-medium">
                      ⚠️ {err}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white font-black py-3.5 rounded-2xl shadow-lg transition-all text-sm sm:text-base disabled:opacity-50"
                  >
                    {saving ? "⏳ Enregistrement de l'intervention..." : `✓ Valider l'Ordre de Réparation — ${F(montantTotal)} FCFA`}
                  </button>
                </div>
              </form>
            </div>

            {/* Colonne Récapitulatif du jour (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                    📋 Interventions du {date} ({prestations.length})
                  </h3>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    {F(kpis.ca)} F
                  </span>
                </div>

                {loading ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Chargement des ordres...</div>
                ) : prestations.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    Aucune intervention enregistrée pour cette date.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                    {prestations.map((p) => (
                      <div key={p.id} className="p-4 hover:bg-gray-50 transition-colors space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono font-black text-gray-900 text-sm tracking-wide">
                              {p.immatriculation}
                            </span>
                            <span className="text-xs text-gray-500 block">
                              {p.marque_modele || p.type_vehicule} {p.heure ? `à ${p.heure}` : ""}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-amber-700 text-sm sm:text-base block">
                              {F(p.montant_total)} F
                            </span>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {p.mode_paiement}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(p.services || []).map((s, idx) => (
                            <span key={idx} className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                              🔧 {s.service_nom || s.nom}
                            </span>
                          ))}
                          {(p.produits || []).map((pr, idx) => (
                            <span key={idx} className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">
                              🧴 {pr.designation}
                            </span>
                          ))}
                        </div>

                        <div className="flex justify-between items-center text-xs text-gray-500 pt-1">
                          <span>👨‍🔧 {p.technicien || "Ousmane Sow"}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setTicket(p)}
                              className="text-amber-600 hover:text-amber-800 font-bold"
                            >
                              📄 Fiche
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="text-red-400 hover:text-red-600"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ ONGLET SUIVI DES PONTS & KANBAN ATELIER ═══════════════════════ */}
        {tab === "queue" && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
              <div>
                <h2 className="font-black text-gray-900 text-lg sm:text-xl flex items-center gap-2">
                  <span>📋</span> Flux d'Atelier & Véhicules sur les Ponts
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Suivez l'avancement en temps réel, de la prise en charge à la restitution des clés.
                </p>
              </div>
              <button
                onClick={load}
                className="text-xs sm:text-sm bg-amber-50 text-amber-800 font-bold px-3 py-1.5 rounded-xl hover:bg-amber-100"
              >
                🔄 Actualiser l'atelier
              </button>
            </div>

            <EntretienQueue commandes={prestations} onRefresh={load} />
          </div>
        )}

        {/* ══ ONGLET VENTE COMPTOIR LUBRIFIANTS & PIÈCES ════════════════════ */}
        {tab === "comptoir" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Catalogue produits (8 cols) */}
            <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-200 p-5 space-y-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <span>🧴</span> Catalogue Lubrifiants & Consommables en Stock
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cliquez sur un produit pour l'ajouter au panier de vente au comptoir.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-1">
                {catalogueProduits.map((prod) => (
                  <div
                    key={prod.code}
                    onClick={() => addComptoirItem(prod)}
                    className="border border-gray-200 rounded-2xl p-3.5 hover:border-amber-500 hover:shadow-md cursor-pointer transition-all bg-white flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-2xl">
                          {prod.categorie === "LUBRIFIANT" ? "🛢️" : "🧴"}
                        </span>
                        <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                          {prod.categorie}
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm mt-1.5 line-clamp-2">
                        {prod.designation}
                      </h4>
                    </div>
                    <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-baseline">
                      <span className="text-xs text-gray-400 font-mono">{prod.code}</span>
                      <span className="font-black text-amber-700 text-base">
                        {F(prod.prix_vente)} F
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panier comptoir (4 cols) */}
            <div className="lg:col-span-4 bg-white rounded-3xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-gray-200 pb-3">
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <span>🛒</span> Panier Vente Comptoir
                  </h3>
                  <span className="text-xs text-gray-500">{comptoirCart.length} article(s)</span>
                </div>

                <input
                  value={comptoirClient}
                  onChange={(e) => setComptoirClient(e.target.value)}
                  placeholder="Nom client comptoir (optionnel)"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none"
                />

                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {comptoirCart.length === 0 ? (
                    <p className="text-xs text-gray-400 py-6 text-center">
                      Aucun article dans le panier.<br />Cliquez sur un produit à gauche.
                    </p>
                  ) : (
                    comptoirCart.map((item) => (
                      <div key={item.code} className="py-2 flex justify-between items-center text-xs sm:text-sm">
                        <div className="pr-2">
                          <span className="font-bold text-gray-900 block truncate max-w-[160px]">{item.designation}</span>
                          <span className="text-gray-500 text-[11px]">{item.quantite} × {F(item.prix_unitaire)} F</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-amber-700">{F(item.total)} F</span>
                          <button
                            onClick={() => removeComptoirItem(item.code)}
                            className="text-red-500 font-bold px-1 hover:text-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Règlement</label>
                  <select
                    value={comptoirPaiement}
                    onChange={(e) => setComptoirPaiement(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none"
                  >
                    {MODES_PAIEMENT.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-3 mt-4">
                <div className="flex justify-between items-baseline text-lg font-black text-gray-900">
                  <span>TOTAL COMPTOIR</span>
                  <span className="text-amber-700 text-xl">{F(totalComptoir)} FCFA</span>
                </div>
                <button
                  onClick={handleValiderComptoir}
                  disabled={comptoirSaving || comptoirCart.length === 0}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl shadow-md transition-all disabled:opacity-40"
                >
                  {comptoirSaving ? "Encaissement..." : `✓ Encaisser ${F(totalComptoir)} FCFA`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ONGLET CONFIGURATION ATELIER (GÉRANT / ADMIN) ═════════════════ */}
        {tab === "config" && canConfig && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 text-lg sm:text-xl mb-4 flex items-center gap-2">
              <span>⚙️</span> Configuration de la Baie d'Entretien
            </h2>
            <EntretienConfigPanel
              stationId={stationId}
              services={services}
              bays={bays}
              onRefresh={load}
            />
          </div>
        )}

      </div>

      {/* ── MODAL TICKET & ORDRE DE RÉPARATION ──────────────────────────── */}
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
