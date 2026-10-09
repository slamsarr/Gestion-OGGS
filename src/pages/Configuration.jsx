import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Section } from "../components/ui";
import { T } from "../lib/calcul";

// Structure des catégories de configuration
const CONFIG_CATEGORIES = [
  {
    id: "reseau",
    nom: "Réseau & Stations",
    icon: "🏪",
    description: "Stations, prix carburants, cuves, clients crédit",
    route: "/parametres",
    sections: ["Stations", "Prix carburants", "Cuves", "Clients à crédit"]
  },
  {
    id: "produits",
    nom: "Produits & Stocks",
    icon: "🛢️",
    description: "Produits, catégories de dépense, fournisseurs",
    route: "/parametres",
    sections: ["Produits", "Catégories de dépense", "Fournisseurs"]
  },
  {
    id: "equipe",
    nom: "Équipe & Quarts",
    icon: "👥",
    description: "Collaborateurs, rôles, quarts de travail, affectations",
    route: "/gestion-quarts",
    sections: ["Collaborateurs", "Rôles", "Quarts", "Affectations"]
  },
  {
    id: "lavage",
    nom: "Centre de Lavage",
    icon: "🚿",
    description: "Packs, services, tarifs, baies, promotions",
    route: "/lavage",
    sections: ["Packs", "Services", "Tarifs", "Baies", "Promotions", "Bons B2B"]
  },
  {
    id: "entretien",
    nom: "Atelier Entretien",
    icon: "🔧",
    description: "Baie de service, types de véhicules, prestations",
    route: "/entretien",
    sections: ["Configuration baie", "Types véhicules", "Prestations"]
  },
  {
    id: "pistolets",
    nom: "Pistolets & Pompes",
    icon: "⛽",
    description: "Configuration des pistolets, index, jauges",
    route: "/pistolets",
    sections: ["Pistolets", "Capacités cuves", "Jauges", "Livraisons"]
  },
  {
    id: "boutique",
    nom: "Boutique & POS",
    icon: "🛍️",
    description: "Articles boutique, stocks, caisse",
    route: "/boutique",
    sections: ["Articles", "Stocks", "Catégories"]
  },
  {
    id: "fidélité",
    nom: "Fidélité & Clients",
    icon: "⭐",
    description: "Cartes fidélité, points, récompenses",
    route: "/clients-pro",
    sections: ["Cartes fidélité", "Programme points", "Récompenses"]
  },
  {
    id: "facturation",
    nom: "Facturation",
    icon: "📄",
    description: "Paramètres OHADA, numérotation, modèles",
    route: "/clients-pro",
    sections: ["Séquence factures", "Comptabilité OHADA", "Modèles"]
  },
  {
    id: "systeme",
    nom: "Système & Sync",
    icon: "⚙️",
    description: "Synchronisation cloud, paramètres réseau, diagnostic",
    route: "/parametres",
    sections: ["Synchronisation", "Paramètres réseau", "Diagnostic"]
  }
];

export default function Configuration() {
  const { profil } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);

  const filteredCategories = CONFIG_CATEGORIES.filter(cat => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      cat.nom.toLowerCase().includes(q) ||
      cat.description.toLowerCase().includes(q) ||
      cat.sections.some(s => s.toLowerCase().includes(q))
    );
  });

  const handleCategoryClick = (category) => {
    // Pour les catégories qui nécessitent une navigation directe
    if (category.route === "/parametres") {
      navigate(category.route);
      return;
    }
    // Pour les catégories avec des sous-sections, afficher les détails
    setActiveCategory(activeCategory?.id === category.id ? null : category);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: T.petrol }}>
          ⚙️ Configuration
        </h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Centre de configuration centralisé - Tous les paramètres de l'application
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <input
          type="text"
          placeholder="🔍 Rechercher un paramètre (ex: packs, quarts, prix, pistolets...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border bg-white text-sm"
          style={{ borderColor: T.line }}
        />
        <span className="absolute left-3 top-3 text-gray-400">🔍</span>
      </div>

      {/* Grille des catégories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
            className="cursor-pointer bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"
            style={{ borderColor: T.line }}
          >
            <div className="flex items-start gap-3">
              <div className="text-3xl">{cat.icon}</div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-800">{cat.nom}</h3>
                <p className="text-xs text-gray-500 mt-1">{cat.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {cat.sections.slice(0, 3).map((section) => (
                    <span
                      key={section}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                    >
                      {section}
                    </span>
                  ))}
                  {cat.sections.length > 3 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      +{cat.sections.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Panneau de détails pour catégorie active */}
      {activeCategory && (
        <Section
          titre={`${activeCategory.icon} ${activeCategory.nom}`}
          aside={activeCategory.description}
        >
          <div className="space-y-3">
            <p className="text-sm" style={{ color: T.muted }}>
              Cette section contient les paramètres suivants :
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {activeCategory.sections.map((section) => (
                <div
                  key={section}
                  className="p-3 rounded-lg border bg-gray-50 text-sm font-medium"
                  style={{ borderColor: T.line }}
                >
                  {section}
                </div>
              ))}
            </div>
            <div className="pt-3">
              <button
                onClick={() => navigate(activeCategory.route)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: T.petrol }}
              >
                Accéder à {activeCategory.nom} →
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Informations supplémentaires */}
      <Section titre="ℹ️ À propos de la configuration" aside="Guide rapide">
        <div className="space-y-2 text-sm" style={{ color: T.muted }}>
          <p>
            <strong>Configuration centralisée :</strong> Ce hub regroupe tous les paramètres de l'application.
            Cliquez sur une catégorie pour accéder à ses paramètres détaillés.
          </p>
          <p>
            <strong>Configuration réseau :</strong> Les paramètres stations, prix et produits sont accessibles
            via la page Paramètres réseau.
          </p>
          <p>
            <strong>Configuration métier :</strong> Les paramètres spécifiques (lavage, entretien, boutique)
            sont accessibles via leurs pages respectives.
          </p>
          <p>
            <strong>Permissions :</strong> Certains paramètres nécessitent des droits spécifiques
            (gérant, superviseur, administrateur).
          </p>
        </div>
      </Section>
    </div>
  );
}
