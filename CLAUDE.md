# CLAUDE.md

Repère pour un LLM qui reprend ce dépôt à froid.

## À lire d'abord

- [`README.md`](README.md) — commandes, les deux boucles de jeu, architecture des dossiers
- [`docs/design.md`](docs/design.md) — vision, boucles macro/micro, multijoueur, état actuel, roadmap
- [`supabase/README.md`](supabase/README.md) — schéma, conventions RLS

Ces trois fichiers sont la source de vérité ; ne pas dupliquer leur contenu ici,
seulement les compléter par ce qu'un nouvel arrivant casserait sans le savoir.

## Commandes utiles

```bash
npm run dev        # serveur de dev (honore $PORT)
npm test           # domaine — Vitest, doit rester vert
npm run lint       # oxlint
npm run build      # tsc -b puis vite build
npm run seed:sql   # régénère supabase/migrations/…_continent_seed.sql depuis src/domain/continent.ts
```

Pas de CI configurée : `npm test`, `npm run lint` et `npm run build` sont à lancer
soi-même avant de considérer un changement terminé.

## Pièges connus

- **Zones ou actions touchées dans `src/domain/continent.ts`** → lancer
  `npm run seed:sql` et commiter le SQL généré. `continentSeed.test.ts` échoue
  sinon (le seed commité et le catalogue divergent).
- **`src/game/mapBridge.ts`** est la seule frontière entre React et Phaser : on y
  pousse une vue immuable, jamais une référence vivante. Une nouvelle donnée à
  afficher sur la carte passe par là, pas par un import croisé.
- **L'horloge de jeu** (`src/state/game.tsx`) se recalcule depuis `Date.now()` à
  chaque tick, pas en accumulant le delta par frame — un onglet en arrière-plan
  suspend `requestAnimationFrame` mais pas l'horloge murale.
- **`src/domain/`** n'a aucune dépendance vers React, Phaser ou Supabase, et doit
  le rester : c'est ce qui le rend testable et rejouable à l'identique depuis sa
  graine. Toute nouvelle règle de jeu s'y écrit d'abord, avec ses tests.
- **`src/assets/hero.png`, `react.svg`, `vite.svg` et `public/icons.svg`** sont
  des restes du scaffold Vite/React, inutilisés par le jeu.
- Sans migrations appliquées sur le projet Supabase, `probeSupabase()` fait
  basculer le jeu sur un dépôt `localStorage` — un comportement normal en dev,
  pas un bug à corriger.

## Conventions

- Contenu du jeu (noms de zones, textes UI, messages) en français ; identifiants
  et code en anglais.
- Commentaires réservés au *pourquoi* non évident (contrainte cachée, invariant,
  contournement) — jamais au *quoi*, que les noms doivent déjà porter. Le code
  existant suit cette règle ; la garder en l'étendant.
- Pas d'abstraction ou de gestion d'erreur pour des cas qui ne peuvent pas se
  produire côté domaine : les frontières (Supabase, entrée utilisateur) sont les
  seuls points de validation.
