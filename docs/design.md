# Explorateurs — Proto v1

## Pitch
Chaque jour : choisir une mission, planifier son expédition sur une carte, agir (miner/chasser/construire/explorer), rentrer avant minuit, améliorer son perso/campement. Multi : voir les autres, ami, chat, échange, groupe avec vision des plans, events exclusifs de zone.

## Scope proto (simplifié)
- 1 carte unique (grille 8x8), zones nommées.
- Déplacement au clic (macro+micro fusionnés : un clic = un "planning" instantané).
- Présence multi via polling (~4s), pas de websocket réel.
- Amis (perso), Chat global (partagé), Échange simple d'objets (partagé), Groupe (partagé) avec affichage de la destination prévue des membres.
- Event exclusif : bannière si toi + un membre du groupe êtes dans la même zone.
- Inventaire mock (bois/métal/nourriture), pas de vraie éco/taxe pour l'instant.

## Techn
- Artifact HTML/JS autonome, stockage via `window.storage` (shared=true pour players/chat/trades/groups, perso pour amis/inventaire).
- Last-write-wins → OK pour proto, pas pour prod.

## Limites connues
- Polling = latence, pas de vrai temps réel.
- Pas d'auth : le nom = identité (collision possible).
- Pas de vraie sécurité sur les échanges.

## Itérations suivantes
- Vraie boucle macro (missions/bases/ascenseur/nuit).
- Compétences, équipement, taxe d'expédition.
- Missions coop candidature.
- Backend réel si on dépasse les limites du polling.
