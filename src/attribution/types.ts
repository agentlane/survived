export type Confidence = 'high' | 'estimated';

export type DetectorName = 'trailer' | 'notes' | 'author' | 'heuristic';

export interface Attribution {
  commit: string;
  source: DetectorName;
  confidence: Confidence;
  /** Detected tool (from the matched marker), or null when unknown. */
  tool: string | null;
}
