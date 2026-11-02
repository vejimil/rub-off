// Names shared by several screens, in every language.

import type { GarmentKind } from "../pattern/types.ts";
import { L, type Local } from "./lang.ts";

// In the order the garment picker shows them: tops, bottoms, then things that aren't worn.
export const GARMENT_NAME: Record<GarmentKind, Local> = {
  "t-shirt": L("티셔츠", "T-shirt", "Camiseta"),
  "long-sleeve": L("긴팔 티셔츠", "Long-sleeve T-shirt", "Camiseta de manga larga"),
  sweatshirt: L("맨투맨", "Sweatshirt", "Sudadera"),
  dress: L("티셔츠 원피스", "T-shirt dress", "Vestido camiseta"),
  shirt: L("셔츠", "Shirt", "Camisa"),
  hoodie: L("후드 집업", "Zip hoodie", "Sudadera con cremallera"),
  pants: L("고무줄 바지", "Elastic-waist trousers", "Pantalón de cintura elástica"),
  skirt: L("고무줄 스커트", "Elastic-waist skirt", "Falda de cintura elástica"),
  "a-line-skirt": L("A라인 스커트", "A-line skirt", "Falda en A"),
  "eco-bag": L("에코백", "Tote bag", "Bolsa de tela"),
  apron: L("앞치마", "Apron", "Delantal"),
  cushion: L("쿠션 커버", "Cushion cover", "Funda de cojín"),
  pouch: L("지퍼 파우치", "Zip pouch", "Neceser con cremallera"),
};
