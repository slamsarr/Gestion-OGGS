import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel, listProfilsCloud, updateProfilRole,
  createStation, updateStation,
  createPrix, deletePrix,
  createProduit, updateProduit,
  createCategorie, updateCategorie, deleteCategorie,
  createClientCredit, updateClientCredit,
  listCuves, saveCuve,
  getParametres, saveParametres, diagSync,
} from "../lib/api";
import { setLocalRef } from "../lib/db";
import { F, n, T, todayISO } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

function AddForm({ label, children, onSubmit, show, setShow }) {
  if (!show) return <button onClick={() => setShow(true)} className="w-full py-2 my-2 rounded text-sm font-medium" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}>+ {label}</button>;
  return (
    <div className="py-3 border-t grid gap-2" style={{ borderColor: T.line }}>
      <div className="text-sm font-medium" style={{ color: T.petrol }}>{label}</div>
      {children}
      <div className="flex gap-2"><button onClick={onSubmit} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Ajouter</button><button onClick={() => setShow(false)} className="text-sm" style={{ color: T.muted }}>Annuler</button></div>
    </div>
  );
}

function Actions({ onEdit, onOther, otherLabel, otherColor }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.petrol }}>✏️</button>
      {onOther && <button onClick={onOther} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: otherColor || T.alert }}>{otherLabel}</button>}
    </div>
  );
}

const inp = "w-full border rounded px-2 py-1.5 text-sm bg-white";

