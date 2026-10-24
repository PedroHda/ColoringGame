export const ambienceThemes = {
  earth: {
    title: "Terra e primeiras marcas",
    notes: [130.8128, 196, 261.6256],
  },
  rivers: {
    title: "Rios e encontros",
    notes: [146.8324, 220, 293.6648, 349.2282],
  },
  workshop: {
    title: "Oficinas e descobertas",
    notes: [164.8138, 246.9417, 329.6276],
  },
  tomorrow: {
    title: "Horizontes do amanhã",
    notes: [174.6141, 261.6256, 349.2282, 440],
  },
} as const;
export type AmbienceTheme = keyof typeof ambienceThemes;
export function ambienceForPath(pathId?: string | null): AmbienceTheme {
  const index = Number(pathId?.slice(-2)) || 1;
  return index <= 2
    ? "earth"
    : index <= 8
      ? "rivers"
      : index <= 12
        ? "workshop"
        : "tomorrow";
}
