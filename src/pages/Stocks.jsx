import { useEffect, useState } from "react";
import { loadReferentiel, stocksTheoriques } from "../lib/api";
import { F, T } from "../lib/calcul";
import { Section, Loading } from "../components/ui";

export default function Stocks() {
  const [ref, setRef] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("TOUS");

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      const s = await stocksTheoriques(r);
      setRows(s);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loading />;

  const familles = ["TOUS", "LUBRIFIANT", "GAZ", "ACCESSOIRE"];
  const filtered = filtre === "TOUS" ? rows : rows.filter((r) => r.famille === filtre);
  const alertes = rows.filter((r) => r.stock <= r.seuil && r.stock >= 0);
  const negatifs = rows.filter((r) => r.stock < 0);
  const stations = ref?.stations || [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Stocks lubrifiants & gaz</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>Stock théorique basé sur les rapports validés</p>

      {/* Alertes stock bas */}
      {(alertes.length > 0 || negatifs.length > 0) && (
        <div className="rounded-lg px-3 py-2 mb-4 text-sm" style={{ background: "#FBEAE5", color: T.alert }}>
          {negatifs.length > 0 && <div>🔴 Stock négatif : {negatifs.map((r) => `${r.produit} @ ${r.station}`).join(", ")}</div>}
          {alertes.length > 0 && <div>⚠️ Stock bas (&le; seuil) : {alertes.map((r) => `${r.produit} (${r.stock}) @ ${r.station}`).join(", ")}</div>}
        </div>
      )}

      {/* Filtre famille */}
      <div className="flex gap-2 mb-4">
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
