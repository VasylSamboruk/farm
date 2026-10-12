import React from 'react';
import type { GameItemConfig } from '../../types/game';

interface AdminAppearanceAnimationProps {
  value: NonNullable<GameItemConfig['appearanceAnimation']>;
  onChange: (value: NonNullable<GameItemConfig['appearanceAnimation']>) => void;
}

export const AdminAppearanceAnimation: React.FC<AdminAppearanceAnimationProps> = ({ value, onChange }) => (
  <label className="admin-appearance-animation">
    Анімація оформлення
    <select value={value} onChange={(event) => onChange(event.target.value as NonNullable<GameItemConfig['appearanceAnimation']>)}>
      <option value="none">Вимкнена</option>
      <option value="snow">Сніг</option>
      <option value="blizzard">Завірюха</option>
    </select>
    <small>Ефект відображається поверх ферми для гравців із цим оформленням.</small>
  </label>
);
