import { Bug, Car, Droplets, Hammer, HardHat, House, Laptop, Leaf, PaintRoller, PawPrint, Snowflake, Sofa, SprayCan, Trees, Truck, Waves, Wrench, Zap, type LucideIcon } from 'lucide-react';

/** Icône de chaque métier (inscription, Mon métier). */
export const TRADE_ICON: Record<string, LucideIcon> = {
  exterieur: House, paysagement: Leaf, peinture: PaintRoller, menage: SprayCan, deneigement: Snowflake, renovation: Hammer, general: Wrench,
  plomberie: Droplets, electricite: Zap, toiture: HardHat, piscine: Waves, arboriculture: Trees, extermination: Bug, demenagement: Truck,
  tapis: Sofa, auto: Car, informatique: Laptop, toilettage: PawPrint,
};
