import { useId } from "react";
import type { Player } from "../../../packages/core/index";
import { clothingBody } from "../../../packages/core/clothing-art";
export function Avatar({
  player,
  shirt,
  hat,
  bag,
  equipmentAssets = {},
  className = "",
}: {
  player: Player;
  shirt?: string;
  hat?: string;
  bag?: string;
  equipmentAssets?: Record<string, string>;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const shirtAsset =
    equipmentAssets[player.equipped.shirt] ?? "/clothing/shirt.svg";
  const cape = shirtAsset === "/clothing/cape.svg";
  const shirtBox = cape
    ? { x: 18, y: 5, width: 220, height: 290 }
    : { x: -12, y: 90, width: 280, height: 210 };
  const hatBox = { x: 35, y: -30, width: 186, height: 170 };
  const bagBox = { x: 140, y: 195, width: 82, height: 90 };
  return (
    <svg
      className={`avatar ${className}`}
      viewBox="0 0 256 320"
      role="img"
      aria-label={`Personagem de ${player.name}`}
    >
      <defs>
        {[
          { slot: "shirt", asset: shirtAsset, box: shirtBox },
          {
            slot: "hat",
            asset: equipmentAssets[player.equipped.hat] ?? "/clothing/hat.svg",
            box: hatBox,
          },
          {
            slot: "bag",
            asset: equipmentAssets[player.equipped.bag] ?? "/clothing/bag.svg",
            box: bagBox,
          },
        ].map(({ slot, asset, box }) => (
          <mask
            key={slot}
            id={`${slot}${id}`}
            maskUnits="userSpaceOnUse"
            x="0"
            y="-40"
            width="256"
            height="360"
            style={{ maskType: "alpha" }}
          >
            <g
              transform={`translate(${box.x} ${box.y}) scale(${box.width / 512} ${box.height / 512})`}
              dangerouslySetInnerHTML={{ __html: clothingBody[asset] ?? "" }}
            />
          </mask>
        ))}
      </defs>
      <ellipse cx="128" cy="301" rx="66" ry="9" fill="#3D433315" />
      <path
        d="M91 253L91 288M165 253L165 288"
        stroke="#5D695B"
        strokeWidth="29"
      />
      <path
        d="M91 289L77 294M165 289L179 294"
        stroke={player.shoes === "sandals" ? "#B18B60" : "#4A3B2B"}
        strokeWidth="23"
        strokeLinecap="round"
      />
      <path
        d="M64 173L60 215M192 173L196 215"
        stroke={player.skin}
        strokeWidth="20"
        strokeLinecap="round"
      />
      <path
        d="M76 136L106 125Q128 145 150 125L180 136L211 174L186 196L173 179L177 269H79L83 179L70 196L45 174Z"
        fill={
          player.outfit === "coat"
            ? "#B78A54"
            : player.outfit === "dress"
              ? "#A8838F"
              : "#E4C98E"
        }
        stroke="#554932"
        strokeWidth="2"
      />
      {shirt && (
        <image
          href={shirt}
          {...shirtBox}
          mask={`url(#shirt${id})`}
          preserveAspectRatio="none"
        />
      )}
      {player.outfit === "coat" && (
        <path
          d="M128 143V269M105 138L128 174L150 138"
          fill="none"
          stroke="#6C583C"
          strokeWidth="2"
        />
      )}
      <path d="M113 112V137Q128 149 143 137V112" fill={player.skin} />
      <ellipse
        cx="128"
        cy="82"
        rx={player.face === "oval" ? 38 : 43}
        ry={player.face === "oval" ? 48 : 44}
        fill={player.skin}
        stroke="#5C4535"
        strokeWidth="1.5"
      />
      {player.hair !== "bald" && (
        <path
          d={
            player.hair === "short"
              ? "M85 76Q80 28 129 30Q180 25 173 75L153 55L112 57Z"
              : player.hair === "long" || player.hair === "straight"
                ? "M82 139L79 66Q80 23 128 28Q177 24 180 66L180 139L159 118L162 59L126 52L93 65L96 120Z"
                : "M84 79Q68 61 84 49Q78 30 101 30Q107 15 128 26Q147 15 158 30Q181 27 178 48Q194 61 173 79L160 57Q126 73 96 56Z"
          }
          fill={player.hairColor}
        />
      )}
      <path
        d="M105 79h10M142 79h10"
        stroke="#3E3029"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="111" cy="87" r="2.7" fill="#342B27" />
      <circle cx="147" cy="87" r="2.7" fill="#342B27" />
      <path
        d={
          player.expression === "calm" || player.expression === "serene"
            ? "M118 108H139"
            : player.expression === "surprise"
              ? "M124 106Q128 99 133 106Q137 115 128 116Q121 114 124 106"
              : "M116 103Q128 117 141 103"
        }
        fill={player.expression === "surprise" ? "#7B4936" : "none"}
        stroke="#704937"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {player.accessory === "glasses" && (
        <g fill="none" stroke="#604A35" strokeWidth="2">
          <circle cx="111" cy="87" r="11" />
          <circle cx="147" cy="87" r="11" />
          <path d="M122 87H136" />
        </g>
      )}
      {(player.accessory === "hat" || hat) && (
        <g>
          {!hat && (
            <path
              d="M75 83Q68 20 128 20Q188 20 181 83L211 91Q128 114 45 91Z"
              fill="#CBA56D"
              stroke="#5B4933"
              strokeWidth="2"
            />
          )}
          {hat && (
            <image
              href={hat}
              {...hatBox}
              preserveAspectRatio="none"
              mask={`url(#hat${id})`}
            />
          )}
        </g>
      )}
      {(player.accessory === "bag" || bag) && (
        <g>
          <path d="M97 136L174 244" stroke="#665039" strokeWidth="7" />
          {!bag && (
            <rect
              x="156"
              y="215"
              width="47"
              height="57"
              rx="10"
              fill="#A07950"
              stroke="#55422E"
              strokeWidth="2"
            />
          )}
          {bag && (
            <image
              href={bag}
              {...bagBox}
              preserveAspectRatio="none"
              mask={`url(#bag${id})`}
            />
          )}
        </g>
      )}
    </svg>
  );
}
