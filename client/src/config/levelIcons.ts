import type { LevelIconEntry } from '../types/game';

export const DEFAULT_LEVEL_ICONS: LevelIconEntry[] = [
  { minLevel: 21, icon: '/assets/ui/lvl_ico1.png' },
  { minLevel: 36, icon: '/assets/ui/lvl_ico2.png' },
  { minLevel: 51, icon: '/assets/ui/lvl_ico3.png' },
  { minLevel: 66, icon: '/assets/ui/lvl_ico4.png' },
];

export const getLevelIcon = (level: number, icons: LevelIconEntry[] = DEFAULT_LEVEL_ICONS): string => {
  let icon = '/assets/ui/lvl_ico.png';
  for (const entry of icons) {
    if (level < entry.minLevel) break;
    icon = entry.icon;
  }
  return icon;
};
