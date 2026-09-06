# Base de données Expedition

Projet Supabase : `gdzoggpwxiekiiiefrjs` (auth anonyme activée, historique de migrations initialisé).

Appliquer les migrations :

```
supabase link --project-ref gdzoggpwxiekiiiefrjs
supabase db push
```

Nouvelle migration : `supabase migration new <nom>`, puis `supabase db push`.

## Schéma

Le plateau générique du scaffold (`games` / `game_players` / `moves`) a été supprimé :
Explorateurs n'a ni tour de jeu ni partie partagée, et les positions sont des
coordonnées continues sur un continent généré.

| Table | Rôle |
|---|---|
| `players` | Une ligne par utilisateur auth (anonyme inclus). Identité, position monde, zone courante, statut, niveau/XP/crédits. Créée automatiquement par un trigger sur `auth.users`. |
| `zones` | Zones nommées du continent : type (base, forêt, montagne…), centre + rayon, publique ou non, ascenseur, danger. |
| `player_zone_discoveries` | Ce que *ce* joueur a découvert — la carte est grisée par défaut. |
| `upgrades` / `player_upgrades` | Catalogue campement / capacités / connaissances, et le niveau atteint par joueur. |
| `items` / `player_inventory` | Catalogue de matériel et ressources, et ce que chaque joueur porte (privé). |
| `actions` | Actions contextuelles et types de zones où elles sont proposées. |
| `expeditions` | Une journée sur le continent : organisateur, zone cible, départ, couvre-feu, taxe, taille d'équipage. |
| `expedition_members` | Équipage et candidatures (`applied` → `accepted` → `aboard` → `returned`), plus le règlement du butin au retour. |
| `expedition_steps` | Le planning : enchaînement `move` / `action` / `return`, durées estimées et marge d'erreur, statut d'exécution. |
| `events` | Flux append-only : rencontres, filons, croisements de groupe, alertes couvre-feu. Sert d'historique de rattrapage au retour en ligne. |
| `friendships` | Demandes d'amis dirigées, symétriques une fois acceptées. |
| `groups` / `group_members` | Groupes avec code d'invitation partagé. |
| `chat_messages` | Chat global, par zone ou par groupe. |
| `trades` / `trade_items` | Transfert de matériel entre deux joueurs, en base ou en expédition. |

## Conventions

- **RLS partout**, plus des `grant` explicites : les nouvelles tables de `public`
  ne sont plus exposées automatiquement à l'API.
- Les positions et les profils sont publics (la carte vivante en dépend) ;
  l'inventaire, le planning et les événements sont privés — sauf le planning,
  visible par les membres du même groupe (`shares_group_with`).
- Les policies qui interrogent la table qu'elles protègent passent par une
  fonction `security definer` (`is_group_member`, `is_expedition_member`,
  `can_access_trade`) pour éviter la récursion.
- États et types en `text` + `check`, comme le reste du schéma.
- Realtime activé sur `players`, `events`, `chat_messages`, `group_members`,
  `friendships`, `trades`, `trade_items`, `expedition_members`, `expedition_steps`.
