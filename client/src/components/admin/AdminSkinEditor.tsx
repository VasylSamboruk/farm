import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ItemSkin } from '../../types/game';
import { AdminImageUrlInput } from './AdminImageUrlInput';
import { formatGameDuration } from '../../game/trees';

interface AdminSkinEditorProps {
  type: 'TREE' | 'ANIMAL';
  enabled: boolean;
  skins: ItemSkin[];
  assetBaseUrl: string;
  productionTimeMs?: number | null;
  onEnabledChange: (enabled: boolean) => void;
  onSkinsChange: (skins: ItemSkin[]) => void;
}

const makeSkinId = (name: string, fallback: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || fallback;

export const AdminSkinEditor: React.FC<AdminSkinEditorProps> = ({
  type,
  enabled,
  skins,
  assetBaseUrl,
  productionTimeMs,
  onEnabledChange,
  onSkinsChange,
}) => {
  const imageLabels = type === 'TREE'
    ? ['Скін дерева до плодів', 'Скін дерева з плодами']
    : ['Зображення скіна тварини'];

  const updateSkin = (index: number, changes: Partial<ItemSkin>) => {
    onSkinsChange(skins.map((skin, skinIndex) => skinIndex === index ? { ...skin, ...changes } : skin));
  };

  return (
    <section className="admin-skin-editor">
      <header className="admin-skin-editor-heading">
        <div><strong>Скіни предмета</strong><span>{type === 'TREE' ? 'Для дерева потрібні два стани: до плодів і з плодами.' : 'Для тварини потрібне одне зображення.'}</span></div>
        <label className="admin-check-field"><input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />Увімкнути</label>
      </header>
      {enabled && <>
        {skins.map((skin, index) => (
          <article className="admin-skin-card" key={skin.id || `skin-${index}`}>
            <header><strong>Скін {index + 1}</strong><button type="button" onClick={() => onSkinsChange(skins.filter((_, skinIndex) => skinIndex !== index))} aria-label={`Видалити скін ${index + 1}`}><Trash2 size={15} /></button></header>
            <div className="admin-skin-fields">
              <label>Назва<input value={skin.name} maxLength={80} onChange={(event) => updateSkin(index, { name: event.target.value, id: makeSkinId(event.target.value, `skin_${index + 1}`) })} placeholder="Золотиста" /></label>
              <label>ID скіна<input value={skin.id} maxLength={40} onChange={(event) => updateSkin(index, { id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') })} placeholder="golden" /></label>
              <label>Ціна<input type="number" min="0" max="1000000000" step="1" value={skin.price} onChange={(event) => updateSkin(index, { price: Number(event.target.value) })} /></label>
              <label>Валюта<select value={skin.priceCurrency ?? 'coins'} onChange={(event) => updateSkin(index, { priceCurrency: event.target.value as ItemSkin['priceCurrency'] })}><option value="coins">Монети</option><option value="rubies">Рубіни</option></select></label>
              <label>Рідкість<select value={skin.rarity ?? 'common'} onChange={(event) => updateSkin(index, { rarity: event.target.value as NonNullable<ItemSkin['rarity']> })}><option value="common">Звичайний</option><option value="rare">Рідкісний</option><option value="exclusive">Ексклюзивний</option></select></label>
              <AdminImageUrlInput
                className="admin-skin-image-field"
                label="Зображення в магазині"
                value={skin.shopImage ?? ''}
                assetBaseUrl={assetBaseUrl}
                onChange={(shopImage) => updateSkin(index, { shopImage })}
              />
              {imageLabels.map((label, imageIndex) => (
                <AdminImageUrlInput
                  key={`${skin.id}-${imageIndex}`}
                  className="admin-skin-image-field"
                  label={label}
                  value={skin.images[imageIndex] ?? ''}
                  assetBaseUrl={assetBaseUrl}
                  onChange={(value) => updateSkin(index, {
                    images: imageLabels.map((_, currentIndex) => currentIndex === imageIndex ? value : skin.images[currentIndex] ?? ''),
                  })}
                />
              ))}
            </div>
            <div className="admin-skin-bonus-control">
              <label><input
                type="checkbox"
                checked={skin.productionTimeBonus?.enabled ?? false}
                onChange={(event) => updateSkin(index, {
                  productionTimeBonus: {
                    enabled: event.target.checked,
                    reductionPercent: skin.productionTimeBonus?.reductionPercent ?? 10,
                  },
                })}
              />Скорочувати час до врожаю</label>
              <label className="admin-skin-bonus-percent">Скорочення
                <span><input
                  type="number"
                  min="1"
                  max="90"
                  step="1"
                  value={skin.productionTimeBonus?.reductionPercent ?? 10}
                  onChange={(event) => updateSkin(index, {
                    productionTimeBonus: {
                      enabled: skin.productionTimeBonus?.enabled ?? false,
                      reductionPercent: Number(event.target.value),
                    },
                  })}
                />%</span>
              </label>
            </div>
            {skin.productionTimeBonus?.enabled && Number.isFinite(productionTimeMs) &&
              Number.isSafeInteger(skin.productionTimeBonus.reductionPercent) &&
              skin.productionTimeBonus.reductionPercent >= 1 && skin.productionTimeBonus.reductionPercent <= 90 && (
                <p className="admin-skin-time-preview">
                  Цикл збору: {formatGameDuration(productionTimeMs ?? 0)} → {formatGameDuration((productionTimeMs ?? 0) * (100 - skin.productionTimeBonus.reductionPercent) / 100)}
                  <span>Економія {formatGameDuration((productionTimeMs ?? 0) * skin.productionTimeBonus.reductionPercent / 100)} за цикл</span>
                </p>
              )}
          </article>
        ))}
        <button className="admin-skin-add" type="button" onClick={() => onSkinsChange([
          ...skins,
          { id: `skin_${skins.length + 1}`, name: '', price: 100, priceCurrency: 'coins', rarity: 'common', images: imageLabels.map(() => ''), productionTimeBonus: { enabled: false, reductionPercent: 10 } },
        ])} disabled={skins.length >= 30}>
          <Plus size={15} />Додати скін
        </button>
      </>}
    </section>
  );
};
