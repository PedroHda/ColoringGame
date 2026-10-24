import type { Player } from "./index";

export type ClothingSlot = "shirt" | "hat" | "bag";
export interface ClothingItem {
  id: string;
  slot: ClothingSlot;
  title: string;
  asset: string;
  unlockPath?: string;
}
export const wardrobe: ClothingItem[] = [
  {
    id: "shirt",
    slot: "shirt",
    title: "Camiseta",
    asset: "/clothing/shirt.svg",
  },
  {
    id: "hat",
    slot: "hat",
    title: "Chapéu de artista",
    asset: "/clothing/hat.svg",
  },
  {
    id: "bag",
    slot: "bag",
    title: "Bolsa de viagem",
    asset: "/clothing/bag.svg",
  },
  {
    id: "fiber-hat",
    slot: "hat",
    title: "Chapéu de fibras",
    asset: "/clothing/fiber-hat.svg",
    unlockPath: "path-02",
  },
  {
    id: "cape",
    slot: "shirt",
    title: "Capa de viajante",
    asset: "/clothing/cape.svg",
    unlockPath: "path-07",
  },
  {
    id: "explorer-hat",
    slot: "hat",
    title: "Chapéu de navegação",
    asset: "/clothing/explorer-hat.svg",
    unlockPath: "path-08",
  },
  {
    id: "apron",
    slot: "shirt",
    title: "Avental de oficina",
    asset: "/clothing/apron.svg",
    unlockPath: "path-09",
  },
  {
    id: "workshop-bag",
    slot: "bag",
    title: "Bolsa de ferramentas",
    asset: "/clothing/workshop-bag.svg",
    unlockPath: "path-11",
  },
  {
    id: "future-jacket",
    slot: "shirt",
    title: "Casaco de reuso",
    asset: "/clothing/future-jacket.svg",
    unlockPath: "path-15",
  },
];
export const clothingByAsset = (asset: string) =>
  wardrobe.find((item) => item.asset === asset);
export const isClothingUnlocked = (player: Player, item: ClothingItem) =>
  !item.unlockPath || player.rewards.includes(`path:${item.unlockPath}`);
