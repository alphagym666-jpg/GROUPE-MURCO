import {
  Brush, Circle, ClipboardList, Droplets, Fence, Hammer, HardHat, House, Leaf, Lightbulb, Paintbrush, Ruler, Shovel, Siren, Snowflake, Sparkles, SprayCan,
  Thermometer, Trees, Truck, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

/** Icônes offertes pour les types de jobs (sobres, cohérentes avec le reste de l'app). */
export const JOB_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, droplets: Droplets, spray: SprayCan, brush: Brush, wrench: Wrench, hammer: Hammer, hardhat: HardHat, ruler: Ruler,
  clipboard: ClipboardList, siren: Siren, zap: Zap, lightbulb: Lightbulb, paint: Paintbrush, house: House, fence: Fence, leaf: Leaf,
  trees: Trees, shovel: Shovel, snowflake: Snowflake, thermometer: Thermometer, truck: Truck, circle: Circle,
};

export const jobIcon = (key?: string): LucideIcon => (key && JOB_ICONS[key]) || Circle;
