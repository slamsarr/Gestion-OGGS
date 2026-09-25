import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, stocksTheoriques, listPrestationsLavage, listVentesBoutique } from "../lib/api";
import { F, fmtDate, todayISO, T, n, calculer } from "../lib/calcul";
import { Section, Row, Loading, PageHeader, StatCard, Badge, Card } from "../components/ui";

function Bar({ label, value, max, color = "#0B2F3A" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-xs w-28 truncate font-medium text-slate-600">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
        <div
          className="h-full rounded-full flex items-center px-2 transition-all shadow-xs"
          style={{ width: `${Math.max(pct, 3)}%`, background: color }}
        >
          {pct > 22 && <span className="text-[10px] text-white font-bold whitespace-nowrap">{F(value)}</span>}
        </div>
      </div>
      {pct <= 22 && <span className="text-xs tabular font-bold text-slate-700">{F(value)}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { profil } = useAuth();
  const navigate = useNavigate();
  const [ref, setRef] = useState(null);
  const [rapports, setRapports] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [lavages, setLavages] = useState([]);
  const [ventesBoutique, setVentesBoutique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const stationScope = profil?.role === "gerant" ? (profil?.stations?.code || profil?.station_id?.replace("st-", "").toUpperCase()) : undefined;
  const stationId = profil?.station_id || "";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await loadReferentiel();
        if (!alive) return;
        setRef(r);
        const [raps, st, lav, vBout] = await Promise.all([
          listRapports({ page: 1, limit: 100, station: stationScope }).catch(() => []),
          stocksTheoriques(r).catch(() => []),
          listPrestationsLavage(stationId, todayISO()).catch(() => []),
          listVentesBoutique(stationId, todayISO()).catch(() => []),
        ]);
        if (!alive) return;
        setRapports(raps || []);
        setTotalPages(raps?.pages || 1);
        setStocks(st || []);
        setLavages(lav || []);
        setVentesBoutique(vBout || []);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [stationScope, stationId]);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    const raps = await listRapports({ page: next, limit: 100, station: stationScope });
    setRapports((prev) => { const merged = [...prev, ...raps]; merged.total = raps.total; merged.pages = raps.pages; return merged; });
    setPage(next);
    setTotalPages(raps.pages || 1);
    setLoadingMore(false);
  };

  if (loading) return <Loading label="Chargement du cockpit de pilotage..." />;

  const today = todayISO();
  const daysAgo = (d, days) => { const diff = (new Date(today) - new Date(d)) / 86400000; return diff >= 0 && diff < days; };
  const rapToday = rapports.filter((r) => (r.date || r.date_rapport) === today);
  const rap7 = rapports.filter((r) => daysAgo(r.date || r.date_rapport, 7));
  const rap30 = rapports.filter((r) => daysAgo(r.date || r.date_rapport, 30));

  const caRapportsJ = rapToday.reduce((s, r) => s + n(r.ca_total), 0);
  const caLavageJ = lavages.reduce((s, l) => s + n(l.montant_total), 0);
  const caBoutiqueJ = ventesBoutique.reduce((s, v) => s + n(v.total_montant), 0);
  const caJ = caRapportsJ + caLavageJ + caBoutiqueJ;

  const ca7 = rap7.reduce((s, r) => s + n(r.ca_total), 0);
  const ca30 = rap30.reduce((s, r) => s + n(r.ca_total), 0);
  const soumis = rapports.filter((r) => r.statut === "SOUMIS");
  const stReported = [...new Set(rapToday.map((r) => r.station))];
  const stMissing = (ref?.stations || []).filter((s) => !stReported.includes(s.code));
  const ecarts = rapToday.filter((r) => Math.abs(n(r.ecart_caisse)) > 5000);
  const stocksBas = stocks.filter((s) => s.stock <= s.seuil && s.stock >= 0 && s.seuil > 0);
  const stations = ref?.stations || [];

  // Volumes par station (7j)
  const volByStation = stations.map((st) => {
    const stRaps = rap7.filter((r) => r.station === st.code);
    let go = 0, su = 0, ca = 0;
    stRaps.forEach((r) => {
      if (r.vol_hint?.pistolets) {
        const c = calculer(r.vol_hint, ref);
        go += c.volGO; su += c.volSU; ca += c.caTotal;
      } else { ca += n(r.ca_total); }
    });
    return { code: st.code, nom: st.nom, go, su, ca };
  });
  const maxCA = Math.max(...volByStation.map((v) => v.ca), 1);
  const maxVol = Math.max(...volByStation.map((v) => v.go + v.su), 1);

  // Raccourcis opérationnels rapides
  const quickActions = [
    { label: "Saisie Descente", sub: "Index & Ventes quart", icon: "⛽", to: "/descente", color: "from-blue-600 to-indigo-600" },
    { label: "Cuves & Dépotage", sub: "Jauge & PV citerne", icon: "🛢️", to: "/cuves", color: "from-amber-500 to-orange-600" },
    { label: "Fidélité Clients", sub: "Cartes & Récompenses", icon: "🎁", to: "/fidelite", color: "from-purple-600 to-pink-600" },
    { label: "Lavage Auto", sub: "Encaissement client", icon: "🚿", to: "/lavage", color: "from-emerald-500 to-teal-600" },
    { label: "Shop Boutique", sub: "Vente & Caisse POS", icon: "🛒", to: "/boutique", color: "from-amber-600 to-amber-700" },
    { label: "Rapport Jour", sub: "Bordereau & Clôture", icon: "📋", to: "/rapport", color: "from-slate-700 to-slate-900" },
  ];

  return (
    <div className="space-y-5">
      {/* BANNIÈRE OFFICIELLE STAR ENERGY */}
      <div className="rounded-2xl overflow-hidden shadow-lg border border-purple-900/30 relative">
        <img
          src="/star_energy_cover.jpg"
          alt="Star Energy Sénégal — Une marque sénégalaise, li nio ko mom !"
          className="w-full h-auto object-cover max-h-48 sm:max-h-56 w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F0626]/90 via-[#1F0626]/40 to-transparent flex flex-col justify-end p-4 sm:p-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 uppercase tracking-wide">
                  COCKPIT RÉSEAU STAR ENERGY
                </span>
                <span className="text-xs text-amber-200 font-medium">· {fmtDate(today)}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Bonjour, {profil?.nom_complet || "Chef de Station"} 👋
              </h1>
              <p className="text-xs text-purple-200 mt-0.5">
                {profil?.stations?.nom || "Station Hann Mariste"} · 45 stations-service au Sénégal
              </p>
            </div>
            <div className="text-right bg-black/40 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10">
              <div className="text-[10px] text-amber-300 uppercase font-bold">Chiffre d'Affaires Global Jour</div>
              <div className="text-xl sm:text-2xl font-black tabular text-white">
                {F(caJ)} <span className="text-xs font-normal text-amber-300">FCFA</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold">✓ Station opérationnelle</div>
            </div>
          </div>
        </div>
      </div>

      {/* HUB D'ACTIONS RAPIDES (Raccourcis terrain) */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
            ⚡ Raccourcis Opérationnels Prioritaires
          </h2>
          <span className="text-[11px] text-slate-400">Accès direct 1-clic</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {quickActions.map((qa, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigate(qa.to)}
              className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all text-left group flex flex-col justify-between h-24"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl group-hover:scale-110 transition-transform">{qa.icon}</span>
                <span className="text-xs text-slate-300 group-hover:text-amber-500 font-bold">→</span>
              </div>
              <div>
                <div className="font-bold text-xs text-slate-800 group-hover:text-blue-900 transition-colors">
                  {qa.label}
                </div>
                <div className="text-[10px] text-slate-400 truncate">{qa.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* STATCARDS : VENTILATION FINANCIÈRE */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Carburant (Jour)"
          value={`${F(caRapportsJ)} F`}
          subtext="Ventes essence & gasoil"
          icon="⛽"
          color="blue"
          onClick={() => navigate("/rapport")}
        />
        <StatCard
          label="Lavage Auto (Jour)"
          value={`${F(caLavageJ)} F`}
          subtext={`${lavages.length} véhicules lavés`}
          icon="🚿"
          color="emerald"
          onClick={() => navigate("/lavage")}
        />
        <StatCard
          label="Boutique Shop (Jour)"
          value={`${F(caBoutiqueJ)} F`}
          subtext={`${ventesBoutique.length} tickets de caisse`}
          icon="🛒"
          color="amber"
          onClick={() => navigate("/boutique")}
        />
        <StatCard
          label="À Valider (Contrôle)"
          value={soumis.length}
          subtext={soumis.length > 0 ? "Rapports en attente" : "Tous rapports validés"}
          icon="📋"
          color={soumis.length > 0 ? "rose" : "emerald"}
          onClick={() => navigate("/historique")}
        />
      </div>

      {/* ALERTES PRIORITAIRES */}
      {(stMissing.length > 0 || ecarts.length > 0 || stocksBas.length > 0) && (
        <div className="space-y-2">
          {stMissing.length > 0 && (
            <div className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 shadow-xs">
              <span>⚠️</span>
              <span>Stations sans rapport aujourd'hui : {stMissing.map((s) => s.nom).join(", ")}</span>
            </div>
          )}
          {ecarts.length > 0 && (
            <div className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 shadow-xs">
              <span>🚨</span>
              <span>Écarts de caisse constatés : {ecarts.map((r) => `${r.station} (${F(r.ecart_caisse)} F)`).join(", ")}</span>
            </div>
          )}
          {stocksBas.length > 0 && (
            <div className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 shadow-xs">
              <span>📦</span>
              <span>Alerte stock bas réassort : {stocksBas.slice(0, 4).map((s) => `${s.produit} (${s.stock}) @ ${s.station}`).join(", ")}{stocksBas.length > 4 ? ` +${stocksBas.length - 4}` : ""}</span>
            </div>
          )}
        </div>
      )}

      {/* GRAPHIQUES VOLUMES ET CHIFFRE D'AFFAIRES (7J) */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Section titre="📊 Chiffre d'Affaires par Station (7j)">
          <div className="space-y-1 py-1">
            {volByStation.map((v) => (
              <Bar key={v.code} label={v.code} value={v.ca} max={maxCA} color="#0B2F3A" />
            ))}
            {volByStation.length === 0 && (
              <p className="text-xs py-4 text-center text-slate-400">Aucune donnée disponible</p>
            )}
          </div>
        </Section>

        <Section titre="⛽ Volumes Distribués Gasoil & Super (7j)">
          <div className="space-y-2 py-1">
            {volByStation.map((v) => (
              <div key={v.code} className="border-b border-slate-100 pb-1.5 last:border-0">
                <Bar label={`${v.code} (Gasoil)`} value={v.go} max={maxVol} color="#2563EB" />
                <Bar label={`${v.code} (Super)`} value={v.su} max={maxVol} color="#F59E0B" />
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* RAPPORTS À VALIDER POUR LA DIRECTION */}
      {soumis.length > 0 && (profil?.role === "admin" || profil?.role === "superviseur" || profil?.role === "directeur") && (
        <Section titre="📋 Rapports Journaliers en Attente de Validation" aside={`${soumis.length} rapport(s)`}>
          <div className="divide-y divide-slate-100">
            {soumis.map((r, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{r.station}</span>
                  <span className="text-slate-400">· {fmtDate(r.date || r.date_rapport)}</span>
                  <Badge variant="warn">SOUMIS</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black tabular text-slate-900">{F(r.ca_total)} FCFA</span>
                  <button
                    type="button"
                    onClick={() => navigate("/rapport")}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400 text-slate-950 shadow-xs hover:bg-amber-300"
                  >
                    Examiner
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* DERNIERS RAPPORTS ENREGISTRÉS */}
      <Section titre="📁 Derniers Rapports Enregistrés" aside={`${rapports.total || rapports.length} total`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 text-left">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Station</th>
                <th className="pb-2 text-right font-semibold">Chiffre d'Affaires</th>
                <th className="pb-2 text-right font-semibold">Écart Caisse</th>
                <th className="pb-2 text-center font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rapports.slice(0, 10).map((r, i) => {
                const ecartVal = n(r.ecart_caisse);
                const isEcart = Math.abs(ecartVal) > 5000;
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 font-medium tabular text-slate-600">{fmtDate(r.date || r.date_rapport)}</td>
                    <td className="py-2.5 font-bold text-slate-900">{r.station}</td>
                    <td className="py-2.5 text-right tabular font-black text-slate-900">{F(r.ca_total)} F</td>
                    <td className={`py-2.5 text-right tabular font-bold ${isEcart ? "text-rose-600" : "text-emerald-700"}`}>
                      {ecartVal > 0 ? "+" : ""}{F(ecartVal)} F
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.statut === "VALIDE"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.statut === "SOUMIS"
                            ? "bg-amber-100 text-amber-800"
                            : r.statut === "REJETE"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.statut}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {page < totalPages && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-2.5 mt-2 rounded-xl text-xs font-bold border border-dashed border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            {loadingMore ? "Chargement…" : `Charger plus de rapports (page ${page + 1}/${totalPages})`}
          </button>
        )}
      </Section>
    </div>
  );
}
