import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('C:\\Users\\sadio keita\\Downloads\\Gestion-OGGS-main (1)\\Gestion-OGGS-main\\data-extraction.json', 'utf-8'));

console.log('========================================');
console.log('ANALYSE DU JOURNAL EXCEL STAR ENERGY');
console.log('========================================\n');

// 1. Analyse de chaque feuille
console.log('1. STRUCTURE DES FEUILLES\n');
Object.entries(data.feuilles).forEach(([nom, feuille]) => {
  console.log(`\n📄 ${nom}`);
  console.log(`   Format: ${feuille.format}`);
  console.log(`   Lignes: ${feuille.nombre_lignes}`);
  if (feuille.nombre_lignes > 0) {
    console.log(`   Colonnes: ${feuille.colonnes ? feuille.colonnes.length : 'N/A'}`);
    if (feuille.colonnes && feuille.colonnes.length > 0) {
      console.log(`   Exemple colonnes: ${feuille.colonnes.slice(0, 5).join(', ')}${feuille.colonnes.length > 5 ? '...' : ''}`);
    }
  }
});

// 2. Feuilles clés et leur rôle
console.log('\n\n2. RÔLE DES FEUILLES CLÉS\n');
const analyseFeuilles = {
  'TABLEAU DE BORD': 'Vue synthétique avec indicateurs mensuels et graphiques',
  'CONTROLES': 'Alertes et contrôles de cohérence (seuils paramétrables)',
  'PARAMETRES': 'Barème des prix carburant (vente, achat, marge)',
  'BASE_JOURS': 'Synthèse journalière consolidée (134 journées) - ÉQUIVALENT RAPPORT GÉRANT',
  'BASE_POMPISTES': 'Détail par pompiste et par pompe (4 pompes, index départ/fin)',
  'BASE_DEPENSES': 'Ventilation détaillée des dépenses par catégorie et client',
  'BASE_LIVRAISONS': 'Livraisons carburant avec marges théoriques',
  'CREANCES_CLIENTS': 'Comptes clients individuels (DMJ, O.NDIAYE, M.BEYE, ITS)',
  'JOURNAL': 'Journal d\'index global (5636 lignes)',
  'POMPISTES': 'Journal de saisie pompiste (8434 lignes)',
  'GO&SUP': 'Suivi des livraisons',
  'DMJ': 'Compte client DMJ (Joukadar)',
  'O.NDIAYE': 'Compte client O.NDIAYE (Star Transport)',
  'M.BEYE': 'Compte client M.BEYE (Mamour Beye)',
  'ITS': 'Compte client ITS',
  'Feuil4': 'Suivi des lubrifiants CEPSA'
};

Object.entries(analyseFeuilles).forEach(([nom, role]) => {
  const feuille = data.feuilles[nom];
  if (feuille) {
    console.log(`📋 ${nom}: ${role} (${feuille.nombre_lignes} lignes)`);
  }
});

// 3. Pistes d'amélioration pour la plateforme
console.log('\n\n3. PISTES D\'AMÉLIORATION POUR LA PLATEFORME\n');

