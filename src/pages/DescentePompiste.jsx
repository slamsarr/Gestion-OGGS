import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, createDescente, listDescentes, indexVeille, saveOperationCredit, savePistolet } from "../lib/api";
import { F, fmtDate, n, T, todayISO, prixDuJour } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function DescentePompiste() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationCode = profil?.stations?.code || stationId.replace("st-", "").toUpperCase();
  const [ref, setRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [descentes, setDescentes] = useState([]);
  const [historiqueView, setHistoriqueView] = useState(false);
  const [ticketModal, setTicketModal] = useState(null); // ticket actif à afficher / imprimer / whatsapp

  // Modal ajout de pompe / pistolet
  const [showAddPompe, setShowAddPompe] = useState(false);
  const [newPompeCode, setNewPompeCode] = useState("");
  const [newPompeProduit, setNewPompeProduit] = useState("GASOIL");
  const [newPompeIndex, setNewPompeIndex] = useState("");

  // Formulaire
  const [date, setDate] = useState(todayISO());
  const [pompisteId, setPompisteId] = useState(profil?.id || "");
  const [pompisteNom, setPompisteNom] = useState(profil?.nom_complet || "");
  const [pistoletCode, setPistoletCode] = useState("");
  const [indexDebut, setIndexDebut] = useState("");
  const [indexFin, setIndexFin] = useState("");

  // Encaissements
  const [especes, setEspeces] = useState("");
  const [wave, setWave] = useState("");
  const [orangeMoney, setOrangeMoney] = useState("");
  const [carteBancaire, setCarteBancaire] = useState("");
  const [creditClient, setCreditClient] = useState("");
  const [selectedClientCredit, setSelectedClientCredit] = useState("");
  const [autrePaiement, setAutrePaiement] = useState("");
  const [commentaire, setCommentaire] = useState("");

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const des = await listDescentes(stationId);
      setDescentes(des || []);
      const dispo = (r.pistolets || []).filter((p) => !stationId || p.station_id === stationId);
      const initialPist = pistoletCode || (dispo.length > 0 ? dispo[0].code : "");
      if (initialPist && initialPist !== pistoletCode) {
        setPistoletCode(initialPist);
      }
      if (initialPist) {
        const lastIdx = await indexVeille(stationCode, date, initialPist);
        if (lastIdx != null && !indexDebut) {
          setIndexDebut(lastIdx.toString());
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  // Mettre à jour l'index début automatiquement lors du changement de pistolet
  const handlePistoletChange = async (code) => {
    setPistoletCode(code);
    try {
      const lastIdx = await indexVeille(stationCode, date, code);
      if (lastIdx != null) {
        setIndexDebut(lastIdx.toString());
      }
    } catch {}
  };

  const handleAjouterPompe = async (e) => {
    e.preventDefault();
    const cleanCode = newPompeCode.trim().toLowerCase().replace(/\s+/g, "");
    if (!cleanCode) return flash("Veuillez saisir un nom ou numéro de pompe/pistolet (ex: gasoil5 ou P9)");

    try {
      const res = await savePistolet({
        station_id: stationId,
        station_code: stationCode,
        code: cleanCode,
        produit: newPompeProduit,
      });
      if (res.ok) {
        flash(`Pompe / Pistolet ${cleanCode.toUpperCase()} ajouté avec succès !`);
        setShowAddPompe(false);
        setNewPompeCode("");
        if (newPompeIndex) {
          setIndexDebut(newPompeIndex);
        }
        await loadData();
        setPistoletCode(cleanCode);
        if (newPompeIndex) {
          setIndexDebut(newPompeIndex);
        }
      } else {
        flash("Erreur lors de l'ajout de la pompe");
      }
    } catch (err) {
      flash("Erreur : " + (err.message || err));
    }
  };

  if (loading) return <Loading label="Chargement de Ma Descente..." />;

  const pistList = (ref?.pistolets || []).filter((p) => !stationId || p.station_id === stationId);
  const selectedPist = pistList.find((p) => p.code === pistoletCode) || pistList[0];
  const produit = selectedPist?.produit || "GASOIL";
  const currentPrix = prixDuJour(ref?.prix || [], produit, date) || (ref?.prix || []).find((px) => px.produit === produit)?.prix_vente || 0;

  const idxDeb = n(indexDebut);
  const idxFin = n(indexFin);
  const volumeVendu = idxFin > idxDeb ? idxFin - idxDeb : 0;
  const montantTheorique = Math.round(volumeVendu * currentPrix);

  const totalEncaisse = n(especes) + n(wave) + n(orangeMoney) + n(carteBancaire) + n(creditClient) + n(autrePaiement);
  const ecart = totalEncaisse - montantTheorique;

  const buildTicketText = (d) => {
    const dateStr = fmtDate(d.date);
    const heureStr = d.created_at ? new Date(d.created_at).toLocaleTimeString().slice(0, 5) : new Date().toLocaleTimeString().slice(0, 5);
    const pNom = d.pompiste_nom || profil?.nom_complet || "Pompiste";
    const pistCode = (d.pistolet_code || "").toUpperCase();
    return `*⛽ TICKET DE PASSATION DE QUART - STATION ${stationCode}*
----------------------------------------
📅 *Date :* ${dateStr} à ${heureStr}
👤 *Pompiste :* ${pNom}
🔫 *Pistolet / Pompe :* ${pistCode} (${d.produit})
----------------------------------------
📊 *RELEVÉ INDEX COMPTEUR*
• Index Début : ${d.index_debut} L
• Index Fin   : ${d.index_fin} L
• Volume Total: *${F(d.volume_vendu)} Litres*
• Prix unitaire: ${F(d.prix_unitaire)} FCFA / L
💰 *Montant Théorique :* *${F(d.montant_theorique)} FCFA*
----------------------------------------
💵 *ENCAISSEMENTS REMIS*
• Espèces (Cash) : ${F(d.encaissements?.especes || 0)} FCFA
• Wave           : ${F(d.encaissements?.wave || 0)} FCFA
• Orange Money   : ${F(d.encaissements?.orange_money || 0)} FCFA
• Carte / TPE    : ${F(d.encaissements?.carte_bancaire || 0)} FCFA
• Crédit Client  : ${F(d.encaissements?.credit_client || 0)} FCFA
• Autre          : ${F(d.encaissements?.autre || 0)} FCFA
👉 *TOTAL ENCAISSÉ :* *${F(d.total_encaisse)} FCFA*
----------------------------------------
⚖️ *ÉCART DE CAISSE :* *${d.ecart >= 0 ? "+" : ""}${F(d.ecart)} FCFA* ${d.ecart === 0 ? "✅ (Conforme)" : d.ecart > 0 ? "🟢 (Excédent)" : "🚨 (MANQUANT)"}
----------------------------------------
✍️ *Décharge & Passation de quart certifiée conforme*`;
  };

  const shareTicketWhatsApp = (d) => {
    const text = buildTicketText(d);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const validerDescente = async (statut = "TERMINEE") => {
    if (!pistoletCode) return flash("Veuillez sélectionner un pistolet");
    if (idxFin <= idxDeb) return flash("L'index de fin doit être supérieur à l'index de début");

    const payload = {
      station_id: stationId,
      date,
      pompiste_id: pompisteId || profil?.id,
      pompiste_nom: pompisteNom || profil?.nom_complet,
      pistolet_code: pistoletCode,
      produit,
      prix_unitaire: currentPrix,
      index_debut: idxDeb,
      index_fin: idxFin,
      volume_vendu: volumeVendu,
      montant_theorique: montantTheorique,
      encaissements: {
        especes: n(especes),
        wave: n(wave),
        orange_money: n(orangeMoney),
        carte_bancaire: n(carteBancaire),
        credit_client: n(creditClient),
        autre: n(autrePaiement),
      },
      total_encaisse: totalEncaisse,
      ecart,
      commentaire,
      statut,
      created_at: new Date().toISOString(),
    };

    const res = await createDescente(payload);
    if (res.ok) {
      if (n(creditClient) > 0 && selectedClientCredit) {
        try {
          await saveOperationCredit({
            client_code: selectedClientCredit,
            station_id: stationId,
            date_op: date,
            matricule: commentaire || `Descente ${pistoletCode}`,
            volume_l: currentPrix > 0 ? +(n(creditClient) / currentPrix).toFixed(2) : 0,
            valeur_cons: n(creditClient),
            depot: 0,
          });
        } catch (e) {
          console.error("Erreur enregistrement crédit client:", e);
        }
      }
      flash("Descente enregistrée avec succès ! Ticket généré.");
      // Ouvrir le ticket de fin de quart automatiquement
      setTicketModal(payload);

      setIndexDebut(idxFin.toString());
      setIndexFin("");
      setEspeces("");
      setWave("");
      setOrangeMoney("");
      setCarteBancaire("");
      setCreditClient("");
      setSelectedClientCredit("");
      setAutrePaiement("");
      setCommentaire("");
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement");
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-3">
      <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
            ⛽ Ma Descente Pompiste
          </h1>
          <p className="text-xs" style={{ color: T.muted }}>
            Saisie terrain pistolet, index fin de quart et encaissements multi-modes
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHistoriqueView(!historiqueView)}
          className="text-xs px-3 py-1.5 rounded border font-medium transition-colors"
          style={{ borderColor: T.line, background: historiqueView ? T.petrol : "white", color: historiqueView ? "white" : T.ink }}
        >
          {historiqueView ? "← Saisie" : "📋 Mes descentes (" + descentes.length + ")"}
        </button>
      </div>

      {msg && (
        <div className="mb-3 p-2.5 text-xs rounded font-medium" style={{ background: "#E3F4EA", color: T.ok }}>
          {msg}
        </div>
      )}

      {historiqueView ? (
        <div className="bg-white rounded-lg border p-4 shadow-sm" style={{ borderColor: T.line }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: T.petrol }}>
            Historique des descentes enregistrées
          </h3>
          {descentes.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: T.muted }}>Aucune descente enregistrée.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: T.line }}>
              {descentes.map((d) => (
                <div key={d.id || d.created_at} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {fmtDate(d.date)} · Pistolet {(d.pistolet_code || "").toUpperCase()} ({d.produit})
                    </div>
                    <div className="text-gray-500">
                      Index : {d.index_debut} → {d.index_fin} · <strong>{F(d.volume_vendu)} L</strong> à {F(d.prix_unitaire)} F
                    </div>
                    <div className="text-gray-500">
                      Paiements : Esp. {F(d.encaissements?.especes)} · Wave {F(d.encaissements?.wave)} · OM {F(d.encaissements?.orange_money)}
                    </div>
                  </div>
                  <div className="text-right flex sm:flex-col items-end justify-between gap-1">
                    <div>
                      <div className="font-bold">{F(d.montant_theorique)} F</div>
                      <div className={`font-semibold ${d.ecart >= 0 ? "text-green-600" : "text-red-600"}`}>
                        Écart : {d.ecart >= 0 ? "+" : ""}{F(d.ecart)} F
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => setTicketModal(d)}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-white text-gray-700 hover:bg-gray-50 shadow-xs"
                        style={{ borderColor: T.line }}
                        title="Voir & Imprimer le ticket de quart"
                      >
                        🧾 Ticket
                      </button>
                      <button
                        type="button"
                        onClick={() => shareTicketWhatsApp(d)}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-0.5"
                        title="Envoyer le ticket sur WhatsApp"
                      >
                        📲 WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <Section titre="1. Pistolet et Index Compteur">
            <Row>
              <span className="text-xs font-medium">Date du quart</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs border rounded px-2 py-1"
                style={{ borderColor: T.line }}
              />
            </Row>
            <Row>
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-medium">Pistolet / Pompe</span>
                <button
                  type="button"
                  onClick={() => setShowAddPompe((v) => !v)}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded border border-dashed transition hover:opacity-80"
                  style={{ borderColor: T.petrol, color: T.petrol, background: "#EFF6FF" }}
                >
                  {showAddPompe ? "✕ Fermer" : "➕ Ajouter une pompe"}
                </button>
              </div>
            </Row>

            {showAddPompe ? (
              <div className="p-3 my-1 rounded-lg border bg-blue-50/60 border-blue-200">
                <div className="text-xs font-bold text-blue-900 mb-2">
                  ⛽ Déclarer / Ajouter une nouvelle pompe ou un pistolet
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="text-[10px] text-gray-600 block font-medium">Nom / N° Pistolet *</label>
                    <input
                      type="text"
                      placeholder="ex: gasoil5, super5, P3..."
                      value={newPompeCode}
                      onChange={(e) => setNewPompeCode(e.target.value)}
                      className="w-full text-xs border rounded px-2 py-1 bg-white font-semibold"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 block font-medium">Carburant *</label>
                    <select
                      value={newPompeProduit}
                      onChange={(e) => setNewPompeProduit(e.target.value)}
                      className="w-full text-xs border rounded px-2 py-1 bg-white font-medium"
                      style={{ borderColor: T.line }}
                    >
                      <option value="GASOIL">GASOIL</option>
                      <option value="SUPER">SUPER</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 block font-medium">Index départ (optionnel)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newPompeIndex}
                      onChange={(e) => setNewPompeIndex(e.target.value)}
                      className="w-full text-xs border rounded px-2 py-1 bg-white"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddPompe(false)}
                    className="px-2.5 py-1 rounded text-xs border bg-white text-gray-600"
                    style={{ borderColor: T.line }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleAjouterPompe}
                    className="px-3 py-1 rounded text-xs font-semibold text-white shadow-sm"
                    style={{ background: T.petrol }}
                  >
                    Enregistrer et utiliser cette pompe
                  </button>
                </div>
              </div>
            ) : (
              <Row>
                <span className="text-xs font-medium text-gray-600">Sélectionner la pompe</span>
                <select
                  value={pistoletCode}
                  onChange={(e) => handlePistoletChange(e.target.value)}
                  className="text-xs border rounded px-2 py-1 font-semibold w-52"
                  style={{ borderColor: T.line }}
                >
                  {pistList.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code.toUpperCase()} — {p.produit}
                    </option>
                  ))}
                </select>
              </Row>
            )}

            <Row>
              <div>
                <span className="text-xs font-medium block">Prix unitaire</span>
                <span className="text-[10px] text-gray-500">Tarif officiel {produit}</span>
              </div>
              <span className="text-xs font-bold tabular">{F(currentPrix)} FCFA / L</span>
            </Row>
            <Row>
              <span className="text-xs font-medium">Index DÉBUT (Litres)</span>
              <Num value={indexDebut} onChange={setIndexDebut} placeholder="Index départ" w="w-32" />
            </Row>
            <Row>
              <div>
                <span className="text-xs font-medium block text-blue-800">Index FIN (Litres) *</span>
                <span className="text-[10px] text-gray-500">Relevé actuel sur le pistolet</span>
              </div>
              <Num value={indexFin} onChange={setIndexFin} placeholder="Index actuel" w="w-32" big />
            </Row>
            <div className="my-2 p-2 rounded bg-blue-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Volume Vendu :</span>
              <span className="text-sm font-bold text-blue-900 tabular">{F(volumeVendu)} Litres</span>
            </div>
            <div className="mb-2 p-2 rounded bg-amber-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">Montant Théorique à Justifier :</span>
              <span className="text-base font-extrabold text-amber-900 tabular">{F(montantTheorique)} FCFA</span>
            </div>
          </Section>

          <Section titre="2. Encaissements Reçus (Multi-modes)">
            <Row>
              <span className="text-xs font-medium">💵 Espèces (Cash)</span>
              <Num value={especes} onChange={setEspeces} placeholder="0" w="w-32" />
            </Row>
            <Row>
              <span className="text-xs font-medium text-blue-600">📲 Wave</span>
              <Num value={wave} onChange={setWave} placeholder="0" w="w-32" />
            </Row>
            <Row>
              <span className="text-xs font-medium text-orange-600">🍊 Orange Money</span>
              <Num value={orangeMoney} onChange={setOrangeMoney} placeholder="0" w="w-32" />
            </Row>
            <Row>
              <span className="text-xs font-medium">💳 Carte / TPE</span>
              <Num value={carteBancaire} onChange={setCarteBancaire} placeholder="0" w="w-32" />
            </Row>
            <Row>
              <div>
                <span className="text-xs font-medium block">📝 Bons Client Pro (Crédit)</span>
                <span className="text-[10px] text-gray-500">Bons carburant signés</span>
              </div>
              <Num value={creditClient} onChange={setCreditClient} placeholder="0" w="w-32" />
            </Row>
            {n(creditClient) > 0 && (
              <Row>
                <span className="text-xs font-medium text-amber-800">Sélectionner le Client Pro *</span>
                <select
                  value={selectedClientCredit}
                  onChange={(e) => setSelectedClientCredit(e.target.value)}
                  className="text-xs border rounded px-2 py-1 w-44 font-medium"
                  style={{ borderColor: "#F59E0B" }}
                >
                  <option value="">-- Choisir le compte client --</option>
                  {(ref?.clients || []).map((cl) => (
                    <option key={cl.code} value={cl.code}>
                      {cl.nom} ({cl.code})
                    </option>
                  ))}
                </select>
              </Row>
            )}
            <Row>
              <span className="text-xs font-medium">🔄 Autre moyen</span>
              <Num value={autrePaiement} onChange={setAutrePaiement} placeholder="0" w="w-32" />
            </Row>
            <Row>
              <span className="text-xs font-medium">Commentaire</span>
              <input
                type="text"
                placeholder="Observation..."
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                className="text-xs border rounded px-2 py-1 w-52"
                style={{ borderColor: T.line }}
              />
            </Row>
          </Section>

          <div
            className="rounded-xl p-4 shadow-sm border"
            style={{
              borderColor: ecart === 0 ? "#86EFAC" : Math.abs(ecart) <= 200 ? "#FDE047" : "#FCA5A5",
              background: ecart === 0 ? "#F0FDF4" : Math.abs(ecart) <= 200 ? "#FEFCE8" : "#FEF2F2",
            }}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-gray-700">Total Encaissements Saisis :</span>
              <span className="text-sm font-bold tabular">{F(totalEncaisse)} FCFA</span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-gray-700">Montant Théorique Compteur :</span>
              <span className="text-sm font-bold tabular">{F(montantTheorique)} FCFA</span>
            </div>
            <div className="border-t pt-2 mt-2 flex justify-between items-center">
              <span className="text-sm font-bold">ÉCART DE CAISSE :</span>
              <span
                className={`text-lg font-extrabold tabular ${
                  ecart === 0 ? "text-green-700" : ecart > 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {ecart > 0 ? "+" : ""}{F(ecart)} FCFA
              </span>
            </div>
            {ecart < 0 && (
              <p className="text-[11px] text-red-600 mt-1">
                ⚠️ Manquant de {F(Math.abs(ecart))} FCFA. Veuillez vérifier votre caisse.
              </p>
            )}
            {ecart > 0 && (
              <p className="text-[11px] text-emerald-600 mt-1">
                ℹ️ Excédent de caisse de {F(ecart)} FCFA.
              </p>
            )}
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => validerDescente("EN_COURS")}
              className="flex-1 py-3 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50 transition-colors"
              style={{ borderColor: T.line }}
            >
              Enregistrer brouillon
            </button>
            <button
              type="button"
              onClick={() => validerDescente("TERMINEE")}
              className="flex-1 py-3 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-95"
              style={{ background: T.gold }}
            >
              ✓ Clôturer et Valider la Descente
            </button>
          </div>
        </div>
      )}

      {/* MODAL TICKET DE FIN DE QUART & PASSATION */}
      {ticketModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Barre d'action supérieure */}
            <div className="p-3 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">⛽</span>
                <span className="font-bold text-xs">Ticket de Fin de Quart & Décharge</span>
              </div>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="text-gray-400 hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            {/* Corps du ticket thermique */}
            <div className="p-5 font-mono text-xs text-gray-800 space-y-3 bg-[#FDFDFD]" id="ticket-print-area">
              <div className="text-center border-b pb-2 border-dashed border-gray-300">
                <div className="text-sm font-black tracking-wider uppercase">STATION {stationCode}</div>
                <div className="text-[10px] text-gray-500">RÉSEAU GESTION PÉTROLIÈRE</div>
                <div className="text-[11px] font-bold mt-1">TICKET DE PASSATION DE QUART</div>
                <div className="text-[10px] text-gray-500">
                  {fmtDate(ticketModal.date)} · {ticketModal.created_at ? new Date(ticketModal.created_at).toLocaleTimeString() : new Date().toLocaleTimeString()}
                </div>
              </div>

              <div className="text-[11px] space-y-0.5 border-b pb-2 border-dashed border-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-500">Pompiste sortant :</span>
                  <span className="font-bold">{ticketModal.pompiste_nom || profil?.nom_complet || "Pompiste"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Poste / Pistolet :</span>
                  <span className="font-bold">{(ticketModal.pistolet_code || "").toUpperCase()} ({ticketModal.produit})</span>
                </div>
              </div>

              {/* Index & Volume */}
              <div className="border-b pb-2 border-dashed border-gray-300 text-[11px] space-y-1">
                <div className="font-bold text-gray-700">RELEVÉ COMPTEUR :</div>
                <div className="flex justify-between">
                  <span>Index Début :</span>
                  <span className="tabular font-medium">{ticketModal.index_debut} L</span>
                </div>
                <div className="flex justify-between">
                  <span>Index Fin :</span>
                  <span className="tabular font-medium">{ticketModal.index_fin} L</span>
                </div>
                <div className="flex justify-between font-bold text-blue-900 pt-0.5">
                  <span>Volume Vendu :</span>
                  <span className="tabular">{F(ticketModal.volume_vendu)} Litres</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Tarif / Litre :</span>
                  <span className="tabular">{F(ticketModal.prix_unitaire)} FCFA</span>
                </div>
                <div className="flex justify-between font-black text-gray-950 pt-1 border-t border-dotted">
                  <span>TOTAL THÉORIQUE :</span>
                  <span className="tabular">{F(ticketModal.montant_theorique)} FCFA</span>
                </div>
              </div>

              {/* Détail encaissements */}
              <div className="border-b pb-2 border-dashed border-gray-300 text-[11px] space-y-1">
                <div className="font-bold text-gray-700">ENCAISSEMENTS REMIS :</div>
                <div className="flex justify-between">
                  <span>Espèces (Cash) :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.especes || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Wave :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.wave || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Orange Money :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.orange_money || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Carte Bancaire :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.carte_bancaire || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Crédit Client / Bons :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.credit_client || 0)} F</span>
                </div>
                {n(ticketModal.encaissements?.autre) > 0 && (
                  <div className="flex justify-between">
                    <span>Autre :</span>
                    <span className="tabular">{F(ticketModal.encaissements?.autre)} F</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-gray-950 pt-1 border-t border-dotted">
                  <span>TOTAL ENCAISSÉ :</span>
                  <span className="tabular">{F(ticketModal.total_encaisse)} FCFA</span>
                </div>
              </div>

              {/* Écart */}
              <div className="border-b pb-2 border-dashed border-gray-300">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold">ÉCART DE CAISSE :</span>
                  <span className={`font-black tabular text-sm ${ticketModal.ecart >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {ticketModal.ecart >= 0 ? "+" : ""}{F(ticketModal.ecart)} FCFA
                  </span>
                </div>
                <div className="text-[10px] mt-0.5 font-sans">
                  {ticketModal.ecart === 0 && <span className="text-emerald-700">✓ Caisse parfaitement équilibrée.</span>}
                  {ticketModal.ecart > 0 && <span className="text-emerald-700">🟢 Excédent de caisse constaté.</span>}
                  {ticketModal.ecart < 0 && <span className="text-red-600 font-bold">⚠️ Manquant de caisse à justifier.</span>}
                </div>
              </div>

              {/* Signatures décharge */}
              <div className="pt-2 grid grid-cols-2 gap-4 text-[10px] text-gray-500 font-sans">
                <div className="border rounded p-2 text-center h-16 flex flex-col justify-between">
                  <span>Signature Pompiste</span>
                  <span className="text-[9px] text-gray-400">Lu et approuvé</span>
                </div>
                <div className="border rounded p-2 text-center h-16 flex flex-col justify-between">
                  <span>Visa Gérant / Contrôle</span>
                  <span className="text-[9px] text-gray-400">Caisse vérifiée</span>
                </div>
              </div>
            </div>

            {/* Boutons d'action : Imprimer & WhatsApp */}
            <div className="p-3 bg-gray-50 border-t flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-800 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-sm"
              >
                🖨️ Imprimer le ticket
              </button>
              <button
                type="button"
                onClick={() => shareTicketWhatsApp(ticketModal)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm"
              >
                📲 Partager WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}