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
 * STAR ENERGY (Enseigne station) + DAMEL ENERGY (Opérateur de gestion)
 */
export function BrandDualFooter() {
  return (
    <footer className="bg-white border-t border-slate-200 py-3.5 text-[11px] text-slate-500 font-medium">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Enseigne Station Star Energy */}
        <div className="flex items-center gap-2">
          <img
            src={BRAND_CONFIG.station.logo}
            alt={BRAND_CONFIG.station.name}
            className="w-5 h-5 object-contain rounded shadow-2xs"
          />
          <span className="font-extrabold text-[#56216C] tracking-tight">
            {BRAND_CONFIG.station.brandTitle}
          </span>
          <span className="text-gray-300 hidden sm:inline">•</span>
          <span className="text-amber-700 font-semibold italic text-[10.5px]">
            « {BRAND_CONFIG.station.slogan} »
          </span>
        </div>

        {/* Opérateur de gestion Damel Energy */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
          <img
            src={BRAND_CONFIG.operator.logos.icon}
            alt="DE"
            className="w-4 h-4 object-contain"
          />
          <span className="text-gray-500 text-[10px]">Operated by</span>
          <span className="font-black text-[#0B4EA2] text-[10.5px] tracking-wide">
            DAMEL ENERGY
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider hidden sm:inline">
            Energy &amp; Station Management
          </span>
        </div>
      </div>
    </footer>
  );
}
