# Explorateurs — Documentation de design

## 1. Vision
Des explorateurs opportunistes voyagent en vaisseau et se positionnent en orbite stationnaire au-dessus de continents inconnus. Chaque jour, ils descendent explorer, récolter, combattre et construire — puis doivent impérativement rentrer avant la nuit, sous peine de dangers mortels. À terme, les meilleurs pourront organiser leurs propres expéditions et recruter d'autres joueurs.

## 2. Boucle de jeu

### 2.1 Boucle macro (cycle jour/nuit)
1. Choisir une mission auprès d'une base (accessible via ascenseur).
2. Départ possible dès le levé du soleil ; retour obligatoire avant minuit.
3. Une fois de retour : payer une taxe d'expédition, récupérer le reste du butin.
4. Investir le butin dans :
   - le **campement** (chambre, confort),
   - le **matériel** (bottes, manteau, outils),
   - les **capacités** (endurance, robustesse, natation, escalade, minage…),
   - les **connaissances** (langues, raccourcis, métiers).
5. Option : rester au camp un jour de plus pour améliorer davantage, au prix de revenus perdus.
6. Progression long terme : débloquer la possibilité d'organiser ses propres expéditions et de recruter.

### 2.2 Boucle micro (dans l'expédition)
- Déplacement sur une carte, actions contextuelles selon la zone : miner, chasser, construire des cachettes, explorer.
- Planning de la journée établissable à l'avance (où aller, quoi faire, quand rentrer) mais modifiable en cours de route.
- Événements aléatoires en cours de journée : lieux alternatifs, événements locaux, filons précieux, rencontres avec d'autres joueurs — chacun notifié et modifiant les opportunités/malus à venir.
- Un retour par défaut est toujours planifié avant le coucher du soleil ; le chemin retour s'enclenche automatiquement si le temps restant devient insuffisant.
- Fiabilité des estimations de temps : meilleure en début de run et à mesure que le joueur progresse en niveau ; les actions de fin de journée sont plus incertaines.

## 3. Interfaces

### 3.1 Choix de mission
- Carte géante du continent, très majoritairement grisée ; seules quelques zones "publiques" autour d'ascenseurs fixes sont accessibles au départ.
- Quêtes/objectifs récupérables sur place, possibilité de s'allier à d'autres joueurs pour des actions améliorées.
- Une fois la mission choisie : heure de départ fixée le lendemain matin (départ tardif possible en journée mais avec moins de marge).
- Plus tard : missions plus ambitieuses organisées par d'autres joueurs, accessibles par candidature (l'organisateur choisit son équipage avant le coucher du soleil).

### 3.2 Planning d'expédition
- Clic sur la carte = déplacement planifié vers une zone.
- Une fois arrivé : choix d'actions selon le type de zone.
- Chaînage libre de déplacements/actions tant que le planning tient dans le temps disponible.
- Le planning se termine toujours par un retour à la zone de débarquement + décollage au coucher du soleil.
- Navette de secours après le coucher du soleil, plus chère, réservée aux imprévus.

## 4. Multijoueur

| Fonction | Description |
|---|---|
| **Présence** | Voir les autres joueurs se déplacer sur la carte, en base comme en expédition. |
| **Amis** | Ajouter un joueur croisé sur la carte à sa liste d'amis. |
| **Chat** | Discussion textuelle (global pour le prototype ; à terme par zone/groupe). |
| **Échanges** | Transfert simple de matériel entre joueurs, en base ou en expédition. |
| **Groupes** | Former un groupe pour voir en permanence où sont les membres, y compris leur **destination planifiée** (pas seulement leur position actuelle). |
| **Événements exclusifs** | Un événement spécial se déclenche si le joueur et un membre de son groupe sont dans la même zone au même moment. |
| **Missions coop** | Expéditions à plusieurs, nécessitant une coordination fine (débloqué plus tard). |

## 5. Prototype v1 (état actuel)
- Carte unique simplifiée (grille 8×8, zones nommées).
- Un clic = déplacement immédiat ; clic-droit = planification d'une destination future visible par le groupe.
- Présence multijoueur simulée par polling (~4s) via le stockage partagé d'un artifact — pas de vrai temps réel, pas d'historique hors-ligne.
- Amis (liste perso), chat global, échanges simples (bois/métal/nourriture mockés), groupes avec ID partagé, bannière d'événement exclusif si croisement en zone.
- **Limites connues** : pas d'authentification (le nom = identité, collisions possibles), pas de notifications asynchrones, last-write-wins sur le storage partagé.

## 6. Cible technique (v2 — backend réel)
Objectif : présence temps réel, connexion asynchrone (revenir plus tard sans tout perdre), notifications.

- **Backend** : Supabase (Postgres + Realtime + Auth) — compte déjà existant.
- **Auth** : comptes réels (email ou magic link) pour remplacer le nom comme identité.
- **Temps réel** : Supabase Realtime (channels de présence + écoute des changements Postgres) pour la position des joueurs, le chat, les groupes.
- **Persistance** : tables Postgres pour joueurs, inventaire, groupes, chat, trades, événements — remplace le storage d'artifact.
- **Notifications** : à définir — web push (PWA) ou notifications in-app au retour en ligne (historique d'événements consultable), selon effort souhaité.
- **Repo** : `github.com/jfongue/expedition`, développement via Claude Code (accès direct au filesystem local).

## 7. Roadmap suggérée
1. Setup Supabase (schéma DB : players, inventory, groups, chat_messages, trades, events).
2. Auth basique + migration du prototype vers de vraies requêtes Supabase (au lieu du storage artifact).
3. Presence temps réel (positions + statut en ligne/hors ligne).
4. Historique d'événements / notifications au retour.
5. Vraie boucle macro : bases, ascenseurs, taxe d'expédition, améliorations de personnage.
6. Missions coop par candidature.
