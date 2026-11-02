// Names shared by several screens, in every language.

import type { GarmentKind } from "../pattern/types.ts";
import { L, type Local } from "./lang.ts";

export const GARMENT_NAME: Record<GarmentKind, Local> = {
  shirt: L("셔츠", "Shirt", "Camisa"),
  "t-shirt": L("티셔츠", "T-shirt", "Camiseta"),
  hoodie: L("후드 집업", "Zip hoodie", "Sudadera con cremallera"),
  pants: L("고무줄 바지", "Elastic-waist trousers", "Pantalón de cintura elástica"),
  skirt: L("고무줄 스커트", "Elastic-waist skirt", "Falda de cintura elástica"),
  "eco-bag": L("에코백", "Tote bag", "Bolsa de tela"),
};
