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
import { peutAgirProfil } from "../lib/permissions";
import { SEED_WASH_TYPES_VEHICULE, SEED_WASH_PACK_INCLUSIONS } from "../lib/seed";
import WashPackCard from "../components/lavage/WashPackCard";
import WashQueue from "../components/lavage/WashQueue";
import WashConfigPanel from "../components/lavage/WashConfigPanel";
import WashTicket from "../components/lavage/WashTicket";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");
const TODAY = () => new Date().toISOString().slice(0, 10);
const MODES_PAIEMENT = ["ESPECES", "WAVE", "OM", "TPE", "CREDIT", "BON_LAVAGE"];

// Calcul points fidélité : 1 pt par tranche 500 FCFA
const calcPoints = (montant) => Math.floor(Number(montant || 0) / 500);

export default function Lavage() {
  const { profil } = useAuth();
  const stationId = profil?.station_id;
  const stationNom = profil?.station_nom || "Star Energy";
  const canConfig = peutAgirProfil(profil, "lavage", "configurer");
  const canDelete = peutAgirProfil(profil, "lavage", "annuler");

  // ─── Onglet actif ────────────────────────────────────────────────────────
  const [tab, setTab] = useState("caisse");

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
      const [cmds, pks, svcs, bys, pm, prs, bns, prc] = await Promise.all([
        listCommandesLavage(stationId, date).catch(() => []),
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
  }, [stationId, date]);

  useEffect(() => { load(); }, [load]);

  // ─── KPIs jour ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ca = commandes.reduce((s, c) => s + Number(c.montant_total || c.montant || 0), 0);
    const nb = commandes.length;
    const livres = commandes.filter((c) => c.statut === "LIVRE").length;
    const enCours = commandes.filter((c) => c.statut && c.statut !== "LIVRE" && c.statut !== "EN_ATTENTE").length;
    return { ca, nb, livres, enCours };
  }, [commandes]);

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
  };
  const [form, setForm] = useState(initForm);
  const [promoMsg, setPromoMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState(null);

  // Tarif pack sélectionné
  const tarifPack = form.pack_id && form.type_vehicule
    ? (priceMap[`${form.pack_id}_${form.type_vehicule}`] || 0)
    : 0;

  // Addons sélectionnés
  const addonServices = services.filter((s) => s.categorie === "ADDON" && s.actif !== false);
  const montantAddons = form.addons.reduce((s, a) => s + (a.prix_unitaire || 0), 0);
  const montantTotal = Math.max(0, tarifPack + montantAddons - form.reduction_promo);
  const pointsGagnes = calcPoints(montantTotal);

  // Inclusions du pack sélectionné
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
        type_vehicule: form.type_vehicule,
        immatriculation: form.immatriculation,
        pack_id: form.pack_id,
        pack_nom: selectedPack?.nom || "",
        addons: form.addons,
        montant_pack: tarifPack,
        montant_addons: montantAddons,
        reduction_promo: form.reduction_promo,
        code_promo: form.code_promo,
        mode_paiement: form.mode_paiement,
        client_nom: form.client_nom,
        client_tel: form.client_tel,
        baie_id: form.baie_id || null,
        bon_lavage_id: form.bon_lavage_id || null,
        membre_fidelite_id: form.membre_fidelite_id || null,
        points_gagnes: pointsGagnes,
        statut: "EN_ATTENTE",
        heure: new Date().toTimeString().slice(0, 5),
      });
      if (res.ok) {
        setTicket({ ...res.commande, pack_nom: selectedPack?.nom, heure: new Date().toTimeString().slice(0, 5), points_gagnes: pointsGagnes });
        setForm(initForm);
        setPromoMsg(null);
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
    { id: "caisse",   label: "🧾 Caisse",         always: true },
    { id: "queue",    label: "📋 File d'attente",  always: true },
    { id: "config",   label: "⚙️ Configuration",   always: false, cond: canConfig },
  ].filter((t) => t.always || t.cond);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#102A43] via-[#0B4EA2] to-[#0284C7] px-4 py-5 text-white border-b-2 border-amber-400">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <div className="h-6 px-2 bg-white rounded-md flex items-center justify-center">
              <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-3.5 w-auto object-contain" />
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500 text-white uppercase tracking-wider">
              DAMEL CAR WASH SERVICES
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-black/40 text-amber-300 px-2 py-0.5 rounded-full border border-purple-400/40">
              <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3 h-3 object-contain rounded-xs" />
              <span>Station {stationNom}</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold">🚿 Centre de Lavage Haute Pression</h1>
          <p className="text-blue-100 text-sm mt-0.5">Services de lavage automobile Damel Energy · {date}</p>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            {[
              { label: "CA du jour", val: `${F(kpis.ca)} F`, icon: "💰" },
              { label: "Lavages", val: kpis.nb, icon: "🚗" },
              { label: "Livrés", val: kpis.livres, icon: "✅" },
              { label: "En cours", val: kpis.enCours, icon: "⏳" },
            ].map((k) => (
              <div key={k.label} className="bg-white/15 rounded-xl p-2.5 sm:p-3 text-center backdrop-blur-sm">
                <div className="text-lg sm:text-xl">{k.icon}</div>
                <div className="font-bold text-base sm:text-lg leading-tight truncate">{k.val}</div>
                <div className="text-blue-100 sm:text-blue-200 text-[11px] sm:text-xs">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Date + Onglets */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${tab === t.id ? "bg-white text-blue-700 shadow" : "text-blue-100 hover:bg-white/20"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-white/20 border border-white/30 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:bg-white/30 self-end sm:self-auto" />
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ══ ONGLET CAISSE ══════════════════════════════════════════════════ */}
        {tab === "caisse" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Formulaire */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 text-base">Nouvelle prestation</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-5">

                {/* Client */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">👤 Identification client</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.client_nom} onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                      placeholder="Nom client (optionnel)"
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                    <input value={form.client_tel} onChange={(e) => setForm({ ...form, client_tel: e.target.value })}
                      placeholder="Téléphone (optionnel)"
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                  </div>
                </div>

                {/* Véhicule */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🚗 Véhicule</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <select value={form.type_vehicule}
                      onChange={(e) => setForm({ ...form, type_vehicule: e.target.value })}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                      {SEED_WASH_TYPES_VEHICULE.map((t) => (
                        <option key={t.code} value={t.code}>{t.libelle}</option>
                      ))}
                    </select>
                    <input value={form.immatriculation}
                      onChange={(e) => setForm({ ...form, immatriculation: e.target.value.toUpperCase() })}
                      placeholder="Immatriculation"
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none uppercase" />
                  </div>
                </div>

                {/* Sélection Pack */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">📦 Sélection du pack</h3>
                  {packs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
                      Aucun pack configuré. <br />{canConfig && <span>Configurez des packs dans l'onglet ⚙️.</span>}
                    </p>
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
                </div>

                {/* Add-ons */}
                {addonServices.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">➕ Options complémentaires</h3>
                    <div className="space-y-2">
                      {addonServices.map((svc) => {
                        const checked = form.addons.some((a) => a.service_id === svc.id);
                        return (
                          <label key={svc.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${checked ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleAddon(svc)} className="w-4 h-4 accent-blue-600" />
                            <span className="flex-1 text-sm text-gray-800">{svc.nom}</span>
                            <span className="text-sm font-semibold text-blue-700">+{F(svc.prix_unitaire)} F</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Baie + Paiement */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">🅱️ Baie</label>
                    <select value={form.baie_id} onChange={(e) => setForm({ ...form, baie_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                      <option value="">— Non attribuée</option>
                      {bays.map((b) => <option key={b.id} value={b.code_baie}>{b.nom_baie || b.code_baie}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">💳 Paiement</label>
                    <select value={form.mode_paiement} onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                      {MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Code promo */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">🏷️ Code promo</label>
                  <div className="flex gap-2">
                    <input value={form.code_promo}
                      onChange={(e) => { setForm({ ...form, code_promo: e.target.value.toUpperCase(), reduction_promo: 0 }); setPromoMsg(null); }}
                      placeholder="Code promo"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none uppercase" />
                    <button type="button" onClick={handleApplyPromo}
                      className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-200 transition-colors">
                      Appliquer
                    </button>
                  </div>
                  {promoMsg && (
                    <p className={`text-xs mt-1 ${promoMsg.ok ? "text-green-600" : "text-red-500"}`}>{promoMsg.txt}</p>
                  )}
                </div>

                {/* Récap total */}
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-100">
                  <div className="space-y-1 text-sm">
                    {form.pack_id && <div className="flex justify-between"><span className="text-gray-600">Pack</span><span className="font-semibold">{F(tarifPack)} F</span></div>}
                    {montantAddons > 0 && <div className="flex justify-between"><span className="text-gray-600">Options</span><span className="font-semibold">+{F(montantAddons)} F</span></div>}
                    {form.reduction_promo > 0 && <div className="flex justify-between text-green-600"><span>Réduction promo</span><span>-{F(form.reduction_promo)} F</span></div>}
                    <div className="border-t border-blue-200 pt-1 mt-1 flex justify-between text-lg font-bold text-blue-700">
                      <span>TOTAL</span><span>{F(montantTotal)} FCFA</span>
                    </div>
                    {pointsGagnes > 0 && <div className="text-xs text-yellow-600 text-center">⭐ +{pointsGagnes} points fidélité</div>}
                  </div>
                </div>

                {err && <p className="text-red-500 text-sm bg-red-50 rounded-lg p-2">{err}</p>}

                <button type="submit" disabled={saving || !form.pack_id}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold py-3 rounded-xl hover:from-blue-700 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base">
                  {saving ? "⏳ Enregistrement..." : `✓ Enregistrer — ${F(montantTotal)} FCFA`}
                </button>
              </form>
            </div>

            {/* Tableau du jour */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-bold text-gray-800 text-base">📋 Prestations du {date}</h2>
                <span className="text-sm text-gray-500">{commandes.length} lavage{commandes.length > 1 ? "s" : ""}</span>
              </div>
              {loading ? (
                <div className="p-8 text-center text-gray-400">Chargement...</div>
              ) : commandes.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Aucune prestation enregistrée.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="py-3 px-4 text-left">Heure</th>
                        <th className="py-3 px-4 text-left">Pack / Type</th>
                        <th className="py-3 px-4 text-left">Véhicule</th>
                        <th className="py-3 px-4 text-left">Paiement</th>
                        <th className="py-3 px-4 text-right">Montant</th>
                        {canDelete && <th className="py-3 px-4"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {commandes.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-gray-500 text-xs">
                            {c.created_at ? c.created_at.slice(11, 16) : "--:--"}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-800">{c.pack_nom || c.type_prestation || "Lavage"}</div>
                            <div className="text-xs text-gray-500">{c.type_vehicule}</div>
                          </td>
                          <td className="py-3 px-4 text-gray-700 font-mono text-xs">{c.immatriculation || c.client_nom || "—"}</td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.mode_paiement === "ESPECES" ? "bg-green-100 text-green-700" : c.mode_paiement === "CREDIT" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                              {c.mode_paiement}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-gray-800">
                            {F(c.montant_total || c.montant)} F
                          </td>
                          {canDelete && (
                            <td className="py-3 px-4 text-right">
                              <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={canDelete ? 4 : 4} className="py-3 px-4 text-sm font-semibold text-gray-600">Total du jour</td>
                        <td className="py-3 px-4 text-right font-bold text-blue-700 text-base">{F(kpis.ca)} F</td>
                        {canDelete && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ONGLET FILE D'ATTENTE ══════════════════════════════════════════ */}
        {tab === "queue" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-gray-800 text-lg">📋 File d'attente — {date}</h2>
              <button onClick={load} className="text-sm text-blue-600 hover:text-blue-800 font-medium">🔄 Actualiser</button>
            </div>
            {loading ? (
              <div className="text-center text-gray-400 py-8">Chargement...</div>
            ) : (
              <WashQueue commandes={commandes} onRefresh={load} />
            )}
          </div>
        )}

        {/* ══ ONGLET CONFIG (gérant/admin seulement) ════════════════════════ */}
        {tab === "config" && canConfig && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-800 text-lg mb-6">⚙️ Configuration du Centre de Lavage</h2>
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
          </div>
        )}
      </div>

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
