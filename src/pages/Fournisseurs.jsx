import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel, listFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  listAchats, createAchat, updateAchat,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function Fournisseurs() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "";
  const [ref, setRef] = useState(null);
  const [fous, setFous] = useState([]);
  const [achats, setAchats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showFo, setShowFo] = useState(false);
  const [formFo, setFormFo] = useState({ code: "", nom_fournisseur: "", telephone: "", email: "", adresse: "" });
  const [showAc, setShowAc] = useState(false);
  const [showAchatsFor, setShowAchatsFor] = useState(null);
  const [formAc, setFormAc] = useState({ fournisseur_id: "", date_achat: todayISO(), designation: "", quantite: "", prix_unitaire: "", montant: "" });
  const [editFoId, setEditFoId] = useState(null);
  const [editFou, setEditFou] = useState(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const load = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const fo = await listFournisseurs(stationId);
      setFous(fo || []);
      const ac = await listAchats(stationId);
      setAchats(ac || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stationId]);

  const saveFour = async () => {
    if (!formFo.nom_fournisseur.trim()) return flash("Nom du fournisseur requis");
    const payload = { ...formFo, code: formFo.code || (formFo.nom_fournisseur || "").trim().toUpperCase().replace(/\s+/g, "-"), station_id: stationId };
    const res = editFou ? await updateFournisseur(editFou.id, payload) : await createFournisseur(payload);
    if (res?.error) return flash("Erreur : " + res.error);
    flash(editFou ? "Fournisseur mis à jour" : "Fournisseur ajouté");
    setShowFo(false); setFormFo({ code: "", nom_fournisseur: "", telephone: "", email: "", adresse: "" }); setEditFou(null);
    load();
  };

  const delFour = async (id) => {
    if (!confirm("Supprimer ce fournisseur ?")) return;
    const res = await deleteFournisseur(id);
    if (res?.error) return flash("Erreur : " + res.error);
    flash("Fournisseur supprimé");
    load();
  };

  const saveAcho = async () => {
    if (!formAc.fournisseur_id) return flash("Choisissez le fournisseur");
    const montant = n(formAc.montant) || n(formAc.quantite) * n(formAc.prix_unitaire);
    const payload = { ...formAc, montant, station_id: stationId, id: uuid() };
    const res = await createAchat(payload);
    if (res?.error) return flash("Erreur : " + res.error);
    flash("Achat enregistré");
    setShowAc(false);
    setFormAc({ fournisseur_id: "", date_achat: todayISO(), designation: "", quantite: "", prix_unitaire: "", montant: "" });
    load();
  };

  if (loading) return <Loading label="Chargement fournisseurs…" />;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Fournisseurs & achats</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>Base fournisseurs §34 — achats/approvisionnement carburant & produits</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      <Section titre="Nouveau fournisseur" aside="Livraisons carburant, lubrifiants, gaz — §34">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
          <div><div className="text-xs" style={{ color: T.muted }}>Code</div>
            <input value={formFo.code} onChange={(e) => setFormFo({ ...formFo, code: e.target.value })} placeholder="FR-001" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Nom fournisseur *</div>
            <input value={formFo.nom_fournisseur} onChange={(e) => setFormFo({ ...formFo, nom_fournisseur: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Téléphone</div>
            <input value={formFo.telephone} onChange={(e) => setFormFo({ ...formFo, telephone: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Email</div>
            <input value={formFo.email} onChange={(e) => setFormFo({ ...formFo, email: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
        </div>
        <div className="flex gap-2 pb-2">
          <button onClick={saveFour} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>
            {editFou ? "Mettre à jour" : "Ajouter le fournisseur"}
          </button>
          {editFou && <button onClick={() => { setEditFou(null); setShowFo(false); setFormFo({ code: "", nom_fournisseur: "", telephone: "", email: "", adresse: "" }); }} className="text-sm" style={{ color: T.muted }}>Annuler</button>}
        </div>
      </Section>

      <Section titre="Fournisseurs" aside={`${fous.length} actifs`}>
        {fous.map((f, i) => (
          <Row key={f.id || i}>
            <div>
              <div className="font-medium">{f.nom_fournisseur}</div>
              <div className="text-xs" style={{ color: T.muted }}>{f.code}{f.telephone ? ` · ${f.telephone}` : ""}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setEditFou(f); setShowFo(true); setFormFo(f); }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.petrol }}>✏️</button>
              <button onClick={() => setShowAchatsFor(showAchatsFor === f.id ? null : f.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.petrol }}>🧾 {achats.filter((a) => a.fournisseur_id === f.id).length}</button>
              <button onClick={() => delFour(f.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.alert }}>🗑️</button>
            </div>
          </Row>
        ))}
        {fous.length === 0 && <div className="py-3 text-sm" style={{ color: T.muted }}>Aucun fournisseur — ajoutez-en un ci-dessus</div>}
      </Section>

      {showAchatsFor && (
        <Section titre={`Achats — ${(fous.find((f) => f.id === showAchatsFor) || {}).nom_fournisseur || ""}`} aside={`${achats.filter((a) => a.fournisseur_id === showAchatsFor).length} bons`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
            <div><div className="text-xs" style={{ color: T.muted }}>Date *</div>
              <input type="date" value={formAc.date_achat} onChange={(e) => setFormAc({ ...formAc, date_achat: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Désignation *</div>
              <input value={formAc.designation} onChange={(e) => setFormAc({ ...formAc, designation: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Quantité</div>
              <Num value={formAc.quantite} onChange={(v) => setFormAc({ ...formAc, quantite: v })} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Prix unitaire (F)</div>
              <Num value={formAc.prix_unitaire} onChange={(v) => setFormAc({ ...formAc, prix_unitaire: v })} /></div>
          </div>
          <div className="pb-2"><button onClick={saveAcho} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer l'achat</button></div>
          {achats.filter((a) => a.fournisseur_id === showAchatsFor).map((a, i) => (
            <Row key={a.id || i}>
              <div>
                <div className="font-medium">{a.designation}</div>
                <div className="text-xs" style={{ color: T.muted }}>{fmtDate(a.date_achat)} · {a.quantite || ""} {a.unite || "u"}</div>
              </div>
              <div className="text-right font-semibold tabular">{F(a.montant)} F</div>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}
