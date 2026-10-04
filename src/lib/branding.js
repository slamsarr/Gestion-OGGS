/**
 * Configuration de marque centralisée : STAR ENERGY & DAMEL ENERGY
 *
 * Principes fondamentaux (§2 & §3 du cahier des charges) :
 * - STAR ENERGY = Enseigne principale / Stations / Visibilité terrain & pistolets
 * - DAMEL ENERGY = Opérateur / Gestion / Exploitation / Performance énergétique
 *
 * Règle d'or : Ne jamais créer de confusion ou de concurrence visuelle entre les deux marques.
 */

export const BRAND_CONFIG = {
  // Enseigne principale des stations
  station: {
    name: "STAR ENERGY",
    brandTitle: "STAR ENERGY SÉNÉGAL",
    slogan: "Une marque sénégalaise — Li nio ko mom !",
    role: "ENSEIGNE & RÉSEAU DE STATIONS-SERVICE",
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

  // Opérateur de gestion et de performance
  operator: {
    name: "DAMEL ENERGY",
    role: "ENERGY & STATION MANAGEMENT",
    promise: "ENERGY. OPERATIONS. PERFORMANCE.",
    promiseFr: "GESTION • EXPLOITATION • PERFORMANCE",
    operatedBy: "Operated by DAMEL ENERGY",
    managedBy: "Managed by DAMEL ENERGY",
    poweredBy: "Powered by DAMEL ENERGY",
    signatures: {
      management: "ENERGY & STATION MANAGEMENT",
      performance: "ENERGY. OPERATIONS. PERFORMANCE.",
      fr: "GESTION • EXPLOITATION • PERFORMANCE",
      operatedBy: "Operated by DAMEL ENERGY",
      managedBy: "Managed by DAMEL ENERGY",
    },
    logos: {
      // Logo officiel JPEG (fidélité maximale — recommandé pour les contextes haute qualité)
      logoJpeg: "/branding/damel-energy/logo-damel-energy.jpeg",
      // SVG vectoriels (réactifs, légers, multi-contextes)
      principal: "/branding/damel-energy/damel-energy-logo.svg",
      corporate: "/branding/damel-energy/damel-energy-corporate.svg",
      dark: "/branding/damel-energy/damel-energy-dark.svg",
      white: "/branding/damel-energy/damel-energy-white.svg",
      icon: "/branding/damel-energy/damel-energy-icon.svg",
    },
    colors: {
      blue: "#0B4EA2",
      red: "#E30620",
      yellow: "#F9C400",
      navy: "#102A43",
      white: "#FFFFFF",
      light: "#F0F5FA",
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
