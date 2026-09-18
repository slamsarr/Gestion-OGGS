import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, getRapport, saveRapport, indexVeille, listDescentes, listPrestationsLavage, listVentesBoutique } from "../lib/api";
import { calculer, controler, ecrireSyscohada, rapportVide, COUPURES, SEUIL_ECART, F, n, fmtDate, todayISO, T } from "../lib/calcul";
import { exporterExcel, exporterCsv } from "../lib/exportExcel";
import { Num, Row, Section, Alerte } from "../components/ui";

const STATUTS = {
  BROUILLON: ["Brouillon", T.muted],
  SOUMIS: ["Soumis — en attente", "#B7791F"],
  VALIDE: ["Validé", T.ok],
  REJETE: ["Rejeté", T.alert],
};

const MODES_REGLEMENT = [
  ["TICKET", "Tickets / bons"],
  ["CARTE_STAR", "Cartes STAR"],
  ["PLATEFORME_PETROSEN", "Petrosen"],
  ["ORANGE_MONEY", "Orange Money"],
  ["WAVE", "Wave"],
  ["TPE", "TPE"],
  ["CREDIT_CLIENT", "Crédit client"],
];

export default function Rapport() {
  const { profil, cloud } = useAuth();
  const role = profil?.role || "gerant";
  const stationFromProfile = profil?.stations?.code || profil?.station_id?.replace("st-", "").toUpperCase() || "HANN";
  const [searchParams, setSearchParams] = useSearchParams();

  const [ref, setRef] = useState(null);
  const [selectedStation, setSelectedStation] = useState(searchParams.get("station") || stationFromProfile);
  const [date, setDate] = useState(searchParams.get("date") || todayISO());
  const [r, setR] = useState(null);
  const [onglet, setOnglet] = useState("carburant");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Load referentiel on mount
  useEffect(() => {
    loadReferentiel()
      .then((res) => setRef(res || referentielFromSeed()))
      .catch(() => setRef(referentielFromSeed()));
  }, []);

  // Sync station/date to URL params
  useEffect(() => {
    const p = {};
    if (selectedStation) p.station = selectedStation;
    if (date) p.date = date;
    setSearchParams(p, { replace: true });
  }, [selectedStation, date, setSearchParams]);

  // Load or create rapport when station/date/ref changes
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    (async () => {
      try {
        const existing = await getRapport(selectedStation, date);
        if (!alive) return;
        if (existing) {
          setR(existing);
        } else {
          const fresh = rapportVide(ref, selectedStation, date, profil?.nom_complet);
          // 1. Index début veille & Index fin du jour depuis descentes pompistes
          let jourDescentes = [];
          try {
            jourDescentes = await listDescentes(selectedStation, date);
          } catch {}

          for (const p of (ref.pistolets || []).filter((x) => x.station_code === selectedStation || !x.station_code)) {
            try {
              const prev = await indexVeille(selectedStation, date, p.code);
              if (prev != null) fresh.pistolets[p.code].depart = prev;
            } catch {}

            // Trouver la dernière descente enregistrée pour ce pistolet ce jour-là
            const pDescentes = jourDescentes.filter((d) => d.pistolet_code === p.code);
            if (pDescentes.length > 0) {
              const maxFin = Math.max(...pDescentes.map((d) => n(d.index_fin)));
              if (maxFin > 0) fresh.pistolets[p.code].fin = maxFin;
            }
          }

          // 2. Auto-remplissage des recettes Lavage du jour
          try {
            const lavages = await listPrestationsLavage(selectedStation, date);
            const totalLavage = (lavages || []).reduce((s, item) => s + (n(item.montant_total) || n(item.prix) || 0), 0);
            if (totalLavage > 0) fresh.lavage = totalLavage;
          } catch {}

          // 3. Auto-remplissage des recettes Boutique du jour
          try {
            const ventes = await listVentesBoutique(selectedStation, date);
            const totalBoutique = (ventes || []).reduce((s, item) => s + (n(item.total_montant) || 0), 0);
            if (totalBoutique > 0) fresh.boutique = totalBoutique;
          } catch {}

          if (alive) setR(fresh);
        }
      } catch (err) {
        console.error("Rapport load error:", err);
        if (alive) setR(rapportVide(ref, selectedStation, date, profil?.nom_complet));
      }
    })();
    return () => { alive = false; };
  }, [ref, selectedStation, date]);

  const c = useMemo(() => (r && ref ? calculer(r, ref) : null), [r, ref]);
  const erreurs = useMemo(() => (r && c ? controler(r, c) : []), [r, c]);
  const verrou = !r || r.statut === "VALIDE" || (r.statut === "SOUMIS" && role === "gerant");

  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const f = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);

  if (!ref || !r || !c) return <p className="p-8 text-center text-sm" style={{ color: T.muted }}>Chargement du rapport…</p>;

  const [stLbl, stCol] = STATUTS[r.statut] || STATUTS.BROUILLON;
  const up = (patch) => {
    setDirty(true);
    setR((x) => ({ ...x, ...patch }));
  };
  const upIn = (bloc, k, champ, v) => {
    setDirty(true);
    setR((x) => ({ ...x, [bloc]: { ...x[bloc], [k]: { ...x[bloc][k], [champ]: v } } }));
  };
  const sauver = async (rap, texte) => {
    setBusy(true);
    try {
      const res = await saveRapport(rap || r, profil, ref);
      setMsg(texte || (res.cloud ? "Enregistré dans le cloud" : "Brouillon enregistré localement"));
      if (res.doc) setR(res.doc);
      setDirty(false);
    } catch {
      setMsg("Erreur d'enregistrement — réessayez");
    }
    setBusy(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const changerStatut = async (statut, extra = {}) => {
    const rap = { ...r, statut, ...extra };
    setR(rap);
    await sauver(rap, `Rapport ${STATUTS[statut][0].toLowerCase()}`);
  };

  const onglets = [
    ["carburant", "⛽ Carburant"],
    ["lubrifiants", "🛢️ Lub."],
    ["gaz", "🔥 Gaz"],
    ["cloture", "💰 Clôture"],
    ["recap", "📋 Récap"],
  ];

  return (
    <div className="pb-20">
      {/* En-tête rapport */}
      <div className="rounded-lg p-4 mb-4" style={{ background: T.petrol, color: "white" }}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs opacity-80">Rapport journalier</div>
            {role === "gerant" ? (
              <div className="font-semibold text-lg">{selectedStation}</div>
            ) : (
              <select
                value={selectedStation}
                onChange={(e) => { setSelectedStation(e.target.value); setR(null); }}
                className="font-semibold text-lg bg-transparent border rounded px-1"
                style={{ borderColor: "rgba(255,255,255,.5)" }}
              >
                {(ref?.stations || []).map((s) => (
                  <option key={s.id} value={s.code} style={{ color: T.ink }}>{s.code} — {s.nom}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent border rounded px-2 py-0.5 text-sm"
                style={{ borderColor: "rgba(255,255,255,.4)", colorScheme: "dark" }}
              />
              <span className="text-xs opacity-80">GO {c.pGO} F · Super {c.pSU} F</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-80">À verser</div>
            <div className="text-2xl font-bold tabular" style={{ color: T.gold }}>{F(c.aVerser)}</div>
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "white", color: stCol }}>{stLbl}</span>
          </div>
        </div>
      </div>

      {msg && <div className="text-sm rounded px-3 py-2 mb-3" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}
      {r.statut === "REJETE" && r.motifRejet && <Alerte>Rejeté par le superviseur : {r.motifRejet}</Alerte>}

      {/* Onglets */}
      <div className="flex border-b mb-4 overflow-x-auto" style={{ borderColor: T.line }}>
        {onglets.map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setOnglet(k)}
            className="px-3 py-2 text-sm whitespace-nowrap relative"
            style={{ color: onglet === k ? T.petrol : T.muted, fontWeight: onglet === k ? 600 : 400 }}
          >
            {lbl}
            {onglet === k && <span className="absolute bottom-0 left-2 right-2 h-0.5" style={{ background: T.gold }} />}
            {k === "recap" && erreurs.length > 0 && r.statut === "BROUILLON" && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: T.alert }} />
            )}
          </button>
        ))}
      </div>

      {/* ONGLET CARBURANT */}
      {onglet === "carburant" && (
        <>
          {["GASOIL", "SUPER"].map((prod) => (
            <Section
              key={prod}
              titre={prod === "GASOIL" ? "Gasoil" : "Super"}
              aside={`${F(prod === "GASOIL" ? c.volGO : c.volSU)} L · ${F((prod === "GASOIL" ? c.volGO : c.volSU) * (prod === "GASOIL" ? c.pGO : c.pSU))} F`}
            >
              <div className="grid grid-cols-12 text-xs py-1 border-b" style={{ color: T.muted, borderColor: T.line }}>
                <span className="col-span-3">Pistolet</span>
                <span className="col-span-3 text-right">Départ</span>
                <span className="col-span-3 text-right">Fin</span>
                <span className="col-span-3 text-right">Litres</span>
              </div>
              {c.pist.filter((p) => p.produit === prod).map((p) => (
                <div key={p.code}>
                  <div className="grid grid-cols-12 items-center gap-1 py-1.5 border-b" style={{ borderColor: T.line }}>
                    <span className="col-span-3 font-medium text-sm">{p.code}</span>
                    <span className="col-span-3 text-right text-sm tabular" style={{ color: T.muted }}>{F(p.depart)}</span>
                    <div className="col-span-3 flex justify-end">
                      <Num value={r.pistolets[p.code]?.fin ?? ""} disabled={verrou} onChange={(v) => upIn("pistolets", p.code, "fin", v)} w="w-full" />
                    </div>
                    <span className="col-span-3 text-right font-semibold tabular" style={{ color: p.anomalie ? T.alert : T.ink }}>
                      {r.pistolets[p.code]?.fin ? F(p.volume) : "—"}
                    </span>
                  </div>
                  {p.anomalie && <Alerte>{p.code} — {p.anomalie}</Alerte>}
                </div>
              ))}
            </Section>
          ))}
          <p className="text-xs" style={{ color: T.muted }}>Index départ repris de la veille. Volume = fin − départ ; valeur = volume × prix du jour.</p>
        </>
      )}

      {/* ONGLET LUBRIFIANTS */}
      {onglet === "lubrifiants" && (
        <Section titre="Lubrifiants" aside={`${F(c.caLub)} F vendus`}>
          <div className="grid grid-cols-12 text-xs py-1 border-b" style={{ color: T.muted, borderColor: T.line }}>
            <span className="col-span-4">Référence</span>
            <span className="col-span-2 text-right">Début</span>
            <span className="col-span-2 text-right">Reçu</span>
            <span className="col-span-2 text-right">Vendu</span>
            <span className="col-span-2 text-right">Fin</span>
          </div>
          {c.lub.map((l) => (
            <div key={l.nom} className="grid grid-cols-12 items-center gap-1 py-1.5 border-b" style={{ borderColor: T.line }}>
              <div className="col-span-4">
                <div className="text-sm font-medium leading-tight">{l.nom}</div>
                <div className="text-xs" style={{ color: T.muted }}>{F(l.prix)} F</div>
              </div>
              <div className="col-span-2 flex justify-end"><Num value={r.lubrifiants[l.nom]?.debut ?? 0} disabled={verrou} onChange={(v) => upIn("lubrifiants", l.nom, "debut", v)} w="w-full" /></div>
              <div className="col-span-2 flex justify-end"><Num value={r.lubrifiants[l.nom]?.reception ?? ""} disabled={verrou} placeholder="" onChange={(v) => upIn("lubrifiants", l.nom, "reception", v)} w="w-full" /></div>
              <div className="col-span-2 flex justify-end"><Num value={r.lubrifiants[l.nom]?.vendu ?? ""} disabled={verrou} placeholder="" onChange={(v) => upIn("lubrifiants", l.nom, "vendu", v)} w="w-full" /></div>
              <span className="col-span-2 text-right font-semibold" style={{ color: l.stockFin < 0 ? T.alert : l.bas ? "#B7791F" : T.ink }}>{F(l.stockFin)}</span>
            </div>
          ))}
          <Row className="border-0 font-semibold"><span>Valeur du stock fin</span><span>{F(c.valeurStockLub)} F</span></Row>
        </Section>
      )}

      {/* ONGLET GAZ */}
      {onglet === "gaz" && (
        <Section titre="Gaz butane" aside={`${F(c.caGaz)} F · marge ${F(c.margeGaz)} F`}>
          <div className="grid grid-cols-12 text-xs py-1 border-b" style={{ color: T.muted, borderColor: T.line }}>
            <span className="col-span-4">Format</span>
            <span className="col-span-2 text-right">Présent</span>
            <span className="col-span-2 text-right">Livré</span>
            <span className="col-span-2 text-right">Vendu</span>
            <span className="col-span-2 text-right">Restant</span>
          </div>
          {c.gaz.map((g) => (
            <div key={g.nom} className="grid grid-cols-12 items-center gap-1 py-1.5 border-b" style={{ borderColor: T.line }}>
              <div className="col-span-4">
                <div className="text-sm font-medium">{g.nom}</div>
                <div className="text-xs" style={{ color: T.muted }}>{F(g.prix)} F</div>
              </div>
              <div className="col-span-2 flex justify-end"><Num value={r.gaz[g.nom]?.present ?? 0} disabled={verrou} onChange={(v) => upIn("gaz", g.nom, "present", v)} w="w-full" /></div>
              <div className="col-span-2 flex justify-end"><Num value={r.gaz[g.nom]?.livraison ?? ""} disabled={verrou} placeholder="" onChange={(v) => upIn("gaz", g.nom, "livraison", v)} w="w-full" /></div>
              <div className="col-span-2 flex justify-end"><Num value={r.gaz[g.nom]?.vendu ?? ""} disabled={verrou} placeholder="" onChange={(v) => upIn("gaz", g.nom, "vendu", v)} w="w-full" /></div>
              <span className="col-span-2 text-right font-semibold" style={{ color: g.restant < 0 ? T.alert : T.ink }}>{F(g.restant)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ONGLET CLÔTURE */}
      {onglet === "cloture" && (
        <>
          <Section titre="Autres recettes et règlements">
            <Row><span>Lavage</span><Num big value={r.lavage} disabled={verrou} onChange={(v) => up({ lavage: v })} /></Row>
            <Row><span>Boutique / Shop</span><Num big value={r.boutique} disabled={verrou} onChange={(v) => up({ boutique: v })} /></Row>
            <Row><span>Tickets / bons carburant</span><Num big value={r.tickets} disabled={verrou} onChange={(v) => up({ tickets: v })} /></Row>
            <Row><span>Dépôts clients</span><Num value={r.depots} disabled={verrou} onChange={(v) => up({ depots: v })} /></Row>
            <Row className="border-0"><span>Remboursements</span><Num value={r.remboursement} disabled={verrou} onChange={(v) => up({ remboursement: v })} /></Row>
          </Section>

          <Section titre="Dépenses" aside={`${F(c.depenses)} F`}>
            {(r.depenses || []).length === 0 && <p className="text-sm py-2" style={{ color: T.muted }}>Aucune dépense saisie.</p>}
            {(r.depenses || []).map((d, i) => (
              <div key={i} className="py-2 border-b" style={{ borderColor: T.line }}>
                <div className="flex gap-2 mb-1">
                  <select
                    value={d.categorie}
                    disabled={verrou}
                    onChange={(e) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, categorie: e.target.value } : x) })}
                    className="flex-1 rounded border px-2 py-1 bg-white text-sm"
                    style={{ borderColor: T.line }}
                  >
                    {(ref.categories || []).map((k) => <option key={k.code || k.libelle} value={k.libelle}>{k.libelle}</option>)}
                  </select>
                  <Num value={d.montant} disabled={verrou} onChange={(v) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, montant: v } : x) })} />
                  {!verrou && <button onClick={() => up({ depenses: r.depenses.filter((_, j) => j !== i) })} className="px-2 rounded" style={{ color: T.alert }}>✕</button>}
                </div>
                <input
                  value={d.libelle}
                  disabled={verrou}
                  placeholder="Libellé (ex. Bon pour Mamour Beye)"
                  onChange={(e) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, libelle: e.target.value } : x) })}
                  className="w-full rounded border px-2 py-1 text-sm bg-white disabled:bg-transparent disabled:border-transparent"
                  style={{ borderColor: T.line }}
                />
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-xs px-2 py-1 rounded border cursor-pointer inline-flex items-center gap-1" style={{ borderColor: T.line, color: T.muted }}>
                    📷 {d.photo ? "✓ Photo" : "Justificatif"}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      disabled={verrou}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // Try Supabase Storage first (cloud mode)
                        if (cloud) {
                          try {
                            const { getSupabase } = await import("../lib/supabase");
                            const sb = getSupabase();
                            if (sb) {
                              const ext = file.name.split(".").pop();
                              const filePath = `${selectedStation}/${date}/${i}_${Date.now()}.${ext}`;
                              const { error } = await sb.storage.from("justificatifs").upload(filePath, file, { upsert: true });
                              if (!error) {
                                const { data: urlData } = sb.storage.from("justificatifs").getPublicUrl(filePath);
                                up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, photo: urlData.publicUrl, photoName: file.name } : x) });
                                return;
                              }
                            }
                          } catch {}
                        }
                        // Fallback: base64 local
                        const reader = new FileReader();
                        reader.onload = (ev) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, photo: ev.target.result, photoName: file.name } : x) });
                        reader.readAsDataURL(file);
                      }} />
                  </label>
                  {d.photo && <img src={d.photo} alt="justif" className="w-10 h-10 rounded object-cover border" style={{ borderColor: T.line }} onClick={() => window.open(d.photo)} />}
                </div>
              </div>
            ))}
            {!verrou && (
              <button
                onClick={() => up({ depenses: [...(r.depenses || []), { categorie: ref.categories?.[0]?.libelle || "Transport", libelle: "", montant: "" }] })}
                className="w-full py-2 my-2 rounded text-sm font-medium"
                style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}
              >+ Ajouter une dépense</button>
            )}
          </Section>

          <Section titre="Versements espèces" aside={`BIS ${F(c.bis)} F`}>
            {(r.versements || []).map((v, i) => (
              <Row key={i} className={i === 4 ? "border-0" : ""}>
                <span>Versement {i + 1}</span>
                <Num big value={v} disabled={verrou} placeholder="" onChange={(x) => up({ versements: r.versements.map((y, j) => j === i ? x : y) })} />
              </Row>
            ))}
          </Section>

          <Section titre="Délestages Coffre & Scellés Bancaires (Sécurité)" aside={`${F(c.totalDelestages || 0)} F coffre`}>
            <p className="text-xs pb-2 text-gray-500">
              Mise en sécurité du cash en cours de journée (dépôt dans le coffre-fort de la station sous enveloppe ou scellé numéroté).
            </p>
            {(r.delestages || []).length === 0 && (
              <p className="text-xs py-2 text-gray-400 italic">Aucun délestage coffre enregistré pour cette journée.</p>
            )}
            {(r.delestages || []).map((del, i) => (
              <div key={i} className="py-2 border-b space-y-1.5" style={{ borderColor: T.line }}>
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={del.heure || ""}
                    disabled={verrou}
                    onChange={(e) => up({ delestages: r.delestages.map((x, j) => j === i ? { ...x, heure: e.target.value } : x) })}
                    className="rounded border px-2 py-1 bg-white text-xs w-24"
                    style={{ borderColor: T.line }}
                  />
                  <Num
                    value={del.montant}
                    disabled={verrou}
                    placeholder="Montant (F)"
                    onChange={(v) => up({ delestages: r.delestages.map((x, j) => j === i ? { ...x, montant: v } : x) })}
                    w="w-32"
                  />
                  <input
                    type="text"
                    value={del.numero_scelle || ""}
                    disabled={verrou}
                    placeholder="N° Scellé / Enveloppe"
                    onChange={(e) => up({ delestages: r.delestages.map((x, j) => j === i ? { ...x, numero_scelle: e.target.value } : x) })}
                    className="flex-1 rounded border px-2 py-1 bg-white text-xs font-mono"
                    style={{ borderColor: T.line }}
                  />
                  {!verrou && (
                    <button
                      type="button"
                      onClick={() => up({ delestages: r.delestages.filter((_, j) => j !== i) })}
                      className="px-2 rounded text-xs font-bold"
                      style={{ color: T.alert }}
                      title="Supprimer ce délestage"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={del.deposant || ""}
                    disabled={verrou}
                    placeholder="Déposant / Témoin (ex: Chef de piste)"
                    onChange={(e) => up({ delestages: r.delestages.map((x, j) => j === i ? { ...x, deposant: e.target.value } : x) })}
                    className="flex-1 rounded border px-2 py-1 text-xs bg-white disabled:bg-transparent"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>
            ))}
            {!verrou && (
              <button
                type="button"
                onClick={() =>
                  up({
                    delestages: [
                      ...(r.delestages || []),
                      {
                        heure: new Date().toLocaleTimeString().slice(0, 5),
                        montant: "",
                        numero_scelle: "",
                        deposant: profil?.nom_complet || "Chef de piste",
                      },
                    ],
                  })
                }
                className="w-full py-2 my-2 rounded text-xs font-medium"
                style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}
              >
                + Enregistrer un délestage coffre (scellé sécurisé)
              </button>
            )}
            <Row className="border-0 font-semibold text-xs pt-1">
              <span>Total mis en coffre-fort sécurisé :</span>
              <span className="tabular text-emerald-800">{F(c.totalDelestages || 0)} FCFA</span>
            </Row>
          </Section>

          <Section titre="Règlements non-espèces" aside={`${F((r.reglements || []).reduce((s, x) => s + n(x.montant), 0))} F`}>
            {(r.reglements || []).length === 0 && <p className="text-sm py-2" style={{ color: T.muted }}>Aucun règlement par carte, mobile money ou crédit.</p>}
            {(r.reglements || []).map((rg, i) => (
              <div key={i} className="py-2 border-b" style={{ borderColor: T.line }}>
                <div className="flex gap-2 items-center">
                  <select
                    value={rg.mode}
                    disabled={verrou}
                    onChange={(e) => up({ reglements: r.reglements.map((x, j) => j === i ? { ...x, mode: e.target.value, client: "", client_id: null } : x) })}
                    className="flex-1 rounded border px-2 py-1 bg-white text-sm"
                    style={{ borderColor: T.line }}
                  >
                    {MODES_REGLEMENT.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                  </select>
                  <Num value={rg.montant} disabled={verrou} placeholder="" onChange={(v) => up({ reglements: r.reglements.map((x, j) => j === i ? { ...x, montant: v } : x) })} />
                  {!verrou && <button onClick={() => up({ reglements: r.reglements.filter((_, j) => j !== i) })} className="px-2 rounded" style={{ color: T.alert }}>✕</button>}
                </div>
                {rg.mode === "CREDIT_CLIENT" && (
                  <select
                    value={rg.client || ""}
                    disabled={verrou}
                    onChange={(e) => up({ reglements: r.reglements.map((x, j) => j === i ? { ...x, client: e.target.value } : x) })}
                    className="mt-1 w-full rounded border px-2 py-1 bg-white text-sm"
                    style={{ borderColor: T.line }}
                  >
                    <option value="">— Choisir le client —</option>
                    {(ref.clients || []).map((cl) => <option key={cl.code} value={cl.code}>{cl.nom}</option>)}
                  </select>
                )}
                <input
                  value={rg.libelle || ""}
                  disabled={verrou}
                  placeholder="Libellé (facultatif)"
                  onChange={(e) => up({ reglements: r.reglements.map((x, j) => j === i ? { ...x, libelle: e.target.value } : x) })}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm bg-white disabled:bg-transparent disabled:border-transparent"
                  style={{ borderColor: T.line }}
                />
              </div>
            ))}
            {!verrou && (
              <button
                onClick={() => up({ reglements: [...(r.reglements || []), { mode: "TICKET", montant: "", client: "", client_id: null, libelle: "" }] })}
                className="w-full py-2 my-2 rounded text-sm font-medium"
                style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}
              >+ Ajouter un règlement non-espèces</button>
            )}
          </Section>

          <Section titre="Détail coupures" aside={`${F(c.totalCoupures)} F`}>
            <div className="grid grid-cols-3 gap-2 py-2">
              {COUPURES.map((cp) => (
                <label key={cp} className="rounded p-2" style={{ background: T.paper }}>
                  <div className="text-xs" style={{ color: T.muted }}>{F(cp)} F</div>
                  <Num value={r.coupures?.[cp] ?? ""} disabled={verrou} placeholder="" onChange={(v) => up({ coupures: { ...r.coupures, [cp]: v } })} w="w-full" right={false} />
                  <div className="text-xs text-right" style={{ color: T.muted }}>{F(cp * n(r.coupures?.[cp]))}</div>
                </label>
              ))}
            </div>
            <Row className="border-0"><span>NET BIS (versements − coupures)</span><span className="font-semibold">{F(c.netBis)} F</span></Row>
          </Section>
        </>
      )}

      {/* ONGLET RÉCAP */}
      {onglet === "recap" && (
        <>
          <div className="bg-white rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
            <div className="px-4 py-3" style={{ background: T.petrol, color: "white" }}>
              <div className="text-xs opacity-80">Bordereau de clôture</div>
              <div className="font-semibold">{selectedStation} — {fmtDate(date)}</div>
              <div className="text-xs opacity-80">Gérant : {r.gerant || profil?.nom_complet}</div>
            </div>
            <div className="px-4 py-2 tabular">
              <Row><span>Gasoil {F(c.volGO)} L × {c.pGO}</span><span>{F(c.volGO * c.pGO)}</span></Row>
              <Row><span>Super {F(c.volSU)} L × {c.pSU}</span><span>{F(c.volSU * c.pSU)}</span></Row>
              <Row><span>Lubrifiants</span><span>{F(c.caLub)}</span></Row>
              <Row><span>Gaz</span><span>{F(c.caGaz)}</span></Row>
              <Row><span>Lavage</span><span>{F(c.lavage)}</span></Row>
              <Row><span>Boutique / Shop</span><span>{F(c.boutique)}</span></Row>
              {(c.depots > 0 || c.remboursement > 0) && <Row><span>Dépôts + remboursements</span><span>{F(c.depots + c.remboursement)}</span></Row>}
              <Row className="font-bold text-base"><span>C.A. TOTAL</span><span>{F(c.caTotal)}</span></Row>
              <Row><span>− Tickets</span><span>{F(c.tickets)}</span></Row>
              <Row><span>− Dépenses</span><span>{F(c.depenses)}</span></Row>
              <Row className="font-bold text-lg"><span>À VERSER</span><span style={{ color: T.petrol }}>{F(c.aVerser)}</span></Row>
              <Row><span>Versements (BIS)</span><span>{F(c.bis)}</span></Row>
              {c.totalDelestages > 0 && (
                <Row className="text-emerald-800">
                  <span>🔒 Coffre (Délestages scellés)</span>
                  <span>{F(c.totalDelestages)}</span>
                </Row>
              )}
              <Row className="font-semibold border-0">
                <span>Écart de caisse</span>
                <span className="px-2 rounded" style={{ background: Math.abs(c.ecart) > SEUIL_ECART ? "#FBEAE5" : "#E3F4EA", color: Math.abs(c.ecart) > SEUIL_ECART ? T.alert : T.ok }}>
                  {c.ecart > 0 ? "+" : ""}{F(c.ecart)}
                </span>
              </Row>
            </div>
            <div className="px-4 py-2 text-sm border-t" style={{ borderColor: T.line, background: T.paper }}>
              <div className="flex justify-between flex-wrap gap-1">
                <span>Ventilation</span>
                <span className="text-xs" style={{ color: T.muted }}>Carburant {F(c.ventilation.carburant)} · Lub {F(c.caLub)} · Lavage {F(c.lavage)} · Boutique {F(c.boutique)} · Gaz {F(c.caGaz)}</span>
              </div>
              <div className="flex justify-between mt-1"><span>Coupures</span><span>{F(c.totalCoupures)} — NET BIS {F(c.netBis)}</span></div>
            </div>
          </div>

          {erreurs.length > 0 && r.statut === "BROUILLON" && (
            <div className="mt-4 rounded-lg px-3 py-2" style={{ background: "#FBEAE5", color: T.alert }}>
              <div className="font-semibold text-sm mb-1">À corriger avant soumission</div>
              <ul className="text-sm list-disc pl-5">{erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          <textarea
            value={r.commentaire || ""}
            disabled={verrou}
            onChange={(e) => up({ commentaire: e.target.value })}
            placeholder="Commentaire du gérant (incident, panne, explication d'écart…)"
            className="w-full mt-4 rounded border p-2 text-sm bg-white disabled:bg-transparent"
            rows={2}
            style={{ borderColor: T.line }}
          />

          <div className="mt-4 grid gap-2">
            {(role === "gerant" || role === "admin") && (r.statut === "BROUILLON" || r.statut === "REJETE") && (
              <>
                <button disabled={busy} onClick={() => sauver()} className="py-3 rounded-lg font-medium" style={{ border: `1px solid ${T.petrol}`, color: T.petrol, background: "white" }}>
                  {busy ? "Enregistrement…" : "Enregistrer le brouillon"}
                </button>
                <button
                  disabled={erreurs.length > 0 || busy}
                  onClick={() => changerStatut("SOUMIS", { soumisLe: new Date().toISOString() })}
                  className="py-3 rounded-lg font-semibold disabled:opacity-40"
                  style={{ background: T.gold, color: T.ink }}
                >Soumettre au superviseur</button>
              </>
            )}
            {(role === "admin" || role === "superviseur" || role === "directeur") && r.statut === "SOUMIS" && (
              <>
                <button onClick={() => changerStatut("VALIDE", { valideLe: new Date().toISOString(), valide_par: profil.id })} className="py-3 rounded-lg font-semibold" style={{ background: T.ok, color: "white" }}>Valider le rapport</button>
                <button onClick={() => { const m = prompt("Motif du rejet ?"); if (m) changerStatut("REJETE", { motifRejet: m }); }} className="py-3 rounded-lg font-medium" style={{ border: `1px solid ${T.alert}`, color: T.alert, background: "white" }}>Rejeter avec motif</button>
              </>
            )}
            <button onClick={() => exporterExcel(r, c, ref.stations)} className="py-3 rounded-lg font-medium" style={{ border: `1px solid ${T.line}`, background: "white" }}>
              📥 Exporter au format journal Excel
            </button>
            <button onClick={() => { const stName = (ref.stations.find((s) => s.code === selectedStation) || {}).nom || selectedStation; const rows = ecrireSyscohada(r, c, stName); exporterCsv(`SYSCOHADA_${selectedStation}_${date}.xlsx`, rows); }} className="py-3 rounded-lg font-medium text-sm" style={{ border: `1px solid ${T.line}`, background: "white" }}>
              📊 Export écritures SYSCOHADA
            </button>
          </div>
        </>
      )}
    </div>
  );
}
