import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listDepenses, saveDepense, deleteDepense, createCategorie } from "../lib/api";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Row, Num, Loading, Button } from "../components/ui";
import { peutAgirProfil } from "../lib/permissions";
import { useFlash } from "../hooks/useFlash";

const CAT_VIDE = { code: "", libelle: "", nature_depense: "FONCTIONNEMENT", compte_syscohada: "6588" };

export default function Depenses() {
  const { profil } = useAuth();
  const [stationId, setStationId] = useState(profil?.station_id || "st-hann");
  const [ref, setRef] = useState(null);
  const [cats, setCats] = useState([]);
  const [depenses, setDeps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, flash] = useFlash();
  const [showCat, setShowCat] = useState(false);
  const [catForm, setCatForm] = useState(CAT_VIDE);
  const [filtreStatut, setFiltreStatut] = useState("TOUS"); // TOUS | BROUILLON | VALIDE
  const [dForm, setDForm] = useState({
    categorie_code: "",
    libelle: "",
    montant: "",
    date_depense: todayISO(),
    mode_paiement: "ESPECES",
    station_id: stationId,
  });
  const [isMounted, setIsMounted] = useState(true);

  // Mettre à jour station_id dans le formulaire si stationId change
  useEffect(() => {
    setDForm((f) => ({ ...f, station_id: stationId }));
  }, [stationId]);

  const estDirection = ["admin", "directeur", "superviseur"].includes(profil?.role);
  const peutDeclarer = useMemo(() => peutAgirProfil(profil, "depense", "declarer"), [profil]);
  const peutValider = useMemo(() => peutAgirProfil(profil, "depense", "valider"), [profil]);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

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

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [stationId, isMounted]);

  const saveCat = async () => {
    if (!catForm.code.trim() || !catForm.libelle.trim()) return flash("Code + libellé requis");
    const { error } = await createCategorie({
      ...catForm,
      nature: catForm.nature_depense || "FONCTIONNEMENT",
      nature_depense: catForm.nature_depense || "FONCTIONNEMENT",
    });
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
      station_id: stationId,
      date_depense: dForm.date_depense || todayISO(),
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
      setDForm({
        categorie_code: "",
        libelle: "",
        montant: "",
        date_depense: todayISO(),
        mode_paiement: "ESPECES",
        station_id: stationId,
      });
      flash(peutValider ? "✅ Dépense validée et enregistrée" : "💾 Dépense enregistrée en brouillon — en attente de validation");
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
    const res = await saveDepense(miseAJour);
    if (res?.error) return flash("Erreur : " + res.error);
    if (isMounted) {
      flash("✅ Dépense validée — comptabilisée.");
      load();
    }
  };

  if (loading) return <Loading label="Chargement des dépenses…" />;

  const depensesFiltrees = depenses.filter((d) => {
    if (filtreStatut === "BROUILLON") return d.statut !== "VALIDE";
    if (filtreStatut === "VALIDE") return d.statut === "VALIDE";
    return true;
  });

  const total = depenses.reduce((s, d) => s + n(d.montant), 0);
  const totalValide = depenses.filter((d) => d.statut === "VALIDE").reduce((s, d) => s + n(d.montant), 0);
  const totalBrouillon = depenses.filter((d) => d.statut !== "VALIDE").reduce((s, d) => s + n(d.montant), 0);
  const nbBrouillon = depenses.filter((d) => d.statut !== "VALIDE").length;

  // Normalisation de la nature : FONCTIONNEMENT vs INVESTISSEMENT vs EXCEPTIONNEL
  const getNatureNorm = (cat) => {
    const raw = (cat?.nature_depense || cat?.nature || "").toUpperCase();
    if (raw.includes("INVEST")) return "INVESTISSEMENT";
    if (raw.includes("EXCEPT")) return "EXCEPTIONNEL";
    return "FONCTIONNEMENT";
  };

  // Ventilation par catégorie (style BASE_DEPENSES Excel)
  const ventilationParCategorie = useMemo(() => {
    const vent = {};
    depenses.forEach((d) => {
      const catCode = d.categorie_code || "DIVERS";
      const cat = cats.find((c) => c.code === catCode);
      const catLibelle = cat?.libelle || "Divers";
      const nature = getNatureNorm(cat);

      if (!vent[catCode]) {
        vent[catCode] = {
          code: catCode,
          libelle: catLibelle,
          total: 0,
          nombre: 0,
          nature,
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

  // Ventilation par nature
  const ventilationParNature = useMemo(() => {
    const vent = { FONCTIONNEMENT: 0, INVESTISSEMENT: 0, EXCEPTIONNEL: 0 };
    depenses.forEach((d) => {
      const catCode = d.categorie_code || "DIVERS";
      const cat = cats.find((c) => c.code === catCode);
      const nature = getNatureNorm(cat);
      if (vent[nature] !== undefined) {
        vent[nature] += n(d.montant);
      } else {
        vent.FONCTIONNEMENT += n(d.montant);
      }
    });
    return vent;
  }, [depenses, cats]);

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Dépenses réseau</h1>
          <p className="text-sm" style={{ color: T.muted }}>
            Enregistrement & Contrôle par catégorie — SYSCOHADA (Classe 6 / 65 / 66)
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {estDirection && ref?.stations?.length > 1 && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-xs font-semibold text-slate-500">Station :</span>
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white shadow-sm focus:ring-2 focus:ring-blue-500"
              >
                {ref.stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.nom || st.code}
                  </option>
                ))}
              </select>
            </div>
          )}

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

      {msg && (
        <div className="rounded-xl px-4 py-3 text-sm shadow-sm border border-emerald-100" style={{ background: "#E3F4EA", color: T.ok }}>
          {msg}
        </div>
      )}

      {/* Saisie d'une nouvelle dépense */}
      <Section titre="Nouvelle dépense" aside={`${cats.length} catégories configurées`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 py-2">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Date *</div>
            <input
              type="date"
              value={dForm.date_depense}
              onChange={(e) => setDForm({ ...dForm, date_depense: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: T.line }}
            />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Catégorie *</div>
            <select
              value={dForm.categorie_code}
              onChange={(e) => setDForm({ ...dForm, categorie_code: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              <option value="">— choisir —</option>
              {cats.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Désignation / Motif</div>
            <input
              value={dForm.libelle}
              placeholder="Ex: Facture eau, transport..."
              onChange={(e) => setDForm({ ...dForm, libelle: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: T.line }}
            />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Montant (F CFA) *</div>
            <Num value={dForm.montant} onChange={(v) => setDForm({ ...dForm, montant: v })} />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Mode de paiement</div>
            <select
              value={dForm.mode_paiement}
              onChange={(e) => setDForm({ ...dForm, mode_paiement: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              {["ESPECES", "VIREMENT", "CHEQUE", "MOBILE_MONEY", "CARTE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={save}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            style={{ background: T.petrol }}
          >
            {peutValider ? "Enregistrer et Valider" : "Enregistrer la dépense (Brouillon)"}
          </button>

          <button
            onClick={() => setShowCat((v) => !v)}
            className="text-xs font-semibold hover:underline"
            style={{ color: T.petrol }}
          >
            {showCat ? "Fermer l'ajout de catégorie" : "+ Ajouter une nouvelle catégorie"}
          </button>
        </div>
      </Section>

      {/* Création d'une catégorie */}
      {showCat && (
        <Section titre="Nouvelle catégorie de dépense" aside="Compte SYSCOHADA §35">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Code *</div>
              <input
                value={catForm.code}
                placeholder="Ex: TAXES"
                onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                style={{ borderColor: T.line }}
              />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Libellé *</div>
              <input
                value={catForm.libelle}
                placeholder="Ex: Taxes & Patente"
                onChange={(e) => setCatForm({ ...catForm, libelle: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                style={{ borderColor: T.line }}
              />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Nature</div>
              <select
                value={catForm.nature_depense}
                onChange={(e) => setCatForm({ ...catForm, nature_depense: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                style={{ borderColor: T.line }}
              >
                {["FONCTIONNEMENT", "INVESTISSEMENT", "EXCEPTIONNEL"].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: T.muted }}>Compte SYSCOHADA</div>
              <input
                value={catForm.compte_syscohada}
                placeholder="Ex: 6411"
                onChange={(e) => setCatForm({ ...catForm, compte_syscohada: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                style={{ borderColor: T.line }}
              />
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={saveCat}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
              style={{ background: T.petrol }}
            >
              Ajouter la catégorie
            </button>
          </div>
        </Section>
      )}

      {/* Ventilation détaillée (style BASE_DEPENSES Excel) */}
      <Section titre="📊 Ventilation des Dépenses">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-[10px] font-bold text-blue-700 uppercase">Par Catégorie</div>
            <div className="text-2xl font-black text-blue-900 tabular">{ventilationParCategorie.length}</div>
            <div className="text-[10px] text-blue-600">catégorie(s) représentée(s)</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="text-[10px] font-bold text-purple-700 uppercase">Par Mode de Paiement</div>
            <div className="text-2xl font-black text-purple-900 tabular">{ventilationParMode.length}</div>
            <div className="text-[10px] text-purple-600">mode(s) utilisé(s)</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Nature des Dépenses</div>
            <div className="text-sm font-bold text-emerald-900 tabular mt-1">
              Fonctionnement : {F(ventilationParNature.FONCTIONNEMENT)} F
            </div>
            <div className="text-sm font-bold text-emerald-900 tabular">
              Investissement : {F(ventilationParNature.INVESTISSEMENT)} F
            </div>
            {ventilationParNature.EXCEPTIONNEL > 0 && (
              <div className="text-sm font-bold text-emerald-900 tabular">
                Exceptionnel : {F(ventilationParNature.EXCEPTIONNEL)} F
              </div>
            )}
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
                          v.nature === "INVESTISSEMENT"
                            ? "bg-purple-100 text-purple-800"
                            : v.nature === "EXCEPTIONNEL"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }`}>
                          {v.nature}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ventilationParCategorie.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-3 text-center text-gray-400">Aucune dépense enregistrée</td>
                    </tr>
                  )}
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
                  {ventilationParMode.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-3 text-center text-gray-400">Aucune dépense enregistrée</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Section>

      {/* Liste des dépenses avec filtre de statut */}
      <Section
        titre="Liste des dépenses"
        aside={
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setFiltreStatut("TOUS")}
                className={`px-2 py-1 rounded-md font-semibold transition ${filtreStatut === "TOUS" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
              >
                Toutes ({depenses.length})
              </button>
              <button
                onClick={() => setFiltreStatut("BROUILLON")}
                className={`px-2 py-1 rounded-md font-semibold transition ${filtreStatut === "BROUILLON" ? "bg-white shadow-sm text-amber-800" : "text-slate-500"}`}
              >
                Brouillons ({nbBrouillon})
              </button>
              <button
                onClick={() => setFiltreStatut("VALIDE")}
                className={`px-2 py-1 rounded-md font-semibold transition ${filtreStatut === "VALIDE" ? "bg-white shadow-sm text-emerald-800" : "text-slate-500"}`}
              >
                Validées ({depenses.length - nbBrouillon})
              </button>
            </div>
            <span className="font-semibold text-slate-600">· Total : {F(total)} F</span>
          </div>
        }
      >
        <div className="divide-y" style={{ borderColor: T.line }}>
          {depensesFiltrees.map((d, i) => {
            const cat = cats.find((c) => c.code === d.categorie_code);
            const isValide = d.statut === "VALIDE";
            return (
              <Row key={d.id || i} className="hover:bg-slate-50/50 px-2 rounded-lg transition">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    isValide ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800 border border-amber-300"
                  }`}>
                    {isValide ? "VALIDE" : "BROUILLON"}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {cat?.libelle || d.categorie_code || "Dépense"}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="font-medium text-slate-700">{fmtDate(d.date_depense)}</span>
                      {d.libelle && <span>· {d.libelle}</span>}
                      {d.cree_par && <span className="text-[11px] text-slate-400">· Par {d.cree_par}</span>}
                      {isValide && d.valide_par && (
                        <span className="text-[11px] text-emerald-700">· Validé par {d.valide_par}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-bold tabular text-slate-900">{F(d.montant)} F</div>
                    <div className="text-xs text-slate-400">{d.mode_paiement || "ESPECES"}</div>
                  </div>

                  {!isValide && peutValider && (
                    <Button
                      variant="success"
                      size="xs"
                      onClick={() => validerDepense(d.id)}
                      title="Valider la dépense"
                    >
                      ✓ Valider
                    </Button>
                  )}

                  <button
                    onClick={() => del(d.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </Row>
            );
          })}
        </div>

        {depensesFiltrees.length === 0 && (
          <div className="py-6 text-center text-sm" style={{ color: T.muted }}>
            Aucune dépense trouvée{filtreStatut !== "TOUS" ? ` avec le filtre ${filtreStatut.toLowerCase()}` : ""}.
          </div>
        )}
      </Section>
    </div>
  );
}

