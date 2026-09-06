-- The initial scaffold modelled a generic turn-based board (games / game_players /
-- moves). Explorateurs is not that game: there is no turn order, no shared board
-- session, and positions are continuous world coordinates rather than grid cells.
-- Drop the placeholder tables before laying down the real schema.

drop table if exists moves;
drop table if exists game_players;
drop table if exists games;

-- profiles is superseded by players, which carries identity *and* run-time state.
drop table if exists profiles cascade;
