import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listPompistes, savePompiste, listRapports, listQuarts, saveQuarts as saveQuartsCloud } from "../lib/api";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function Pompistes() {
  const { profil } = useAuth();
  const [ref, setRef] = useState(null);
  const [pompistes, setPompistes] = useState([]);
  const [rapports, setRapports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [nom, setNom] = useState("");
  const [stId, setStId] = useState("");
  const [selectedStation, setSelectedStation] = useState("ALL");

  // Quarts state
  const [quarts, setQuarts] = useState([]);
  const [dateQuart, setDateQuart] = useState(todayISO());

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      const raps = await listRapports();
      setRapports(raps);
      const allP = [];
      for (const st of r.stations) {
        const p = await listPompistes(st.id);
        allP.push(...p);
      }
      setPompistes(allP);
      if (r.stations.length > 0) setStId(r.stations[0].id);
      const existing = await listQuarts(dateQuart);
      setQuarts(existing);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    listQuarts(dateQuart).then(setQuarts);
  }, [dateQuart, loading]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const addPompiste = async () => {
    if (!nom.trim() || !stId) return;
    try {
      const res = await savePompiste({ nom: nom.trim(), station_id: stId });
      if (res?.error) { flash("Erreur : " + res.error); return; }
      setPompistes((p) => [...p, res.pompiste]);
      setNom("");
      setShowAdd(false);
      flash("Pompiste ajouté");
    } catch (e) { flash("Erreur : " + (e.message || e)); }
  };

  const toggleActif = async (p) => {
    try {
      const updated = { ...p, actif: !p.actif };
      const res = await savePompiste(updated);
      if (res?.error) { flash("Erreur : " + res.error); return; }
      setPompistes((list) => list.map((x) => x.id === p.id ? updated : x));
      flash(updated.actif ? "Pompiste activé" : "Pompiste désactivé");
    } catch (e) { flash("Erreur : " + (e.message || e)); }
  };

  // Quart management
  const addQuart = (pompisteId) => {
    setQuarts((q) => [...q, {
      id: uuid(), pompiste_id: pompisteId, rapport_id: null,
      valeur_ventes: "", prelevement: "", tickets: "", cartes_star: "",
      petrosen: "", mobile_money: "", verse: "",
    }]);
  };

  const upQuart = (id, field, val) => {
    setQuarts((q) => q.map((x) => x.id === id ? { ...x, [field]: val } : x));
  };

  const saveQuarts = async () => {
    const withDate = quarts.map((q) => ({ ...q, date: dateQuart }));
    const res = await saveQuartsCloud(withDate);
    if (res.cloud) flash(`${withDate.length} quart(s) synchronisé(s) avec le cloud`);
    else if (res.pending) flash(`${withDate.length} quart(s) enregistré(s) — synchronisation en attente`);
    else flash(`${withDate.length} quart(s) enregistré(s) localement`);
  };

  if (loading) return <Loading />;

  const stations = ref?.stations || [];
  const filteredP = selectedStation === "ALL" ? pompistes : pompistes.filter((p) => p.station_id === selectedStation);
  const stationName = (id) => stations.find((s) => s.id === id)?.nom || id;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Pompistes</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>Gestion des pompistes et quarts journaliers</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Filtre station */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setSelectedStation("ALL")} className="px-3 py-1 rounded-full text-sm" style={{ background: selectedStation === "ALL" ? T.petrol : "white", color: selectedStation === "ALL" ? "white" : T.ink, border: `1px solid ${T.line}` }}>Toutes</button>
        {stations.map((st) => (
          <button key={st.id} onClick={() => setSelectedStation(st.id)} className="px-3 py-1 rounded-full text-sm" style={{ background: selectedStation === st.id ? T.petrol : "white", color: selectedStation === st.id ? "white" : T.ink, border: `1px solid ${T.line}` }}>{st.code}</button>
        ))}
      </div>

      {/* Liste pompistes */}
      <Section titre="👷 Pompistes" aside={`${filteredP.length} pompiste(s)`}>
        {filteredP.map((p) => (
          <Row key={p.id}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${p.actif ? "bg-green-500" : "bg-gray-300"}`} />
              <span className="font-medium">{p.nom}</span>
              <span className="text-xs" style={{ color: T.muted }}>{stationName(p.station_id)}</span>
            </div>
            <button onClick={() => toggleActif(p)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: p.actif ? T.alert : T.ok }}>{p.actif ? "Désactiver" : "Activer"}</button>
          </Row>
        ))}
        {filteredP.length === 0 && <p className="text-sm py-3" style={{ color: T.muted }}>Aucun pompiste enregistré.</p>}

        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} className="w-full py-2 my-2 rounded text-sm font-medium" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}>+ Ajouter un pompiste</button>
        ) : (
          <div className="py-3 grid gap-2">
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du pompiste" className="border rounded px-3 py-2 text-sm" style={{ borderColor: T.line }} />
            <select value={stId} onChange={(e) => setStId(e.target.value)} className="border rounded px-3 py-2 text-sm" style={{ borderColor: T.line }}>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={addPompiste} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Ajouter</button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded text-sm" style={{ color: T.muted }}>Annuler</button>
            </div>
          </div>
        )}
      </Section>

      {/* Quarts journaliers */}
      <Section titre="📋 Quarts du jour" aside={dateQuart}>
        <div className="py-2">
          <input type="date" value={dateQuart} onChange={(e) => setDateQuart(e.target.value)} className="border rounded px-2 py-1 text-sm mb-3" style={{ borderColor: T.line }} />
        </div>

        {quarts.length === 0 && (
          <div className="py-3">
            <p className="text-sm mb-2" style={{ color: T.muted }}>Sélectionnez les pompistes de service :</p>
            <div className="flex flex-wrap gap-2">
              {filteredP.filter((p) => p.actif).map((p) => (
                <button key={p.id} onClick={() => addQuart(p.id)} className="px-3 py-1 rounded text-sm border" style={{ borderColor: T.petrol, color: T.petrol }}>{p.nom}</button>
              ))}
            </div>
          </div>
        )}

        {quarts.map((q) => {
          const pomp = pompistes.find((p) => p.id === q.pompiste_id);
          const ventes = n(q.valeur_ventes);
          const deductions = n(q.prelevement) + n(q.tickets) + n(q.cartes_star) + n(q.petrosen) + n(q.mobile_money);
          const aVerser = ventes - deductions;
          const ecart = n(q.verse) - aVerser;
          return (
            <div key={q.id} className="py-3 border-b" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{pomp?.nom || "?"}</span>
                <button onClick={() => setQuarts((qs) => qs.filter((x) => x.id !== q.id))} className="text-xs" style={{ color: T.alert }}>✕</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <div><div className="text-xs" style={{ color: T.muted }}>Ventes</div><Num value={q.valeur_ventes} onChange={(v) => upQuart(q.id, "valeur_ventes", v)} w="w-full" /></div>
                <div><div className="text-xs" style={{ color: T.muted }}>Prélèvement</div><Num value={q.prelevement} onChange={(v) => upQuart(q.id, "prelevement", v)} w="w-full" /></div>
                <div><div className="text-xs" style={{ color: T.muted }}>Tickets</div><Num value={q.tickets} onChange={(v) => upQuart(q.id, "tickets", v)} w="w-full" /></div>
                <div><div className="text-xs" style={{ color: T.muted }}>Cartes STAR</div><Num value={q.cartes_star} onChange={(v) => upQuart(q.id, "cartes_star", v)} w="w-full" /></div>
                <div><div className="text-xs" style={{ color: T.muted }}>Petrosen/OM/Wave</div><Num value={q.mobile_money} onChange={(v) => upQuart(q.id, "mobile_money", v)} w="w-full" /></div>
                <div><div className="text-xs" style={{ color: T.muted }}>Versé</div><Num value={q.verse} onChange={(v) => upQuart(q.id, "verse", v)} w="w-full" /></div>
              </div>
              <div className="flex justify-between mt-2 text-sm font-semibold">
                <span>À verser : {F(aVerser)} F</span>
                <span style={{ color: Math.abs(ecart) > 500 ? T.alert : T.ok }}>Écart : {ecart > 0 ? "+" : ""}{F(ecart)} F</span>
              </div>
            </div>
          );
        })}

        {quarts.length > 0 && (
          <div className="py-3 grid gap-2">
            <button onClick={() => { const p = filteredP.filter((p) => p.actif && !quarts.find((q) => q.pompiste_id === p.id)); if (p.length > 0) addQuart(p[0].id); }} className="text-sm" style={{ color: T.petrol }}>+ Ajouter un pompiste au quart</button>
            <button onClick={saveQuarts} className="py-3 rounded-lg font-semibold" style={{ background: T.gold, color: T.ink }}>Enregistrer les quarts</button>
          </div>
        )}
      </Section>
    </div>
  );
}
