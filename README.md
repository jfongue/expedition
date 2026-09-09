# Expedition — *Explorateurs*

Jeu de plateau web/mobile : des explorateurs descendent chaque jour d'un
vaisseau en orbite, récoltent sur un continent inconnu, et doivent
impérativement remonter avant la nuit. Le butin se réinvestit au camp.

La documentation de design est dans [`docs/design.md`](docs/design.md).

## Démarrer

```bash
npm install
npm run dev
```

Copiez `.env.local.example` en `.env.local` et renseignez les clés du projet
Supabase. Sans schéma appliqué (voir plus bas), le jeu démarre quand même et
sauvegarde en local : l'en-tête indique alors « sauvegarde locale ».

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (honore `PORT`) |
| `npm test` | Tests du domaine (Vitest) |
| `npm run lint` | Oxlint |
| `npm run build` | Vérification de types puis build |
| `npm run seed:sql` | Régénère le seed SQL du continent depuis `src/domain/continent.ts` |

## Les deux boucles

**Boucle macro — une journée.** Au camp, on choisit une mission parmi celles
qu'offrent les trois ascenseurs, ou on reste un jour de plus pour s'améliorer
(plus rapide et mieux estimé le lendemain, mais sans revenu). Au retour, la base
prélève sa taxe, la prime d'objectif tombe si l'objectif a été rempli, et les
crédits s'investissent en campement, capacités et connaissances. Chaque
amélioration a un effet mécanique réel : la Chambre avance le lever du soleil,
l'Escalade réduit la difficulté des montagnes, les Raccourcis fiabilisent les
estimations.

**Boucle micro — l'expédition.** On enchaîne déplacements et actions en touchant
la carte, tant que le planning laisse le temps de rentrer. Les durées affichées
sont des *estimations* : l'incertitude grandit avec l'heure et diminue avec le
niveau. Pendant la course, l'horloge tourne, des événements modifient les
contraintes, le planning reste modifiable — et si le temps restant devient
insuffisant, le retour s'enclenche tout seul.

## Architecture

```
src/domain/   Le jeu, en TypeScript pur. Aucune dépendance à React, Phaser
              ou Supabase. Déterministe : une journée rejouée depuis sa graine
              donne exactement le même résultat. C'est là que sont les tests.
src/game/     La carte Phaser : continent généré (terrain.ts, mapArt.ts) et la
              scène pilotée (MapScene.ts).
src/lib/      Identité, présence temps réel, et le dépôt de persistance.
src/state/    L'orchestrateur React : horloge, transitions d'écran, sauvegarde.
src/ui/       Les écrans : camp, planning, expédition, débriefing.
```

Deux frontières valent d'être connues :

- **`src/game/mapBridge.ts`** — React pousse une vue de l'état (zones, itinéraire,
  étape en cours, jetons) ; la scène s'y abonne et redessine son calque. Les
  touchers repartent dans l'autre sens. Aucun des deux côtés ne détient de
  référence sur l'autre, ce qui rend la scène démontable sans risque.
- **`src/domain/run.ts`** — la couture entre l'interface et la simulation : on
  donne une mission et la progression du joueur, on récupère de quoi jouer la
  journée (monde, fiche d'explorateur, RNG graine, règles de butin) et de quoi
  la solder.

Le temps de jeu est lu sur l'horloge murale, pas accumulé image par image : un
navigateur suspend les images d'une page en arrière-plan, et une journée qui
s'arrête quand on change d'onglet n'a plus d'enjeu.

## Base de données

Le schéma et les conventions sont décrits dans
[`supabase/README.md`](supabase/README.md).

```bash
supabase link --project-ref gdzoggpwxiekiiiefrjs
supabase db push
```

Tant que les migrations ne sont pas appliquées, `probeSupabase()` le détecte et
le jeu bascule sur un dépôt local (`localStorage`) plutôt que de refuser de
démarrer. Une fois appliquées, les zones et les actions sont lues dans les tables
du catalogue : le monde se retouche en base, sans livrer de client.

Le seed du continent est **généré** depuis `src/domain/continent.ts` — c'est la
source de vérité unique. `src/domain/continentSeed.test.ts` échoue si le SQL
commité et le catalogue divergent : après avoir touché aux zones ou aux actions,
lancez `npm run seed:sql` et commitez le résultat.

## Ce qui n'est pas encore là

Le schéma prévoit amis, groupes, chat par zone, échanges et missions coopératives
par candidature ; côté client, seuls la présence temps réel et un chat global
(en *broadcast*, sans historique) sont branchés. Les notifications asynchrones
restent à définir.
