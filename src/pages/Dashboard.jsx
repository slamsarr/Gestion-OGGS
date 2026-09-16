import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, stocksTheoriques } from "../lib/api";
import { F, fmtDate, todayISO, T, n, calculer } from "../lib/calcul";
import { Section, Row, Loading } from "../components/ui";

function Bar({ label, value, max, color = T.petrol }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs w-28 truncate" style={{ color: T.muted }}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div className="h-full rounded-full flex items-center px-2 transition-all" style={{ width: `${Math.max(pct, 2)}%`, background: color }}>
          {pct > 20 && <span className="text-xs text-white font-medium whitespace-nowrap">{F(value)}</span>}
        </div>
      </div>
      {pct <= 20 && <span className="text-xs tabular" style={{ color: T.muted }}>{F(value)}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { profil } = useAuth();
  const [ref, setRef] = useState(null);
  const [rapports, setRapports] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const stationScope = profil?.role === "gerant" ? (profil?.stations?.code || profil?.station_id?.replace("st-", "").toUpperCase()) : undefined;

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      const [raps, st] = await Promise.all([listRapports({ page: 1, limit: 100, station: stationScope }), stocksTheoriques(r)]);
      setRapports(raps);
      setTotalPages(raps.pages || 1);
      setStocks(st);
      setLoading(false);
    })();
  }, [stationScope]);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    const raps = await listRapports({ page: next, limit: 100, station: stationScope });
    setRapports((prev) => { const merged = [...prev, ...raps]; merged.total = raps.total; merged.pages = raps.pages; return merged; });
    setPage(next);
    setTotalPages(raps.pages || 1);
    setLoadingMore(false);
  };

  if (loading) return <Loading />;

  const today = todayISO();
  const daysAgo = (d, days) => { const diff = (new Date(today) - new Date(d)) / 86400000; return diff >= 0 && diff < days; };
  const rapToday = rapports.filter((r) => (r.date || r.date_rapport) === today);
  const rap7 = rapports.filter((r) => daysAgo(r.date || r.date_rapport, 7));
  const rap30 = rapports.filter((r) => daysAgo(r.date || r.date_rapport, 30));
  const caJ = rapToday.reduce((s, r) => s + n(r.ca_total), 0);
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

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Tableau de bord réseau</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>{fmtDate(today)} · {profil?.nom_complet}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "CA Aujourd'hui", value: `${F(caJ)} F`, color: T.petrol },
          { label: "CA 7 jours", value: `${F(ca7)} F`, color: T.petrol },
          { label: "CA 30 jours", value: `${F(ca30)} F`, color: T.petrol },
          { label: "À valider", value: soumis.length, color: soumis.length > 0 ? "#B7791F" : T.ok },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-lg p-3" style={{ border: `1px solid ${T.line}` }}>
            <div className="text-xs" style={{ color: T.muted }}>{k.label}</div>
            <div className="text-xl font-bold tabular" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {stMissing.length > 0 && <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ background: "#FBEAE5", color: T.alert }}>⚠️ Sans rapport : {stMissing.map((s) => s.nom).join(", ")}</div>}
      {ecarts.length > 0 && <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ background: "#FBEAE5", color: T.alert }}>⚠️ Écart caisse : {ecarts.map((r) => `${r.station} (${F(r.ecart_caisse)} F)`).join(", ")}</div>}
      {stocksBas.length > 0 && <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ background: "#FEF3C7", color: "#92400E" }}>📦 Stock bas : {stocksBas.slice(0, 5).map((s) => `${s.produit} (${s.stock}) @ ${s.station}`).join(", ")}{stocksBas.length > 5 ? ` +${stocksBas.length - 5}` : ""}</div>}

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Section titre="📊 CA par station (7j)">
          {volByStation.map((v) => <Bar key={v.code} label={v.code} value={v.ca} max={maxCA} color={T.petrol} />)}
          {volByStation.length === 0 && <p className="text-sm py-2" style={{ color: T.muted }}>Aucune donnée</p>}
        </Section>
        <Section titre="⛽ Volumes par station (7j)">
          {volByStation.map((v) => (
            <div key={v.code}>
              <Bar label={`${v.code} GO`} value={v.go} max={maxVol} color="#2563EB" />
              <Bar label={`${v.code} SUP`} value={v.su} max={maxVol} color={T.gold} />
            </div>
          ))}
        </Section>
      </div>

      {soumis.length > 0 && (profil?.role === "admin" || profil?.role === "superviseur" || profil?.role === "directeur") && (
        <Section titre="📋 Rapports à valider" aside={`${soumis.length}`}>
          {soumis.map((r, i) => (
            <Row key={i}><div><span className="font-medium">{r.station}</span><span className="text-xs ml-2" style={{ color: T.muted }}>{fmtDate(r.date || r.date_rapport)}</span></div><span className="font-semibold tabular">{F(r.ca_total)} F</span></Row>
          ))}
        </Section>
      )}

      <Section titre="Derniers rapports" aside={`${rapports.total || rapports.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
            <th className="py-2 text-left font-medium">Date</th><th className="py-2 text-left font-medium">Station</th>
            <th className="py-2 text-right font-medium">CA</th><th className="py-2 text-right font-medium">Écart</th>
            <th className="py-2 text-center font-medium">Statut</th>
          </tr></thead><tbody>
            {rapports.slice(0, rapports.length).map((r, i) => {
              const col = { BROUILLON: T.muted, SOUMIS: "#B7791F", VALIDE: T.ok, REJETE: T.alert }[r.statut] || T.muted;
              return (<tr key={i} className="border-b" style={{ borderColor: T.line }}>
                <td className="py-2 tabular">{fmtDate(r.date || r.date_rapport)}</td><td className="py-2">{r.station}</td>
                <td className="py-2 text-right tabular font-medium">{F(r.ca_total)}</td>
                <td className="py-2 text-right tabular" style={{ color: Math.abs(n(r.ecart_caisse)) > 5000 ? T.alert : T.ink }}>{F(r.ecart_caisse)}</td>
                <td className="py-2 text-center"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: col + "18", color: col }}>{r.statut}</span></td>
              </tr>);
            })}
          </tbody></table>
        </div>
        {page < totalPages && (
          <button onClick={loadMore} disabled={loadingMore} className="w-full py-2 mt-1 rounded text-sm font-medium disabled:opacity-50" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol, background: "white" }}>
            {loadingMore ? "Chargement…" : `Charger plus (page ${page + 1}/${totalPages})`}
          </button>
        )}
        {rapports.length === 0 && <p className="text-sm py-4 text-center" style={{ color: T.muted }}>Aucun rapport. Commencez par l'onglet "Rapport".</p>}
      </Section>
    </div>
  );
}