const ameliorations = [
  {
    source: 'BASE_JOURS',
    idee: 'Synthèse journalière améliorée',
    details: [
      'Ajouter colonnes : Jours d\'exploitation, volumes par produit séparés',
      'Calcul de marges théoriques automatiques',
      'Ventilation détaillée des modes de paiement (espèces, Wave, carte, bons)',
      'Suivi des charges d\'exploitation',
      'Contrôle de ventilation automatique'
    ]
  },
  {
    source: 'BASE_POMPISTES',
    idee: 'Suivi pompiste avancé',
    details: [
      'Contrôle de continuité des index (index fin de quart = index début de quart suivant)',
      'Validation des index pompes (4 pompes)',
      'Calcul automatique des écarts de comptage',
      'Historique des index par pompiste et par pompe'
    ]
  },
  {
    source: 'BASE_DEPENSES',
    idee: 'Gestion des dépenses catégorisée',
    details: [
      'Catégorisation automatique des dépenses',
      'Identification des clients pour chaque dépense',
      'Ventilation par nature (charge/dépense, avec/sans mouvement)',
      'Alertes sur dépenses inhabituelles'
    ]
  },
  {
    source: 'CREANCES_CLIENTS',
    idee: 'Gestion des comptes clients B2B',
    details: [
      'Suivi individuel des comptes clients (comme DMJ, O.NDIAYE, M.BEYE, ITS)',
      'Calcul du taux de recouvrement automatique',
      'Alertes sur créances anciennes',
      'Tableau de bord par client'
    ]
  },
  {
    source: 'JOURNAL & POMPISTES',
    idee: 'Journal d\'index unifié',
    details: [
      'Journal d\'index global pour traçabilité complète',
      'Historique de tous les index par date et pompiste',
      'Reconciliation automatique avec les descentes',
      'Export Excel fidèle au format original'
    ]
  },
  {
    source: 'PARAMETRES',
    idee: 'Configuration dynamique des prix',
    details: [
      'Barème de prix carburant configurable',
      'Historique des changements de prix',
      'Calcul automatique des marges selon le barème',
      'Simulation d\'impact des changements de prix'
    ]
  },
  {
    source: 'CONTROLES',
    idee: 'Système d\'alertes avancé',
    details: [
      'Seuils paramétrables pour chaque type d\'alerte',
      'Alertes sur écarts de caisse, stocks bas, index incohérents',
      'Dashboard de contrôle avec priorisation',
      'Historique des alertes et résolutions'
    ]
  },
  {
    source: 'Feuil4',
    idee: 'Gestion des lubrifiants',
    details: [
      'Suivi des stocks lubrifiants CEPSA',
      'Ventes et réceptions de lubrifiants',
      'Calcul de valorisation des stocks',
      'Alertes sur stocks de lubrifiants'
    ]
  }
];

ameliorations.forEach((item, idx) => {
  console.log(`\n${idx + 1}. ${item.idee} (Source: ${item.source})`);
  item.details.forEach((detail, dIdx) => {
    console.log(`   ${dIdx + 1}. ${detail}`);
  });
});

// 4. Statistiques globales
console.log('\n\n4. STATISTIQUES GLOBALES\n');
const totalLignes = Object.values(data.feuilles).reduce((sum, f) => sum + (f.nombre_lignes || 0), 0);
const feuillesWithDonnees = Object.values(data.feuilles).filter(f => f.nombre_lignes > 0).length;

console.log(`Total lignes de données: ${totalLignes.toLocaleString()}`);
console.log(`Feuilles avec données: ${feuillesWithDonnees}/${Object.keys(data.feuilles).length}`);
console.log(`Période couverte: 134 journées (05/05/2026 - 14/09/2026)`);
console.log(`Clients suivis: 4 (DMJ, O.NDIAYE, M.BEYE, ITS)`);

// 5. Recommandations prioritaires
console.log('\n\n5. RECOMMANDATIONS PRIORITAIRES\n');
const priorites = [
  { priorite: 'HAUTE', action: 'Implémenter la synthèse journalière type BASE_JOURS dans le cockpit gérant' },
  { priorite: 'HAUTE', action: 'Ajouter le contrôle de continuité des index pompistes' },
  { priorite: 'HAUTE', action: 'Créer la gestion des comptes clients B2B avec suivi individuel' },
  { priorite: 'MOYENNE', action: 'Implémenter le barème de prix carburant dynamique' },
  { priorite: 'MOYENNE', action: 'Ajouter la ventilation détaillée des dépenses par catégorie' },
  { priorite: 'MOYENNE', action: 'Créer le journal d\'index global pour traçabilité' },
  { priorite: 'BASSE', action: 'Ajouter la gestion des lubrifiants CEPSA' },
  { priorite: 'BASSE', action: 'Implémenter le système d\'alertes avec seuils paramétrables' }
];

priorites.forEach((item, idx) => {
  const emoji = item.priorite === 'HAUTE' ? '🔴' : item.priorite === 'MOYENNE' ? '🟡' : '🟢';
  console.log(`${emoji} [${item.priorite}] ${item.action}`);
});

console.log('\n========================================');
console.log('FIN DE L\'ANALYSE');
console.log('========================================\n');
