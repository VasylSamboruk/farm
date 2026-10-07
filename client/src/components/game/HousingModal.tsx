import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore, type HousedAnimal } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { GameItemConfig } from '../../types/game';
import { formatGameDuration, getTreeHarvestReadyAt } from '../../game/trees';

interface HousingModalProps {
  building: GameItemConfig;
  position: { row: number; col: number; quadrant: number };
  animals: HousedAnimal[];
  onClose: () => void;
  onStartHousing: () => void;
  onRelease: (animalId: string) => void;
}

export const HousingModal: React.FC<HousingModalProps> = ({ building, position, animals, onClose, onStartHousing, onRelease }) => {
  const userId = useAuthStore((state) => state.user?.id);
  const collectHousedAnimals = useFarmStore((state) => state.collectHousedAnimals);
  const gameItems = useGameConfigStore((state) => state.items);
  const [now, setNow] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState('');
  const capacity = building.housing?.capacity ?? 0;
  const animalIcon = building.housing?.animalTypes
    .map((animalId) => gameItems[animalId])
    .find((item) => item?.type === 'ANIMAL');
  const animalImage = animalIcon?.growthImages?.[0] ?? animalIcon?.shopImage;
  const readyProducts = [...new Set(animals
    .filter((animal) => {
      const item = gameItems[animal.itemId];
      return Boolean(item?.yieldItem && item.productionTimeMs && now >= getTreeHarvestReadyAt(animal, item));
    })
    .map((animal) => animal.itemId))].map((itemId) => gameItems[itemId]).filter((item) => item?.yieldItem);

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  const readyCount = animals.filter((animal) => {
    const item = gameItems[animal.itemId];
    return Boolean(item?.yieldItem && item.productionTimeMs && now >= getTreeHarvestReadyAt(animal, item));
  }).length;

  const collectReady = async () => {
    if (!userId || collecting || readyCount === 0) return;
    setCollecting(true);
    setNotice('');
    try {
      const result = await collectHousedAnimals(userId, position);
      if (!result) return;
      const summary = result.items.map((entry) => `${entry.yieldName} ×${entry.amount}`).join(', ');
      setNotice(summary ? `Зібрано: ${summary}` : 'Готового врожаю поки немає.');
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="housing-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="housing-modal game-modal-window" role="dialog" aria-modal="true" aria-labelledby="housing-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="housing-modal-header shared-modal-header game-modal-header">
          <div className="housing-modal-heading">
            <span className="housing-modal-icon" aria-hidden="true">
              {animalImage && <img src={animalImage} alt="" draggable={false} />}
            </span>
            <div className="housing-modal-title-copy">
              <span className="housing-modal-eyebrow">ТВАРИННИЦЬКА БУДІВЛЯ</span>
              <h2 id="housing-modal-title">{building.name}</h2>
              <span className="housing-capacity">{animals.length}/{capacity} тварин</span>
            </div>
          </div>
          <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити">×</button>
        </header>
        <div className="housing-modal-content">
          <div className="housing-actions">
            <button type="button" onClick={onStartHousing} disabled={animals.length >= capacity}>Помістити тварин</button>
            <button type="button" onClick={() => void collectReady()} disabled={!readyCount || collecting}>
              {readyProducts.map((item) => {
                const productImage = item?.yieldImage;
                return productImage
                  ? <img key={item.id} src={productImage} alt="" draggable={false} />
                  : <span key={item?.id}>{item?.yieldIcon ?? '📦'}</span>;
              })}
              {collecting ? 'Збираємо…' : `Зібрати готове (${readyCount})`}
            </button>
          </div>
          {notice && <p className="housing-notice" role="status">{notice}</p>}
          <div className="housing-animal-list modal-scrollbar-hidden">
            {animals.length === 0 ? <p>У будівлі поки немає тварин.</p> : animals.map((animal) => {
              const item = gameItems[animal.itemId];
              if (!item) return <p key={animal.id}>Невідома тварина: {animal.itemId}</p>;
              const readyAt = getTreeHarvestReadyAt(animal, item);
              const ready = now >= readyAt;
              const productImage = item.yieldImage;
              return (
                <article className="housing-animal-row game-modal-card" key={animal.id}>
                  <span className="housing-animal-icon">
                    {(item.growthImages?.[0] ?? item.shopImage) && (
                      <img src={item.growthImages?.[0] ?? item.shopImage} alt="" draggable={false} />
                    )}
                  </span>
                  <div className="housing-animal-copy">
                    <strong>{item.name}</strong>
                    <small>
                      <span className="housing-product-icon" aria-hidden="true">
                        {productImage
                          ? <img src={productImage} alt="" draggable={false} />
                          : item.yieldIcon ?? '📦'}
                      </span>
                      <span>{item.yieldName ?? 'Продукція'}: {ready ? 'готово' : `ще ${formatGameDuration(readyAt - now)}`}</span>
                    </small>
                  </div>
                  <button className="housing-release-button" type="button" onClick={() => onRelease(animal.id)}>Випустити</button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
