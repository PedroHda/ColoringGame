import { useEffect } from "react";
import { AppState } from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AmbienceTheme } from "../../../packages/core/ambience";
const themes: Record<AmbienceTheme, number> = {
  earth: require("../assets/audio/earth.wav"),
  rivers: require("../assets/audio/rivers.wav"),
  workshop: require("../assets/audio/workshop.wav"),
  tomorrow: require("../assets/audio/tomorrow.wav"),
};
/** Offline procedural music and UI sound. Device speech has its own volume. */
export function useAmbience(
  music: number,
  effects: number,
  theme: AmbienceTheme,
) {
  const pad = useAudioPlayer(themes[theme]);
  const effect = useAudioPlayer(require("../assets/audio/discovery.wav"));
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);
  useEffect(() => {
    pad.loop = true;
    pad.volume = music;
    const apply = (state: string) => {
      try {
        if (state === "active" && music > 0) pad.play();
        else pad.pause();
      } catch {}
    };
    apply(AppState.currentState);
    const sub = AppState.addEventListener("change", apply);
    return () => {
      sub.remove();
      try {
        pad.pause();
      } catch {}
    };
  }, [pad, music]);
  useEffect(() => {
    effect.volume = effects;
  }, [effect, effects]);
  return () => {
    if (effects <= 0) return;
    void effect
      .seekTo(0)
      .then(() => effect.play())
      .catch(() => {});
  };
}
