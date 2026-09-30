# 📘 Guide utilisateur — Réseau Stations Service (OGSS)

Version 1.0 — pour les gérants, superviseurs, comptables et responsables du réseau.

---

## 1. Connexion

1. Ouvre l'adresse de l'application (fournie par ton responsable réseau).
2. Saisis ton **email** et ton **mot de passe** (créés par le réseau).
3. Clique **Se connecter**.

> En mode **démonstration** (sans serveur cloud), connecte-toi avec un compte démo : tes saisies sont **enregistrées sur cet appareil** (navigateur), mais **ne sont pas partagées** avec les autres stations. Pour le travail réel du réseau, utilise ton compte cloud lorsque le bandeau affiche **Cloud**.

---

## 2. Comprendre le bandeau d'en-tête

En haut de l'écran, en permanence :

- **« En ligne / Hors ligne »** : indique si tu as une connexion internet. Hors ligne, l'application continue de fonctionner : tes saisies sont **gardées localement** puis synchronisées automatiquement dès que la connexion revient.
- **« Cloud / Démo locale »** : 
  - **Cloud** = l'application est connectée au serveur réseau : toutes les stations voient les mêmes données.
  - **Démo locale** = données sur **cet appareil uniquement** (formation / test). En production, le réseau doit afficher **Cloud**.

---

## 3. Première utilisation — où commencer ?

**Gérant de station** : à la connexion, tu arrives sur le **Poste de commande** (`Poste de Commande`). Tu y supervises descentes pompistes, bons, lavage et boutique. Le bouton **Rapport du jour** ouvre le rapport journalier pré-rempli depuis ces saisies terrain.

**Superviseur / directeur / comptable** : le **Cockpit réseau** affiche le CA (jour, 7 j, 30 j), les rapports en attente, les stations sans rapport, les écarts de caisse et les stocks bas. Clique sur un rapport pour l'ouvrir.

---

## 4. Saisir un rapport journalier

C'est le cœur de l'application. Chaque jour, chaque station **doit** transmettre son rapport.

1. Depuis le **Poste de commande**, clique **Rapport du jour**, ou va dans **Rapport journalier** (menu Pilotage).
2. Si les pompistes ont déjà clôturé leurs descentes, les **index de fin**, les **bons / tickets**, le **lavage**, la **boutique** et les **dépenses** du jour sont pré-remplis. Vérifie puis complète le reste :
   - les **index des pistolets** (départ / fin) : les volumes GO et SUPER sont calculés automatiquement ;
   - le **carburant livré** ;
   - les **lubrifiants** (stock initial, réception, vendu) ;
   - le **gaz**, le **lavage**, les **tickets** ;
   - les **versements** et **dépenses** ;
   - une **photo justificative** des dépenses si possible.
3. Clique **Enregistrer** : le rapport est gardé (même hors ligne) puis synchronisé en ligne.
4. Quand tout est complet, clique **Soumettre** pour l'envoyer à la validation.

Ton rapport apparaît alors dans l'**Historique** avec le statut **SOUMIS**.

---

## 5. Suivre ses rapports — Historique

La page **Historique** liste tous les rapports avec leur statut :

| Statut | Signification |
|---|---|
| **BROUILLON** | En cours, pas encore transmis |
| **SOUMIS** | Transmis, en attente de validation |
| **VALIDE** | Validé par le réseau |
| **REJETE** | Refusé (voir le motif, corriger, resoumettre) |

Utilise les filtres (station, statut) et la pagination pour retrouver un rapport. Tu peux **supprimer** un brouillon ou un rapport rejeté.

---

## 6. Stocks, cuves et jauges

La page **Stocks** affiche le stock théorique (déduit des rapports) des lubrifiants et du gaz.

Les **jauges physiques** carburant se saisissent dans **Cuves & Dépotage** (ou l’onglet Jauges de **Pistolets & Pompes**) : c’est le **même registre**. Les livraisons camion (BL, scellés) se font depuis Cuves.

---

## 6bis. Terrain quotidien (pompiste, lavage, boutique)

- **Descentes pompistes** : le pompiste **choisit lui-même ses pompes** (aucune pompe n’est pré-assignée). Index, caisse pompe, bons carburant (code client `CP-…`). Après **clôture / validation**, le formulaire est vidé pour le quart suivant. Une descente **TERMINEE** n’est plus modifiable par le pompiste ; le gérant peut corriger.
- **Lavage / Boutique / Dépenses / Maintenance / Dépotage / Fidélité** : après enregistrement réussi, la saisie en cours est vidée (le ticket ou le reçu reste affiché).
- **Poste de commande** (gérant) : vue du jour, attribution des bons, lancement du **Rapport du jour**.
- **Fidélité** : cartes et points. Le client scanne un QR vers `/espace-fidelite` sans mot de passe.

---

## 7. Finance (réservé au réseau)

La page **Finance** (réservée aux superviseurs, directeurs et comptables) centralise :

- le **CA total** par station et par période ;
- les **écarts de caisse** ;
- les opérations de **crédit** des clients (suivi des soldes) ;
- les **versements bancaires** ;
- l'export **SYSCOHADA** et le **journal de caisse** en Excel.

Utilise les exports pour remettre au comptable du réseau les données conformes au plan comptable.

---

## 8. Gestion des ressources

- **Pompistes** : ajouter / activer / désactiver un pompiste et saisir ses **quarts** quotidiens (ventes, versements).
- **Pistolets** : saisir les **jauges** et **livraisons** de carburant, suivre les cuves.
- **Paramètres** : gérer les stations, prix, produits, clients crédit, cuves (réservé au directeur/administrateur).

---

## 9. Travailler sans connexion (offline)

- Toutes les saisies sont enregistrées en local puis **synchronisées automatiquement** au retour de la connexion (voir le compteur dans l'en-tête).
- **Ne ferme pas** l'application pendant une synchronisation.
- En cas d'écran « rapport absent », pas d'inquiétude : la synchronisation reprendra toute seule.

---

## 10. Rôles et droits

| Rôle | Accueil | Droits principaux |
|---|---|---|
| **Admin** | Cockpit réseau | Tout, y compris paramètres |
| **Directeur** | Cockpit réseau | Tout, y compris paramètres |
| **Superviseur** | Cockpit réseau | Validation des rapports, vue réseau, finance |
| **Comptable** | Cockpit réseau | Vue réseau, finance, pas de saisie de rapport |
| **Gérant** | Poste de commande | Station uniquement : descentes, rapport, soumission |
| **Pompiste** | Descentes | Index et bons ; pas de rapport réseau |
| **Lavage / Boutique / Stock / Maintenance** | Leur module | Saisie métier ; stock voit aussi cuves et boutique |
| **Commercial** | Clients pro | Comptes `CP-*`, fidélité |
| **Client professionnel** | Clients pro | Son compte seulement (ex. CP-ITS) |

Un compte **sans rôle** n’obtient aucun droit (pas de gérant par défaut). Les codes clients du journal Excel (`ITS`) sont les mêmes que `CP-ITS`.

---

## 11. Problèmes fréquents

| Situation | Solution |
|---|---|
| « Démo locale » affiché | Connecte-toi / signale au réseau que le cloud n'est pas branché |
| Données non synchronisées | Vérifie la connexion ; la sync est automatique |
| Rapport rejeté | Lis le motif, corrige, resoumets |
| Rapport absent sans explication | Rafraîchis ; c'est souvent un simple décalage de sync |

---

**Support** : contacte le responsable réseau en cas de bug ou de question.

*Document généré pour l'équipe OGSS — ne contient aucune donnée sensible.*
