import catalog from './catalog.json';

export type Stage = {
  id: string;
  pathId: string;
  index: number;
  title: string;
  intro: string;
  outro: string;
  asset: string | null;
  width: number;
  height: number;
  resolutionStatus?: string;
  legacyId?: string;
};

export type HistoricalPath = {
  id: string;
  index: number;
  title: string;
  era: string;
  intro: string;
  outro: string;
  reward: string;
  palette: string[];
  stages: Stage[];
};

/** Only stages whose source illustration passed asset validation have a URL. */
export const paths: HistoricalPath[] = catalog.paths;
export const stages: Stage[] = paths.flatMap((path) => path.stages);
export const availableStages = stages.filter((stage) => stage.asset !== null);
export const stageById = (id: string) => stages.find((stage) => stage.id === id);
export const pathById = (id: string) => paths.find((path) => path.id === id);
