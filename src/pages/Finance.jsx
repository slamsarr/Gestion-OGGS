import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, listOperationsCredit, saveOperationCredit, soldeClient, getParametres } from "../lib/api";
import { F, fmtDate, n, T, ecrireSyscohada, calculer, todayISO } from "../lib/calcul";
import { exporterCsv } from "../lib/exportExcel";
import { Section, Num, Loading } from "../components/ui";
import { db } from "../lib/db";
import { getSupabase } from "../lib/supabase";

export default function Finance() {
  const { profil } = useAuth();
  const [ref, setRef] = useState(null);
  const [rapports, setRapports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Credit operations
  const [selectedClient, setSelectedClient] = useState(null);
  const [ops, setOps] = useState([]);
  const [soldes, setSoldes] = useState({});
  const [devise, setDevise] = useState("FCFA");
  const [showOpForm, setShowOpForm] = useState(false);
  const [opForm, setOpForm] = useState({ client_code: "", date_op: todayISO(), matricule: "", volume_l: "", valeur_cons: "", depot: "" });

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      const p = await getParametres();
      if (p?.devise) setDevise(p.devise);
      const raps = await listRapports({ page: 1, limit: 100 });
      setRapports(raps);
      setTotalPages(raps.pages || 1);
      // Calculate soldes
      const s = {};
      for (const cl of (r.clients || [])) {
        s[cl.code] = await soldeClient(cl.code);
      }
      setSoldes(s);
      setLoading(false);
    })();
  }, []);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    const raps = await listRapports({ page: next, limit: 100 });
    setRapports((prev) => { const merged = [...prev, ...raps]; merged.total = raps.total; merged.pages = raps.pages; return merged; });
    setPage(next);
    setTotalPages(raps.pages || 1);
    setLoadingMore(false);
  };

  const loadOps = async (code) => {
    setSelectedClient(code);
    const o = await listOperationsCredit(code);
    setOps(o);
    setOpForm((f) => ({ ...f, client_code: code }));
  };

  const submitOp = async () => {
    if (!opForm.client_code) return;
    try {
      const res = await saveOperationCredit({ ...opForm, station_id: profil?.station_id || "" });
      setMsg(res.pending ? "Opération crédit enregistrée localement — synchronisation en attente" : "Opération crédit enregistrée");
      setTimeout(() => setMsg(""), 3500);
      const newSolde = n(soldes[opForm.client_code]) + n(opForm.depot) - n(opForm.valeur_cons);
      setSoldes((s) => ({ ...s, [opForm.client_code]: newSolde }));
      loadOps(opForm.client_code);
      setOpForm({ client_code: opForm.client_code, date_op: todayISO(), matricule: "", volume_l: "", valeur_cons: "", depot: "" });
      setShowOpForm(false);
    } catch (e) {
      setMsg("Erreur : " + (e.message || e));
      setTimeout(() => setMsg(""), 4000);
    }
  };

  if (loading) return <Loading />;

  const valides = rapports.filter((r) => r.statut === "VALIDE");
  const totalCA = valides.reduce((s, r) => s + n(r.ca_total), 0);
  const totalVers = valides.reduce((s, r) => s + n(r.total_versements), 0);
  const totalDep = valides.reduce((s, r) => s + n(r.depenses), 0);
  const totalTick = valides.reduce((s, r) => s + n(r.tickets), 0);
  const totalEcart = valides.reduce((s, r) => s + n(r.ecart_caisse), 0);
  const clients = ref?.clients || [];

  const exportSyscohada = () => {
    const all = [["Date", "Journal", "Compte", "Libellé", "Débit", "Crédit", "Pièce", "Station"]];
    for (const r of valides) { try { const c = calculer(r, ref); const stName = (ref.stations.find((s) => s.code === r.station) || {}).nom || r.station; const rows = ecrireSyscohada(r, c, stName); all.push(...rows.slice(1)); } catch {} }
    exporterCsv(`SYSCOHADA_RESEAU_${todayISO()}.xlsx`, all);
  };

  const exportJournal = () => {
    const rows = [["Date", "Station", "CA Total", "Tickets", "Dépenses", "À verser", "Versements", "Écart"]];
    for (const r of valides) { rows.push([r.date || r.date_rapport, r.station, r.ca_total, r.tickets, r.depenses, r.a_verser, r.total_versements, r.ecart_caisse]); }
    exporterCsv(`JOURNAL_CAISSE_${todayISO()}.xlsx`, rows);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Suivi financier</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>{valides.length} rapports validés</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: "CA Total", value: `${F(totalCA)} ${devise}` },
          { label: "Versements", value: `${F(totalVers)} ${devise}` },
          { label: "Dépenses", value: `${F(totalDep)} ${devise}` },
          { label: "Tickets/Bons", value: `${F(totalTick)} ${devise}` },
          { label: "Écarts cumulés", value: `${F(totalEcart)} ${devise}`, color: Math.abs(totalEcart) > 10000 ? T.alert : T.ok },
          { label: "Encours crédit", value: `${F(Object.values(soldes).reduce((s, v) => s + Math.abs(Math.min(0, v)), 0))} ${devise}`, color: "#B7791F" },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-lg p-3" style={{ border: `1px solid ${T.line}` }}>
            <div className="text-xs" style={{ color: T.muted }}>{k.label}</div>
            <div className="text-lg font-bold tabular" style={{ color: k.color || T.petrol }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Journal */}
      <Section titre="Journal de caisse">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
            <th className="py-2 text-left font-medium">Date</th><th className="py-2 text-left font-medium">Station</th>
            <th className="py-2 text-right font-medium">CA</th><th className="py-2 text-right font-medium">Tickets</th>
            <th className="py-2 text-right font-medium">Dépenses</th><th className="py-2 text-right font-medium">Versements</th>
            <th className="py-2 text-right font-medium">Écart</th>
          </tr></thead><tbody>
            {valides.map((r, i) => (
              <tr key={i} className="border-b" style={{ borderColor: T.line }}>
                <td className="py-1.5 tabular">{fmtDate(r.date || r.date_rapport)}</td><td className="py-1.5">{r.station}</td>
                <td className="py-1.5 text-right tabular">{F(r.ca_total)}</td><td className="py-1.5 text-right tabular">{F(r.tickets)}</td>
                <td className="py-1.5 text-right tabular">{F(r.depenses)}</td><td className="py-1.5 text-right tabular">{F(r.total_versements)}</td>
                <td className="py-1.5 text-right tabular" style={{ color: Math.abs(n(r.ecart_caisse)) > 5000 ? T.alert : T.ink }}>{F(r.ecart_caisse)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
        {page < totalPages && (
          <button onClick={loadMore} disabled={loadingMore} className="w-full py-2 mt-1 rounded text-sm font-medium disabled:opacity-50" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol, background: "white" }}>
            {loadingMore ? "Chargement…" : `Charger plus (page ${page + 1}/${totalPages})`}
          </button>
        )}
        {valides.length === 0 && <p className="text-sm py-4 text-center" style={{ color: T.muted }}>Aucun rapport validé.</p>}
      </Section>

      {/* Clients à crédit */}
      <Section titre="💳 Clients à crédit" aside={`${clients.length} clients`}>
        {clients.map((cl) => {
          const sol = soldes[cl.code] || 0;
          return (
            <div key={cl.code} className="py-2 border-b cursor-pointer" style={{ borderColor: T.line }} onClick={() => loadOps(cl.code)}>
              <div className="flex justify-between items-center">
                <div><span className="font-medium">{cl.nom}</span><span className="text-xs ml-2" style={{ color: T.muted }}>({cl.code})</span></div>
                <div className="text-right">
                  <div className="font-semibold tabular" style={{ color: sol < 0 ? T.alert : T.ok }}>{F(sol)} F</div>
                  <div className="text-xs" style={{ color: T.muted }}>Plafond : {F(cl.plafond || 0)} F</div>
                </div>
              </div>
              {selectedClient === cl.code && (
                <div className="mt-2 pl-2" style={{ borderLeft: `2px solid ${T.petrol}` }}>
                  {!showOpForm ? (
                    <button onClick={(e) => { e.stopPropagation(); setShowOpForm(true); }} className="text-sm mb-2" style={{ color: T.petrol }}>+ Nouvelle opération</button>
                  ) : (
                    <div className="grid gap-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div><div className="text-xs" style={{ color: T.muted }}>Date</div><input type="date" value={opForm.date_op} onChange={(e) => setOpForm({ ...opForm, date_op: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
                        <div><div className="text-xs" style={{ color: T.muted }}>Matricule</div><input value={opForm.matricule} onChange={(e) => setOpForm({ ...opForm, matricule: e.target.value })} placeholder="AA-123-BB" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
                        <div><div className="text-xs" style={{ color: T.muted }}>Volume (L)</div><Num value={opForm.volume_l} onChange={(v) => setOpForm({ ...opForm, volume_l: v })} w="w-full" /></div>
                        <div><div className="text-xs" style={{ color: T.muted }}>Consommation (F)</div><Num value={opForm.valeur_cons} onChange={(v) => setOpForm({ ...opForm, valeur_cons: v })} w="w-full" /></div>
                        <div><div className="text-xs" style={{ color: T.muted }}>Dépôt (F)</div><Num value={opForm.depot} onChange={(v) => setOpForm({ ...opForm, depot: v })} w="w-full" /></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={submitOp} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer</button>
                        <button onClick={(e) => { e.stopPropagation(); setShowOpForm(false); }} className="text-sm" style={{ color: T.muted }}>Annuler</button>
                      </div>
                    </div>
                  )}
                  {ops.length > 0 && (
                    <table className="w-full text-xs mt-2"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
                      <th className="py-1 text-left">Date</th><th className="py-1 text-left">Matricule</th>
                      <th className="py-1 text-right">Vol(L)</th><th className="py-1 text-right">Conso(F)</th>
                      <th className="py-1 text-right">Dépôt(F)</th>
                    </tr></thead><tbody>
                      {ops.slice(0, 20).map((o, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: T.line }}>
                          <td className="py-1 tabular">{fmtDate(o.date_op)}</td><td className="py-1">{o.matricule}</td>
                          <td className="py-1 text-right tabular">{F(o.volume_l)}</td>
                          <td className="py-1 text-right tabular" style={{ color: T.alert }}>{n(o.valeur_cons) > 0 ? `-${F(o.valeur_cons)}` : ""}</td>
                          <td className="py-1 text-right tabular" style={{ color: T.ok }}>{n(o.depot) > 0 ? `+${F(o.depot)}` : ""}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                  {ops.length === 0 && <p className="text-xs py-1" style={{ color: T.muted }}>Aucune opération</p>}
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Export */}
      <div className="mt-4 grid gap-2">
        <button onClick={exportJournal} disabled={valides.length === 0} className="py-3 rounded-lg font-medium disabled:opacity-40" style={{ border: `1px solid ${T.petrol}`, color: T.petrol, background: "white" }}>📥 Exporter le journal de caisse</button>
        <button onClick={exportSyscohada} disabled={valides.length === 0} className="py-3 rounded-lg font-medium disabled:opacity-40" style={{ background: T.petrol, color: "white" }}>📊 Exporter écritures SYSCOHADA</button>
      </div>
    </div>
  );
}
