import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import Slider from "@react-native-community/slider";
import Svg, {
  Path,
  Circle,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    [r, g, b]
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}
export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(
      (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    ),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const h = !delta
    ? 0
    : max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [(h * 60 + 360) % 360, max ? delta / max : 0, max];
}
export function Control({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <View style={styles.control}>
      <Text style={styles.label}>
        {label} · {Math.round(max === 1 ? value * 100 : value)}
      </Text>
      <Slider
        accessibilityLabel={label}
        minimumValue={min}
        maximumValue={max}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#9A5D44"
        maximumTrackTintColor="#D7C9AF"
        thumbTintColor="#9A5D44"
      />
    </View>
  );
}
export default function ColorPanel({
  color,
  onChange,
  history,
  favorites,
  onFavorite,
}: {
  color: string;
  onChange: (color: string) => void;
  history: string[];
  favorites: string[][];
  onFavorite: () => void;
}) {
  const [h, s, v] = hexToHsv(color);
  const [input, setInput] = useState(color);
  const choose = (newColor: string) => {
    setInput(newColor);
    onChange(newColor);
  };
  const touch = (x: number, y: number) => {
    const dx = x - 110,
      dy = y - 110;
    choose(
      hsvToHex(
        ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
        Math.min(1, Math.hypot(dx, dy) / 108),
        v || 1,
      ),
    );
  };
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Todas as cores</Text>
      <View
        style={styles.wheel}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) =>
          touch(e.nativeEvent.locationX, e.nativeEvent.locationY)
        }
        onResponderMove={(e) =>
          touch(e.nativeEvent.locationX, e.nativeEvent.locationY)
        }
        accessibilityLabel="Círculo HSV. Use também os controles RGB e hexadecimal abaixo."
      >
        <Svg width={220} height={220}>
          <Defs>
            <RadialGradient id="white">
              <Stop offset="0" stopColor="white" stopOpacity={1} />
              <Stop offset="1" stopColor="white" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {Array.from({ length: 90 }, (_, i) => {
            const a = (i * 4 * Math.PI) / 180,
              b = ((i * 4 + 4.2) * Math.PI) / 180;
            return (
              <Path
                key={i}
                d={`M110 110 L${110 + 108 * Math.cos(a)} ${110 + 108 * Math.sin(a)} A108 108 0 0 1 ${110 + 108 * Math.cos(b)} ${110 + 108 * Math.sin(b)} Z`}
                fill={hsvToHex(i * 4, 1, 1)}
              />
            );
          })}
          <Circle cx={110} cy={110} r={108} fill="url(#white)" />
          <Circle cx={110} cy={110} r={108} fill="black" opacity={1 - v} />
          <Circle
            cx={110 + Math.cos((h * Math.PI) / 180) * s * 108}
            cy={110 + Math.sin((h * Math.PI) / 180) * s * 108}
            r={7}
            fill={color}
            stroke="white"
            strokeWidth={3}
          />
        </Svg>
      </View>
      <Control
        label="Luminosidade"
        value={v}
        onChange={(value) => choose(hsvToHex(h, s, value))}
      />
      <Control
        label="Saturação"
        value={s}
        onChange={(value) => choose(hsvToHex(h, value, v))}
      />
      <View style={styles.row}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <TextInput
          accessibilityLabel="Cor hexadecimal"
          value={input}
          style={styles.input}
          autoCapitalize="characters"
          maxLength={7}
          onChangeText={(value) => {
            setInput(value);
            if (/^#[0-9A-F]{6}$/i.test(value)) onChange(value.toUpperCase());
          }}
          onEndEditing={() => setInput(color)}
        />
      </View>
      {["Vermelho", "Verde", "Azul"].map((label, index) => (
        <Control
          key={label}
          label={`${label} RGB`}
          min={0}
          max={255}
          value={rgb[index]}
          onChange={(value) => {
            const next = [...rgb];
            next[index] = Math.round(value);
            choose(
              "#" +
                next
                  .map((n) => n.toString(16).padStart(2, "0"))
                  .join("")
                  .toUpperCase(),
            );
          }}
        />
      ))}
      <Text style={styles.label}>Cores recentes</Text>
      <View style={styles.row}>
        {history.map((c) => (
          <Pressable
            key={c}
            accessibilityLabel={`Escolher ${c}`}
            onPress={() => choose(c)}
            style={[styles.swatch, { backgroundColor: c }]}
          />
        ))}
      </View>
      <Pressable style={styles.button} onPress={onFavorite}>
        <Text>Guardar paleta atual</Text>
      </Pressable>
      {favorites.map((palette, index) => (
        <View key={index} style={styles.row}>
          {palette.map((c, i) => (
            <Pressable
              key={`${c}-${i}`}
              accessibilityLabel={`Favorita ${c}`}
              onPress={() => choose(c)}
              style={[styles.swatch, { backgroundColor: c }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 16, gap: 8 },
  title: { color: "#493B2C", fontSize: 21, fontWeight: "700" },
  label: { color: "#665744", fontSize: 13 },
  control: { gap: 2 },
  wheel: { width: 220, height: 220, alignSelf: "center", marginVertical: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B5A68D",
  },
  input: {
    borderWidth: 1,
    borderColor: "#C9BA9F",
    borderRadius: 8,
    padding: 10,
    minWidth: 120,
    color: "#493B2C",
  },
  button: { padding: 12, backgroundColor: "#EBDEC3", borderRadius: 10 },
});
