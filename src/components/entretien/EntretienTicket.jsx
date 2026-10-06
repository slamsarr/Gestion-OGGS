import React, { useState } from "react";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

export default function EntretienTicket({ prestation, onClose, stationNom = "Star Energy" }) {
  const [printed, setPrinted] = useState(false);
  if (!prestation) return null;

  const date = prestation.date || new Date().toISOString().slice(0, 10);
  const heure = prestation.heure || (prestation.created_at ? prestation.created_at.slice(11, 16) : "--:--");
  const immat = prestation.immatriculation || "—";
  const marqueModele = prestation.marque_modele || prestation.type_vehicule || "";
  const km = prestation.kilometrage ? Number(prestation.kilometrage) : null;
  const client = prestation.client_nom || "Client Passage";
  const tel = prestation.client_tel || "";
  const tech = prestation.technicien || "Ousmane Sow";
  const baie = prestation.baie_id || "";
  const orNum = prestation.numero_or || prestation.id;
  const services = prestation.services || [];
  const produits = prestation.produits || [];
  const montantServices = Number(prestation.montant_services || 0);
  const montantProduits = Number(prestation.montant_produits || 0);
  const reduction = Number(prestation.reduction_promo || 0);
  const total = Number(prestation.montant_total || 0);
  const points = Number(prestation.points_gagnes || 0);
  const modePaiement = prestation.mode_paiement || "ESPECES";
  const prochainKm = km ? km + 10000 : null;

  const ticketText = () => {
    let t = `🔧 *${stationNom} — CENTRE D'ENTRETIEN RAPIDE*\n`;
    t += `📋 *ORDRE DE RÉPARATION : ${orNum}*\n`;
    t += `────────────────────────────\n`;
    t += `📅 Date : ${date} à ${heure}\n`;
    t += `🚗 Véhicule : ${immat}${marqueModele ? ` (${marqueModele})` : ""}\n`;
    if (km) t += `🛣️ Compteur : ${km.toLocaleString()} km\n`;
    t += `👤 Client : ${client}${tel ? ` (${tel})` : ""}\n`;
    t += `👨‍🔧 Technicien : ${tech}${baie ? ` · Baie : ${baie}` : ""}\n`;
    t += `────────────────────────────\n`;
    t += `🛠️ *PRESTATIONS & MAIN D'ŒUVRE :*\n`;
    if (services.length > 0) {
      services.forEach((s) => {
        t += `  • ${s.service_nom || s.nom} : ${F(s.prix)} FCFA\n`;
      });
    } else {
      t += `  • Main d'œuvre atelier : ${F(montantServices)} FCFA\n`;
    }
    if (produits.length > 0) {
      t += `\n🧴 *LUBRIFIANTS & PIÈCES FOURNIES :*\n`;
      produits.forEach((p) => {
        t += `  • ${p.designation} (x${p.quantite}) : ${F(p.total || p.prix_unitaire * p.quantite)} FCFA\n`;
      });
    }
    t += `────────────────────────────\n`;
    if (reduction > 0) t += `🏷️ Réduction : -${F(reduction)} FCFA\n`;
    t += `💰 *TOTAL TTC : ${F(total)} FCFA*\n`;
    t += `💳 Règlement : ${modePaiement}\n`;
    if (points > 0) t += `⭐ Fidélité : +${points} points cumulés\n`;
    if (prochainKm) {
      t += `────────────────────────────\n`;
      t += `💡 Prochaine vidange conseillée à : ${prochainKm.toLocaleString()} km\n`;
    }
    t += `────────────────────────────\nMerci pour votre confiance ! Bonne route 🚗💨`;
    return t;
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(ticketText())}`, "_blank");
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=420,height=650");
    if (!win) return;
    win.document.write(`<html><head><title>Fiche Entretien ${orNum}</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size: 13px; max-width: 320px; margin: 20px auto; color: #111; }
      h2 { text-align: center; font-size: 16px; margin: 4px 0; text-transform: uppercase; }
      .center { text-align: center; }
      .sep { border-top: 1px dashed #444; margin: 8px 0; }
      .total { font-size: 16px; font-weight: bold; margin: 8px 0; }
      .small { font-size: 11px; color: #444; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; }
      .bold { font-weight: bold; }
    </style></head><body>
    <h2>DAMEL ENERGY</h2>
    <p class="center small">SERVICES MÉCANIQUES &amp; BAIE RAPIDE</p>
    <p class="center small">Station : ${stationNom} (Enseigne : Star Energy)</p>
    <p class="center bold">ORDRE DE RÉPARATION : ${orNum}</p>
    <div class="sep"></div>
    <div class="row"><span>Date :</span><span>${date} ${heure}</span></div>
    <div class="row"><span>Véhicule :</span><span class="bold">${immat}</span></div>
    ${marqueModele ? `<div class="row"><span>Modèle :</span><span>${marqueModele}</span></div>` : ""}
    ${km ? `<div class="row"><span>Kilométrage :</span><span>${km.toLocaleString()} km</span></div>` : ""}
    <div class="row"><span>Client :</span><span>${client}</span></div>
    ${tel ? `<div class="row"><span>Tél :</span><span>${tel}</span></div>` : ""}
    <div class="row"><span>Technicien :</span><span>${tech}</span></div>
    ${baie ? `<div class="row"><span>Pont / Baie :</span><span>${baie}</span></div>` : ""}
    <div class="sep"></div>
    <p class="bold">PRESTATIONS & SERVICES :</p>
    ${services.map(s => `<div class="row"><span style="max-width:200px">${s.service_nom || s.nom}</span><span>${F(s.prix)} F</span></div>`).join("")}
    ${produits.length > 0 ? `
      <div class="sep"></div>
      <p class="bold">PIÈCES & LUBRIFIANTS :</p>
      ${produits.map(p => `<div class="row"><span style="max-width:200px">${p.designation} (x${p.quantite})</span><span>${F(p.total || p.prix_unitaire * p.quantite)} F</span></div>`).join("")}
    ` : ""}
    <div class="sep"></div>
    <div class="row"><span>Total Services :</span><span>${F(montantServices)} F</span></div>
    ${montantProduits > 0 ? `<div class="row"><span>Total Pièces/Huiles :</span><span>${F(montantProduits)} F</span></div>` : ""}
    ${reduction > 0 ? `<div class="row"><span>Réduction Promo :</span><span>-${F(reduction)} F</span></div>` : ""}
    <div class="sep"></div>
    <div class="row total"><span>TOTAL TTC :</span><span>${F(total)} FCFA</span></div>
    <div class="row"><span>Règlement :</span><span class="bold">${modePaiement}</span></div>
    ${points > 0 ? `<div class="row"><span>Points Fidélité :</span><span>+${points} pts</span></div>` : ""}
    ${prochainKm ? `
      <div class="sep"></div>
      <p class="small center">Prochaine vidange conseillée : <strong>${prochainKm.toLocaleString()} km</strong></p>
    ` : ""}
    <div class="sep"></div>
    <p class="center small">Merci pour votre confiance !<br/>Bonne route et à bientôt.</p>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    setPrinted(true);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-500 px-6 py-4 text-white flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔧</span>
              <h3 className="font-bold text-lg">Ordre de Réparation Validé</h3>
            </div>
            <p className="text-amber-100 text-xs mt-0.5">{orNum} · {stationNom}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Corps défilable */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
          {/* Véhicule & Client */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-amber-700 font-semibold uppercase tracking-wider block">Véhicule</span>
                <span className="text-xl font-black text-gray-900 font-mono tracking-wider">{immat}</span>
                {marqueModele && <span className="text-xs text-gray-600 block">{marqueModele}</span>}
              </div>
              {km && (
                <div className="text-right">
                  <span className="text-xs text-gray-500 block">Compteur</span>
                  <span className="font-bold text-amber-900">{km.toLocaleString()} km</span>
                </div>
              )}
            </div>
            <div className="border-t border-amber-200/70 pt-2 flex justify-between text-xs text-gray-600">
              <span>👤 {client} {tel ? `(${tel})` : ""}</span>
              <span>👨‍🔧 {tech} {baie ? `· 🅱️ ${baie}` : ""}</span>
            </div>
          </div>

          {/* Prestations */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              🛠️ Prestations & Main d'œuvre ({services.length})
            </h4>
            <div className="bg-gray-50 rounded-xl p-3 divide-y divide-gray-200/60 space-y-1.5">
              {services.map((s, i) => (
                <div key={i} className="flex justify-between items-center pt-1.5 first:pt-0">
                  <span className="font-medium text-gray-800 text-xs sm:text-sm">{s.service_nom || s.nom}</span>
                  <span className="font-bold text-amber-700 text-xs sm:text-sm">{F(s.prix)} F</span>
                </div>
              ))}
              <div className="pt-2 flex justify-between text-xs font-bold text-gray-600">
                <span>Sous-total Main d'œuvre</span>
                <span>{F(montantServices)} F</span>
              </div>
            </div>
          </div>

          {/* Pièces & Lubrifiants */}
          {produits.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                🧴 Lubrifiants & Consommables ({produits.length})
              </h4>
              <div className="bg-gray-50 rounded-xl p-3 divide-y divide-gray-200/60 space-y-1.5">
                {produits.map((p, i) => (
                  <div key={i} className="flex justify-between items-center pt-1.5 first:pt-0">
                    <div>
                      <span className="font-medium text-gray-800 text-xs sm:text-sm block">{p.designation}</span>
                      <span className="text-[11px] text-gray-500">Qté : {p.quantite} × {F(p.prix_unitaire)} F</span>
                    </div>
                    <span className="font-bold text-blue-700 text-xs sm:text-sm">{F(p.total || p.prix_unitaire * p.quantite)} F</span>
                  </div>
                ))}
                <div className="pt-2 flex justify-between text-xs font-bold text-gray-600">
                  <span>Sous-total Pièces / Huiles</span>
                  <span>{F(montantProduits)} F</span>
                </div>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-2 border-amber-300 rounded-2xl p-4 space-y-1.5">
            {reduction > 0 && (
              <div className="flex justify-between text-xs text-green-700">
                <span>Remise promotionnelle</span>
                <span>-{F(reduction)} F</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1 border-t border-amber-200">
              <span className="font-bold text-gray-800 text-base">TOTAL TTC</span>
              <span className="font-black text-2xl text-amber-700">{F(total)} FCFA</span>
            </div>
            <div className="flex justify-between text-xs text-gray-600 pt-1">
              <span>Mode de paiement : <strong>{modePaiement}</strong></span>
              {points > 0 && <span className="text-amber-800 font-bold">⭐ +{points} pts fidélité</span>}
            </div>
          </div>

          {prochainKm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center gap-2">
              <span className="text-lg">💡</span>
              <span>Prochaine vidange recommandée au compteur : <strong>{prochainKm.toLocaleString()} km</strong>.</span>
            </div>
          )}
        </div>

        {/* Boutons actions */}
        <div className="p-4 bg-gray-50 border-t flex flex-wrap gap-2.5">
          <button
            onClick={handleWhatsApp}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm transition-colors shadow-sm"
          >
            📱 Envoyer WhatsApp
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm transition-colors shadow-sm"
          >
            🖨️ {printed ? "Réimprimer" : "Imprimer Ticket"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
