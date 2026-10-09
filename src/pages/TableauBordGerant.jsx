import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listDescentes,
  listTousBonsStation,
  listPrestationsLavage,
  listVentesBoutique,
  listJaugesCuves,
  listCollaborateurs,
  stocksTheoriques,
  listPrestationsEntretien,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { ROLE_LABELS } from "../lib/permissions";
import { Section, Row, Num, Loading } from "../components/ui";
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
  const [stocksStation, setStocksStation] = useState([]);
  const [entretiensJour, setEntretiensJour] = useState([]);
  const [lavagesV, setLavagesV] = useState([]);
  const [ventesBoutiqueV, setVentesBoutiqueV] = useState([]);
  const [afficherHistoire, setAfficherHistoire] = useState(true);
  const [histoire, setHistoire] = useState(null);

  // Filtre Bons
  const [filtreBon, setFiltreBon] = useState("TOUS"); // TOUS | IMPAYES | REGLES

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
              onClick={() => navigate("/gestion-quarts")}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow-md flex items-center gap-1.5"
              title="Gérer les quarts et affectations"
            >
              <span>⏰</span>
              <span className="hidden sm:inline">Planning Quarts</span>
              <span className="sm:hidden">Quarts</span>
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
            onClick={() => navigate(`/rapport?station=${encodeURIComponent(stationCode)}&date=${encodeURIComponent(date)}`)}
            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
            title="Clôture officielle après vérification de cohérence"
          >
            <span>� Clôture Officielle</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1 : DESCENTES POMPISTES (VISUALISATION SEULE) ── */}
      {activeTab === "descentes" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              Supervision des Descentes Pompistes du {fmtDate(date)}
            </h2>
            <div className="text-xs text-gray-500">
              Visualisation uniquement · Pas de saisie opérationnelle
            </div>
          </div>

          {descentes.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-xs shadow-sm">
              <p className="font-bold text-gray-700 text-sm">Aucune descente pompiste enregistrée pour le {fmtDate(date)}.</p>
              <p className="text-gray-400 mt-1">Dès qu'un pompiste démarre ou soumet son quart, il apparaîtra ici avec ses index et modes d'encaissement.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm divide-y" style={{ borderColor: T.line }}>
              {descentes.map((d) => {
                const isTerminee = d.statut === "TERMINEE";
                const ecartVal = n(d.ecart);
                return (
                  <div key={d.id} className="p-4 hover:bg-gray-50/70 transition-colors">
                    {/* En-tête pompiste */}
                    <div className="flex items-center justify-between mb-3">
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
                          {isTerminee ? "✓ Soumise" : "🟡 En cours"}
                        </span>
                        {d.quart && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            {d.quart}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Écart Caisse</div>
                        <div className={`font-black text-sm tabular ${ecartVal >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {ecartVal >= 0 ? "+" : ""}{F(ecartVal)} FCFA
                        </div>
                      </div>
                    </div>

                    {/* Détails index */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg mb-3">
                      <div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase">Index Départ</div>
                        <div className="font-mono text-sm font-bold text-gray-800">{d.index_depart || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase">Index Fin</div>
                        <div className="font-mono text-sm font-bold text-gray-800">{d.index_fin || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase">Volume</div>
                        <div className="font-mono text-sm font-bold text-gray-800">{F(d.total_volume || d.volume_vendu || 0)} L</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase">Valeur</div>
                        <div className="font-mono text-sm font-bold text-gray-800">{F(d.total_carburant || d.montant_theorique || 0)} F</div>
                      </div>
                    </div>

                    {/* Modes d'encaissement */}
                    <div className="mb-3">
                      <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Modes d'Encaissement</div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-medium">
                          Espèces : {F(d.especes || 0)} F
                        </span>
                        {Array.isArray(d.bons) && d.bons.length > 0 && (
                          <span className="px-2 py-1 rounded bg-rose-100 text-rose-800 text-xs font-medium">
                            Bons : {d.bons.length} bon(s) ({F(d.total_bons || 0)} F)
                          </span>
                        )}
                        {d.mobile_money && (
                          <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-medium">
                            Mobile Money : {F(d.mobile_money)} F
                          </span>
                        )}
                        {d.carte_bancaire && (
                          <span className="px-2 py-1 rounded bg-purple-100 text-purple-800 text-xs font-medium">
                            Carte Bancaire : {F(d.carte_bancaire)} F
                          </span>
                        )}
                        <span className="px-2 py-1 rounded bg-gray-100 text-gray-800 text-xs font-medium">
                          Total Caisse : {F(d.total_caisse || d.montant_theorique || 0)} F
                        </span>
                      </div>
                    </div>

                    {/* Lubrifiants */}
                    {n(d.total_lubrifiants) > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Lubrifiants</div>
                        <div className="bg-amber-50 p-2 rounded-lg">
                          <span className="text-sm font-medium text-amber-900">
                            {F(d.total_lubrifiants)} F
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Versements */}
                    {Array.isArray(d.versements) && d.versements.length > 0 && (
                      <div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Versements</div>
                        <div className="flex flex-wrap gap-2">
                          {d.versements.map((v, i) => (
                            <span key={i} className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 text-xs font-medium">
                              Versement {i + 1} : {F(v)} F
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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

          {/* Filtres (visualisation uniquement) */}
          <div className="flex items-center gap-1.5 text-xs pt-1">
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
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px]">
                                Non attribué
                              </span>
                            )}
                            {reste > 0 && !isDivers && (
                              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px]">
                                À régler
                              </span>
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
                    <div className="font-black text-gray-900 tabular">{F(l.montant_total)} F</div>
                  </div>
                ))}
              </div>
            )}
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
                    <div className="font-black text-gray-900 tabular">{F(v.total_montant)} F</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4 : CUVES & JAUGES ── */}
      {activeTab === "cuves" && (
        <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-4" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h3 className="font-bold text-sm text-gray-900">État Volumétrique & Jaugeages Physiques</h3>
              <p className="text-xs text-gray-500">Rapprochement des jauges cuves et dépotages citernes (visualisation)</p>
            </div>
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
                Pompistes, agents de lavage, vendeurs boutique et techniciens rattachés à votre site (visualisation).
              </p>
            </div>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
