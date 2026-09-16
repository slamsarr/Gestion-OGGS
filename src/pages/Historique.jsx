import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, deleteRapport } from "../lib/api";
import { F, n, fmtDate, todayISO, T } from "../lib/calcul";
import { Row, Loading } from "../components/ui";
import { peutSupprimerRapport } from "../lib/permissions";

export default function Historique() {
  const { profil } = useAuth();
  const role = profil?.role || "gerant";
  const stationScope = profil?.stations?.code || profil?.station_id?.replace("st-", "").toUpperCase() || "";

  const [ref, setRef] = useState(null);
  const [rapports, setRapports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filtreStation, setFiltreStation] = useState(stationScope || "ALL");
  const [filtreStatut, setFiltreStatut] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    (async () => {
      setLoadingMore(page > 1);
      const opts = { page, limit: 100, station: filtreStation === "ALL" ? undefined : filtreStation };
      const raps = await listRapports(opts);
      if (page === 1) {
        setRapports(raps);
      } else {
        setRapports((prev) => { const merged = [...prev, ...raps]; merged.total = raps.total; merged.pages = raps.pages; return merged; });
      }
      setTotalPages(raps.pages || 1);
      setLoadingMore(false);
    })();
  }, [page, filtreStation, loading]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const effacer = async (r) => {
    if (!peutSupprimerRapport(role, r.statut, r.station, stationScope)) { flash("Droits insuffisants pour supprimer ce rapport"); return; }
    if (!window.confirm(`Supprimer le rapport ${r.station} du ${fmtDate(r.date || r.date_rapport)} ?`)) return;
    const res = await deleteRapport(r, ref);
    if (res.ok) {
      flash("Rapport supprimé");
      setRapports((list) => list.filter((x) => x.id !== r.id));
    } else {
      flash(res.error || "Suppression impossible");
    }
  };

  if (loading || !ref) return <Loading />;

  const rows = rapports.filter((r) => (filtreStatut === "ALL" ? true : r.statut === filtreStatut));
  const aujourdHui = todayISO();

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Historique des rapports</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>{rows.length || rapports.total || 0} rapport(s) · dernière connexion le {aujourdHui}</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#FBEAE5", color: T.alert }}>{msg}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {role !== "gerant" && (
          <select value={filtreStation} onChange={(e) => { setFiltreStation(e.target.value); setPage(1); }} className="text-sm border rounded px-2 py-1.5 bg-white" style={{ borderColor: T.line }}>
            <option value="ALL">Toutes les stations</option>
            {(ref?.stations || []).map((s) => <option key={s.id} value={s.code}>{s.code} — {s.nom}</option>)}
          </select>
        )}
        <select value={filtreStatut} onChange={(e) => { setFiltreStatut(e.target.value); setPage(1); }} className="text-sm border rounded px-2 py-1.5 bg-white" style={{ borderColor: T.line }}>
          <option value="ALL">Tous les statuts</option>
          <option value="BROUILLON">Brouillon</option>
          <option value="SOUMIS">Soumis</option>
          <option value="VALIDE">Validé</option>
          <option value="REJETE">Rejeté</option>
        </select>
      </div>

      <div className="bg-white rounded-lg px-3" style={{ border: `1px solid ${T.line}` }}>
        {rows.map((r) => {
          const col = { BROUILLON: T.muted, SOUMIS: "#B7791F", VALIDE: T.ok, REJETE: T.alert }[r.statut] || T.muted;
          const peutSupprimer = peutSupprimerRapport(role, r.statut, r.station, stationScope);
          return (
            <Row key={r.id || `${r.station}-${r.date}`}>
              <div>
                <div className="font-medium">{r.station} <span className="text-xs ml-1" style={{ color: T.muted }}>{fmtDate(r.date || r.date_rapport)}</span></div>
                <div className="text-xs" style={{ color: T.muted }}>{r.gerant || ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold tabular">{F(r.ca_total)} F</div>
                  <div className="text-xs" style={{ color: Math.abs(n(r.ecart_caisse)) > 5000 ? T.alert : T.muted }}>Écart {F(r.ecart_caisse)}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: col + "18", color: col }}>{r.statut}</span>
                <Link
                  to={`/rapport?station=${encodeURIComponent(r.station)}&date=${encodeURIComponent(r.date || r.date_rapport)}`}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: T.line, color: T.petrol }}
                >
                  Ouvrir
                </Link>
                {peutSupprimer && (
                  <button onClick={() => effacer(r)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.alert }}>✕</button>
                )}
              </div>
            </Row>
          );
        })}
        {rows.length === 0 && <p className="text-sm py-6 text-center" style={{ color: T.muted }}>Aucun rapport pour ces critères.</p>}
        {page < totalPages && (
          <div className="py-3">
            <button onClick={() => setPage(page + 1)} disabled={loadingMore} className="w-full py-2 rounded text-sm font-medium disabled:opacity-50" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol, background: "white" }}>
              {loadingMore ? "Chargement…" : `Charger plus (page ${page + 1}/${totalPages})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}