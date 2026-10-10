import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listDepenses, saveDepense, deleteDepense, createCategorie } from "../lib/api";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";
import { peutAgirProfil } from "../lib/permissions";

const CAT_VIDE = { code: "", libelle: "", nature_depense: "FONCTIONNEMENT", compte_syscohada: "6588" };

export default function Depenses() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "";
  const [ref, setRef] = useState(null);
  const [cats, setCats] = useState([]);
  const [depenses, setDeps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showCat, setShowCat] = useState(false);
  const [catForm, setCatForm] = useState(CAT_VIDE);
  const [dForm, setDForm] = useState({ categorie_code: "", libelle: "", montant: "", date_depense: todayISO(), mode_paiement: "ESPECES", station_id: stationId });
  const [isMounted, setIsMounted] = useState(true);

  const peutDeclarer = useMemo(() => peutAgirProfil(profil, "depense", "declarer"), [profil]);
  const peutValider = useMemo(() => peutAgirProfil(profil, "depense", "valider"), [profil]);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const flash = (t) => { if (isMounted) { setMsg(t); setTimeout(() => { if (isMounted) setMsg(""); }, 3500); } };

  const load = async () => {
    if (!isMounted) return;
    try {
      const r = await loadReferentiel();
      if (isMounted) {
        setRef(r);
        setCats(r?.categories || r?.categories_depenses || []);
        const ds = await listDepenses(stationId);
        if (isMounted) setDeps(ds || []);
      }
    } catch (err) {
      console.error("Erreur chargement dépenses:", err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stationId, isMounted]);

  const saveCat = async () => {
    if (!catForm.code.trim() || !catForm.libelle.trim()) return flash("Code + libellé requis");
    const { error } = await createCategorie(catForm);
    if (error) return flash("Erreur : " + error);
    if (isMounted) {
      setCatForm(CAT_VIDE);
      setShowCat(false);
      flash("Catégorie de dépense ajoutée");
      load();
    }
  };

  const save = async () => {
    if (!peutDeclarer) return flash("Tu n'as pas le droit de déclarer une dépense.");
    if (!dForm.categorie_code) return flash("Catégorie requise");
    if (!n(dForm.montant) || n(dForm.montant) <= 0) return flash("Montant invalide");
    const statut = peutValider ? "VALIDE" : "BROUILLON";
    const payload = {
      ...dForm,
      montant: n(dForm.montant),
      id: uuid(),
      statut,
      valide_par: peutValider ? (profil?.nom_complet || profil?.email || "admin") : null,
      date_validation: peutValider ? todayISO() : null,
      cree_par: profil?.nom_complet || profil?.email || "inconnu",
      cree_par_role: profil?.role || "",
    };
    const res = await saveDepense(payload);
    if (res?.error) return flash("Erreur : " + res.error);
    if (isMounted) {
      setDForm({ categorie_code: "", libelle: "", montant: "", date_depense: todayISO(), mode_paiement: "ESPECES", station_id: stationId });
      flash(peutValider ? "✅ Dépense validée" : "💾 Dépense enregistrée en brouillon — en attente de validation Direction");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      load();
    }
  };

  const del = async (id) => {
    const d = depenses.find((x) => x.id === id);
    if (!d) return;
    if (d.statut === "VALIDE" && !peutValider) {
      return flash("⛔ Une dépense validée ne peut être supprimée que par la Direction / Supervision.");
    }
    if (!confirm(d.statut === "BROUILLON"
      ? "Supprimer ce brouillon de dépense ?"
      : "⚠️ Dépense VALIDÉE. Êtes-vous SÛR de vouloir la supprimer ? Cette action est tracée.")) return;
    await deleteDepense(id);
    if (isMounted) {
      flash("Dépense supprimée");
      load();
    }
  };

  const validerDepense = async (id) => {
    if (!peutValider) return flash("⛔ Validation réservée à la Direction / Supervision.");
    const d = depenses.find((x) => x.id === id);
    if (!d) return;
    if (d.statut === "VALIDE") return flash("Déjà validée.");
    const miseAJour = {
      ...d,
      statut: "VALIDE",
      valide_par: profil?.nom_complet || profil?.email || "admin",
      date_validation: todayISO(),
    };
    const { error } = await saveDepense(miseAJour);
    if (error) return flash("Erreur : " + error);
    if (isMounted) {
      flash("✅ Dépense validée — comptabilisée.");
      load();
    }
  };

  if (loading) return <Loading label="Chargement des dépenses…" />;

  const total = depenses.reduce((s, d) => s + n(d.montant), 0);
  const totalValide = depenses.filter((d) => d.statut === "VALIDE").reduce((s, d) => s + n(d.montant), 0);
  const totalBrouillon = depenses.filter((d) => d.statut !== "VALIDE").reduce((s, d) => s + n(d.montant), 0);
  const nbBrouillon = depenses.filter((d) => d.statut !== "VALIDE").length;

  // Ventilation par catégorie (style BASE_DEPENSES Excel)
  const ventilationParCategorie = useMemo(() => {
    const vent = {};
    depenses.forEach((d) => {
      const catCode = d.categorie_code || "DIVERS";
      const cat = cats.find((c) => c.code === catCode);
      const catLibelle = cat?.libelle || "Divers";
      
      if (!vent[catCode]) {
        vent[catCode] = {
          code: catCode,
          libelle: catLibelle,
          total: 0,
          nombre: 0,
          nature: cat?.nature_depense || "FONCTIONNEMENT"
        };
      }
      vent[catCode].total += n(d.montant);
      vent[catCode].nombre += 1;
    });
    return Object.values(vent).sort((a, b) => b.total - a.total);
  }, [depenses, cats]);

  // Ventilation par mode de paiement
  const ventilationParMode = useMemo(() => {
    const vent = {};
    depenses.forEach((d) => {
      const mode = d.mode_paiement || "ESPECES";
      if (!vent[mode]) {
        vent[mode] = { mode, total: 0, nombre: 0 };
      }
      vent[mode].total += n(d.montant);
      vent[mode].nombre += 1;
    });
    return Object.values(vent).sort((a, b) => b.total - a.total);
  }, [depenses]);

  // Ventilation par nature (FONCTIONNEMENT vs INVESTISSEMENT)
  const ventilationParNature = useMemo(() => {
    const vent = { FONCTIONNEMENT: 0, INVESTISSEMENT: 0 };
    depenses.forEach((d) => {
      const catCode = d.categorie_code || "DIVERS";
      const cat = cats.find((c) => c.code === catCode);
      const nature = cat?.nature_depense || "FONCTIONNEMENT";
      vent[nature] += n(d.montant);
    });
    return vent;
  }, [depenses, cats]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Dépenses réseau</h1>
          <p className="text-sm" style={{ color: T.muted }}>Par catégorie — §38 (SYSCOHADA §35, classe 6/65/66)</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {nbBrouillon > 0 && (
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <span>📝</span> {nbBrouillon} brouillon(s) · {F(totalBrouillon)} F
            </span>
          )}
          <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
            <span>✅</span> Validé : {F(totalValide)} F
          </span>
        </div>
      </div>
      {msg && <div className="rounded-xl px-4 py-3 mb-3 text-sm shadow-sm border border-emerald-100" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      <Section titre="Nouvelle dépense" aside={`${cats.length} catégories`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
          <div><div className="text-xs" style={{ color: T.muted }}>Catégorie *</div>
            <select value={dForm.categorie_code} onChange={(e) => setDForm({ ...dForm, categorie_code: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
              <option value="">— choisir —</option>
              {cats.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}
            </select></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Désignation</div>
            <input value={dForm.libelle} onChange={(e) => setDForm({ ...dForm, libelle: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Montant (F) *</div>
            <Num value={dForm.montant} onChange={(v) => setDForm({ ...dForm, montant: v })} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Mode de paiement</div>
            <select value={dForm.mode_paiement} onChange={(e) => setDForm({ ...dForm, mode_paiement: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
              {["ESPECES", "VIREMENT", "CHEQUE", "MOBILE_MONEY", "CARTE"].map((m) => <option key={m}>{m}</option>)}
            </select></div>
        </div>
        <div className="pb-2"><button onClick={save} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer la dépense</button></div>
      </Section>

      {showCat && (
        <Section titre="Nouvelle catégorie de dépense" aside="compte SYSCOHADA §35">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
            <div><div className="text-xs" style={{ color: T.muted }}>Code *</div>
              <input value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Libellé *</div>
              <input value={catForm.libelle} onChange={(e) => setCatForm({ ...catForm, libelle: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Nature</div>
              <select value={catForm.nature_depense} onChange={(e) => setCatForm({ ...catForm, nature_depense: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                {["FONCTIONNEMENT", "INVESTISSEMENT", "EXCEPTIONNEL"].map((n) => <option key={n}>{n}</option>)}
              </select></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Compte SYSCOHADA</div>
              <input value={catForm.compte_syscohada} onChange={(e) => setCatForm({ ...catForm, compte_syscohada: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          </div>
          <div className="pb-2"><button onClick={saveCat} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Ajouter la catégorie</button></div>
        </Section>
      )}

      {/* Ventilation détaillée (style BASE_DEPENSES Excel) */}
      <Section titre="📊 Ventilation Détaillée des Dépenses">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="text-[10px] font-bold text-blue-700 uppercase">Par Catégorie</div>
            <div className="text-2xl font-black text-blue-900 tabular">{ventilationParCategorie.length}</div>
            <div className="text-[10px] text-blue-600">catégorie(s)</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl">
            <div className="text-[10px] font-bold text-purple-700 uppercase">Par Mode Paiement</div>
            <div className="text-2xl font-black text-purple-900 tabular">{ventilationParMode.length}</div>
            <div className="text-[10px] text-purple-600">mode(s)</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Nature Dépenses</div>
            <div className="text-lg font-black text-emerald-900 tabular mt-1">
              Fonct: {F(ventilationParNature.FONCTIONNEMENT)} F
            </div>
            <div className="text-lg font-black text-emerald-900 tabular">
              Invest: {F(ventilationParNature.INVESTISSEMENT)} F
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ventilation par catégorie */}
          <div>
            <h3 className="text-xs font-bold text-gray-800 uppercase mb-3">Par Catégorie</h3>
            <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                  <tr>
                    <th className="py-2.5 px-3 text-left">Catégorie</th>
                    <th className="py-2.5 px-3 text-right">Nombre</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center">Nature</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {ventilationParCategorie.map((v, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-gray-900">{v.libelle}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{v.code}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular">{v.nombre}</td>
                      <td className="py-2.5 px-3 text-right tabular font-bold">{F(v.total)} F</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          v.nature === "FONCTIONNEMENT" ? "bg-blue-100 text-blue-800" :
                          v.nature === "INVESTISSEMENT" ? "bg-purple-100 text-purple-800" :
                          "bg-amber-100 text-amber-800"
                        }`}>
                          {v.nature}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ventilation par mode de paiement */}
          <div>
            <h3 className="text-xs font-bold text-gray-800 uppercase mb-3">Par Mode de Paiement</h3>
            <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                  <tr>
                    <th className="py-2.5 px-3 text-left">Mode</th>
                    <th className="py-2.5 px-3 text-right">Nombre</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {ventilationParMode.map((v, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-bold text-gray-900">{v.mode}</td>
                      <td className="py-2.5 px-3 text-right tabular">{v.nombre}</td>
                      <td className="py-2.5 px-3 text-right tabular font-bold">{F(v.total)} F</td>
                      <td className="py-2.5 px-3 text-right tabular">
                        {total > 0 ? Math.round((v.total / total) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Section>

      <Section titre="Liste des dépenses" aside={`${depenses.length} enregistrées · ${F(total)} F`}>
        {depenses.map((d, i) => (
          <Row key={d.id || i}>
            <div>
              <div className="font-medium">{(cats.find((c) => c.code === d.categorie_code) || {}).libelle || d.categorie_code}</div>
              <div className="text-xs" style={{ color: T.muted }}>{fmtDate(d.date_depense)} · {d.libelle || ""}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular">{F(d.montant)} F</div>
              <div className="text-xs" style={{ color: T.muted }}>{d.mode_paiement || ""}</div>
            </div>
            <button onClick={() => del(d.id)} className="text-xs px-2 py-1" style={{ color: T.alert }}>🗑️</button>
          </Row>
        ))}
        {depenses.length === 0 && <div className="py-3 text-sm" style={{ color: T.muted }}>Aucune dépense pour l'instant</div>}
      </Section>

      <div className="pt-1"><button onClick={() => setShowCat((v) => !v)} className="text-sm" style={{ color: T.petrol }}>+ Gérer les catégories de dépenses</button></div>
    </div>
  );
}
