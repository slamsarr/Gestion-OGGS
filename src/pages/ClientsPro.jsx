import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listClientsPro,
  createClientPro,
  listVehicules,
  createVehicule,
  listOperationsCredit,
  saveOperationCredit,
  soldeClient,
} from "../lib/api";
import { Section, Row, Num, Loading } from "../components/ui";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";

export default function ClientsPro() {
  const { profil, cloud } = useAuth();
  const [stationId, setStationId] = useState(profil?.station_id || "");
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [selected, setSelected] = useState(null);
  const [subTab, setSubTab] = useState("ops"); // ops | vehicules | reglement
  const [clForm, setClForm] = useState({ code: "", nom_entreprise: "", telephone: "", email: "", plafond_credit: 1000000, station_id: stationId });
  const [veh, setVeh] = useState({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
  const [reglementForm, setReglementForm] = useState({ montant: "", reference: "", mode: "ESPECES", date: todayISO() });
  const [msg, setMsg] = useState("");
  const [soldes, setSoldes] = useState({});
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);

  const clients = ref?.clients_pro || [];
  const vehicules = selected ? (ref?.vehicules || []).filter((v) => v.client_code === selected) : [];
  const clientActif = clients.find((c) => c.code === selected);

  const flash = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const cls = r?.clients_pro || [];
      const sMap = {};
      for (const cl of cls) {
        try {
          sMap[cl.code] = await soldeClient(cl.code);
        } catch {}
      }
      setSoldes(sMap);
    } catch (err) {
      console.error("Erreur chargement clients pro:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!stationId && ref?.stations?.length) setStationId(ref.stations[0].code);
  }, [ref, stationId]);

  useEffect(() => {
    loadData();
  }, [cloud]);

  const loadClientOps = async (code) => {
    setLoadingOps(true);
    try {
      const o = await listOperationsCredit(code);
      setOps(o || []);
      const s = await soldeClient(code);
      setSoldes((prev) => ({ ...prev, [code]: s }));
    } catch (err) {
      console.error("Erreur chargement opérations client:", err);
    } finally {
      setLoadingOps(false);
    }
  };

  useEffect(() => {
    if (selected) {
      loadClientOps(selected);
    } else {
      setOps([]);
    }
  }, [selected]);

  const save = async () => {
    if (!clForm.nom_entreprise.trim()) return flash("Le nom de l'entreprise est requis");
    const code = clForm.code.trim() || `CP-${clForm.nom_entreprise.trim().slice(0, 4).toUpperCase()}`;
    const res = await createClientPro({ ...clForm, code, station_id: stationId, plafond_credit: n(clForm.plafond_credit) });
    if (res?.error) return flash("Erreur : " + res.error);
    setClForm({ code: "", nom_entreprise: "", telephone: "", email: "", plafond_credit: 1000000, station_id: stationId });
    flash("Client professionnel ajouté avec succès");
    await loadData();
  };

  const saveVeh = async () => {
    if (!selected) return flash("Sélectionnez d'abord un client");
    if (!veh.immatriculation?.trim()) return flash("Immatriculation requise");
    const res = await createVehicule({ ...veh, client_code: selected, station_id: stationId });
    if (res?.error) return flash("Erreur : " + res.error);
    setVeh({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
    flash("Véhicule ajouté à la flotte du client");
    const r = await loadReferentiel();
    setRef(r);
  };

  const saveReglement = async () => {
    if (!selected) return flash("Sélectionnez un client");
    const m = n(reglementForm.montant);
    if (m <= 0) return flash("Montant de règlement invalide");
    try {
      await saveOperationCredit({
        client_code: selected,
        station_id: stationId,
        date_op: reglementForm.date || todayISO(),
        matricule: `Règlement ${reglementForm.mode}${reglementForm.reference ? " - " + reglementForm.reference : ""}`,
        volume_l: 0,
        valeur_cons: 0,
        depot: m,
      });
      flash(`Règlement de ${F(m)} F enregistré avec succès`);
      setReglementForm({ montant: "", reference: "", mode: "ESPECES", date: todayISO() });
      await loadClientOps(selected);
      setSubTab("ops");
    } catch (err) {
      flash("Erreur règlement : " + err.message);
    }
  };

  if (loading) return <Loading label="Chargement des clients professionnels…" />;

  return (
    <div className="space-y-4">
      {/* Entête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: T.petrol }}>
            Portefeuille Clients Professionnels & Flottes
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            Gestion des crédits carburant, suivi des encaissements de bons & suivi des flottes (§33)
          </p>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
          {clients.length} compte(s) B2B actif(s)
        </div>
      </div>

      {msg && <div className="rounded-lg px-3 py-2 text-sm font-semibold shadow-xs" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Formulaire nouveau client */}
      <Section titre="Nouveau Compte Client Entreprise" aside="RBAC : Commercial, Gérant, Direction">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Code Client</div>
            <input value={clForm.code} onChange={(e) => setClForm({ ...clForm, code: e.target.value })} placeholder="ex: CP-TRANSPORT" className="w-full border rounded px-2 py-1 text-sm uppercase" style={{ borderColor: T.line }} />
          </div>
          <div className="col-span-2">
            <div className="text-xs font-medium" style={{ color: T.muted }}>Raison Sociale / Nom Entreprise *</div>
            <input value={clForm.nom_entreprise} onChange={(e) => setClForm({ ...clForm, nom_entreprise: e.target.value })} placeholder="ex: Sococim Industries SA" className="w-full border rounded px-2 py-1 text-sm font-semibold" style={{ borderColor: T.line }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Téléphone Contact</div>
            <input value={clForm.telephone} onChange={(e) => setClForm({ ...clForm, telephone: e.target.value })} placeholder="77 000 00 00" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Email Gestionnaire</div>
            <input value={clForm.email} onChange={(e) => setClForm({ ...clForm, email: e.target.value })} placeholder="flotte@entreprise.sn" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: T.muted }}>Plafond Crédit Autorisé (F CFA) *</div>
            <Num value={clForm.plafond_credit} onChange={(v) => setClForm({ ...clForm, plafond_credit: v })} w="w-full" />
          </div>
        </div>
        <div className="pt-1 pb-2">
          <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-xs transition-opacity hover:opacity-90" style={{ background: T.petrol }}>
            + Créer le compte client pro
          </button>
        </div>
      </Section>

      {/* Liste des comptes clients pro */}
      <Section titre="Comptes Clients & Encours de Crédit" aside="Cliquez sur un compte pour ouvrir sa fiche détaillée">
        <div className="divide-y" style={{ borderColor: T.line }}>
          {clients.map((c, i) => {
            const rawSolde = soldes[c.code] ?? 0; // solde = depots - consommations
            const detteEnCours = Math.max(0, -rawSolde);
            const plafond = n(c.plafond_credit) || 0;
            const creditRestant = Math.max(0, plafond + rawSolde);
            const ratioConso = plafond > 0 ? (detteEnCours / plafond) * 100 : 0;
            const isSelected = selected === c.code;

            return (
              <div
                key={c.code || c.id || i}
                onClick={() => setSelected(isSelected ? null : c.code)}
                className={`p-3 transition-colors cursor-pointer rounded-lg ${isSelected ? "bg-amber-50/70 border border-amber-300" : "hover:bg-slate-50"}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-gray-900">{c.nom_entreprise}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{c.code}</span>
                      {isSelected && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">Sélectionné</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.telephone && <span>📞 {c.telephone}</span>}
                      {c.email && <span className="ml-2">✉️ {c.email}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-right">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-semibold">Plafond Accordé</div>
                      <div className="font-semibold text-xs tabular">{F(plafond)} F</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: detteEnCours > 0 ? T.alert : T.ok }}>
                        {detteEnCours > 0 ? "Dette (Bons)" : "Avance"}
                      </div>
                      <div className="font-bold text-xs tabular" style={{ color: detteEnCours > 0 ? T.alert : T.ok }}>
                        {rawSolde < 0 ? `${F(detteEnCours)} F` : rawSolde > 0 ? `+${F(rawSolde)} F` : "0 F"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-semibold">Crédit Disponible</div>
                      <div className="font-black text-xs tabular" style={{ color: creditRestant <= 0 ? T.alert : T.petrol }}>
                        {F(creditRestant)} F
                      </div>
                    </div>
                  </div>
                </div>

                {/* Barre d'encours de crédit */}
                {plafond > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, ratioConso)}%`,
                          background: ratioConso >= 100 ? T.alert : ratioConso >= 80 ? "#D97706" : T.green,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 tabular w-10 text-right">
                      {ratioConso.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {clients.length === 0 && <div className="py-4 text-center text-sm" style={{ color: T.muted }}>Aucun client pro enregistré.</div>}
      </Section>

      {/* Détail du compte client sélectionné */}
      {selected && clientActif && (
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b gap-2" style={{ borderColor: T.line }}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏢</span>
                <h2 className="text-base font-bold text-gray-900">{clientActif.nom_entreprise}</h2>
                <span className="text-xs font-mono font-bold text-gray-500">({clientActif.code})</span>
              </div>
              <p className="text-xs text-gray-500">
                Plafond : <strong>{F(clientActif.plafond_credit || 0)} FCFA</strong> · Encours :{" "}
                <strong style={{ color: (soldes[selected] || 0) < 0 ? T.alert : T.ok }}>
                  {(soldes[selected] || 0) < 0 ? `${F(-soldes[selected])} FCFA dus` : `${F(soldes[selected] || 0)} FCFA d'avance`}
                </strong>
              </p>
            </div>

            {/* Onglets d'action */}
            <div className="flex rounded-lg border p-1 bg-gray-50 gap-1 text-xs font-semibold" style={{ borderColor: T.line }}>
              <button
                onClick={() => setSubTab("ops")}
                className={`px-3 py-1.5 rounded-md transition-colors ${subTab === "ops" ? "bg-white shadow-xs text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
              >
                📋 Bons & Opérations ({ops.length})
              </button>
              <button
                onClick={() => setSubTab("vehicules")}
                className={`px-3 py-1.5 rounded-md transition-colors ${subTab === "vehicules" ? "bg-white shadow-xs text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
              >
                🚗 Véhicules Flotte ({vehicules.length})
              </button>
              <button
                onClick={() => setSubTab("reglement")}
                className={`px-3 py-1.5 rounded-md transition-colors ${subTab === "reglement" ? "bg-white shadow-xs text-emerald-800" : "text-emerald-700 hover:bg-emerald-50"}`}
              >
                💳 Règlement / Dépôt
              </button>
            </div>
          </div>

          {/* Onglet 1 : Historique des opérations & Bons de carburant */}
          {subTab === "ops" && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center justify-between">
                <span>Détail des Bons d'encaissement pompiste et Règlements :</span>
                <span className="text-[10px] text-gray-400">Origine : Descentes & Caisses</span>
              </div>

              {loadingOps ? (
                <p className="text-xs text-gray-400 py-3 text-center">Chargement des opérations…</p>
              ) : ops.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">Aucune opération enregistrée pour ce client.</p>
              ) : (
                <div className="overflow-x-auto border rounded-lg" style={{ borderColor: T.line }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                      <tr>
                        <th className="py-2 px-3 text-left">Date</th>
                        <th className="py-2 px-3 text-left">Référence / Matricule / Bon</th>
                        <th className="py-2 px-3 text-right">Bon Carburant (F)</th>
                        <th className="py-2 px-3 text-right">Règlement / Dépôt (F)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.line }}>
                      {ops.map((op, idx) => (
                        <tr key={op.id || idx} className="hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-600 tabular">{fmtDate(op.date_op)}</td>
                          <td className="py-2 px-3 font-semibold text-gray-900">{op.matricule || "Opération crédit"}</td>
                          <td className="py-2 px-3 text-right font-bold tabular" style={{ color: n(op.valeur_cons) > 0 ? T.alert : T.muted }}>
                            {n(op.valeur_cons) > 0 ? `${F(op.valeur_cons)} F` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-bold tabular text-emerald-700">
                            {n(op.depot) > 0 ? `+${F(op.depot)} F` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Onglet 2 : Véhicules de la flotte rattachée */}
          {subTab === "vehicules" && (
            <div className="space-y-3">
              <div className="divide-y border rounded-lg" style={{ borderColor: T.line }}>
                {vehicules.map((v, i) => (
                  <div key={v.id || v.immatriculation || i} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-gray-900 px-2 py-0.5 rounded bg-gray-100">{v.immatriculation}</span>
                      <span className="text-gray-600 font-medium">{v.marque} {v.modele}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800">{v.type || v.type_vehicule}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800">{v.carburant}</span>
                    </div>
                  </div>
                ))}
                {vehicules.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">Aucun véhicule rattaché à ce client.</p>}
              </div>

              {/* Formulaire ajout véhicule */}
              <div className="border rounded-lg p-3 bg-gray-50/70" style={{ borderColor: T.line }}>
                <div className="text-xs font-bold text-gray-700 mb-2">+ Enregistrer un nouveau véhicule à la flotte</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <div className="text-[10px] text-gray-500">Immatriculation *</div>
                    <input value={veh.immatriculation} onChange={(e) => setVeh({ ...veh, immatriculation: e.target.value })} placeholder="DK-1234-AA" className="w-full border rounded px-2 py-1 text-xs uppercase font-mono font-bold" style={{ borderColor: T.line }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Marque</div>
                    <input value={veh.marque} onChange={(e) => setVeh({ ...veh, marque: e.target.value })} placeholder="Toyota" className="w-full border rounded px-2 py-1 text-xs" style={{ borderColor: T.line }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Modèle</div>
                    <input value={veh.modele} onChange={(e) => setVeh({ ...veh, modele: e.target.value })} placeholder="Hilux" className="w-full border rounded px-2 py-1 text-xs" style={{ borderColor: T.line }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Type</div>
                    <select value={veh.type_vehicule} onChange={(e) => setVeh({ ...veh, type_vehicule: e.target.value })} className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }}>
                      {["CAMION", "PICKUP", "BUS", "VOITURE", "MOTO"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Carburant</div>
                    <select value={veh.carburant} onChange={(e) => setVeh({ ...veh, carburant: e.target.value })} className="w-full border rounded px-2 py-1 text-xs bg-white" style={{ borderColor: T.line }}>
                      {["GASOIL", "SUPER", "GAZ"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <button onClick={saveVeh} className="px-3 py-1.5 rounded text-xs font-bold text-white shadow-xs" style={{ background: T.petrol }}>
                    Ajouter le véhicule
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Onglet 3 : Règlement / Dépôt Client */}
          {subTab === "reglement" && (
            <div className="border rounded-lg p-3 bg-emerald-50/40 space-y-3" style={{ borderColor: T.line }}>
              <div className="text-xs font-bold text-emerald-950 flex items-center justify-between">
                <span>Encaisser un règlement de créance client</span>
                <span className="text-[10px] text-emerald-700 font-medium">Réduit la dette du compte</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Date de règlement *</div>
                  <input type="date" value={reglementForm.date} onChange={(e) => setReglementForm({ ...reglementForm, date: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs bg-white" style={{ borderColor: T.line }} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Mode de paiement *</div>
                  <select value={reglementForm.mode} onChange={(e) => setReglementForm({ ...reglementForm, mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs bg-white" style={{ borderColor: T.line }}>
                    {["ESPECES", "CHEQUE", "VIREMENT", "WAVE", "ORANGE_MONEY"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Référence / N° Chèque</div>
                  <input value={reglementForm.reference} onChange={(e) => setReglementForm({ ...reglementForm, reference: e.target.value })} placeholder="ex: CHQ-88192" className="w-full border rounded px-2 py-1.5 text-xs bg-white" style={{ borderColor: T.line }} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 font-medium">Montant encaissé (F CFA) *</div>
                  <Num value={reglementForm.montant} onChange={(v) => setReglementForm({ ...reglementForm, montant: v })} w="w-full" />
                </div>
              </div>
              <div className="pt-2 text-right">
                <button onClick={saveReglement} className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs bg-emerald-700 hover:bg-emerald-800 transition-colors">
                  ✓ Enregistrer l'encaissement de {F(n(reglementForm.montant))} F
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
