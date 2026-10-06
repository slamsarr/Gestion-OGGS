import React from "react";
import { BRAND_CONFIG } from "../lib/branding";

/**
 * Logo Damel Energy SVG vectoriel adaptatif (badges, headers, icônes)
 */
export function DamelLogo({ variant = "principal", className = "h-6 w-auto", alt = "DAMEL ENERGY" }) {
  const src = BRAND_CONFIG.operator.logos[variant] || BRAND_CONFIG.operator.logos.principal;
  return <img src={src} alt={alt} className={className} />;
}

/**
 * Logo officiel DAMEL ENERGY en JPEG haute fidélité
 * Utiliser pour : carte Login, section Paramètres, page À propos, impression
 * Préférer DamelLogo SVG pour les badges, headers, footers
 */
export function DamelLogoOfficial({ className = "h-10 w-auto object-contain", alt = "DAMEL ENERGY" }) {
  return (
    <img
      src={BRAND_CONFIG.operator.logos.logoJpeg}
      alt={alt}
      className={className}
      style={{ maxWidth: "180px" }}
    />
  );
}


/**
 * Badge opérateur pour header, cockpits et écrans de gestion
 * Présente subtilement "Operated by DAMEL ENERGY" ou "Managed by DAMEL ENERGY"
 */
export function OperatorBadge({
  context = "operated",
  variant = "dark",
  className = "",
  showIcon = true,
}) {
  const label = context === "managed" ? BRAND_CONFIG.operator.managedBy : BRAND_CONFIG.operator.operatedBy;

  if (variant === "dark") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#102A43]/80 text-white border border-blue-400/30 backdrop-blur-xs tracking-tight ${className}`}
        title="Opérateur de gestion réseau : DAMEL ENERGY"
      >
        {showIcon && (
          <img
            src={BRAND_CONFIG.operator.logos.icon}
            alt="DE"
            className="w-3.5 h-3.5 object-contain rounded-xs"
          />
        )}
        <span>{label}</span>
      </span>
    );
  }

  if (variant === "light") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-[#102A43] border border-slate-200 tracking-tight ${className}`}
        title="Opérateur de gestion réseau : DAMEL ENERGY"
      >
        {showIcon && (
          <img
            src={BRAND_CONFIG.operator.logos.icon}
            alt="DE"
            className="w-3.5 h-3.5 object-contain"
          />
        )}
        <span>{label}</span>
      </span>
    );
  }

  // Variant "pill" par défaut
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-[#0B4EA2] border border-blue-200 ${className}`}
    >
      {showIcon && (
        <img
          src={BRAND_CONFIG.operator.logos.icon}
          alt="DE"
          className="w-3 h-3 object-contain"
        />
      )}
      <span>{label}</span>
    </span>
  );
}

/**
 * Pied de page double marque :
 * DAMEL ENERGY (Services & Opérateur principal) + STAR ENERGY (Réseau & Enseigne 2nd plan)
 */
export function BrandDualFooter() {
  return (
    <footer className="bg-white border-t border-slate-200 py-3 text-[11px] text-slate-500 font-medium">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Services Principaux DAMEL ENERGY */}
        <div className="flex items-center gap-2.5">
          <img
            src={BRAND_CONFIG.operator.logos.icon}
            alt="Damel Energy"
            className="w-5 h-5 object-contain"
          />
          <div className="flex items-center gap-2">
            <span className="font-black text-[#0B4EA2] tracking-wide text-xs">
              DAMEL ENERGY
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span className="text-slate-600 font-bold text-[10.5px]">
              {BRAND_CONFIG.operator.role}
            </span>
            <span className="text-slate-300 hidden md:inline">•</span>
            <span className="text-[#0B4EA2] font-semibold text-[10px] hidden md:inline">
              « {BRAND_CONFIG.operator.promiseFr} »
            </span>
          </div>
        </div>

        {/* Enseigne réseau affiliée au 2nd plan : Star Energy */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
          <span className="text-[10px] text-gray-500">Enseigne déployée :</span>
          <img
            src={BRAND_CONFIG.station.logo}
            alt={BRAND_CONFIG.station.name}
            className="w-4 h-4 object-contain rounded opacity-80"
          />
          <span className="font-extrabold text-[#56216C] text-[10.5px] opacity-90">
            {BRAND_CONFIG.station.name}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-[10px] text-amber-700 italic hidden sm:inline">
            « {BRAND_CONFIG.station.slogan} »
          </span>
        </div>
      </div>
    </footer>
  );
}
