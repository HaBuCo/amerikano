export type MatchResult = {
  id?: number;
  score: number;
  place: number;
  playerCount: number;
  won: boolean;
  createdAt: string;
};

export type SinglePlayerStats = {
  gamesPlayed: number;
  wins: number;
  scoreTotal: number;
  bestScore: number | null;
  bestWinningScore: number | null;
};

export const EMPTY_SINGLE_PLAYER_STATS: SinglePlayerStats = {
  gamesPlayed: 0,
  wins: 0,
  scoreTotal: 0,
  bestScore: null,
  bestWinningScore: null,
};

export function basicRecord(gamesPlayed: number, wins: number) {
  const games = Math.max(0, Math.floor(gamesPlayed) || 0);
  const victories = Math.min(games, Math.max(0, Math.floor(wins) || 0));
  return {
    gamesPlayed: games,
    wins: victories,
    losses: games - victories,
    winRate: games ? Math.round((victories / games) * 100) : 0,
  };
}

export function summarizeMatches(results: MatchResult[]) {
  if (!results.length) return { trackedMatches: 0, averageScore: null, bestScore: null, bestWinningScore: null, podiums: 0 };
  const scores = results.map(result => Math.max(0, result.score));
  const winningScores = results.filter(result => result.won).map(result => Math.max(0, result.score));
  return {
    trackedMatches: results.length,
    averageScore: Math.round(scores.reduce((total, score) => total + score, 0) / scores.length),
    bestScore: Math.min(...scores),
    bestWinningScore: winningScores.length ? Math.min(...winningScores) : null,
    podiums: results.filter(result => result.place <= Math.min(3, result.playerCount)).length,
  };
}

export function addSinglePlayerResult(current: SinglePlayerStats, score: number, won: boolean): SinglePlayerStats {
  const safeScore = Math.max(0, Math.floor(score) || 0);
  return {
    gamesPlayed: current.gamesPlayed + 1,
    wins: current.wins + (won ? 1 : 0),
    scoreTotal: current.scoreTotal + safeScore,
    bestScore: current.bestScore === null ? safeScore : Math.min(current.bestScore, safeScore),
    bestWinningScore: won
      ? current.bestWinningScore === null ? safeScore : Math.min(current.bestWinningScore, safeScore)
      : current.bestWinningScore,
  };
}
