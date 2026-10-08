import React from "react";
import { BRAND_CONFIG, PRODUCT } from "../lib/branding";

export function DamelLogo({ variant = "principal", className = "h-6 w-auto", alt = "DAMEL ENERGY" }) {
  const src = BRAND_CONFIG.operator.logos[variant] || BRAND_CONFIG.operator.logos.principal;
  return <img src={src} alt={alt} className={className} />;
}

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

export function ProductBadge({ variant = "pill", className = "" }) {
  if (variant === "dark-mini") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-damel-yellow text-fuelos-950 tracking-tight ${className}`}
      >
        <span>by</span>
        <span>DAMEL ENERGY</span>
      </span>
    );
  }

  if (variant === "mini") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-fuelos-50 text-fuelos-800 border border-fuelos-200 tracking-tight ${className}`}
      >
        <span>by</span>
        <span className="text-damel-blue">DAMEL ENERGY</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-gradient-to-r from-fuelos-50 to-white text-damel-blue border border-fuelos-200 tracking-tight shadow-card ${className}`}
    >
      <span className="text-damel-blue">{PRODUCT.name}</span>
      <span className="text-slate-400">·</span>
      <span className="text-fuelos-900">{BRAND_CONFIG.operator.name}</span>
    </span>
  );
}

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
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-fuelos-900/90 text-white border border-fuelos-700/60 backdrop-blur-sm tracking-tight ${className}`}
        title="Opérateur de gestion réseau : DAMEL ENERGY"
      >
        {showIcon && (
          <img
            src={BRAND_CONFIG.operator.logos.icon}
            alt="DE"
            className="w-3.5 h-3.5 object-contain rounded-[2px]"
          />
        )}
        <span>{label}</span>
      </span>
    );
  }

  if (variant === "light") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-white text-fuelos-800 border border-surface-border shadow-card tracking-tight ${className}`}
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

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-extrabold bg-fuelos-50 text-damel-blue border border-fuelos-200 shadow-card ${className}`}
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

export function BrandDualFooter() {
  return (
    <footer className="bg-white border-t border-surface-border py-4 text-[11px] text-slate-500 font-medium">
      <div className="max-w-7xl mx-auto px-4 sm:px-5 lg:px-6 flex flex-col md:flex-row items-center justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuelos-50 to-white border border-fuelos-200/80 flex items-center justify-center shadow-card">
            <img
              src={BRAND_CONFIG.operator.logos.icon}
              alt="Damel Energy"
              className="w-5 h-5 object-contain"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-damel-blue tracking-wide text-[12px]">
              {PRODUCT.name}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-extrabold text-fuelos-900 text-[11.5px]">
              {BRAND_CONFIG.operator.name}
            </span>
            <span className="hidden lg:inline text-slate-300">·</span>
            <span className="hidden sm:inline text-slate-600 font-semibold text-[11px]">
              {BRAND_CONFIG.operator.role}
            </span>
            <span className="hidden lg:inline text-slate-300">·</span>
            <span className="hidden lg:inline text-damel-blue font-semibold text-[11px]">
              « {BRAND_CONFIG.operator.promiseFr} »
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-surface-base border border-surface-border px-3 py-1.5 rounded-xl shadow-card">
          <span className="text-[10px] text-slate-500 font-semibold">Enseigne déployée :</span>
          <img
            src={BRAND_CONFIG.station.logo}
            alt={BRAND_CONFIG.station.name}
            className="w-4.5 h-4.5 object-contain rounded-[2px]"
            style={{ width: "18px", height: "18px" }}
          />
          <span className="font-extrabold text-star-purple text-[11.5px]">
            {BRAND_CONFIG.station.name}
          </span>
          <span className="hidden sm:inline text-slate-300">·</span>
          <span className="text-[10px] text-amber-700 italic hidden sm:inline font-medium">
            « {BRAND_CONFIG.station.slogan} »
          </span>
        </div>
      </div>
    </footer>
  );
}