export default function Parametres() {
  const { profil, cloud } = useAuth();
  const [ref, setRef] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Add form states
  const [showSt, setShowSt] = useState(false);
  const [stForm, setStForm] = useState({ code: "", nom: "", localisation: "", nb_pistolets: 8 });
  const [showPx, setShowPx] = useState(false);
  const [pxForm, setPxForm] = useState({ produit: "GASOIL", prix_vente: "", prix_achat: "", date_effet: todayISO() });
  const [showProd, setShowProd] = useState(false);
  const [prodForm, setProdForm] = useState({ code: "", designation: "", famille: "LUBRIFIANT", unite: "unité", prix_vente: "", seuil_alerte: 5 });
  const [showCat, setShowCat] = useState(false);
  const [catForm, setCatForm] = useState({ code: "", libelle: "", nature: "VARIABLE", compte_syscohada: "6588" });
  const [showCl, setShowCl] = useState(false);
  const [clForm, setClForm] = useState({ code: "", nom: "", plafond: 0 });
  const [cuves, setCuves] = useState([]);
  const [parametres, setParametres] = useState(null);
  const [diag, setDiag] = useState(null);

  // Edit states
  const [editSt, setEditSt] = useState(null);
  const [editProd, setEditProd] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [editCl, setEditCl] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      if (cloud) { try { const u = await listProfilsCloud(); setUsers(u); } catch {} }
      if (r.stations.length > 0) {
        const all = [];
        for (const st of r.stations) {
          const c = await listCuves(st.id);
          all.push(...c);
        }
        setCuves(all);
      }
      const p = await getParametres();
      setParametres(p);
      try { setDiag(await diagSync()); } catch {}
      setLoading(false);
    })();
  }, [cloud]);

  const testerSync = async () => {
    setDiag({ ...(diag || {}), ok: null, pending: true });
    const d = await diagSync();
    setDiag(d);
  };

  const saveParams = async () => {
    if (!parametres || !parametres.nom_reseau) return;
    const res = await saveParametres(parametres);
    flash(res.cloud ? "Paramètres réseau enregistrés dans le cloud" : `Paramètres enregistrés${res.pending ? " (sync en attente)" : ""}`);
  };

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };
  const reload = async () => { const r = await loadReferentiel(); setRef(r); };
  const patchRef = async (fn) => {
    const next = fn({ ...ref });
    setRef(next);
    await setLocalRef(next);
  };

  const addStation = async () => {
    if (!stForm.code || !stForm.nom) return;
    const res = await createStation(stForm);
    if (res.ok) { flash("Station ajoutée"); setShowSt(false); setStForm({ code: "", nom: "", localisation: "", nb_pistolets: 8 }); reload(); }
    else flash("Erreur : " + res.error);
  };
  const saveEditSt = async () => {
    if (!editSt) return;
    const res = await updateStation(editSt.id, { nom: editSt.nom, localisation: editSt.localisation, nb_pistolets: n(editSt.nb_pistolets) });
    if (!res.error) { flash("Station mise à jour"); setEditSt(null); patchRef((r) => ({ ...r, stations: r.stations.map((s) => s.id === editSt.id ? { ...s, nom: editSt.nom, localisation: editSt.localisation, nb_pistolets: n(editSt.nb_pistolets) } : s) })); }
    else flash("Erreur : " + res.error);
  };
  const toggleStation = async (st) => {
    const res = await updateStation(st.id, { actif: !st.actif });
    if (!res.error) { flash(st.actif ? "Station désactivée" : "Station activée"); patchRef((r) => ({ ...r, stations: r.stations.map((s) => s.id === st.id ? { ...s, actif: !s.actif } : s) })); }
    else flash("Erreur : " + res.error);
  };

  const addPrix = async () => {
    if (!pxForm.prix_vente) return;
    const res = await createPrix(pxForm);
    if (res.ok) { flash("Prix ajouté"); setShowPx(false); setPxForm({ produit: "GASOIL", prix_vente: "", prix_achat: "", date_effet: todayISO() }); reload(); }
    else flash("Erreur : " + res.error);
  };
  const delPrix = async (p) => {
    if (!p.id) { flash("Prix de référence (seed) : suppression non disponible en démo"); return; }
    if (!window.confirm(`Supprimer le prix ${p.produit} ${F(p.prix_vente)} F du ${p.date_effet} ?`)) return;
    const res = await deletePrix(p.id);
    if (!res.error) { flash("Prix supprimé"); reload(); } else flash("Erreur : " + res.error);
  };

  const addProduit = async () => {
    if (!prodForm.code || !prodForm.designation) return;
    const res = await createProduit(prodForm);
    if (res.ok) { flash("Produit ajouté"); setShowProd(false); setProdForm({ code: "", designation: "", famille: "LUBRIFIANT", unite: "unité", prix_vente: "", seuil_alerte: 5 }); reload(); }
    else flash("Erreur : " + res.error);
  };
  const saveEditProd = async () => {
    if (!editProd) return;
    const res = await updateProduit(editProd.id, { designation: editProd.designation, prix_vente: n(editProd.prix_vente), seuil_alerte: n(editProd.seuil_alerte) || 5 });
    if (!res.error) { flash("Produit mis à jour"); setEditProd(null); reload(); }
    else flash("Erreur : " + res.error);
  };
  const toggleProduit = async (p) => {
    const res = await updateProduit(p.id, { actif: !p.actif });
    if (!res.error) { flash(p.actif ? "Produit désactivé" : "Produit activé"); reload(); }
    else flash("Erreur : " + res.error);
  };

  const addCategorie = async () => {
    if (!catForm.code || !catForm.libelle) return;
    const res = await createCategorie(catForm);
    if (res.ok) { flash("Catégorie ajoutée"); setShowCat(false); setCatForm({ code: "", libelle: "", nature: "VARIABLE", compte_syscohada: "6588" }); reload(); }
    else flash("Erreur : " + res.error);
  };
  const saveEditCat = async () => {
    if (!editCat) return;
    const res = await updateCategorie(editCat.id, { libelle: editCat.libelle, nature: editCat.nature, compte_syscohada: editCat.compte_syscohada });
    if (!res.error) { flash("Catégorie mise à jour"); setEditCat(null); reload(); }
    else flash("Erreur : " + res.error);
  };
  const delCategorie = async (c) => {
    if (!window.confirm(`Supprimer la catégorie « ${c.libelle} » ?`)) return;
    const res = await deleteCategorie(c.id || c.code);
    if (!res.error) { flash("Catégorie supprimée"); reload(); } else flash("Erreur : " + res.error);
  };

  const addClient = async () => {
    if (!clForm.code || !clForm.nom) return;
    const res = await createClientCredit(clForm);
    if (res.ok) { flash("Client ajouté"); setShowCl(false); setClForm({ code: "", nom: "", plafond: 0 }); reload(); }
    else flash("Erreur : " + res.error);
  };
  const saveEditCl = async () => {
    if (!editCl) return;
    const res = await updateClientCredit(editCl.id, { nom: editCl.nom, plafond: n(editCl.plafond) });
    if (!res.error) { flash("Client mis à jour"); setEditCl(null); patchRef((r) => ({ ...r, clients: r.clients.map((c) => c.id === editCl.id || c.code === editCl.code ? { ...c, nom: editCl.nom, plafond: n(editCl.plafond) } : c) })); }
    else flash("Erreur : " + res.error);
  };
  const toggleClient = async (c) => {
    const res = await updateClientCredit(c.id, { actif: !c.actif });
    if (!res.error) { flash(c.actif ? "Client désactivé" : "Client activé"); patchRef((r) => ({ ...r, clients: r.clients.map((x) => x.id === c.id ? { ...x, actif: !x.actif } : x) })); }
    else flash("Erreur : " + res.error);
  };

  const changeRole = async (userId, role) => {
    const res = await updateProfilRole(userId, { role });
    if (!res.error) { flash("Rôle mis à jour"); setUsers((u) => u.map((x) => x.id === userId ? { ...x, role } : x)); }
    else flash("Erreur");
  };
  const editCuve = (id, capacite_l) => setCuves((list) => list.map((c) => c.id === id ? { ...c, capacite_l } : c));
  const saveCuves = async () => {
    let ok = 0;
    for (const c of cuves) {
      const res = await saveCuve(c);
      if (res.ok) ok++;
    }
    flash(`${ok} cuve(s) mise(s) à jour`);
    reload();
  };

  if (loading) return <Loading />;

  const stations = ref?.stations || [];
  const prix = ref?.prix || [];
  const produits = ref?.produits || [];
  const categories = ref?.categories || [];
  const clients = ref?.clients || [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Paramètres réseau</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>Configuration stations, produits, prix, utilisateurs</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Paramètres réseau */}
      {parametres && (
        <Section titre="🏷️ Réseau" aside="Nom, devise, contact">
          <div className="grid grid-cols-2 gap-2 py-2">
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Nom du réseau</div>
              <input value={parametres.nom_reseau} onChange={(e) => setParametres({ ...parametres, nom_reseau: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm bg-white" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Devise</div>
              <input value={parametres.devise} onChange={(e) => setParametres({ ...parametres, devise: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm bg-white" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Adresse</div>
              <input value={parametres.adresse || ""} onChange={(e) => setParametres({ ...parametres, adresse: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm bg-white" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Contact</div>
              <input value={parametres.contact || ""} onChange={(e) => setParametres({ ...parametres, contact: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm bg-white" style={{ borderColor: T.line }} /></div>
          </div>
          <button onClick={saveParams} className="w-full py-2 my-2 rounded text-sm font-medium" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}>Enregistrer les paramètres</button>
        </Section>
      )}

      {/* Diagnostic synchronisation */}
      <Section titre="🔄 Synchronisation" aside={cloud ? "Cloud Supabase" : "Démo locale"}>
        <div className="py-2 text-sm grid gap-1">
          {diag && (
            <>
              <div className="flex justify-between"><span style={{ color: T.muted }}>Connexion cloud</span>
                <span className="font-medium" style={{ color: diag.ok === false ? T.alert : (diag.ok === true ? T.ok : T.muted) }}>
                  {diag.pending ? "Test en cours…" : (diag.ok === true ? "Opérationnelle" : (diag.ok === false ? "Indisponible" : "—"))}
                </span></div>
              <div className="flex justify-between"><span style={{ color: T.muted }}>Rapports locaux</span><span className="tabular">{diag.localRapports ?? "—"}</span></div>
              {diag.cloudRapports != null && <div className="flex justify-between"><span style={{ color: T.muted }}>Rapports cloud</span><span className="tabular">{diag.cloudRapports}</span></div>}
              <div className="flex justify-between"><span style={{ color: T.muted }}>{diag.pending ? "File d'attente locale" : "En attente de synchronisation"}</span>
                <span className="tabular font-medium" style={{ color: (diag.pending ?? 0) > 0 ? "#B7791F" : T.ok }}>{diag.pending ?? 0}</span></div>
              <div className="flex justify-between"><span style={{ color: T.muted }}>Dernière synchronisation</span><span className="tabular">{diag.lastSync ? new Date(diag.lastSync).toLocaleString() : "jamais"}</span></div>
              {diag.erreur && <div className="text-xs mt-1" style={{ color: T.alert }}>{diag.erreur}</div>}
            </>
          )}
          {!diag && <p className="text-sm py-2" style={{ color: T.muted }}>Chargement du diagnostic…</p>}
          <button onClick={testerSync} className="w-full py-2 my-2 rounded text-sm font-medium" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}>Tester la synchronisation</button>
        </div>
      </Section>

      {/* Stations */}
      <Section titre="🏪 Stations" aside={`${stations.length}`}>
        {stations.map((st) => (
          editSt?.id === st.id ? (
            <div key={st.id || st.code} className="py-2 border-b grid gap-2" style={{ borderColor: T.line }}>
              <div className="grid grid-cols-2 gap-2">
                <input value={editSt.nom} onChange={(e) => setEditSt({ ...editSt, nom: e.target.value })} className={inp} style={{ borderColor: T.line }} />
                <input value={editSt.localisation} onChange={(e) => setEditSt({ ...editSt, localisation: e.target.value })} className={inp} style={{ borderColor: T.line }} />
                <input type="number" value={editSt.nb_pistolets} onChange={(e) => setEditSt({ ...editSt, nb_pistolets: +e.target.value })} className={inp} style={{ borderColor: T.line }} />
              </div>
              <div className="flex gap-2"><button onClick={saveEditSt} className="px-3 py-1 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer</button>
                <button onClick={() => setEditSt(null)} className="text-sm" style={{ color: T.muted }}>Annuler</button></div>
            </div>
          ) : (
            <Row key={st.id || st.code}>
              <div>{!st.actif && <span className="mr-1 text-xs px-1.5 py-0.5 rounded" style={{ background: T.paper, color: T.muted }}>Inactif</span>}<span className="font-semibold">{st.code}</span><span className="text-sm ml-2">{st.nom}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: T.muted }}>{st.localisation || "—"} · {st.nb_pistolets || 8} pist.</span>
                <Actions onEdit={() => setEditSt({ id: st.id, nom: st.nom, localisation: st.localisation, nb_pistolets: st.nb_pistolets })} onOther={() => toggleStation(st)} otherLabel={st.actif ? "Désactiver" : "Activer"} otherColor={st.actif ? T.alert : T.ok} />
              </div>
            </Row>
          )
        ))}
        <AddForm label="Ajouter une station" show={showSt} setShow={setShowSt} onSubmit={addStation}>
          <div className="grid grid-cols-2 gap-2">
            <input value={stForm.code} onChange={(e) => setStForm({ ...stForm, code: e.target.value.toUpperCase() })} placeholder="Code (ex: HANN)" className={inp} style={{ borderColor: T.line }} />
            <input value={stForm.nom} onChange={(e) => setStForm({ ...stForm, nom: e.target.value })} placeholder="Nom complet" className={inp} style={{ borderColor: T.line }} />
            <input value={stForm.localisation} onChange={(e) => setStForm({ ...stForm, localisation: e.target.value })} placeholder="Localisation" className={inp} style={{ borderColor: T.line }} />
            <input type="number" value={stForm.nb_pistolets} onChange={(e) => setStForm({ ...stForm, nb_pistolets: +e.target.value })} placeholder="Nb pistolets" className={inp} style={{ borderColor: T.line }} />
          </div>
        </AddForm>
      </Section>

      {/* Prix */}
      <Section titre="⛽ Prix carburants" aside="Historique">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
            <th className="py-2 text-left font-medium">Produit</th><th className="py-2 text-right font-medium">Vente</th><th className="py-2 text-right font-medium">Achat</th><th className="py-2 text-right font-medium">Date effet</th><th className="py-2" />
          </tr></thead><tbody>
            {[...prix].sort((a, b) => (b.date_effet || "").localeCompare(a.date_effet || "")).map((p, i) => (
              <tr key={p.id || i} className="border-b" style={{ borderColor: T.line }}>
                <td className="py-1.5 font-medium">{p.produit}</td><td className="py-1.5 text-right tabular">{F(p.prix_vente)} F</td>
                <td className="py-1.5 text-right tabular" style={{ color: T.muted }}>{p.prix_achat ? `${F(p.prix_achat)} F` : "—"}</td><td className="py-1.5 text-right tabular">{p.date_effet}</td>
                <td className="py-1.5 text-right"><button onClick={() => delPrix(p)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.alert }}>✕</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <AddForm label="Ajouter un prix" show={showPx} setShow={setShowPx} onSubmit={addPrix}>
          <div className="grid grid-cols-2 gap-2">
            <select value={pxForm.produit} onChange={(e) => setPxForm({ ...pxForm, produit: e.target.value })} className={inp} style={{ borderColor: T.line }}>
              <option value="GASOIL">Gasoil</option><option value="SUPER">Super</option>
            </select>
            <input type="date" value={pxForm.date_effet} onChange={(e) => setPxForm({ ...pxForm, date_effet: e.target.value })} className={inp} style={{ borderColor: T.line }} />
            <div><div className="text-xs" style={{ color: T.muted }}>Prix vente</div><Num value={pxForm.prix_vente} onChange={(v) => setPxForm({ ...pxForm, prix_vente: v })} w="w-full" /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Prix achat</div><Num value={pxForm.prix_achat} onChange={(v) => setPxForm({ ...pxForm, prix_achat: v })} w="w-full" /></div>
          </div>
        </AddForm>
      </Section>

      {/* Produits */}
      <Section titre="🛢️ Produits" aside={`${produits.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
            <th className="py-2 text-left font-medium">Désignation</th><th className="py-2 text-left font-medium">Famille</th><th className="py-2 text-right font-medium">Prix</th><th className="py-2 text-right font-medium">Seuil</th><th className="py-2" />
          </tr></thead><tbody>
            {produits.map((p) => (
              <tr key={p.id || p.code} className="border-b" style={{ borderColor: T.line }}>
                <td className="py-1.5">{!p.actif && <span className="mr-1 text-xs px-1.5 py-0.5 rounded" style={{ background: T.paper, color: T.muted }}>Inactif</span>}{p.designation}</td>
                <td className="py-1.5 text-xs" style={{ color: T.muted }}>{p.famille}</td>
                <td className="py-1.5 text-right tabular">{F(p.prix_vente)} F</td>
                <td className="py-1.5 text-right tabular">{p.seuil_alerte ?? 5}</td>
                <td className="py-1.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditProd({ id: p.id, designation: p.designation, prix_vente: p.prix_vente, seuil_alerte: p.seuil_alerte ?? 5 })} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: T.petrol }}>✏️</button>
                    <button onClick={() => toggleProduit(p)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: T.line, color: p.actif ? T.alert : T.ok }}>{p.actif ? "Désactiver" : "Activer"}</button>
                  </div>
                </td>
              </tr>
            ))}
            {editProd && (
              <tr><td colSpan={5} className="py-2">
                <div className="grid grid-cols-2 gap-2">
                  <input value={editProd.designation} onChange={(e) => setEditProd({ ...editProd, designation: e.target.value })} className={inp} style={{ borderColor: T.line }} />
                  <div><div className="text-xs" style={{ color: T.muted }}>Prix vente</div><Num value={editProd.prix_vente} onChange={(v) => setEditProd({ ...editProd, prix_vente: v })} w="w-full" /></div>
                  <div><div className="text-xs" style={{ color: T.muted }}>Seuil alerte</div><Num value={editProd.seuil_alerte} onChange={(v) => setEditProd({ ...editProd, seuil_alerte: v })} w="w-full" /></div>
                  <div className="flex gap-2 items-end"><button onClick={saveEditProd} className="px-3 py-1 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer</button>
                    <button onClick={() => setEditProd(null)} className="text-sm" style={{ color: T.muted }}>Annuler</button></div>
                </div>
              </td></tr>
            )}
          </tbody></table>
        </div>
        <AddForm label="Ajouter un produit" show={showProd} setShow={setShowProd} onSubmit={addProduit}>
          <div className="grid grid-cols-2 gap-2">
            <input value={prodForm.code} onChange={(e) => setProdForm({ ...prodForm, code: e.target.value.toUpperCase() })} placeholder="Code (ex: LUB01)" className={inp} style={{ borderColor: T.line }} />
            <input value={prodForm.designation} onChange={(e) => setProdForm({ ...prodForm, designation: e.target.value })} placeholder="Désignation" className={inp} style={{ borderColor: T.line }} />
            <select value={prodForm.famille} onChange={(e) => setProdForm({ ...prodForm, famille: e.target.value })} className={inp} style={{ borderColor: T.line }}>
              <option value="LUBRIFIANT">Lubrifiant</option><option value="GAZ">Gaz</option><option value="ACCESSOIRE">Accessoire</option>
            </select>
            <input value={prodForm.unite} onChange={(e) => setProdForm({ ...prodForm, unite: e.target.value })} placeholder="Unité" className={inp} style={{ borderColor: T.line }} />
            <div><div className="text-xs" style={{ color: T.muted }}>Prix vente</div><Num value={prodForm.prix_vente} onChange={(v) => setProdForm({ ...prodForm, prix_vente: v })} w="w-full" /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Seuil alerte</div><Num value={prodForm.seuil_alerte} onChange={(v) => setProdForm({ ...prodForm, seuil_alerte: v })} w="w-full" /></div>
          </div>
        </AddForm>
      </Section>

      {/* Catégories */}
      <Section titre="📂 Catégories de dépense" aside={`${categories.length}`}>
        {categories.map((c, i) => (
          editCat?.id === c.id ? (
            <div key={i} className="py-2 border-b grid gap-2" style={{ borderColor: T.line }}>
              <div className="grid grid-cols-2 gap-2">
                <input value={editCat.libelle} onChange={(e) => setEditCat({ ...editCat, libelle: e.target.value })} className={inp} style={{ borderColor: T.line }} />
                <input value={editCat.compte_syscohada} onChange={(e) => setEditCat({ ...editCat, compte_syscohada: e.target.value })} className={inp} style={{ borderColor: T.line }} />
                <select value={editCat.nature} onChange={(e) => setEditCat({ ...editCat, nature: e.target.value })} className={inp} style={{ borderColor: T.line }}>
                  <option value="FIXE">Fixe</option><option value="VARIABLE">Variable</option><option value="AVANCE_CLIENT">Avance client</option>
                </select>
              </div>
              <div className="flex gap-2"><button onClick={saveEditCat} className="px-3 py-1 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer</button>
                <button onClick={() => setEditCat(null)} className="text-sm" style={{ color: T.muted }}>Annuler</button></div>
            </div>
          ) : (
            <Row key={i}>
              <div><span className="font-medium">{c.libelle}</span><span className="text-xs ml-2" style={{ color: T.muted }}>{c.code}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: T.paper }}>{c.compte_syscohada}</span>
                <Actions onEdit={() => setEditCat({ id: c.id || c.code, libelle: c.libelle, nature: c.nature, compte_syscohada: c.compte_syscohada })} onOther={() => delCategorie(c)} otherLabel="Suppr." />
              </div>
            </Row>
          )
        ))}
        <AddForm label="Ajouter une catégorie" show={showCat} setShow={setShowCat} onSubmit={addCategorie}>
          <div className="grid grid-cols-2 gap-2">
            <input value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })} placeholder="Code (ex: TRANS)" className={inp} style={{ borderColor: T.line }} />
            <input value={catForm.libelle} onChange={(e) => setCatForm({ ...catForm, libelle: e.target.value })} placeholder="Libellé" className={inp} style={{ borderColor: T.line }} />
            <select value={catForm.nature} onChange={(e) => setCatForm({ ...catForm, nature: e.target.value })} className={inp} style={{ borderColor: T.line }}>
              <option value="FIXE">Fixe</option><option value="VARIABLE">Variable</option><option value="AVANCE_CLIENT">Avance client</option>
            </select>
            <input value={catForm.compte_syscohada} onChange={(e) => setCatForm({ ...catForm, compte_syscohada: e.target.value })} placeholder="Compte SYSCOHADA" className={inp} style={{ borderColor: T.line }} />
          </div>
        </AddForm>
      </Section>

      {/* Clients */}
      <Section titre="👥 Clients à crédit" aside={`${clients.length}`}>
        {clients.map((cl, i) => (
          editCl?.id === cl.id ? (
            <div key={i} className="py-2 border-b grid gap-2" style={{ borderColor: T.line }}>
              <div className="grid grid-cols-2 gap-2">
                <input value={editCl.nom} onChange={(e) => setEditCl({ ...editCl, nom: e.target.value })} className={inp} style={{ borderColor: T.line }} />
                <div><div className="text-xs" style={{ color: T.muted }}>Plafond</div><Num value={editCl.plafond} onChange={(v) => setEditCl({ ...editCl, plafond: v })} w="w-full" /></div>
              </div>
              <div className="flex gap-2"><button onClick={saveEditCl} className="px-3 py-1 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Enregistrer</button>
                <button onClick={() => setEditCl(null)} className="text-sm" style={{ color: T.muted }}>Annuler</button></div>
            </div>
          ) : (
            <Row key={i}>
              <div>{!cl.actif && <span className="mr-1 text-xs px-1.5 py-0.5 rounded" style={{ background: T.paper, color: T.muted }}>Inactif</span>}<span className="font-medium">{cl.nom}</span><span className="text-xs ml-2" style={{ color: T.muted }}>{cl.code} · plafond {F(cl.plafond || 0)} F</span></div>
              <Actions onEdit={() => setEditCl({ id: cl.id, code: cl.code, nom: cl.nom, plafond: cl.plafond || 0 })} onOther={() => toggleClient(cl)} otherLabel={cl.actif ? "Désactiver" : "Activer"} otherColor={cl.actif ? T.alert : T.ok} />
            </Row>
          )
        ))}
        <AddForm label="Ajouter un client" show={showCl} setShow={setShowCl} onSubmit={addClient}>
          <div className="grid grid-cols-3 gap-2">
            <input value={clForm.code} onChange={(e) => setClForm({ ...clForm, code: e.target.value.toUpperCase() })} placeholder="Code" className={inp} style={{ borderColor: T.line }} />
            <input value={clForm.nom} onChange={(e) => setClForm({ ...clForm, nom: e.target.value })} placeholder="Nom" className={inp} style={{ borderColor: T.line }} />
            <div><div className="text-xs" style={{ color: T.muted }}>Plafond</div><Num value={clForm.plafond} onChange={(v) => setClForm({ ...clForm, plafond: v })} w="w-full" /></div>
          </div>
        </AddForm>
      </Section>

      {/* Cuves */}
      <Section titre="🛢️ Cuves" aside={`${cuves.length} cuve(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b" style={{ borderColor: T.line, color: T.muted }}>
            <th className="py-2 text-left font-medium">Station</th><th className="py-2 text-left font-medium">Produit</th><th className="py-2 text-right font-medium">Capacité (L)</th>
          </tr></thead><tbody>
            {cuves.map((c) => (
              <tr key={c.id || `${c.station_id}-${c.produit}`} className="border-b" style={{ borderColor: T.line }}>
                <td className="py-1.5">{stations.find((s) => s.id === c.station_id)?.code || c.station_id}</td>
                <td className="py-1.5 font-medium">{c.produit}</td>
                <td className="py-1.5 text-right">
                  <Num value={c.capacite_l ?? ""} onChange={(v) => editCuve(c.id, v)} w="w-28" right />
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
        {cuves.length > 0 && <button onClick={saveCuves} className="w-full py-2 my-2 rounded text-sm font-medium" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}>Enregistrer les capacités</button>}
        {cuves.length === 0 && <p className="text-sm py-3" style={{ color: T.muted }}>Aucune cuve enregistrée.</p>}
      </Section>

      {/* Users */}
      {cloud && users.length > 0 && (
        <Section titre="👤 Utilisateurs" aside={`${users.length}`}>
          {users.map((u) => (
            <Row key={u.id}><div><span className="font-medium">{u.nom_complet}</span><span className="text-xs ml-2" style={{ color: T.muted }}>{u.stations?.nom || "Réseau"}</span></div>
              <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="text-sm border rounded px-2 py-1" style={{ borderColor: T.line }}>
                <option value="admin">Administrateur</option><option value="gerant">Gérant</option><option value="superviseur">Superviseur</option><option value="directeur">Directeur</option><option value="comptable">Comptable</option>
              </select>
            </Row>
          ))}
        </Section>
      )}

      <p className="text-xs mt-6 text-center" style={{ color: T.muted }}>{cloud ? "Mode cloud — synchronisé avec Supabase." : "Mode démonstration locale."}</p>
    </div>
  );
}