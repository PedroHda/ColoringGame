import {
  ambienceThemes,
  type AmbienceTheme,
} from "../../../packages/core/ambience";
let audio: AudioContext | null = null,
  ambient: OscillatorNode[] = [];
const context = () => audio ?? (audio = new AudioContext());
export function sound(volume: number, kind: "tap" | "reward" = "tap") {
  if (volume <= 0) return;
  try {
    const a = context();
    void a.resume();
    const o = a.createOscillator(),
      g = a.createGain();
    o.type = "sine";
    o.frequency.value = kind === "reward" ? 660 : 330;
    g.gain.setValueAtTime(volume * 0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.35);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.4);
  } catch {}
}
export function resumeAudio() {
  if (audio) void audio.resume().catch(() => {});
}
export function music(volume: number, theme: AmbienceTheme = "earth") {
  for (const o of ambient) {
    try {
      o.stop();
    } catch {}
  }
  ambient = [];
  if (volume <= 0) return;
  try {
    const a = context();
    void a.resume();
    for (const hz of ambienceThemes[theme].notes) {
      const o = a.createOscillator(),
        g = a.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.value = volume * 0.012;
      o.connect(g).connect(a.destination);
      o.start();
      ambient.push(o);
    }
  } catch {}
}
export function narrate(text: string, volume: number) {
  if (!("speechSynthesis" in window)) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 0.92;
  utterance.volume = volume;
  speechSynthesis.speak(utterance);
  return true;
}
