# 📘 Guide utilisateur — Réseau Stations Service (OGSS)

Version 1.0 — pour les gérants, superviseurs, comptables et responsables du réseau.

---

## 1. Connexion

1. Ouvre l'adresse de l'application (fournie par ton responsable réseau).
2. Saisis ton **email** et ton **mot de passe** (créés par le réseau).
3. Clique **Se connecter**.

> Sans connexion, tu peux naviguer en mode **démonstration** mais **aucune donnée n'est enregistrée**. Pense toujours à te connecter avant de travailler.

---

## 2. Comprendre le bandeau d'en-tête

En haut de l'écran, en permanence :

- **« En ligne / Hors ligne »** : indique si tu as une connexion internet. Hors ligne, l'application continue de fonctionner : tes saisies sont **gardées localement** puis synchronisées automatiquement dès que la connexion revient.
- **« Cloud / Démo locale »** : 
  - **Cloud** = l'application est connectée au serveur réseau : toutes les stations voient les mêmes données.
  - **Démo locale** = mode de démonstration (aucune donnée partagée). Ne travaille pas en mode démo.

---

## 3. Première utilisation — le tableau de bord

Le **Tableau de bord** (« Réseau ») affiche :

- le chiffre d'affaires du jour, des 7 et des 30 derniers jours ;
- les rapports **en attente de validation** ;
- les stations **sans rapport** (⚠️) ;
- les **écarts de caisse** détectés (⚠️) ;
- les **stocks bas** (📦).

Clique sur un rapport dans la liste pour **l'ouvrir** en mode lecture.

---

## 4. Saisir un rapport journalier

C'est le cœur de l'application. Chaque jour, chaque station **doit** transmettre son rapport.

1. Va dans **Rapport**.
2. Renseigne :
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

## 6. Stocks et stock théorique

La page **Stocks** affiche pour chaque station le **stock théorique** (déduit des rapports) de chaque produit (GO, SUPER, lubrifiants, gaz), avec une alerte quand le stock passe sous le **seuil** de la station.

- Mets à jour les **jauges** et **livraisons** de carburant depuis la page **Pistolets**.
- Les stocks se recalculent automatiquement.

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

| Rôle | Droits principaux |
|---|---|
| **Gérant** | Saisie et soumission de son rapport de station |
| **Superviseur** | Validation, vue réseau, finance |
| **Comptable** | Vue réseau, finance |
| **Directeur** | Tout, y compris paramètres |
| **Admin** | Tout, gestion des comptes |

Les droits dépendent de la station d'appartenance : un gérant ne voit **que sa station**.

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
