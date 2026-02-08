export interface SetScore {
  team1: number;
  team2: number;
}

export interface Match {
  id: string;
  date: string;
  location?: string;
  team1: [string, string]; // player IDs
  team2: [string, string]; // player IDs
  sets: SetScore[];
  winnerId?: 1 | 2; // winning team number, computed
  createdAt: string;
}
