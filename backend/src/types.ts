export type Hole = {
  number: number;
  par: number;
  distance: number;
}

export type Course = {
  name: string;
  holes: Hole[];
  distance: number;
}

export type HoleScore = {
  holeNumber: number;
  strokes: number;
}

export type Round = {
  playedAt: Date;
  scores: HoleScore[];
}

