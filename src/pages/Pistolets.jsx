import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, saveJauge, listJauges, saveLivraison, listLivraisons, listCuves } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Num, Loading } from "../components/ui";

export default function Pistolets() {
  const { profil } = useAuth();
  const [ref, setRef] = useState(null);
  const [rapports, setRapports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState("ALL");
  const [tab, setTab] = useState("index"); // index | jauges | livraisons
  const [msg, setMsg] = useState("");

  // Jauges state
  const [jauges, setJauges] = useState([]);
  const [jForm, setJForm] = useState({ station_id: "", date_jauge: todayISO(), produit: "GASOIL", jauge_j: "", livraison_l: "", vente_j: "", jauge_j1: "" });

  // Livraisons state
  const [livraisons, setLivraisons] = useState([]);
  const [lForm, setLForm] = useState({ station_id: "", date_livraison: todayISO(), numero_bl: "", produit: "GASOIL", volume_l: "", depot: "SENSTOCK", camion: "", chauffeur: "", prix_achat: "", manquant_l: "" });

  // Cuves state
  const [cuves, setCuves] = useState([]);

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      const raps = await listRapports();
      setRapports(raps);
      if (r.stations.length > 0) {
        const sid = r.stations[0].id;
        setJForm((f) => ({ ...f, station_id: sid }));
        setLForm((f) => ({ ...f, station_id: sid }));
        const [j, l, cv] = await Promise.all([listJauges(sid), listLivraisons(sid), listCuves(sid)]);
        setJauges(j); setLivraisons(l); setCuves(cv);
      }
      setLoading(false);
    })();
  }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const loadStationData = async (sid) => {
    const [j, l, cv] = await Promise.all([listJauges(sid), listLivraisons(sid), listCuves(sid)]);
    setJauges(j); setLivraisons(l); setCuves(cv);
    setJForm((f) => ({ ...f, station_id: sid }));
    setLForm((f) => ({ ...f, station_id: sid }));
  };

  const submitJauge = async () => {
    const res = await saveJauge(jForm);
    if (res.ok) { flash("Jauge enregistrée"); const j = await listJauges(jForm.station_id); setJauges(j); setJForm((f) => ({ ...f, jauge_j: "", livraison_l: "", vente_j: "", jauge_j1: "" })); }
    else flash("Erreur : " + (res.error || ""));
  };

  const submitLivraison = async () => {
    const res = await saveLivraison(lForm);
    if (res.ok) { flash("Livraison enregistrée"); const l = await listLivraisons(lForm.station_id); setLivraisons(l); setLForm((f) => ({ ...f, numero_bl: "", volume_l: "", camion: "", chauffeur: "", prix_achat: "", manquant_l: "" })); }
    else flash("Erreur : " + (res.error || ""));
  };

  if (loading) return <Loading />;

  const stations = ref?.stations || [];
  const pistolets = ref?.pistolets || [];
  const filteredPist = stationFilter === "ALL" ? pistolets : pistolets.filter((p) => p.station_code === stationFilter);

  // Calculate stats per pistolet
  const pistStats = filteredPist.map((p) => {
    let totalVol = 0, lastIndex = null, anomalies = 0;
    const pRaps = rapports.filter((r) => r.station === p.station_code).sort((a, b) => (a.date || a.date_rapport) < (b.date || b.date_rapport) ? -1 : 1);
    for (const r of pRaps) {
      const x = r.pistolets?.[p.code]; if (!x) continue;
      const vol = n(x.fin) - n(x.depart);
      if (vol > 0) totalVol += vol;
      if (lastIndex != null && Math.abs(n(x.depart) - lastIndex) > 1) anomalies++;
      if (n(x.fin) > 0) lastIndex = n(x.fin);
    }
    return { ...p, totalVol, lastIndex, anomalies };
  });

  // Jauge calculations
  const jaugesSorted = [...jauges].sort((a, b) => (b.date_jauge || "").localeCompare(a.date_jauge || ""));

  const tabs = [["index", "📊 Index"], ["jauges", "📐 Jauges"], ["livraisons", "🚛 Livraisons"]];

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Pistolets, jauges & livraisons</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>Index compteurs, jauges cuves, livraisons carburant</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Tabs */}
      <div className="flex border-b mb-4" style={{ borderColor: T.line }}>
        {tabs.map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm relative" style={{ color: tab === k ? T.petrol : T.muted, fontWeight: tab === k ? 600 : 400 }}>
            {lbl}
            {tab === k && <span className="absolute bottom-0 left-2 right-2 h-0.5" style={{ background: T.gold }} />}
          </button>
        ))}
      </div>

      {/* Station filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setStationFilter("ALL")} className="px-3 py-1 rounded-full text-sm" style={{ background: stationFilter === "ALL" ? T.petrol : "white", color: stationFilter === "ALL" ? "white" : T.ink, border: `1px solid ${T.line}` }}>Toutes</button>
        {stations.map((st) => (
          <button key={st.code} onClick={() => { setStationFilter(st.code); loadStationData(st.id); }} className="px-3 py-1 rounded-full text-sm" style={{ background: stationFilter === st.code ? T.petrol : "white", color: stationFilter === st.code ? "white" : T.ink, border: `1px solid ${T.line}` }}>{st.code}</button>
        ))}
      </div>

      {/* INDEX TAB */}
      {tab === "index" && ["GASOIL", "SUPER"].map((prod) => {
        const pList = pistStats.filter((p) => p.produit === prod);
        if (pList.length === 0) return null;
        return (
          <Section key={prod} titre={prod} aside={`Vol cumulé : ${F(pList.reduce((s, p) => s + p.totalVol, 0))} L`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
                <th className="py-2 text-left font-medium">Pistolet</th><th className="py-2 text-left font-medium">Station</th>
                <th className="py-2 text-right font-medium">Dernier index</th><th className="py-2 text-right font-medium">Vol. cumulé</th>
                <th className="py-2 text-center font-medium">Anomalies</th>
              </tr></thead><tbody>
                {pList.map((p) => (
                  <tr key={p.code} className="border-b" style={{ borderColor: T.line }}>
                    <td className="py-1.5 font-medium">{p.code}</td><td className="py-1.5">{p.station_code || "—"}</td>
                    <td className="py-1.5 text-right tabular">{p.lastIndex != null ? F(p.lastIndex) : "—"}</td>
                    <td className="py-1.5 text-right tabular font-medium">{F(p.totalVol)}</td>
                    <td className="py-1.5 text-center">
                      {p.anomalies > 0 ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#FBEAE5", color: T.alert }}>{p.anomalies}</span> : <span className="text-xs" style={{ color: T.ok }}>✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </Section>
        );
      })}

      {/* JAUGES TAB */}
      {tab === "jauges" && (
        <>
          <Section titre="📐 Saisie jauge cuve">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
              <div><div className="text-xs" style={{ color: T.muted }}>Station</div>
                <select value={jForm.station_id} onChange={(e) => { setJForm({ ...jForm, station_id: e.target.value }); loadStationData(e.target.value); }} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </select>
              </div>
              <div><div className="text-xs" style={{ color: T.muted }}>Date</div><input type="date" value={jForm.date_jauge} onChange={(e) => setJForm({ ...jForm, date_jauge: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Produit</div>
                <select value={jForm.produit} onChange={(e) => setJForm({ ...jForm, produit: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                  <option value="GASOIL">Gasoil</option><option value="SUPER">Super</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
              <div><div className="text-xs" style={{ color: T.muted }}>Jauge J (L)</div><Num value={jForm.jauge_j} onChange={(v) => setJForm({ ...jForm, jauge_j: v })} w="w-full" /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Livraison (L)</div><Num value={jForm.livraison_l} onChange={(v) => setJForm({ ...jForm, livraison_l: v })} w="w-full" /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Vente J (L)</div><Num value={jForm.vente_j} onChange={(v) => setJForm({ ...jForm, vente_j: v })} w="w-full" /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Jauge J+1 (L)</div><Num value={jForm.jauge_j1} onChange={(v) => setJForm({ ...jForm, jauge_j1: v })} w="w-full" /></div>
            </div>
            {(() => {
              const theo = n(jForm.jauge_j) + n(jForm.livraison_l) - n(jForm.vente_j);
              const ecart = jForm.jauge_j1 !== "" ? n(jForm.jauge_j1) - theo : null;
              return (
                <div className="flex gap-4 text-sm py-2">
                  <span>Théorique : <strong>{F(theo)} L</strong></span>
                  {ecart !== null && <span style={{ color: Math.abs(ecart) > 100 ? T.alert : T.ok }}>Écart : <strong>{ecart > 0 ? "+" : ""}{F(ecart)} L</strong></span>}
                </div>
              );
            })()}
            <button onClick={submitJauge} disabled={!jForm.jauge_j} className="py-2 px-6 rounded font-medium text-sm disabled:opacity-40" style={{ background: T.petrol, color: "white" }}>Enregistrer la jauge</button>
          </Section>

          <Section titre="Historique jauges" aside={`${jaugesSorted.length}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
                <th className="py-2 text-left font-medium">Date</th><th className="py-2 text-left font-medium">Produit</th>
                <th className="py-2 text-right font-medium">Jauge J</th><th className="py-2 text-right font-medium">Livr.</th>
                <th className="py-2 text-right font-medium">Vente</th><th className="py-2 text-right font-medium">Jauge J+1</th>
                <th className="py-2 text-right font-medium">Écart</th>
              </tr></thead><tbody>
                {jaugesSorted.slice(0, 30).map((j, i) => {
                  const theo = n(j.jauge_j) + n(j.livraison_l) - n(j.vente_j);
                  const ec = j.jauge_j1 != null ? n(j.jauge_j1) - theo : null;
                  return (
                    <tr key={i} className="border-b" style={{ borderColor: T.line }}>
                      <td className="py-1.5 tabular">{fmtDate(j.date_jauge)}</td><td className="py-1.5">{j.produit}</td>
                      <td className="py-1.5 text-right tabular">{F(j.jauge_j)}</td><td className="py-1.5 text-right tabular">{F(j.livraison_l)}</td>
                      <td className="py-1.5 text-right tabular">{F(j.vente_j)}</td><td className="py-1.5 text-right tabular">{j.jauge_j1 != null ? F(j.jauge_j1) : "—"}</td>
                      <td className="py-1.5 text-right tabular font-medium" style={{ color: ec !== null && Math.abs(ec) > 100 ? T.alert : T.ok }}>{ec !== null ? `${ec > 0 ? "+" : ""}${F(ec)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
            {jaugesSorted.length === 0 && <p className="text-sm py-3" style={{ color: T.muted }}>Aucune jauge saisie.</p>}
          </Section>

          <Section titre="🛢️ Capacités des cuves" aside={`${cuves.length} cuve(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
                <th className="py-2 text-left font-medium">Produit</th><th className="py-2 text-right font-medium">Capacité (L)</th>
                <th className="py-2 text-right font-medium">Dernier niveau</th><th className="py-2 text-center font-medium">Remplissage</th>
              </tr></thead><tbody>
                {cuves.map((cv) => {
                  const lastJ = jaugesSorted.find((j) => j.produit === cv.produit);
                  const level = lastJ != null && (lastJ.jauge_j1 != null ? n(lastJ.jauge_j1) : n(lastJ.jauge_j));
                  const cap = n(cv.capacite_l);
                  const pct = cap > 0 ? Math.min(100, Math.round((level / cap) * 100)) : 0;
                  return (
                    <tr key={cv.id || cv.produit} className="border-b" style={{ borderColor: T.line }}>
                      <td className="py-1.5 font-medium">{cv.produit}</td>
                      <td className="py-1.5 text-right tabular">{cap ? F(cap) : "—"}</td>
                      <td className="py-1.5 text-right tabular">{level != null ? F(level) + " L" : "—"}</td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-24 h-2 rounded-full" style={{ background: T.paper, overflow: "hidden" }}>
                            <div className="h-full" style={{ width: `${pct}%`, background: pct > 90 ? T.alert : pct >= 60 ? T.gold : T.ok }} />
                          </div>
                          <span className="text-xs tabular" style={{ color: T.muted }}>{cap ? `${pct}%` : "—"}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
            {cuves.length === 0 && <p className="text-sm py-3" style={{ color: T.muted }}>Aucune cuve définie pour cette station.</p>}
          </Section>
        </>
      )}

      {/* LIVRAISONS TAB */}
      {tab === "livraisons" && (
        <>
          <Section titre="🚛 Saisie livraison carburant">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
              <div><div className="text-xs" style={{ color: T.muted }}>Station</div>
                <select value={lForm.station_id} onChange={(e) => { setLForm({ ...lForm, station_id: e.target.value }); loadStationData(e.target.value); }} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </select>
              </div>
              <div><div className="text-xs" style={{ color: T.muted }}>Date</div><input type="date" value={lForm.date_livraison} onChange={(e) => setLForm({ ...lForm, date_livraison: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>N° BL</div><input value={lForm.numero_bl} onChange={(e) => setLForm({ ...lForm, numero_bl: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Produit</div>
                <select value={lForm.produit} onChange={(e) => setLForm({ ...lForm, produit: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                  <option value="GASOIL">Gasoil</option><option value="SUPER">Super</option>
                </select>
              </div>
              <div><div className="text-xs" style={{ color: T.muted }}>Volume (L)</div><Num value={lForm.volume_l} onChange={(v) => setLForm({ ...lForm, volume_l: v })} w="w-full" /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Dépôt</div>
                <select value={lForm.depot} onChange={(e) => setLForm({ ...lForm, depot: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                  <option value="SENSTOCK">SENSTOCK</option><option value="DOT">DOT</option><option value="AUTRE">Autre</option>
                </select>
              </div>
              <div><div className="text-xs" style={{ color: T.muted }}>Camion</div><input value={lForm.camion} onChange={(e) => setLForm({ ...lForm, camion: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Chauffeur</div><input value={lForm.chauffeur} onChange={(e) => setLForm({ ...lForm, chauffeur: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
              <div><div className="text-xs" style={{ color: T.muted }}>Manquant (L)</div><Num value={lForm.manquant_l} onChange={(v) => setLForm({ ...lForm, manquant_l: v })} w="w-full" /></div>
            </div>
            <button onClick={submitLivraison} disabled={!lForm.volume_l} className="py-2 px-6 rounded font-medium text-sm mt-2 disabled:opacity-40" style={{ background: T.petrol, color: "white" }}>Enregistrer la livraison</button>
          </Section>

          <Section titre="Historique livraisons" aside={`${livraisons.length}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
                <th className="py-2 text-left font-medium">Date</th><th className="py-2 text-left font-medium">BL</th>
                <th className="py-2 text-left font-medium">Produit</th><th className="py-2 text-right font-medium">Volume</th>
                <th className="py-2 text-left font-medium">Dépôt</th><th className="py-2 text-right font-medium">Manquant</th>
              </tr></thead><tbody>
                {livraisons.slice(0, 30).map((l, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: T.line }}>
                    <td className="py-1.5 tabular">{fmtDate(l.date_livraison)}</td><td className="py-1.5">{l.numero_bl}</td>
                    <td className="py-1.5">{l.produit}</td><td className="py-1.5 text-right tabular font-medium">{F(l.volume_l)} L</td>
                    <td className="py-1.5">{l.depot}</td>
                    <td className="py-1.5 text-right tabular" style={{ color: n(l.manquant_l) > 0 ? T.alert : T.ink }}>{n(l.manquant_l) > 0 ? F(l.manquant_l) : "—"}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            {livraisons.length === 0 && <p className="text-sm py-3" style={{ color: T.muted }}>Aucune livraison enregistrée.</p>}
          </Section>
        </>
      )}
    </div>
  );
}
