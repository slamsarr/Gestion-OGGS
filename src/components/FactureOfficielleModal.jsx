import React, { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FISCAL_CONFIG, genererPayloadCertification } from "../lib/facturation";
import { BRAND_CONFIG } from "../lib/branding";
import { F, fmtDate, T } from "../lib/calcul";

/**
 * Modal d'affichage et d'impression de Facture Officielle conforme OHADA / Sénégal
 * avec QR Code de certification fiscale DGID / OGSS Réseau.
 */
export default function FactureOfficielleModal({ facture, onClose, onMarquerReglee }) {
  if (!facture) return null;

  const printAreaRef = useRef(null);
  const payloadQr = genererPayloadCertification(facture);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Conteneur principal */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden border border-gray-200">
        
        {/* Barre d'outils supérieure (Masquée à l'impression) */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <div>
              <div className="font-bold text-sm leading-tight flex items-center gap-2">
                <span>Facture Officielle OHADA</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {facture.statut || "ÉMISE"}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                {facture.numero_facture} • {facture.client_nom}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onMarquerReglee && facture.statut !== "REGLEE" && (
              <button
                type="button"
                onClick={() => onMarquerReglee(facture.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1"
              >
                <span>✓</span>
                <span className="hidden sm:inline">Marquer Réglée</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              title="Imprimer ou enregistrer en PDF via le navigateur"
            >
              <span>🖨️</span>
              <span>Imprimer / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors text-base"
              title="Fermer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Corps de la Facture (Format A4 / Imprimable) */}
        <div className="p-6 sm:p-10 overflow-y-auto flex-1 bg-white print:p-0 print:overflow-visible text-gray-900" ref={printAreaRef}>
          
          {/* ============================================================
              EN-TÊTE : LOGOS, ÉMETTEUR & CARTOUCHE FISCAL
          ============================================================ */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b-2 border-slate-900 pb-6">
            
            {/* Colonne Gauche : Émetteur & Identité */}
            <div className="space-y-2 max-w-sm">
              <div className="flex items-center gap-3">
                <img
                  src={BRAND_CONFIG.station.logo}
                  alt={BRAND_CONFIG.station.name}
                  className="w-12 h-12 object-contain rounded-lg border border-gray-200 p-0.5"
                />
                <div>
                  <div className="text-lg font-black text-[#56216C] tracking-tight leading-none">
                    {FISCAL_CONFIG.emetteur.enseigne}
                  </div>
                  <div className="text-[11px] font-bold text-[#0B4EA2] tracking-wide mt-0.5">
                    Operated by {FISCAL_CONFIG.emetteur.operateur}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-gray-600 space-y-0.5 pt-1">
                <div className="font-semibold text-gray-800">{FISCAL_CONFIG.emetteur.activite}</div>
                <div>{FISCAL_CONFIG.emetteur.siege}</div>
                <div className="flex flex-wrap gap-x-3 pt-0.5 text-gray-700 font-medium">
                  <span><strong>NINEA :</strong> {FISCAL_CONFIG.emetteur.ninea}</span>
                  <span><strong>RCCM :</strong> {FISCAL_CONFIG.emetteur.rccm}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-gray-700 font-medium">
                  <span><strong>Centre Fiscal :</strong> {FISCAL_CONFIG.emetteur.centreFiscal}</span>
                  <span><strong>Tél :</strong> {FISCAL_CONFIG.emetteur.telephone}</span>
                </div>
              </div>
            </div>

            {/* Colonne Droite : Cartouche Facture */}
            <div className="text-right sm:min-w-[260px] bg-slate-50 border border-slate-200 rounded-xl p-4 print:border-slate-300">
              <div className="text-xs font-black tracking-widest text-[#0B4EA2] uppercase">
                RÉPUBLIQUE DU SÉNÉGAL
              </div>
              <h1 className="text-xl font-black text-gray-900 mt-0.5 tracking-tight">
                FACTURE OFFICIELLE
              </h1>
              <div className="text-sm font-black text-rose-700 font-mono mt-1">
                N° {facture.numero_facture}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200 text-xs space-y-1 text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500">Date d'émission :</span>
                  <span className="font-bold">{fmtDate(facture.date_emission)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date d'échéance :</span>
                  <span className="font-bold">{fmtDate(facture.date_echeance || facture.date_emission)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Station émettrice :</span>
                  <span className="font-bold text-[#56216C]">{facture.station_nom || "HANN MARISTE"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Règlement :</span>
                  <span className="font-bold">{facture.mode_reglement || "Bon / Virement / Crédit"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================
              BLOC DESTINATAIRE (CLIENT - DOIT)
          ============================================================ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 print:bg-white">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Client / Destinataire (Doit)
              </div>
              <div className="text-base font-black text-gray-900">
                {facture.client_nom}
              </div>
              <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                <div><strong>Code Client :</strong> {facture.client_code}</div>
                <div><strong>NINEA :</strong> {facture.client_ninea || "Non assujetti / Particulier"}</div>
                {facture.client_telephone && <div><strong>Tél :</strong> {facture.client_telephone}</div>}
                {facture.client_email && <div><strong>Email :</strong> {facture.client_email}</div>}
              </div>
            </div>

            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex flex-col justify-between print:bg-white">
              <div>
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">
                  Objet de la facturation
                </div>
                <div className="text-xs font-semibold text-gray-800">
                  {facture.objet || "Consommation carburant flottes & livraisons sur bons"}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Période : {fmtDate(facture.date_debut || facture.date_emission)} au {fmtDate(facture.date_fin || facture.date_emission)}
                </div>
              </div>
              <div className="text-[11px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1 mt-2 inline-block">
                ✓ Certifié conforme aux bordereaux de livraison et descentes de caisse
              </div>
            </div>
          </div>

          {/* ============================================================
              TABLEAU DES CONSOMMATIONS / LIGNES DE FACTURE
          ============================================================ */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 text-left">#</th>
                  <th className="py-2.5 px-3 text-left">Date</th>
                  <th className="py-2.5 px-3 text-left">Réf. Bon / BL</th>
                  <th className="py-2.5 px-3 text-left">Véhicule</th>
                  <th className="py-2.5 px-3 text-left">Désignation</th>
                  <th className="py-2.5 px-3 text-right">Quantité (L)</th>
                  <th className="py-2.5 px-3 text-right">P.U. TTC</th>
                  <th className="py-2.5 px-3 text-right">Total TTC (FCFA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(facture.lignes || []).map((ligne, idx) => (
                  <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                    <td className="py-2 px-3 text-gray-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{fmtDate(ligne.date_conso || ligne.date)}</td>
                    <td className="py-2 px-3 font-bold text-gray-900 font-mono">{ligne.bon_numero || "—"}</td>
                    <td className="py-2 px-3 text-gray-700">{ligne.immatriculation || "—"}</td>
                    <td className="py-2 px-3 font-semibold text-gray-900">{ligne.designation}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium">{F(ligne.quantite)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-600">{F(ligne.prix_unitaire_ttc)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-gray-900">{F(ligne.montant_ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ============================================================
              RÉCAPITULATIF FINANCIER & ARRÊTÉ EN TOUTES LETTRES
          ============================================================ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            
            {/* Arrêté en toutes lettres */}
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Mention Légale OHADA & Fiscale
                </div>
                <p className="text-gray-800 italic leading-relaxed">
                  « Arrêtée la présente facture à la somme totale de :
                  <strong className="block text-gray-900 font-extrabold not-italic mt-1 text-sm text-[#0B4EA2]">
                    {facture.total_en_lettres || "—"}
                  </strong>
                  »
                </p>
              </div>

              <div className="text-[11px] text-gray-500 space-y-1">
                <div><strong>Modalités de règlement :</strong> Par virement bancaire ou chèque à l'ordre de <em>{FISCAL_CONFIG.emetteur.operateur}</em>.</div>
                <div><strong>Conditions :</strong> En cas de retard de paiement, des pénalités au taux légal en vigueur seront appliquées.</div>
              </div>
            </div>

            {/* Totaux fiscaux */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Total Brut Hors Taxes (HT) :</span>
                <span className="font-mono font-semibold">{F(facture.montant_ht)} FCFA</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>TVA (Régime Produits Pétroliers) :</span>
                <span className="font-mono font-semibold">{F(facture.montant_tva || 0)} FCFA</span>
              </div>
              <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-baseline">
                <span className="text-sm font-black text-gray-900 uppercase">Total Net à Payer (TTC) :</span>
                <span className="text-lg font-black text-rose-700 font-mono">
                  {F(facture.montant_ttc)} FCFA
                </span>
              </div>
            </div>
          </div>

          {/* ============================================================
              CERTIFICATION FISCALE, QR CODE & SIGNATURES
          ============================================================ */}
          <div className="mt-8 pt-6 border-t-2 border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            
            {/* Bloc QR Code de Certification */}
            <div className="flex items-center gap-4 p-3 bg-blue-50/40 border border-blue-200 rounded-xl">
              <div className="bg-white p-2 rounded-lg border border-blue-200 shadow-2xs shrink-0">
                <QRCodeSVG
                  value={payloadQr}
                  size={84}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="text-[10px] space-y-0.5 text-gray-600">
                <div className="font-bold text-blue-900 uppercase tracking-wider text-[10.5px]">
                  Certification Fiscale DGID / OGSS
                </div>
                <div>Ce QR code certifie l'authenticité de la facture émise par le réseau.</div>
                <div className="font-mono text-gray-500 text-[9px] pt-1 break-all">
                  Réf : {facture.numero_facture}
                </div>
              </div>
            </div>

            {/* Bloc Signature & Cachet */}
            <div className="text-center sm:text-right space-y-1">
              <div className="text-[11px] font-bold text-gray-700">
                Pour la Direction Financière &amp; d'Exploitation
              </div>
              <div className="text-[10.5px] text-gray-500 font-medium">
                {FISCAL_CONFIG.emetteur.operateur} • {FISCAL_CONFIG.emetteur.enseigne}
              </div>
              <div className="h-16 flex items-center justify-center sm:justify-end pt-2">
                <div className="border-2 border-dashed border-blue-400/60 rounded-xl px-4 py-2 text-[10px] text-blue-800 font-bold uppercase tracking-wider bg-blue-50/30">
                  Cachet &amp; Signature Électronique Valide
                </div>
              </div>
            </div>
          </div>

          {/* Pied de page fiscal */}
          <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[9.5px] text-gray-400 space-y-0.5">
            <div>
              {FISCAL_CONFIG.emetteur.enseigne} S.A. au capital de {FISCAL_CONFIG.emetteur.capital} • NINEA : {FISCAL_CONFIG.emetteur.ninea} • RCCM : {FISCAL_CONFIG.emetteur.rccm}
            </div>
            <div>
              Document émis via le progiciel certifié OGSS Réseau • Exploitation &amp; Gestion d'Énergie DAMEL ENERGY S.A.U
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
