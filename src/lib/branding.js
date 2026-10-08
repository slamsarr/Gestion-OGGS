/**
 * Configuration de marque centralisée : FuelOS by DAMEL ENERGY
 *
 * Hiérarchie des marques (ordonnée par importance visuelle) :
 * 1. FuelOS        = Nom du produit / Plateforme logicielle
 * 2. DAMEL ENERGY  = Propriétaire & Éditeur (corporate, confiance, expertise)
 * 3. STAR ENERGY   = Exploitant / Enseigne affiliée sur le terrain (accent contextuel)
 *
 * Règle d'or : La plateforme = FuelOS by DAMEL ENERGY.
 *              STAR ENERGY n'apparaît que comme identité de station.
 */

export const PRODUCT = {
  name: "FuelOS",
  tagline: "Plateforme de gestion de stations-service",
  taglineShort: "Station OS",
  version: "2.0",
};

export const BRAND_CONFIG = {
  platform: {
    product: PRODUCT.name,
    fullName: "FuelOS by DAMEL ENERGY",
  },
  // Propriétaire & Éditeur : DAMEL ENERGY
  operator: {
    name: "DAMEL ENERGY",
    brandTitle: "DAMEL ENERGY",
    role: "ENERGY & STATION MANAGEMENT",
    promise: "ENERGY. OPERATIONS. PERFORMANCE.",
    promiseFr: "GESTION • EXPLOITATION • PERFORMANCE",
    operatedBy: "Operated by DAMEL ENERGY",
    managedBy: "Managed by DAMEL ENERGY",
    poweredBy: "Propulsé par FuelOS · DAMEL ENERGY",
    signatures: {
      management: "ENERGY & STATION MANAGEMENT",
      performance: "ENERGY. OPERATIONS. PERFORMANCE.",
      fr: "GESTION • EXPLOITATION • PERFORMANCE",
      operatedBy: "Operated by DAMEL ENERGY",
      managedBy: "Managed by DAMEL ENERGY",
      product: `${PRODUCT.name} · DAMEL ENERGY`,
    },
    logos: {
      logoJpeg: "/branding/damel-energy/logo-damel-energy.jpeg",
      principal: "/branding/damel-energy/damel-energy-logo.svg",
      corporate: "/branding/damel-energy/damel-energy-corporate.svg",
      dark: "/branding/damel-energy/damel-energy-dark.svg",
      white: "/branding/damel-energy/damel-energy-white.svg",
      icon: "/branding/damel-energy/damel-energy-icon.svg",
    },
    colors: {
      blue: "#0B4EA2",
      "blue-deep": "#08336D",
      red: "#E30620",
      "red-deep": "#C8102E",
      yellow: "#F9C400",
      gold: "#D4A017",
      navy: "#102A43",
      "navy-ink": "#0C2338",
      white: "#FFFFFF",
      light: "#F0F5FA",
      cream: "#FAFBFD",
    },
  },

  // Exploitant / Enseigne : STAR ENERGY (2nd plan)
  station: {
    name: "STAR ENERGY",
    brandTitle: "STAR ENERGY SÉNÉGAL",
    slogan: "Une marque sénégalaise — Li nio ko mom !",
    role: "ENSEIGNE AFFILIÉE / RÉSEAU DE STATIONS",
    logo: "/star_energy_logo.jpg",
    logoFolder: "/branding/star-energy/star_energy_logo.jpg",
    cover: "/star_energy_cover.jpg",
    coverFolder: "/branding/star-energy/star_energy_cover.jpg",
    colors: {
      purple: "#56216C",
      purpleDark: "#3B1248",
      orange: "#FA5200",
      green: "#76A628",
      lime: "#82B82C",
      magenta: "#B51772",
    },
  },
};

/**
 * Retourne le label d'attribution selon le contexte
 * @param {'operated' | 'managed' | 'corporate' | 'short'} context
 */
export function getOperatorLabel(context = "operated") {
  if (context === "managed") return BRAND_CONFIG.operator.managedBy;
  if (context === "corporate") return BRAND_CONFIG.operator.role;
  if (context === "short") return BRAND_CONFIG.operator.name;
  return BRAND_CONFIG.operator.operatedBy;
}
