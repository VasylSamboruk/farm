import React from 'react';
import { AdminImageUrlInput } from './AdminImageUrlInput';
import { AdminAppearanceAnimation } from './AdminAppearanceAnimation';
import { resolveImageUrl } from '../../game/assetUrls';
import type { GameItemConfig } from '../../types/game';

interface AdminBackgroundImagesProps {
  backgroundImage: string;
  backgroundNightImage: string;
  shopImage: string;
  assetBaseUrl: string;
  onBackgroundImageChange: (value: string) => void;
  onBackgroundNightImageChange: (value: string) => void;
  onShopImageChange: (value: string) => void;
  appearanceAnimation: NonNullable<GameItemConfig['appearanceAnimation']>;
  onAppearanceAnimationChange: (value: NonNullable<GameItemConfig['appearanceAnimation']>) => void;
}

const imageCards = [
  { key: 'day', label: 'Денний фон', inputLabel: 'Зображення фону вдень' },
  { key: 'night', label: 'Нічний фон', inputLabel: 'Зображення фону вночі' },
  { key: 'shop', label: 'Картинка товару в магазині · одна', inputLabel: 'Одне зображення картки товару' },
] as const;

export const AdminBackgroundImages: React.FC<AdminBackgroundImagesProps> = ({
  backgroundImage,
  backgroundNightImage,
  shopImage,
  assetBaseUrl,
  onBackgroundImageChange,
  onBackgroundNightImageChange,
  onShopImageChange,
  appearanceAnimation,
  onAppearanceAnimationChange,
}) => {
  const images = {
    day: { value: backgroundImage, onChange: onBackgroundImageChange },
    night: { value: backgroundNightImage, onChange: onBackgroundNightImageChange },
    shop: { value: shopImage, onChange: onShopImageChange },
  };

  return (
    <section className="admin-background-images" aria-label="Зображення оформлення фону">
      <header className="admin-background-images-heading">
        <strong>Картинки оформлення</strong>
        <span>Один товар у магазині перемикає фон між денним і нічним зображенням.</span>
      </header>
      <AdminAppearanceAnimation value={appearanceAnimation} onChange={onAppearanceAnimationChange} />
      <div className="admin-background-image-grid">
        {imageCards.map(({ key, label, inputLabel }) => {
          const image = images[key];
          return (
            <div className={`admin-background-image-card${key === 'shop' ? ' is-shop' : ''}`} key={key}>
              <span className="admin-background-image-title">{label}</span>
              <div className="admin-background-image-preview">
                {image.value.trim()
                  ? <img src={resolveImageUrl(image.value.trim(), assetBaseUrl)} alt={`Попередній перегляд: ${label}`} />
                  : <span>Додай зображення</span>}
              </div>
              <AdminImageUrlInput
                label={inputLabel}
                value={image.value}
                assetBaseUrl={assetBaseUrl}
                onChange={image.onChange}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
