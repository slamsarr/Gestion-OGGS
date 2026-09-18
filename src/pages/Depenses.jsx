import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listDepenses, saveDepense, deleteDepense, createCategorie } from "../lib/api";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

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

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const load = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      setCats(r?.categories || r?.categories_depenses || []);
      const ds = await listDepenses(stationId);
      setDeps(ds || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stationId]);

  const saveCat = async () => {
    if (!catForm.code.trim() || !catForm.libelle.trim()) return flash("Code + libellé requis");
    const { error } = await createCategorie(catForm);
    if (error) return flash("Erreur : " + error);
    setCatForm(CAT_VIDE); setShowCat(false); flash("Catégorie de dépense ajoutée");
    load();
  };

  const save = async () => {
    if (!dForm.categorie_code) return flash("Catégorie requise");
    if (!n(dForm.montant) || n(dForm.montant) <= 0) return flash("Montant invalide");
    const res = await saveDepense({ ...dForm, montant: n(dForm.montant), id: uuid() });
    if (res?.error) return flash("Erreur : " + res.error);
    setDForm({ categorie_code: "", libelle: "", montant: "", date_depense: todayISO(), mode_paiement: "ESPECES", station_id: stationId });
    flash("Dépense enregistrée");
    load();
  };

  const del = async (id) => {
    if (!confirm("Supprimer cette dépense ?")) return;
    await deleteDepense(id);
    flash("Dépense supprimée");
    load();
  };

  if (loading) return <Loading label="Chargement des dépenses…" />;

  const total = depenses.reduce((s, d) => s + n(d.montant), 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Dépenses réseau</h1>
      <p className="text-sm mb-3" style={{ color: T.muted }}>Par catégorie — §38 (SYSCOHADA §35, classe 6/65/66)</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

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
