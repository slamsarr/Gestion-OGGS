import { useState } from "react";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

export default function WashTicket({ commande, onClose, stationNom = "Star Energy" }) {
  const [printed, setPrinted] = useState(false);
  if (!commande) return null;
  const date = commande.date || new Date().toISOString().slice(0, 10);
  const heure = commande.heure || (commande.created_at ? commande.created_at.slice(11, 16) : "--:--");
  const pack = commande.pack_nom || commande.type_prestation || commande.type_vehicule || "Lavage";
  const type = commande.type_vehicule || "";
  const immat = commande.immatriculation || "";
  const client = commande.client_nom || "Client anonyme";
  const agent = commande.agent || "--";
  const baie = commande.baie_id || "";
  const montantPack = Number(commande.montant_pack || 0);
  const montantAddons = Number(commande.montant_addons || 0);
  const reduction = Number(commande.reduction_promo || 0);
  const total = Number(commande.montant_total || commande.montant || 0);
  const points = Number(commande.points_gagnes || 0);
  const modePaiement = commande.mode_paiement || "ESPECES";

  const ticketText = () => {
    let t = `🚿 *${stationNom}*\n📋 *TICKET DE LAVAGE*\n─────────────────────\n`;
    t += `📅 ${date}  ⏰ ${heure}\n👤 ${client}\n`;
    if (immat) t += `🚗 ${immat}\n`;
    if (type) t += `🏷️ ${type}\n`;
    t += `─────────────────────\n📦 ${pack}  ${F(montantPack)} FCFA\n`;
    if (montantAddons > 0) t += `➕ Options : ${F(montantAddons)} FCFA\n`;
    if (reduction > 0) t += `🏷️ Réduction : -${F(reduction)} FCFA\n`;
    t += `─────────────────────\n💰 *TOTAL : ${F(total)} FCFA*\n💳 ${modePaiement}\n`;
    if (baie) t += `🅱️ Baie : ${baie}\n`;
    t += `👷 Agent : ${agent}\n`;
    if (points > 0) t += `⭐ +${points} points fidélité\n`;
    t += `─────────────────────\nMerci pour votre confiance ! 🙏`;
    return t;
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(ticketText())}`, "_blank");
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=600");
    win.document.write(`<html><head><title>Ticket Lavage</title>
    <style>body{font-family:'Courier New',monospace;font-size:13px;max-width:300px;margin:20px auto}
    h2{text-align:center;font-size:15px;margin:4px 0}.center{text-align:center}
    .sep{border-top:1px dashed #000;margin:6px 0}.total{font-size:15px;font-weight:bold}
    .small{font-size:11px;color:#555}</style></head><body>
    <h2>🚿 ${stationNom}</h2><p class="center small">TICKET DE LAVAGE</p>
    <div class="sep"></div><p>📅 ${date}  ⏰ ${heure}</p><p>👤 ${client}</p>
    ${immat ? `<p>🚗 ${immat}</p>` : ""}${type ? `<p>🏷️ ${type}</p>` : ""}
    <div class="sep"></div><p>📦 ${pack} — ${F(montantPack)} FCFA</p>
    ${montantAddons > 0 ? `<p>➕ Options : ${F(montantAddons)} FCFA</p>` : ""}
    ${reduction > 0 ? `<p>🏷️ Réduction : -${F(reduction)} FCFA</p>` : ""}
    <div class="sep"></div><p class="total center">TOTAL : ${F(total)} FCFA</p>
    <p class="center">${modePaiement}</p>${baie ? `<p>Baie : ${baie}</p>` : ""}
    <p>Agent : ${agent}</p>${points > 0 ? `<p>⭐ +${points} points fidélité</p>` : ""}
    <div class="sep"></div><p class="center small">Merci pour votre confiance !</p>
    </body></html>`);
    win.document.close(); win.print(); setPrinted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-4 text-white text-center">
          <div className="text-3xl mb-1">🚿</div>
          <h2 className="text-lg font-bold">{stationNom}</h2>
          <p className="text-blue-100 text-sm">Ticket de Lavage</p>
        </div>
        <div className="p-4 space-y-2 font-mono text-sm">
          <div className="flex justify-between text-gray-500"><span>📅 {date}</span><span>⏰ {heure}</span></div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div><span className="text-gray-500">👤</span> <span className="font-semibold">{client}</span></div>
          {immat && <div><span className="text-gray-500">🚗</span> {immat}</div>}
          {type && <div><span className="text-gray-500">🏷️</span> {type}</div>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between"><span className="font-semibold text-blue-700">📦 {pack}</span><span>{F(montantPack)} F</span></div>
          {montantAddons > 0 && <div className="flex justify-between text-gray-600"><span>➕ Options</span><span>{F(montantAddons)} F</span></div>}
          {reduction > 0 && <div className="flex justify-between text-green-600"><span>🏷️ Réduction</span><span>-{F(reduction)} F</span></div>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-lg font-bold text-gray-800"><span>💰 TOTAL</span><span className="text-blue-600">{F(total)} FCFA</span></div>
          <div className="text-center text-gray-500 text-xs">{modePaiement}</div>
          {points > 0 && <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-center text-sm text-yellow-700">⭐ +{points} points fidélité crédités</div>}
          <div className="text-center text-gray-400 text-xs pt-1">Agent : {agent}{baie ? ` — Baie ${baie}` : ""}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4 bg-gray-50 border-t border-gray-100">
          <button onClick={handlePrint} className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium transition-all ${printed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            <span className="text-xl">{printed ? "✅" : "🖨️"}</span>{printed ? "Imprimé" : "Imprimer"}
          </button>
          <button onClick={handleWhatsApp} className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium bg-green-500 text-white hover:bg-green-600 transition-all">
            <span className="text-xl">📲</span>WhatsApp
          </button>
          <button onClick={onClose} className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all">
            <span className="text-xl">✓</span>Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
