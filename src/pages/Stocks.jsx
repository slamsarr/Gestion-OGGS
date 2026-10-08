import { useEffect, useState, useMemo } from "react";
import { loadReferentiel, stocksTheoriques } from "../lib/api";
import { F, T, n } from "../lib/calcul";
import { Section, Loading } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { peutAgirProfil, DIRECTION } from "../lib/permissions";

export default function Stocks() {
  const { profil } = useAuth();
  const role = profil?.role || "";
  const stationScope = profil?.station_id || "";
  const peutAjuster = peutAgirProfil(profil, "stock", "ajuster");
  const peutGerer = peutAgirProfil(profil, "produit", "gerer");
  const vueReseau = DIRECTION.includes(role) || role === "comptable" || !stationScope;

  const [ref, setRef] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("TOUS");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await loadReferentiel();
        if (!alive) return;
        setRef(r);
        const st = await stocksTheoriques(r).catch(() => []);
        if (!alive) return;
        setRows(st || []);
      } catch (err) {
        console.error("Stocks load error:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [vueReseau, stationScope]);

  if (loading) return <Loading />;

  const familles = ["TOUS", "LUBRIFIANT", "GAZ", "ACCESSOIRE"];
  const filtered = filtre === "TOUS" ? rows : rows.filter((r) => r.famille === filtre);
  const alertes = rows.filter((r) => r.stock <= r.seuil && r.stock >= 0);
  const negatifs = rows.filter((r) => r.stock < 0);
  const stations = (ref?.stations || []).filter((s) => vueReseau ? true : s.id === stationScope || s.code === stationScope || s.id === stationScope.replace("st-", "") || s.code === stationScope.replace("st-", ""));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Stocks lubrifiants & gaz</h1>
          <p className="text-sm" style={{ color: T.muted }}>Stock théorique basé sur les rapports validés</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!peutAjuster && (
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <span>👁️</span> Lecture seule
            </span>
          )}
          {peutGerer && (
            <button className="px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition hover:-translate-y-0.5" style={{ background: T.gold, color: "#111827" }}>
              ➕ Nouveau produit
            </button>
          )}
          {peutAjuster && (
            <button className="px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm text-white transition hover:-translate-y-0.5" style={{ background: T.petrol }}>
              ⚖️ Inventaire / Ajustement
            </button>
          )}
        </div>
      </div>

      {/* Alertes stock bas */}
      {(alertes.length > 0 || negatifs.length > 0) && (
        <div className="rounded-xl px-4 py-3 mb-4 text-sm shadow-sm border border-rose-100" style={{ background: "#FBEAE5", color: T.alert }}>
          {negatifs.length > 0 && <div className="font-bold">🔴 Stock négatif : {negatifs.map((r) => `${r.produit} (${n(r.stock)}) @ ${r.station}`).join(", ")}</div>}
          {alertes.length > 0 && <div>⚠️ Stock bas (&le; seuil) : {alertes.length} produit(s) concerné(s) {alertes.slice(0,4).map((r) => `${r.produit} (${r.stock}) @ ${r.station}`).join(", ")}{alertes.length > 4 ? "…" : ""}</div>}
        </div>
      )}

      {/* Filtre famille */}
      <div className="flex flex-wrap gap-2 mb-4">
        {familles.map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            className="px-3 py-1 rounded-full text-sm"
            style={{ background: filtre === f ? T.petrol : "white", color: filtre === f ? "white" : T.ink, border: `1px solid ${T.line}` }}
          >{f === "TOUS" ? "Tous" : f}</button>
        ))}
      </div>

      {/* Tableau par station */}
      {stations.map((st) => {
        const stRows = filtered.filter((r) => r.station === st.code);
        if (stRows.length === 0) return null;
        const valeurTotale = stRows.reduce((s, r) => s + r.valeur, 0);
        return (
          <Section key={st.code} titre={st.nom} aside={`Valeur stock : ${F(valeurTotale)} F`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
                    <th className="py-2 text-left font-medium">Produit</th>
                    <th className="py-2 text-right font-medium">Stock</th>
                    <th className="py-2 text-right font-medium">Seuil</th>
                    <th className="py-2 text-right font-medium">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {stRows.map((r) => (
                    <tr key={r.produit} className="border-b" style={{ borderColor: T.line }}>
                      <td className="py-1.5">{r.produit}</td>
                      <td className="py-1.5 text-right font-semibold tabular" style={{ color: r.stock < 0 ? T.alert : r.stock <= r.seuil ? "#B7791F" : T.ink }}>{r.stock}</td>
                      <td className="py-1.5 text-right tabular" style={{ color: T.muted }}>{r.seuil}</td>
                      <td className="py-1.5 text-right tabular">{F(r.valeur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
    </div>
  );
}
