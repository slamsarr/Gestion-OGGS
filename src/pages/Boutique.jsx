import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listProduitsBoutique, createVenteBoutique, listVentesBoutique, updateProduitBoutique } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function Boutique() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const [produits, setProduits] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pos"); // pos | stock | historique
  const [msg, setMsg] = useState("");
  const [recherche, setRecherche] = useState("");
  const [panier, setPanier] = useState([]);
  const [modePaiement, setModePaiement] = useState("ESPECES");

  // Pour l'ajout / ajustement stock
  const [selectedProd, setSelectedProd] = useState(null);
  const [ajustQte, setAjustQte] = useState("");
  const [ticketModal, setTicketModal] = useState(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const buildBoutiqueReceiptText = (v) => {
    const dateStr = fmtDate(v.date || todayISO());
    const heureStr = v.created_at ? new Date(v.created_at).toLocaleTimeString().slice(0, 5) : new Date().toLocaleTimeString().slice(0, 5);
    const idTicket = v.id ? `#${v.id.slice(0, 8)}` : "";
    const lignesStr = (v.lignes || [])
      .map((l) => `• ${l.quantite}x ${l.designation} (${F(l.prix_unitaire)} F) = ${F(l.montant_total)} F`)
      .join("\n");

    return `*🛒 TICKET DE CAISSE BOUTIQUE - STATION ${stationId.replace("st-", "").toUpperCase()}*
----------------------------------------
🧾 *Ticket :* ${idTicket}
📅 *Date :* ${dateStr} à ${heureStr}
👤 *Vendeur :* ${v.vendeur || "Vendeur Shop"}
----------------------------------------
🛍️ *ARTICLES :*
${lignesStr}
----------------------------------------
👉 *TOTAL :* *${F(v.total_montant)} FCFA*
💳 *Mode de paiement :* ${v.mode_paiement}
----------------------------------------
✨ *Merci de votre visite et à bientôt !*`;
  };

  const shareBoutiqueWhatsApp = (v) => {
    const text = buildBoutiqueReceiptText(v);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const loadData = async () => {
    try {
      const prods = await listProduitsBoutique(stationId);
      setProduits(prods || []);
      const v = await listVentesBoutique(stationId, todayISO());
      setVentes(v || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  if (loading) return <Loading label="Chargement de la Boutique / Shop..." />;

  // Filtrage des produits pour la caisse
  const filteredProduits = produits.filter((p) =>
    p.designation.toLowerCase().includes(recherche.toLowerCase()) ||
    p.code.toLowerCase().includes(recherche.toLowerCase()) ||
    (p.categorie && p.categorie.toLowerCase().includes(recherche.toLowerCase()))
  );

  // Gestion du panier
  const addToPanier = (prod) => {
    const exist = panier.find((item) => item.code === prod.code);
    if (exist) {
      setPanier(panier.map((item) =>
        item.code === prod.code ? { ...item, quantite: item.quantite + 1 } : item
      ));
    } else {
      setPanier([...panier, { ...prod, quantite: 1 }]);
    }
  };

  const updatePanierQte = (code, delta) => {
    setPanier(
      panier
        .map((item) => {
          if (item.code === code) {
            const nextQte = item.quantite + delta;
            return nextQte > 0 ? { ...item, quantite: nextQte } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromPanier = (code) => {
    setPanier(panier.filter((item) => item.code !== code));
  };

  const totalPanier = panier.reduce((sum, item) => sum + item.quantite * item.prix_vente, 0);

  const validerVente = async () => {
    if (panier.length === 0) return flash("Le panier est vide");

    // Vérifier les stocks
    for (const item of panier) {
      const p = produits.find((x) => x.code === item.code);
      if (p && n(p.stock) < item.quantite) {
        return flash(`Stock insuffisant pour ${item.designation} (Disponible: ${p.stock})`);
      }
    }

    const payload = {
      station_id: stationId,
      date: todayISO(),
      vendeur: profil?.nom_complet || "Vendeur Boutique",
      lignes: panier.map((item) => ({
        code: item.code,
        id: item.code,
        designation: item.designation,
        quantite: item.quantite,
        prix_unitaire: item.prix_vente,
        montant_total: item.quantite * item.prix_vente,
      })),
      total_montant: totalPanier,
      mode_paiement: modePaiement,
    };

    const res = await createVenteBoutique(payload);
    if (res.ok) {
      flash("Vente encaissée avec succès ! Ticket généré.");
      setTicketModal(payload);
      setPanier([]);
      loadData();
    } else {
      flash("Erreur lors de l'encaissement de la vente");
    }
  };

  const handleAjusterStock = async () => {
    if (!selectedProd || !ajustQte) return;
    const delta = parseInt(ajustQte, 10);
    if (isNaN(delta)) return flash("Quantité invalide");
    const newStock = Math.max(0, (n(selectedProd.stock) || 0) + delta);
    await updateProduitBoutique(selectedProd.id || selectedProd.code, { stock: newStock });
    flash(`Stock mis à jour pour ${selectedProd.designation} : ${newStock}`);
    setSelectedProd(null);
    setAjustQte("");
    loadData();
  };

  const totalVentesJour = ventes.reduce((s, v) => s + (n(v.total_montant) || 0), 0);
  const alertesRupture = produits.filter((p) => n(p.stock) <= (n(p.seuil_alerte) || 5));

  return (
    <div className="max-w-5xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
            🛒 Boutique / Shop Station
          </h1>
          <p className="text-xs" style={{ color: T.muted }}>
            Caisse POS, gestion automatique des stocks et réapprovisionnements
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("pos")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "pos" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            💳 Caisse / POS
          </button>
          <button
            type="button"
            onClick={() => setTab("stock")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "stock" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            📦 État des Stocks ({alertesRupture.length > 0 ? `⚠️ ${alertesRupture.length}` : produits.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("historique")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "historique" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            📋 Ventes du Jour ({F(totalVentesJour)} F)
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-3 p-2.5 text-xs rounded font-medium" style={{ background: "#E3F4EA", color: T.ok }}>
          {msg}
        </div>
      )}

      {/* VUE 1 : CAISSE / POS */}
      {tab === "pos" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Catalogue & Sélection */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="🔍 Rechercher un produit (nom, code, catégorie)..."
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                className="w-full text-xs border rounded-lg p-2.5 bg-white shadow-sm"
                style={{ borderColor: T.line }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredProduits.map((p) => {
                const enRupture = n(p.stock) <= 0;
                const enAlerte = n(p.stock) <= (n(p.seuil_alerte) || 5);
                return (
                  <button
                    key={p.code}
                    type="button"
                    disabled={enRupture}
                    onClick={() => addToPanier(p)}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                      enRupture ? "opacity-40 bg-gray-100 cursor-not-allowed" : "bg-white hover:border-amber-500 hover:shadow-sm"
                    }`}
                    style={{ borderColor: T.line }}
                  >
                    <div>
                      <span className="text-[10px] text-gray-400 block uppercase font-medium">{p.categorie || "Boutique"}</span>
                      <span className="text-xs font-bold text-gray-900 block line-clamp-2">{p.designation}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-blue-900 tabular">{F(p.prix_vente)} F</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${enRupture ? "bg-red-100 text-red-700" : enAlerte ? "bg-amber-100 text-amber-800" : "bg-green-50 text-green-700"}`}>
                        Stock: {p.stock}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panier & Encaissement */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg border p-4 shadow-sm sticky top-16" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: T.line }}>
                <h3 className="text-sm font-bold" style={{ color: T.petrol }}>Panier en cours</h3>
                <span className="text-xs text-gray-500">{panier.reduce((s, i) => s + i.quantite, 0)} article(s)</span>
              </div>

              {panier.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  🛒 Cliquez sur un article pour l'ajouter au panier
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="divide-y max-h-56 overflow-y-auto" style={{ borderColor: T.line }}>
                    {panier.map((item) => (
                      <div key={item.code} className="py-2 flex items-center justify-between text-xs">
                        <div className="flex-1 pr-2">
                          <div className="font-semibold line-clamp-1">{item.designation}</div>
                          <div className="text-[10px] text-gray-400">{F(item.prix_vente)} F / u</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updatePanierQte(item.code, -1)}
                            className="w-5 h-5 rounded bg-gray-100 font-bold text-gray-700 flex items-center justify-center hover:bg-gray-200"
                          >
                            -
                          </button>
                          <span className="font-bold tabular w-4 text-center">{item.quantite}</span>
                          <button
                            type="button"
                            onClick={() => updatePanierQte(item.code, 1)}
                            className="w-5 h-5 rounded bg-gray-100 font-bold text-gray-700 flex items-center justify-center hover:bg-gray-200"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromPanier(item.code)}
                            className="text-red-500 ml-1 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t" style={{ borderColor: T.line }}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-gray-700">TOTAL À PAYER :</span>
                      <span className="text-lg font-extrabold text-blue-900 tabular">{F(totalPanier)} FCFA</span>
                    </div>

                    <label className="block text-xs font-medium text-gray-700 mb-1">Mode d'encaissement</label>
                    <select
                      value={modePaiement}
                      onChange={(e) => setModePaiement(e.target.value)}
                      className="w-full text-xs border rounded p-2 bg-white mb-3"
                      style={{ borderColor: T.line }}
                    >
                      <option value="ESPECES">💵 Espèces (Cash)</option>
                      <option value="WAVE">📲 Wave</option>
                      <option value="ORANGE_MONEY">🍊 Orange Money</option>
                      <option value="CARTE">💳 Carte bancaire</option>
                    </select>

                    <button
                      type="button"
                      onClick={validerVente}
                      className="w-full py-3 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90"
                      style={{ background: T.gold }}
                    >
                      ✓ Encaisser la Vente ({F(totalPanier)} F)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VUE 2 : ÉTAT DES STOCKS & RÉAPPROVISIONNEMENT */}
      {tab === "stock" && (
        <div className="space-y-4">
          {alertesRupture.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
              <div>
                <strong>⚠️ {alertesRupture.length} produit(s) en alerte de stock ou rupture !</strong>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Vérifiez les seuils critiques et passez commande auprès de vos fournisseurs.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border shadow-sm p-4" style={{ borderColor: T.line }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>Catalogue des Produits & Niveaux de Stock</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Produit</th>
                    <th className="pb-2">Catégorie</th>
                    <th className="pb-2 text-right">Prix Achat</th>
                    <th className="pb-2 text-right">Prix Vente</th>
                    <th className="pb-2 text-center">Seuil Alerte</th>
                    <th className="pb-2 text-center">Stock Actuel</th>
                    <th className="pb-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {produits.map((p) => {
                    const enAlerte = n(p.stock) <= (n(p.seuil_alerte) || 5);
                    return (
                      <tr key={p.code} className="hover:bg-gray-50">
                        <td className="py-2.5 font-semibold text-gray-900">{p.designation}</td>
                        <td className="py-2.5 text-gray-500">{p.categorie || "Boutique"}</td>
                        <td className="py-2.5 text-right tabular text-gray-500">{F(p.prix_achat || 0)} F</td>
                        <td className="py-2.5 text-right tabular font-bold">{F(p.prix_vente)} F</td>
                        <td className="py-2.5 text-center text-gray-500 tabular">{p.seuil_alerte || 5}</td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold tabular ${enAlerte ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800"}`}>
                            {p.stock}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedProd(p)}
                            className="px-2 py-1 rounded border text-[11px] font-semibold hover:bg-gray-100"
                            style={{ borderColor: T.line }}
                          >
                            + Réception / Ajuster
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Ajustement */}
          {selectedProd && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl max-w-sm w-full p-4 shadow-lg border" style={{ borderColor: T.line }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: T.petrol }}>
                  Mouvement de stock : {selectedProd.designation}
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Stock actuel : <strong>{selectedProd.stock}</strong>. Saisissez la quantité ajoutée (+ pour livraison) ou soustraite (- pour casse/perte).
                </p>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantité (+/-)</label>
                  <input
                    type="number"
                    value={ajustQte}
                    onChange={(e) => setAjustQte(e.target.value)}
                    placeholder="ex: +24 ou -2"
                    className="w-full text-sm border rounded p-2"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedProd(null); setAjustQte(""); }}
                    className="flex-1 py-2 rounded text-xs border"
                    style={{ borderColor: T.line }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleAjusterStock}
                    className="flex-1 py-2 rounded text-xs font-bold text-gray-900"
                    style={{ background: T.gold }}
                  >
                    Valider le stock
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VUE 3 : HISTORIQUE DES VENTES */}
      {tab === "historique" && (
        <div className="bg-white rounded-lg border shadow-sm p-4" style={{ borderColor: T.line }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
            Tickets de caisse enregistrés aujourd'hui ({ventes.length})
          </h3>
          {ventes.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">Aucune vente boutique enregistrée aujourd'hui.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: T.line }}>
              {ventes.map((v) => (
                <div key={v.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-gray-900">
                      Ticket #{v.id?.slice(0, 8)} · Vendeur : {v.vendeur}
                    </div>
                    <div className="text-gray-500">
                      Articles : {v.lignes?.map((l) => `${l.quantite}x ${l.designation}`).join(", ")}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {v.created_at ? new Date(v.created_at).toLocaleTimeString().slice(0, 5) : "--:--"} · Paiement : {v.mode_paiement}
                    </div>
                  </div>
                  <div className="text-right flex sm:flex-col items-end justify-between gap-1">
                    <span className="text-base font-extrabold text-blue-900 tabular">{F(v.total_montant)} FCFA</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => setTicketModal(v)}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-white text-gray-700 hover:bg-gray-50 shadow-xs"
                        style={{ borderColor: T.line }}
                        title="Voir / Imprimer le ticket de caisse"
                      >
                        🧾 Reçu
                      </button>
                      <button
                        type="button"
                        onClick={() => shareBoutiqueWhatsApp(v)}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                        title="Partager sur WhatsApp"
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
      )}

      {/* MODAL TICKET DE CAISSE BOUTIQUE */}
      {ticketModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border border-gray-200">
            <div className="p-3 bg-amber-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🛒</span>
                <span className="font-bold text-xs">Ticket de Caisse Shop</span>
              </div>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="text-amber-200 hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-5 font-mono text-xs text-gray-800 space-y-3 bg-[#FCFCFC]" id="boutique-ticket">
              <div className="text-center border-b pb-2 border-dashed border-gray-300">
                <div className="text-sm font-black tracking-wider uppercase">STATION {stationId.replace("st-", "").toUpperCase()}</div>
                <div className="text-[10px] text-gray-500">BOUTIQUE & SHOP EXPRESS</div>
                <div className="text-[11px] font-bold mt-1">TICKET DE CAISSE CLIENT</div>
                {ticketModal.id && <div className="text-[10px] text-gray-400">N° #{ticketModal.id.slice(0, 8)}</div>}
                <div className="text-[10px] text-gray-400">
                  {fmtDate(ticketModal.date || todayISO())} · {ticketModal.created_at ? new Date(ticketModal.created_at).toLocaleTimeString() : new Date().toLocaleTimeString()}
                </div>
              </div>

              <div className="space-y-1 border-b pb-2 border-dashed border-gray-300 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Vendeur :</span>
                  <span className="font-bold">{ticketModal.vendeur || "Caissier Boutique"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Paiement :</span>
                  <span className="font-semibold">{ticketModal.mode_paiement}</span>
                </div>
              </div>

              <div className="space-y-1 text-xs border-b pb-2 border-dashed border-gray-300">
                <div className="font-bold text-gray-700 mb-1">ARTICLES :</div>
                {(ticketModal.lignes || []).map((l, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span>{l.quantite}x {l.designation}</span>
                    <span className="tabular font-medium">{F(l.montant_total)} F</span>
                  </div>
                ))}
                <div className="flex justify-between font-black text-amber-950 text-sm pt-2 border-t border-dotted">
                  <span>TOTAL :</span>
                  <span className="tabular">{F(ticketModal.total_montant)} FCFA</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-gray-500 pt-1">
                Merci de votre visite et à très bientôt dans notre station !
              </div>
            </div>

            <div className="p-3 bg-gray-50 border-t flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-800 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-sm"
              >
                🖨️ Imprimer
              </button>
              <button
                type="button"
                onClick={() => shareBoutiqueWhatsApp(ticketModal)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm"
              >
                📲 WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}