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

## 5. État actuel (v2)
Les deux boucles sont jouables de bout en bout, dans le navigateur et sur mobile.

- **Continent** : 14 zones nommées réparties sur les trois disques relevés
  autour des ascenseurs ; le reste du continent est grisé. Chaque zone a un type
  de terrain qui détermine sa difficulté de traversée et les actions offertes.
- **Boucle macro** : tableau de missions du jour (une par ascenseur, objectif +
  taxe + prime), option « rester au camp », règlement au retour (taxe, navette de
  secours si retour après le coucher du soleil, prime d'objectif), boutique
  d'améliorations où chaque entrée a un effet mécanique réel, xp et niveaux,
  journal des expéditions.
- **Boucle micro** : planning par touchers de carte, estimations de durée dont
  l'incertitude croît avec l'heure et décroît avec le niveau, marge et point de
  non-retour affichés en continu, horloge accélérable (pause / ×1 / ×3 / ×8),
  événements aléatoires, replanification en cours de route, retour forcé
  automatique, retour manuel immédiat.
- **Multijoueur** : présence temps réel (position, statut camp/expédition) et
  chat global, tous deux sur un canal Realtime — donc sans dépendre du schéma.
- **Persistance** : Supabase quand le schéma est appliqué (le monde lui-même est
  lu dans les tables du catalogue), repli sur `localStorage` sinon, l'en-tête
  indiquant lequel est actif.
- **Domaine testé** : le jeu vit dans `src/domain`, en TypeScript pur et
  déterministe ; 77 tests, dont une journée complète jouée d'un bout à l'autre.

**Limites connues** : identité anonyme (pas de compte nommé), pas de
notifications asynchrones, amis / groupes / échanges / missions coopératives
présents en base mais pas encore dans le client, chat sans historique.

## 6. Cible technique
- **Backend** : Supabase (Postgres + Realtime + Auth). Schéma écrit et
  versionné dans `supabase/migrations`, appliqué sur le projet réel.
- **Client** : React + Vite pour l'interface, Phaser pour la carte, le jeu
  lui-même isolé en TypeScript pur et déterministe dans `src/domain`.
- **Auth** : connexion anonyme aujourd'hui (l'identité survit aux rechargements
  via la session stockée) ; comptes nommés — e-mail ou lien magique — ensuite.
- **Temps réel** : Supabase Realtime. La présence et le chat passent par un
  canal, sans table, donc sans dépendre du schéma ; l'écoute des changements
  Postgres servira pour les groupes et les échanges.
- **Persistance** : tables Postgres pour joueurs, inventaire, améliorations,
  expéditions et événements. Les zones et les actions sont aussi lues en base :
  le monde se retouche sans livrer de client.
- **Rejouabilité** : chaque journée est graine, et la graine est stockée sur
  l'expédition — une journée soldée peut être auditée ou rejouée à l'identique,
  y compris plus tard côté serveur.
- **Notifications** : à définir — web push (PWA) ou notifications in-app au
  retour en ligne, la table `events` servant déjà d'historique de rattrapage.
- **Repo** : `github.com/jfongue/expedition`, développement via Claude Code.

## 7. Roadmap
Fait : schéma Supabase, auth anonyme, présence temps réel, boucle macro
complète (ascenseurs, taxe, améliorations), boucle micro complète (planning,
estimations, événements, retour forcé), migrations appliquées sur le projet
réel (2026-09-12) — persistance et catalogue du monde en base.

Reste à faire, dans l'ordre suggéré :
1. Héberger le client (Vercel) pour que l'expérience existe hors de la machine
   de dev.
2. Comptes nommés à la place de l'identité anonyme.
3. Amis, groupes et destination planifiée visible par le groupe.
4. Chat persistant par zone et par groupe, puis échanges de matériel.
5. Notifications asynchrones / historique de rattrapage au retour en ligne.
6. Missions coopératives par candidature, avec équipage choisi avant le coucher
   du soleil.
