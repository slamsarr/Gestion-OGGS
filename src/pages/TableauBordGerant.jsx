import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listDescentes,
  listTousBonsStation,
  attribuerBonClient,
  listPrestationsLavage,
  listVentesBoutique,
  listJaugesCuves,
  deletePrestationLavage,
  deleteVenteBoutique,
  listCollaborateurs,
  toggleCollaborateurActif,
  resetCollaborateurPassword,
  stocksTheoriques,
  listPrestationsEntretien,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { ROLE_LABELS } from "../lib/permissions";
import { Section, Row, Num, Loading } from "../components/ui";
import CollaborateurModal from "../components/CollaborateurModal";
import { construireHistoire } from "../lib/histoireQuotidienne";
import HistoireQuotidienne from "../components/HistoireQuotidienne";

export default function TableauBordGerant() {
  const { profil } = useAuth();
  const navigate = useNavigate();
  const stationId = profil?.station_id || "st-hann";
  const stationCode = profil?.stations?.code || stationId.replace("st-", "").toUpperCase();
  const stationNom = profil?.stations?.nom || `Station ${stationCode}`;

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [activeTab, setActiveTab] = useState("descentes"); // descentes | bons | services | cuves | equipe
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok");

  // Données de la station
  const [descentes, setDescentes] = useState([]);
  const [tousBons, setTousBons] = useState([]);
  const [lavages, setLavages] = useState([]);
  const [ventesBoutique, setVentesBoutique] = useState([]);
  const [jauges, setJauges] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [stocksStation, setStocksStation] = useState([]);
  const [entretiensJour, setEntretiensJour] = useState([]);
  const [lavagesV, setLavagesV] = useState([]);
  const [ventesBoutiqueV, setVentesBoutiqueV] = useState([]);
  const [afficherHistoire, setAfficherHistoire] = useState(true);
  const [histoire, setHistoire] = useState(null);

  // Filtre Bons
  const [filtreBon, setFiltreBon] = useState("TOUS"); // TOUS | IMPAYES | REGLES

  // Modal Attribution Bon
  const [attribModal, setAttribModal] = useState(null);
  const [attribClientCode, setAttribClientCode] = useState("");

  const flash = (text, type = "ok") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  };

  const loadStationData = async () => {
    try {
      const hier = new Date(date); hier.setDate(hier.getDate() - 1);
      const hierISO = hier.toISOString().slice(0, 10);
      const septJours = new Date(date); septJours.setDate(septJours.getDate() - 7);
      const septJoursISO = septJours.toISOString().slice(0, 10);
      const [r, dList, bList, lList, vList, jList, cList, stocks, ent,
             lHier, vHier, lTous, vTous, descTous, descHier] = await Promise.all([
        loadReferentiel().catch(() => null),
        listDescentes(stationId, date).catch(() => []),
        listTousBonsStation(stationId).catch(() => []),
        listPrestationsLavage(stationId, date).catch(() => []),
        listVentesBoutique(stationId, date).catch(() => []),
        listJaugesCuves(stationId, date).catch(() => []),
        listCollaborateurs(stationId).catch(() => []),
        stocksTheoriques(null).catch(() => []),
        listPrestationsEntretien(stationId, date).catch(() => []),
        listPrestationsLavage(stationId, hierISO).catch(() => []),
        listVentesBoutique(stationId, hierISO).catch(() => []),
        listPrestationsLavage(stationId, undefined).then(tous => tous.filter(x => {
          const d = x.date; return d && d >= septJoursISO && d <= date;
        })).catch(() => []),
        listVentesBoutique(stationId, undefined).then(tous => tous.filter(x => {
          const d = x.date; return d && d >= septJoursISO && d <= date;
        })).catch(() => []),
        listDescentes(stationId, undefined).then(tous => tous.filter(x => {
          const d = x.date; return d && d >= septJoursISO && d <= date;
        })).catch(() => []),
        listDescentes(stationId, hierISO).catch(() => []),
      ]);
      setRef(r);
      setDescentes(dList || []);
      setTousBons(bList || []);
      setLavages(lList || []);
      setVentesBoutique(vList || []);
      setJauges(jList || []);
      setEquipe(cList || []);
      setStocksStation((stocks || []).filter(s => s.station === stationCode || s.station === stationId));
      setEntretiensJour(ent || []);
      setLavagesV(lHier || []);
      setVentesBoutiqueV(vHier || []);

      // ── Construire l'histoire quotidienne pour le gérant ─────────
      const caCarbV = descHier.reduce((s, x) => s + (n(x.total_carburant) || n(x.montant_theorique) || 0), 0);
      const caCarbM7 = descTous.reduce((s, x) => s + (n(x.total_carburant) || n(x.montant_theorique) || 0), 0) / Math.max(1, [...new Set(descTous.map(x => x.date))].length);
      const caLavV = lHier.reduce((s, x) => s + n(x.montant_total), 0);
      const caLavM7 = lTous.reduce((s, x) => s + n(x.montant_total), 0) / Math.max(1, [...new Set(lTous.map(x => x.date))].length);
      const caBoutV = vHier.reduce((s, x) => s + n(x.total_montant), 0);
      const caBoutM7 = vTous.reduce((s, x) => s + n(x.total_montant), 0) / Math.max(1, [...new Set(vTous.map(x => x.date))].length);
      const caEnt = ent.reduce((s, e) => s + n(e.montant_total || (n(e.montant_services) + n(e.montant_produits)) || 0), 0);
      const volCarb = dList.reduce((s, x) => s + (n(x.total_volume) || n(x.volume_vendu) || 0), 0);

      const hist = construireHistoire({
        dateISO: date,
        stationNom: stationNom,
        stationCode,
        caCarburantJ: totalCarburantJour,
        caLavageJ: totalLavageJour,
        caBoutiqueJ: totalBoutiqueJour,
        caEntretienJ: caEnt,
        volumeCarburantJ: volCarb,
        nbLavagesJ: lList.length,
        nbVentesBoutiqueJ: vList.length,
        nbInterventionsEntretienJ: ent.length,
        descentesJ: dList,
        caCarburantV: caCarbV,
        caLavageV: caLavV,
        caBoutiqueV: caBoutV,
        caCarburantM7: caCarbM7,
        caLavageM7: caLavM7,
        caBoutiqueM7: caBoutM7,
        stocks: stocksStation,
        ecartsDescente: dList.map(x => ({ ecart: n(x.ecart), pompiste_nom: x.pompiste_nom, pompiste_id: x.pompiste_id })),
        bonsImpayes,
        montantImpayes: totalResteBons,
        role: profil?.role,
        nomUtilisateur: profil?.nom_complet,
      });
      setHistoire(hist);

    } catch (err) {
      console.error("Erreur chargement données gérant:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStationData();
  }, [stationId, date]);

  // Totaux consolidés du jour
  const totalCarburantJour = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.total_carburant) || n(d.montant_theorique) || 0), 0);
  }, [descentes]);

  const totalLitresCarburant = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.total_volume) || n(d.volume_vendu) || 0), 0);
  }, [descentes]);

  const totalLubrifiantsJour = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.total_lubrifiants) || 0), 0);
  }, [descentes]);

  const totalLavageJour = useMemo(() => {
    return lavages.reduce((acc, l) => acc + (n(l.montant_total) || 0), 0);
  }, [lavages]);

  const totalBoutiqueJour = useMemo(() => {
    return ventesBoutique.reduce((acc, v) => acc + (n(v.total_montant) || 0), 0);
  }, [ventesBoutique]);

  const totalRecetteStation = totalCarburantJour + totalLubrifiantsJour + totalLavageJour + totalBoutiqueJour;

  const totalEcartDescentes = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.ecart) || 0), 0);
  }, [descentes]);

  // Statistiques Bons
  const bonsImpayes = useMemo(() => tousBons.filter((b) => n(b.reste_a_payer ?? b.montant) > 0), [tousBons]);
  const totalMontantBons = useMemo(() => tousBons.reduce((acc, b) => acc + n(b.montant), 0), [tousBons]);
  const totalResteBons = useMemo(() => tousBons.reduce((acc, b) => acc + n(b.reste_a_payer ?? b.montant), 0), [tousBons]);
  const totalLitresBons = useMemo(() => tousBons.reduce((acc, b) => acc + n(b.volume_litres || 0), 0), [tousBons]);

  const bonsFiltres = useMemo(() => {
    if (filtreBon === "IMPAYES") return tousBons.filter((b) => n(b.reste_a_payer ?? b.montant) > 0);
    if (filtreBon === "REGLES") return tousBons.filter((b) => n(b.reste_a_payer ?? b.montant) === 0);
    return tousBons;
  }, [tousBons, filtreBon]);

  // Clients référentiel pour attribution
  const clientsList = useMemo(() => {
    return (ref?.clients_pro || []).map((c) => ({
      code: c.code,
      nom: c.nom_entreprise || c.code,
    }));
  }, [ref]);

  const handleOuvrirAttribModal = (bon) => {
    setAttribModal(bon);
    setAttribClientCode(bon.client_code && bon.client_code !== "DIVERS" ? bon.client_code : (clientsList[0]?.code || ""));
  };

  const handleConfirmerAttribution = async () => {
    if (!attribModal || !attribClientCode) return;
    const cl = clientsList.find((c) => c.code === attribClientCode);
    const res = await attribuerBonClient(attribModal.id, attribClientCode, cl?.nom || attribClientCode);
    if (res.ok) {
      flash(`Le bon ${attribModal.numero_bon} a été attribué avec succès à ${cl?.nom || attribClientCode}`);
      setAttribModal(null);
      loadStationData();
    } else {
      flash("Erreur lors de l'attribution du bon", "error");
    }
  };

  // Annulation directe par le gérant
  const handleAnnulerLavage = async (id) => {
    if (!confirm("Gérant : Confirmer l'annulation de cette prestation lavage ?")) return;
    await deletePrestationLavage(id);
    flash("Prestation de lavage annulée par le gérant");
    loadStationData();
  };

  const handleAnnulerVenteBoutique = async (id) => {
    if (!confirm("Gérant : Confirmer l'annulation de ce ticket boutique et la réintégration des articles en stock ?")) return;
    await deleteVenteBoutique(id);
    flash("Vente boutique annulée par le gérant et stock réintégré");
    loadStationData();
  };

  const handleToggleActifCollab = async (collab) => {
    const res = await toggleCollaborateurActif(collab.id);
    if (res.ok) {
      flash(`${collab.nom_complet} : compte ${res.actif ? "activé" : "suspendu"}`);
      setEquipe((prev) => prev.map((x) => x.id === collab.id ? { ...x, actif: res.actif } : x));
    } else {
      flash("Erreur lors de la modification du statut");
    }
  };

  const handleResetPassword = async (collab) => {
    if (!window.confirm(`Réinitialiser le mot de passe de ${collab.nom_complet} ?`)) return;
    const res = await resetCollaborateurPassword(collab.id);
    if (res.ok) {
      flash(`✓ Nouveau mot de passe pour ${collab.nom_complet} : ${res.password}`);
      setEquipe((prev) => prev.map((x) => x.id === collab.id ? { ...x, password: res.password } : x));
    } else {
      flash("Erreur réinitialisation mot de passe");
    }
  };

  const handleCollabCreated = (res) => {
    flash(`✓ Collaborateur ${res.identifiants.nom} créé avec succès !`);
    if (res.user) {
      setEquipe((prev) => [res.user, ...prev]);
    }
  };

  if (loading) return <Loading label="Chargement du poste de commande Gérant..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* ── BANDEAU COCKPIT GÉRANT ── */}
      <div className="bg-gradient-to-r from-[#102A43] via-[#0B4EA2] to-[#08336D] text-white rounded-2xl p-4 sm:p-5 shadow-lg border-2 border-amber-400">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-900/80">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <div className="h-6 px-2 bg-white rounded-md flex items-center justify-center">
                <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-3.5 w-auto object-contain" />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500 text-white uppercase tracking-wider">
                DAMEL STATION MANAGEMENT
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-black/40 text-amber-300 px-2 py-0.5 rounded-full border border-purple-400/40">
                <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3 h-3 object-contain rounded-xs" />
                <span>Réseau Star Energy</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏪</span>
              <div>
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>Poste de Commande — {stationNom}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 uppercase">
                    Gérant Site
                  </span>
                </h1>
                <p className="text-xs text-blue-200/90 font-medium">
                  Supervision en direct des descentes, des bons carburant, du lavage et de la boutique
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-purple-950/80 px-3 py-1.5 rounded-xl border border-purple-800 text-xs">
              <span className="text-gray-300 font-medium">Date :</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-white font-bold border-none outline-none cursor-pointer"
              />
            </div>
            <button
              onClick={() => loadStationData()}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
              title="Rafraîchir les données de la station"
            >
              🔄
            </button>
            <button
              type="button"
              onClick={() => navigate(`/clients-pro?tab=factures`)}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-md flex items-center gap-1.5"
              title="Accéder à la facturation officielle OHADA"
            >
              <span>📄</span>
              <span className="hidden sm:inline">Facturation OHADA</span>
              <span className="sm:hidden">Factures</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/clients-pro?tab=factures`)}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-md flex items-center gap-1.5"
              title="Accéder à la facturation officielle OHADA"
            >
              <span>📄</span>
              <span className="hidden sm:inline">Facturation OHADA</span>
              <span className="sm:hidden">Factures</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("equipe")}
              className={`px-3 py-2 rounded-xl text-white text-xs font-bold transition-colors shadow-md flex items-center gap-1.5 ${
                activeTab === "equipe" ? "bg-purple-800 ring-2 ring-amber-400" : "bg-purple-700 hover:bg-purple-600"
              }`}
              title="Gérer l'équipe de la station et créer des comptes collaborateurs"
            >
              <span>👥</span>
              <span className="hidden sm:inline">Mon Équipe &amp; Comptes ({equipe.length})</span>
              <span className="sm:hidden">Équipe ({equipe.length})</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/rapport?station=${encodeURIComponent(stationCode)}&date=${encodeURIComponent(date)}`)}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wide transition-colors shadow-md"
              title="Clôture officielle et réconciliation comptable SYSCOHADA pour la Direction"
            >
              📋 Clôture Officielle
            </button>
          </div>
        </div>

        {/* ── KPIs OPÉRATIONNELS DU SITE ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3">
          <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
            <div className="text-[10px] font-bold text-amber-300 uppercase">Recette Globale Jour</div>
            <div className="text-lg font-black text-white tabular mt-0.5">{F(totalRecetteStation)} F</div>
            <div className="text-[10px] text-gray-300">Tous services réunis</div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
            <div className="text-[10px] font-bold text-blue-300 uppercase">Carburant Piste</div>
            <div className="text-lg font-black text-white tabular mt-0.5">{F(totalCarburantJour)} F</div>
            <div className="text-[10px] text-blue-200 font-semibold">{F(totalLitresCarburant)} Litres</div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
            <div className="text-[10px] font-bold text-rose-300 uppercase">Bons en Attente</div>
            <div className="text-lg font-black text-white tabular mt-0.5">{F(totalResteBons)} F</div>
            <div className="text-[10px] text-rose-200 font-bold">{bonsImpayes.length} bon(s) non réglé(s)</div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
            <div className="text-[10px] font-bold text-emerald-300 uppercase">Lavage & Shop</div>
            <div className="text-lg font-black text-white tabular mt-0.5">{F(totalLavageJour + totalBoutiqueJour)} F</div>
            <div className="text-[10px] text-gray-300">Lavage: {F(totalLavageJour)} · Shop: {F(totalBoutiqueJour)}</div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold text-amber-300 uppercase">Écart Caisse & Équipe</div>
            <div className={`text-lg font-black tabular mt-0.5 ${totalEcartDescentes >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {totalEcartDescentes >= 0 ? "+" : ""}{F(totalEcartDescentes)} F
            </div>
            <div className="text-[10px] text-gray-300">
              {descentes.length} quart(s) · {equipe.filter((e) => e.actif !== false).length} agent(s) actif(s)
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs font-bold shadow-xs flex items-center justify-between ${
            msgType === "error" ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"
          }`}
        >
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-base px-2">✕</button>
        </div>
      )}

      {/* ── HUB HISTOIRE QUOTIDIENNE GÉRANT 📰 */}
      {afficherHistoire && histoire && (
        <HistoireQuotidienne
          histoire={histoire}
          onFermer={() => setAfficherHistoire(false)}
        />
      )}
      {!afficherHistoire && histoire && (
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📰</span>
            <div>
              <div className="font-black text-indigo-900 text-sm">Briefing 1 minute — {stationNom}</div>
              <div className="text-xs text-slate-500">
                {histoire.nbHistoires} slides · {histoire.nbAlertes || 0} point(s) d'attention
              </div>
            </div>
          </div>
          <button
            onClick={() => setAfficherHistoire(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            🎬 Voir le briefing
          </button>
        </div>
      )}

      {/* ── ONGLETS DU POSTE DE COMMANDE GÉRANT ── */}
      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: T.line }}>
        <button
          onClick={() => setActiveTab("descentes")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
            activeTab === "descentes"
              ? "bg-[#431454] text-white shadow-md ring-2 ring-amber-400"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>⛽ Descentes Pompistes ({descentes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("bons")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
            activeTab === "bons"
              ? "bg-[#431454] text-white shadow-md ring-2 ring-amber-400"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>🎫 Tous les Bons de Carburant ({tousBons.length})</span>
          {bonsImpayes.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
              {bonsImpayes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("services")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
            activeTab === "services"
              ? "bg-[#431454] text-white shadow-md ring-2 ring-amber-400"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>🚿 Lavage & 🛒 Boutique ({lavages.length + ventesBoutique.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("cuves")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
            activeTab === "cuves"
              ? "bg-[#431454] text-white shadow-md ring-2 ring-amber-400"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>🛢️ Cuves & Jauges ({jauges.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("equipe")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
            activeTab === "equipe"
              ? "bg-[#431454] text-white shadow-md ring-2 ring-amber-400"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>👥 Mon Équipe ({equipe.length})</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate("/bilan-site")}
            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span>📑 Clôturer le Bilan du Site</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1 : DESCENTES POMPISTES (AVEC DROIT DE CORRECTION GÉRANT) ── */}
      {activeTab === "descentes" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              Contrôle des Descentes Pompistes du {fmtDate(date)}
            </h2>
            <button
              onClick={() => navigate("/descente")}
              className="px-3 py-1.5 rounded-lg bg-[#431454] hover:bg-[#56216C] text-white text-xs font-bold shadow-xs"
            >
              + Ouvrir / Saisir une descente
            </button>
          </div>

          {descentes.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-xs shadow-sm">
              <p className="font-bold text-gray-700 text-sm">Aucune descente pompiste enregistrée pour le {fmtDate(date)}.</p>
              <p className="text-gray-400 mt-1">Dès qu'un pompiste démarre ou soumet son quart, il apparaîtra ici avec son statut et ses écarts.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm divide-y" style={{ borderColor: T.line }}>
              {descentes.map((d) => {
                const isTerminee = d.statut === "TERMINEE";
                const ecartVal = n(d.ecart);
                return (
                  <div key={d.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-gray-50/70 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {d.numero || d.id?.slice(0, 8)}
                        </span>
                        <span className="font-black text-sm text-gray-900">{d.pompiste_nom || "Pompiste"}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isTerminee ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {isTerminee ? "✓ Soumise (Clôturée)" : "🟡 En cours"}
                        </span>
                        {d.corrige_par && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800" title={`Corrigée par ${d.corrige_par}`}>
                            ✏️ Corrigée par Gérant
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Carburant : <strong>{F(d.total_carburant || d.montant_theorique)} F</strong> ({F(d.total_volume || d.volume_vendu)} L)</span>
                        {n(d.total_lubrifiants) > 0 && <span>Lubrifiants : <strong>{F(d.total_lubrifiants)} F</strong></span>}
                        {Array.isArray(d.bons) && d.bons.length > 0 && (
                          <span className="text-rose-700 font-semibold">
                            Bons : {d.bons.length} bon(s) ({F(d.total_bons || 0)} F)
                          </span>
                        )}
                        <span>Total Caisse : <strong>{F(d.total_caisse || d.montant_theorique)} F</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0">
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Écart Caisse</div>
                        <div className={`font-black text-sm tabular ${ecartVal >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {ecartVal >= 0 ? "+" : ""}{F(ecartVal)} FCFA
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Bouton Corriger réservé au Gérant */}
                        <button
                          onClick={() => navigate(`/descente?id=${encodeURIComponent(d.id)}`)}
                          className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
                          title="Le gérant peut corriger les index, les bons et les versements d'une descente soumise"
                        >
                          <span>✏️ Corriger (Gérant)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2 : TOUS LES BONS DE CARBURANT DU SITE ── */}
      {activeTab === "bons" && (
        <div className="space-y-3">
          {/* Synthèse Bons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 bg-white border rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-gray-500 uppercase">Total Bons Saisis</div>
              <div className="text-lg font-black text-gray-900 tabular mt-0.5">{tousBons.length} bon(s)</div>
              <div className="text-[11px] text-gray-500">{F(totalMontantBons)} FCFA</div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-blue-700 uppercase">Volume Carburant</div>
              <div className="text-lg font-black text-blue-900 tabular mt-0.5">{F(totalLitresBons)} L</div>
              <div className="text-[11px] text-blue-600">Total litres distribués</div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-rose-700 uppercase">Reste Dû (Dette)</div>
              <div className="text-lg font-black text-rose-800 tabular mt-0.5">{F(totalResteBons)} FCFA</div>
              <div className="text-[11px] text-rose-600">{bonsImpayes.length} bon(s) à encaisser</div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Total Déjà Réglé</div>
              <div className="text-lg font-black text-emerald-800 tabular mt-0.5">{F(totalMontantBons - totalResteBons)} FCFA</div>
              <div className="text-[11px] text-emerald-600">Encaissements validés</div>
            </div>
          </div>

          {/* Filtres & Accès Règlement */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500 font-bold mr-1">Filtrer :</span>
              <button
                onClick={() => setFiltreBon("TOUS")}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                  filtreBon === "TOUS" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Tous ({tousBons.length})
              </button>
              <button
                onClick={() => setFiltreBon("IMPAYES")}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                  filtreBon === "IMPAYES" ? "bg-rose-700 text-white" : "bg-rose-50 text-rose-800 hover:bg-rose-100"
                }`}
              >
                À Régler ({bonsImpayes.length})
              </button>
              <button
                onClick={() => setFiltreBon("REGLES")}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                  filtreBon === "REGLES" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                Soldés ({tousBons.length - bonsImpayes.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/clients-pro")}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <span>💳 Encaisser un Règlement Client</span>
              </button>
            </div>
          </div>

          {/* Table complète des Bons */}
          {bonsFiltres.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-xs shadow-sm">
              <p className="font-bold text-gray-700 text-sm">Aucun bon de carburant dans cette vue.</p>
              <p className="text-gray-400 mt-1">Les bons saisis par les pompistes lors des descentes de caisse apparaissent automatiquement ici.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                  <tr>
                    <th className="py-2.5 px-3 text-left">Date & Pompiste</th>
                    <th className="py-2.5 px-3 text-left">N° Bon</th>
                    <th className="py-2.5 px-3 text-left">Client Assigné</th>
                    <th className="py-2.5 px-3 text-left">Véhicule / Obs</th>
                    <th className="py-2.5 px-3 text-right">Volume (Litres)</th>
                    <th className="py-2.5 px-3 text-right">Montant Total</th>
                    <th className="py-2.5 px-3 text-right">Reste Dû</th>
                    <th className="py-2.5 px-3 text-center">Statut</th>
                    <th className="py-2.5 px-3 text-center">Action Gérant</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {bonsFiltres.map((b) => {
                    const reste = n(b.reste_a_payer ?? b.montant);
                    const isSolde = reste <= 0;
                    const isPartiel = n(b.montant_regle) > 0 && reste > 0;
                    const isDivers = !b.client_code || b.client_code === "DIVERS";

                    return (
                      <tr key={b.id} className={isSolde ? "hover:bg-gray-50" : isPartiel ? "bg-amber-50/40 hover:bg-amber-50" : "bg-rose-50/30 hover:bg-rose-50/60"}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900 tabular">{fmtDate(b.date)}</div>
                          <div className="text-[10px] text-gray-400">{b.pompiste_nom || "Pompiste"}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                          {b.numero_bon || b.id?.slice(0, 8)}
                        </td>
                        <td className="py-2.5 px-3">
                          {isDivers ? (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold text-[10px] inline-flex items-center gap-1">
                              ⚠️ Non attribué (Divers)
                            </span>
                          ) : (
                            <div>
                              <div className="font-bold text-gray-900">{b.client_nom || b.client_code}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{b.client_code}</div>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700">
                          <div className="font-medium">{b.immatriculation || "Véhicule client"}</div>
                          {b.observations && <div className="text-[10px] text-gray-400 italic">{b.observations}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular font-bold text-blue-900">
                          {n(b.volume_litres) > 0 ? `${F(b.volume_litres)} L` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular font-bold text-gray-900">
                          {F(b.montant)} F
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular font-black ${reste > 0 ? "text-rose-700" : "text-gray-400"}`}>
                          {F(reste)} F
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSolde
                                ? "bg-emerald-100 text-emerald-800"
                                : isPartiel
                                ? "bg-amber-100 text-amber-900"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {isSolde ? "✓ Soldé" : isPartiel ? "🟡 Partiel" : "🔴 Impayé"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isDivers && (
                              <button
                                onClick={() => handleOuvrirAttribModal(b)}
                                className="px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-[10px]"
                                title="Attribuer ce bon à un client de la flotte"
                              >
                                🔗 Attribuer
                              </button>
                            )}
                            {reste > 0 && !isDivers && (
                              <button
                                onClick={() => navigate(`/clients-pro?client=${encodeURIComponent(b.client_code)}`)}
                                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px]"
                                title="Aller régler dans le compte client"
                              >
                                💳 Régler
                              </button>
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

      {/* ── TAB 3 : SERVICES AUXILIAIRES (LAVAGE & BOUTIQUE) ── */}
      {activeTab === "services" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lavage Automobile */}
          <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-3" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                  <span>🚿 Lavage Automobile</span>
                </h3>
                <p className="text-[11px] text-gray-500">Recettes et prestations du jour</p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-blue-900 tabular">{F(totalLavageJour)} FCFA</span>
                <div className="text-[10px] text-gray-400">{lavages.length} véhicule(s) lavé(s)</div>
              </div>
            </div>

            {lavages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Aucune prestation de lavage enregistrée aujourd'hui.</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: T.line }}>
                {lavages.map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-900">{l.libelle_vehicule || l.type_vehicule} — {l.immatriculation}</div>
                      <div className="text-[10px] text-gray-400">Agent: {l.agent} · Mode: {l.mode_paiement}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 tabular">{F(l.montant_total)} F</span>
                      <button
                        onClick={() => handleAnnulerLavage(l.id)}
                        className="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded text-xs hover:bg-rose-50"
                        title="Annuler cette prestation (Gérant)"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 text-right">
              <button
                onClick={() => navigate("/lavage")}
                className="text-xs font-bold text-purple-900 hover:underline"
              >
                Ouvrir la caisse Lavage →
              </button>
            </div>
          </div>

          {/* Boutique / Shop */}
          <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-3" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                  <span>🛒 Boutique & Shop Express</span>
                </h3>
                <p className="text-[11px] text-gray-500">Tickets de caisse et ventes du jour</p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-emerald-900 tabular">{F(totalBoutiqueJour)} FCFA</span>
                <div className="text-[10px] text-gray-400">{ventesBoutique.length} ticket(s) encaissé(s)</div>
              </div>
            </div>

            {ventesBoutique.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Aucune vente boutique enregistrée aujourd'hui.</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: T.line }}>
                {ventesBoutique.map((v) => (
                  <div key={v.id} className="py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-900">Ticket #{v.id?.slice(0, 8)} · {v.vendeur}</div>
                      <div className="text-[10px] text-gray-400">{v.lignes?.map((l) => `${l.quantite}x ${l.designation}`).join(", ")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 tabular">{F(v.total_montant)} F</span>
                      <button
                        onClick={() => handleAnnulerVenteBoutique(v.id)}
                        className="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded text-xs hover:bg-rose-50"
                        title="Annuler ce ticket et réintégrer les stocks (Gérant)"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 text-right">
              <button
                onClick={() => navigate("/boutique")}
                className="text-xs font-bold text-purple-900 hover:underline"
              >
                Ouvrir la caisse Boutique →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4 : CUVES & JAUGES ── */}
      {activeTab === "cuves" && (
        <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-4" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h3 className="font-bold text-sm text-gray-900">État Volumétrique & Jaugeages Physiques</h3>
              <p className="text-xs text-gray-500">Rapprochement des jauges cuves et dépotages citernes</p>
            </div>
            <button
              onClick={() => navigate("/cuves")}
              className="px-3 py-1.5 rounded-lg bg-[#431454] hover:bg-[#56216C] text-white text-xs font-bold shadow-xs"
            >
              + Nouveau Dépotage / Jaugeage
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {(ref?.cuves || [
              { code: "CUV-GO-1", nom: "Cuve Gasoil 1", produit: "GASOIL", capacite: 30000, stock: 18500 },
              { code: "CUV-GO-2", nom: "Cuve Gasoil 2", produit: "GASOIL", capacite: 30000, stock: 14200 },
              { code: "CUV-SU-1", nom: "Cuve Super 1", produit: "SUPER", capacite: 20000, stock: 9800 },
            ]).map((c) => {
              const cap = n(c.capacite) || 30000;
              const stk = n(c.stock) || 15000;
              const pct = cap > 0 ? Math.min(100, Math.round((stk / cap) * 100)) : 50;
              const creux = Math.max(0, cap - stk);

              return (
                <div key={c.code} className="p-3 rounded-xl border bg-gray-50/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-900">{c.nom || c.code}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"}`}>
                      {c.produit}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">Stock actuel :</span>
                      <span className="font-black text-gray-900 tabular">{F(stk)} L ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: pct < 20 ? "#DC2626" : pct < 40 ? "#D97706" : c.produit === "GASOIL" ? "#2563EB" : "#059669",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>Capacité: {F(cap)} L</span>
                      <span className="font-semibold text-amber-800">Creux: {F(creux)} L</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 5 : MON ÉQUIPE & COMPTES COLLABORATEURS ── */}
      {activeTab === "equipe" && (
        <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: T.line }}>
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <span>👥 Équipe de la {stationNom}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-900">
                  {equipe.filter((e) => e.actif !== false).length} actif(s) sur {equipe.length}
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Pompistes, agents de lavage, vendeurs boutique et techniciens rattachés à votre site.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCollabModal(true)}
              className="px-4 py-2 rounded-xl bg-[#431454] hover:bg-[#56216C] text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 shrink-0"
            >
              <span>➕</span>
              <span>Nouveau Collaborateur (Créer Compte)</span>
            </button>
          </div>

          {equipe.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">
              <p className="font-bold text-gray-700">Aucun collaborateur rattaché à cette station pour l'instant.</p>
              <p className="text-gray-400 mt-1">Cliquez sur « Nouveau Collaborateur » pour créer un compte pompiste, lavage ou boutique.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-xl" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                  <tr>
                    <th className="py-2.5 px-3 text-left">Collaborateur</th>
                    <th className="py-2.5 px-3 text-left">Profil / Métier</th>
                    <th className="py-2.5 px-3 text-left">Email de Connexion</th>
                    <th className="py-2.5 px-3 text-center">Statut</th>
                    <th className="py-2.5 px-3 text-center">Actions Gérant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {equipe.map((u) => {
                    const isActif = u.actif !== false;
                    const roleIcon =
                      u.role === "pompiste" ? "⛽" :
                      u.role === "lavage" ? "🚿" :
                      u.role === "boutique" ? "🛍️" :
                      u.role === "stock" ? "📦" :
                      u.role === "maintenance" ? "🔧" :
                      u.role === "gerant" ? "📋" : "👤";

                    return (
                      <tr key={u.id} className={isActif ? "hover:bg-purple-50/20" : "bg-gray-50/70 opacity-75"}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900 flex items-center gap-1.5">
                            <span>{roleIcon}</span>
                            <span>{u.nom_complet}</span>
                          </div>
                          {u.telephone && <div className="text-[10px] text-gray-400">📞 {u.telephone}</div>}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700">
                          {u.email}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isActif
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-rose-100 text-rose-800 border-rose-200"
                            }`}
                          >
                            {isActif ? "Actif" : "Suspendu"}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u)}
                              className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors"
                              title="Générer un nouveau mot de passe temporaire"
                            >
                              🔑 Reset MdP
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActifCollab(u)}
                              className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                                isActif
                                  ? "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300"
                                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                              }`}
                              title={isActif ? "Suspendre l'accès" : "Réactiver l'accès"}
                            >
                              {isActif ? "⏸️ Suspendre" : "▶️ Réactiver"}
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
      )}

      {/* ── MODAL ATTRIBUTION BON ── */}
      {attribModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border">
            <div className="p-4 bg-purple-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <span>🔗 Attribuer le Bon à un Client</span>
              </h3>
              <button onClick={() => setAttribModal(null)} className="text-white text-base">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="p-3 bg-purple-50 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">N° Bon :</span>
                  <span className="font-mono font-bold text-gray-900">{attribModal.numero_bon}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date & Litrage :</span>
                  <span className="font-bold">{fmtDate(attribModal.date)} · {F(attribModal.volume_litres)} L ({attribModal.produit})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Montant :</span>
                  <span className="font-black text-rose-700">{F(attribModal.montant)} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Véhicule :</span>
                  <span>{attribModal.immatriculation || "Non renseigné"}</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Sélectionner le Client Professionnel *</label>
                <select
                  value={attribClientCode}
                  onChange={(e) => setAttribClientCode(e.target.value)}
                  className="w-full border rounded-lg p-2 text-xs font-semibold bg-white"
                >
                  {clientsList.map((cl) => (
                    <option key={cl.code} value={cl.code}>
                      {cl.nom} ({cl.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAttribModal(null)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmerAttribution}
                  className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-xs"
                >
                  ✓ Confirmer l'attribution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de compte collaborateur depuis le cockpit gérant */}
      <CollaborateurModal
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        stations={ref?.stations || []}
        defaultStationId={stationId}
        onCreated={handleCollabCreated}
      />
    </div>
  );
}
