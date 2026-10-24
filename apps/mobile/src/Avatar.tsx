import React from "react";
import Svg, {
  Circle,
  Ellipse,
  Path,
  Rect,
  G,
  Image as SvgImage,
  Defs,
  Mask,
  SvgXml,
} from "react-native-svg";
import { clothingXml } from "../../../packages/core/clothing-art";
import type { Player } from "../../../packages/core";
const shirtPath =
  "M170 82 L215 64 Q256 94 297 64 L342 82 L421 162 L368 218 L335 190 L345 439 L167 439 L177 190 L144 218 L91 162 Z";
export default function Avatar({
  player,
  previews,
  equipmentAssets = {},
  size = 160,
}: {
  player: Player;
  previews: Record<string, string>;
  equipmentAssets?: Record<string, string>;
  size?: number;
}) {
  const shirt = previews[player.equipped.shirt],
    hat = previews[player.equipped.hat],
    bag = previews[player.equipped.bag];
  const shirtAsset =
    equipmentAssets[player.equipped.shirt] ?? "/clothing/shirt.svg";
  const cape = shirtAsset === "/clothing/cape.svg";
  const hair =
    player.hair === "bald"
      ? null
      : player.hair === "short"
        ? "M184 102 Q185 47 256 47 Q327 47 328 107 L304 86 Q256 106 207 79 Z"
        : player.hair === "straight" || player.hair === "long"
          ? "M184 118 Q177 38 256 38 Q338 38 330 128 L306 74 Q252 109 198 80 Z"
          : "M179 116 Q165 83 189 72 Q181 47 211 46 Q223 20 250 36 Q281 19 299 44 Q334 41 333 70 Q354 89 330 120 L308 83 Q262 110 199 83 Z";
  return (
    <Svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 512 570"
      accessibilityLabel={`Personagem de ${player.name}`}
    >
      <Defs>
        {(["shirt", "hat", "bag"] as const).map((slot) => (
          <Mask
            key={slot}
            id={`paint-${slot}`}
            maskType="alpha"
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={512}
            height={512}
          >
            <SvgXml
              xml={
                clothingXml[
                  equipmentAssets[player.equipped[slot]] ??
                    `/clothing/${slot}.svg`
                ]
              }
              width={512}
              height={512}
            />
          </Mask>
        ))}
      </Defs>
      <Ellipse
        cx={256}
        cy={529}
        rx={136}
        ry={20}
        fill="#5C4C35"
        opacity={0.12}
      />
      <Path
        d="M214 421 L210 500 L246 500 L255 427 M271 426 L272 500 L307 500 L298 420"
        fill={player.outfit === "dress" ? "#AC795E" : "#827D65"}
        stroke="#493B2C"
        strokeWidth={7}
      />
      <Path
        d={
          player.shoes === "sandals"
            ? "M203 494 L247 494 L249 514 L199 514 Z M272 494 L312 494 L322 514 L270 514 Z"
            : "M209 470 L246 470 L249 515 L192 515 L192 501 L207 494 Z M272 470 L306 470 L309 494 L324 501 L324 515 L270 515 Z"
        }
        fill={player.shoes === "sandals" ? "#B39069" : "#5D4432"}
        stroke="#493B2C"
        strokeWidth={6}
      />
      <Path
        d="M193 226 Q157 279 168 354 L192 346 L216 252 M317 226 Q354 280 343 354 L319 346 L299 252"
        fill={player.skin}
        stroke="#493B2C"
        strokeWidth={6}
      />
      <G transform="translate(95 159) scale(.63)">
        <Path
          d={shirtPath}
          fill={player.outfit === "coat" ? "#6D7C69" : "#C59761"}
          stroke="#493B2C"
          strokeWidth={7}
        />
        {shirt && !cape && (
          <G mask="url(#paint-shirt)">
            <SvgImage href={shirt} x={0} y={0} width={512} height={512} />
          </G>
        )}
      </G>
      {shirt && cape && (
        <G transform="translate(95 22) scale(.63 .84)" mask="url(#paint-shirt)">
          <SvgImage href={shirt} x={0} y={0} width={512} height={512} />
        </G>
      )}
      {player.outfit === "dress" && (
        <Path
          d="M207 352 L305 352 L330 475 Q256 494 182 475 Z"
          fill="#C59761"
          stroke="#493B2C"
          strokeWidth={6}
        />
      )}
      {player.outfit === "coat" && (
        <Path
          d="M254 218 L254 431 M265 270 L273 270 M265 302 L273 302 M265 334 L273 334"
          stroke="#493B2C"
          strokeWidth={5}
          fill="none"
        />
      )}
      {player.hair === "long" && (
        <Path
          d="M179 230 L179 99 Q179 32 256 32 Q334 32 334 99 L339 230 L308 227 L305 116 L207 116 L205 227 Z"
          fill={player.hairColor}
          stroke="#493B2C"
          strokeWidth={6}
        />
      )}
      <Rect
        x={236}
        y={178}
        width={40}
        height={42}
        rx={10}
        fill={player.skin}
        stroke="#493B2C"
        strokeWidth={5}
      />
      <Ellipse
        cx={256}
        cy={127}
        rx={player.face === "oval" ? 65 : 73}
        ry={player.face === "oval" ? 86 : 76}
        fill={player.skin}
        stroke="#493B2C"
        strokeWidth={6}
      />
      {hair && (
        <Path
          d={hair}
          fill={player.hairColor}
          stroke="#493B2C"
          strokeWidth={6}
        />
      )}
      <Circle cx={230} cy={126} r={6} fill="#3A302A" />
      <Circle cx={282} cy={126} r={6} fill="#3A302A" />
      <Path
        d="M255 131 L249 151 L260 151"
        fill="none"
        stroke="#7A5141"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {player.expression === "surprise" ? (
        <Circle cx={256} cy={170} r={10} fill="#704734" />
      ) : (
        <Path
          d={
            player.expression === "serene" || player.expression === "calm"
              ? "M239 166 Q255 171 272 166"
              : "M235 163 Q256 187 278 163"
          }
          fill="none"
          stroke="#704734"
          strokeWidth={5}
          strokeLinecap="round"
        />
      )}
      {player.accessory === "glasses" && (
        <G fill="none" stroke="#493B2C" strokeWidth={5}>
          <Circle cx={230} cy={128} r={18} />
          <Circle cx={282} cy={128} r={18} />
          <Path d="M248 128 L264 128 M212 122 L193 117 M300 122 L319 117" />
        </G>
      )}
      {(player.accessory === "hat" || hat) && (
        <G transform="translate(143 -22) scale(.44)">
          {hat ? (
            <G mask="url(#paint-hat)">
              <SvgImage href={hat} x={0} y={0} width={512} height={512} />
            </G>
          ) : (
            <Path
              d="M121 289 L159 124 Q256 78 353 124 L391 289 Q443 299 443 329 Q256 401 69 329 Q69 299 121 289 Z"
              fill="#D3AD69"
              stroke="#493B2C"
              strokeWidth={8}
            />
          )}
        </G>
      )}
      {(player.accessory === "bag" || bag) && (
        <G transform="translate(224 268) scale(.28)">
          {bag ? (
            <G mask="url(#paint-bag)">
              <SvgImage href={bag} x={0} y={0} width={512} height={512} />
            </G>
          ) : (
            <Path
              d="M122 164 L390 164 L420 445 L92 445 Z"
              fill="#7D5E44"
              stroke="#493B2C"
              strokeWidth={8}
            />
          )}
        </G>
      )}
    </Svg>
  );
}
