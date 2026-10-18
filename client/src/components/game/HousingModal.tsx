import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore, type HousedAnimal } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { GameItemConfig } from '../../types/game';
import { AdminItemSettings } from './AdminItemSettings';
import { formatGameDuration, getTreeHarvestReadyAt } from '../../game/trees';

interface HousingModalProps {
  building: GameItemConfig;
  position: { row: number; col: number; quadrant: number };
  animals: HousedAnimal[];
  onClose: () => void;
  onStartHousing: () => void;
  onRelease: (animalId: string) => void;
}

type HousingFilter = 'all' | 'ready' | 'working' | 'favorites';

const formatCompactDuration = (milliseconds: number) => {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}г ${minutes}хв` : `${hours}г`;
  return `${Math.max(1, minutes)}хв`;
};

export const HousingModal: React.FC<HousingModalProps> = ({ building, position, animals, onClose, onStartHousing, onRelease }) => {
  const userId = useAuthStore((state) => state.user?.id);
  const collectHousedAnimals = useFarmStore((state) => state.collectHousedAnimals);
  const gameItems = useGameConfigStore((state) => state.items);
  const [now, setNow] = useState(0);
  const [collectingAnimalId, setCollectingAnimalId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<HousingFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    const savedFavorites = localStorage.getItem(`farmcanvas:housing:favorites:${userId ?? 'guest'}`);
    if (!savedFavorites) return new Set();
    try {
      const parsedFavorites: unknown = JSON.parse(savedFavorites);
      return Array.isArray(parsedFavorites) && parsedFavorites.every((id) => typeof id === 'string')
        ? new Set(parsedFavorites)
        : new Set();
    } catch (error) {
      console.error('Не вдалося прочитати улюблених тварин:', error);
      return new Set();
    }
  });
  const capacity = building.housing?.capacity ?? 0;
  const buildingImage = '/assets/ui/housing/chicken-coop.png';

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`farmcanvas:housing:favorites:${userId ?? 'guest'}`, JSON.stringify([...favoriteIds]));
    } catch (error) {
      console.error('Не вдалося зберегти улюблених тварин:', error);
    }
  }, [favoriteIds, userId]);

  const housedAnimals = animals.map((animal, index) => {
    const item = gameItems[animal.itemId];
    const readyAt = item ? getTreeHarvestReadyAt(animal, item) : 0;
    const producing = Boolean(item?.yieldItem && item.productionTimeMs);
    const ready = Boolean(producing && now >= readyAt);
    const baseTime = new Date(animal.lastHarvestedAt ?? animal.placedAt).getTime();
    const duration = Number.isFinite(readyAt - baseTime) ? readyAt - baseTime : item?.productionTimeMs ?? 0;
    const progress = duration > 0
      ? Math.min(100, Math.max(0, ((now - baseTime) / duration) * 100))
      : 0;
    return { animal, index, item, producing, ready, readyAt, progress };
  });
  const readyCount = housedAnimals.filter(({ ready }) => ready).length;
  const workingCount = housedAnimals.filter(({ producing, ready }) => producing && !ready).length;
  const nextReadyAt = housedAnimals
    .filter(({ ready, producing }) => !ready && producing)
    .reduce((nearest, { readyAt }) => Math.min(nearest, readyAt), Number.POSITIVE_INFINITY);
  const nextReadyLabel = readyCount > 0
    ? 'Є готове!'
    : Number.isFinite(nextReadyAt) && now > 0
      ? formatGameDuration(nextReadyAt - now)
      : '—';
  const readyProducts = [...new Set(housedAnimals
    .filter(({ ready }) => ready)
    .map(({ animal }) => animal.itemId))].map((itemId) => gameItems[itemId]).filter((item) => item?.yieldItem);
  const animalProduct = housedAnimals.find(({ item }) => item?.yieldImage || item?.yieldIcon)?.item;
  const defaultProductImage = animalProduct?.yieldImage ?? '/assets/animals/product/chikenegg.png';
  const visibleAnimals = housedAnimals.filter(({ animal, producing, ready }) => {
    if (filter === 'ready') return ready;
    if (filter === 'working') return producing && !ready;
    if (filter === 'favorites') return favoriteIds.has(animal.id);
    return true;
  });

  const collectReady = async (animalId?: string) => {
    if (!userId || collectingAnimalId || (animalId ? !housedAnimals.some(({ animal, ready }) => animal.id === animalId && ready) : !readyCount)) return;
    setCollectingAnimalId(animalId ?? 'all');
    setNotice('');
    try {
      const result = await collectHousedAnimals(userId, position, animalId);
      if (!result) return;
      const summary = result.items.map((entry) => `${entry.yieldName} ×${entry.amount}`).join(', ');
      setNotice(summary ? `Зібрано: ${summary}` : 'Готового врожаю поки немає.');
    } finally {
      setCollectingAnimalId(null);
    }
  };

  const toggleFavorite = (animalId: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(animalId)) next.delete(animalId);
      else next.add(animalId);
      return next;
    });
  };

  const filters: { id: HousingFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: animals.length },
    { id: 'ready', label: 'Готові', count: readyCount },
    { id: 'working', label: 'Виробляють', count: workingCount },
    { id: 'favorites', label: 'Улюблені', count: animals.filter(({ id }) => favoriteIds.has(id)).length },
  ];

  return (
    <div className="housing-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="housing-modal coop-modal game-modal-window" role="dialog" aria-modal="true" aria-labelledby="housing-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="housing-modal-header shared-modal-header game-modal-header">
          <div className="housing-modal-heading">
            <span className="housing-modal-icon" aria-hidden="true">
              {buildingImage && <img src={buildingImage} alt="" draggable={false} />}
            </span>
            <div className="housing-modal-title-copy">
              <h2 id="housing-modal-title">{building.name}</h2>
            </div>
          </div>
          <div className="modal-header-actions">
            <AdminItemSettings item={building} />
            <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити">×</button>
          </div>
        </header>

        <div className="housing-modal-content">
          <section className="coop-capacity-panel" aria-label="Місткість будівлі">
            <div className="coop-capacity-heading">
              <span>МІСЦЯ У ЗАГОНІ</span>
              <strong>{animals.length} / {capacity}</strong>
            </div>
            <div className="coop-capacity-track" role="progressbar" aria-label="Заповнення загону" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={animals.length}>
              <span style={{ width: `${capacity ? Math.min(100, animals.length / capacity * 100) : 0}%` }} />
            </div>
            <div className="coop-summary-grid">
              <div className="coop-summary-card">
                <span className="coop-summary-icon coop-summary-ready">{readyProducts[0]?.yieldImage
                  ? <img src={readyProducts[0].yieldImage} alt="" draggable={false} />
                  : <img src={defaultProductImage} alt="" draggable={false} />}</span>
                <span><small>Готово</small><strong>{readyCount}</strong></span>
              </div>
              <div className="coop-summary-card">
                <span className="coop-summary-icon coop-summary-time"><img src="/assets/ui/housing/clock.png" alt="" draggable={false} /></span>
                <span><small>До наступної</small><strong>{nextReadyLabel}</strong></span>
              </div>
              <div className="coop-summary-card">
                <span className="coop-summary-icon coop-summary-home">{buildingImage && <img src={buildingImage} alt="" draggable={false} />}</span>
                <span><small>Всього тварин</small><strong>{animals.length} / {capacity}</strong></span>
              </div>
            </div>
          </section>

          <div className="housing-actions coop-primary-actions">
            <button className="coop-action-button coop-add-button" type="button" onClick={onStartHousing} disabled={animals.length >= capacity}>
              <img src="/assets/ui/housing/plus.png" alt="" draggable={false} />
              <span>Додати тварин</span>
            </button>
            <button className="coop-action-button coop-collect-button" type="button" onClick={() => void collectReady()} disabled={!readyCount || collectingAnimalId !== null}>
              <span className="coop-collect-icon">{readyProducts[0]?.yieldImage
                ? <img src={readyProducts[0].yieldImage} alt="" draggable={false} />
                : <img src={defaultProductImage} alt="" draggable={false} />}</span>
              <span>{collectingAnimalId === 'all' ? 'Збираємо…' : `Зібрати все (${readyCount})`}</span>
            </button>
          </div>

          {notice && <p className="housing-notice" role="status">{notice}</p>}

          <nav className="coop-filter-tabs" aria-label="Фільтр тварин">
            {filters.map(({ id, label, count }) => (
              <button key={id} className={`coop-filter-tab${filter === id ? ' is-active' : ''}`} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}>
                {id === 'all' && <img src="/assets/ui/shop_cat_animal.png" alt="" draggable={false} />}
                {id === 'ready' && <img src={readyProducts[0]?.yieldImage ?? defaultProductImage} alt="" draggable={false} />}
                {id === 'working' && <img src="/assets/ui/housing/clock.png" alt="" draggable={false} />}
                {id === 'favorites' && <img src={filter === id ? '/assets/ui/housing/heart-full.png' : '/assets/ui/housing/heart-empty.png'} alt="" draggable={false} />}
                <span>{label}</span><strong>{count}</strong>
              </button>
            ))}
          </nav>

          <div className="housing-animal-list modal-scrollbar-hidden">
            {visibleAnimals.map(({ animal, index, item, producing, ready, readyAt, progress }) => {
              if (!item) return <p key={animal.id}>Невідома тварина: {animal.itemId}</p>;
              const productImage = item.yieldImage;
              const skin = item.skinsEnabled && animal.skinId ? item.skins?.find((entry) => entry.id === animal.skinId) : undefined;
              const animalImage = skin?.images[0] ?? item.growthImages?.[0] ?? item.shopImage;
              const isFavorite = favoriteIds.has(animal.id);
              const collectInProgress = collectingAnimalId === animal.id;
              return (
                <article className={`housing-animal-row game-modal-card${ready ? ' is-ready' : ''}`} key={animal.id}>
                  <button
                    className={`coop-favorite-button${isFavorite ? ' is-favorite' : ''}`}
                    type="button"
                    onClick={() => toggleFavorite(animal.id)}
                    aria-label={isFavorite ? `Прибрати ${item.name} з улюблених` : `Додати ${item.name} до улюблених`}
                    aria-pressed={isFavorite}
                  >
                    <img src={isFavorite ? '/assets/ui/housing/heart-full.png' : '/assets/ui/housing/heart-empty.png'} alt="" draggable={false} />
                  </button>
                  <span className="housing-animal-icon">
                    {animalImage
                      ? <img src={animalImage} alt="" draggable={false} />
                      : item.shopIcon ?? '🐾'}
                  </span>
                  <div className="housing-animal-copy">
                    <strong><span>#{index + 1}</span> {item.name}</strong>
                    <small className={ready ? 'is-ready' : producing ? 'is-working' : 'is-idle'}>
                      <span className="coop-status-dot" />
                      {ready ? 'Готово' : producing ? 'Виробляє' : 'Не виробляє'}
                    </small>
                    <div className="coop-animal-production">
                      <span className="housing-product-icon" aria-hidden="true">
                        {productImage ? <img src={productImage} alt="" draggable={false} /> : item.yieldIcon ?? '📦'}
                      </span>
                      <span className="coop-animal-progress"><span style={{ width: `${progress}%` }} /></span>
                      {!ready && <span className="coop-animal-time"><img src="/assets/ui/housing/clock.png" alt="" draggable={false} />{formatCompactDuration(readyAt - now)}</span>}
                    </div>
                  </div>
                  <div className="coop-animal-actions">
                    {ready && (
                      <button className="coop-animal-collect" type="button" onClick={() => void collectReady(animal.id)} disabled={collectingAnimalId !== null}>
                        {collectInProgress ? 'Збираємо…' : 'Зібрати'}
                      </button>
                    )}
                    {!ready && <button className="housing-release-button" type="button" onClick={() => onRelease(animal.id)}>Випустити</button>}
                  </div>
                </article>
              );
            })}
            {animals.length < capacity && (
              <button className="coop-empty-slot" type="button" onClick={onStartHousing}>
                <img src="/assets/ui/housing/plus.png" alt="" draggable={false} />
                <strong>Вільне місце</strong>
                <small>{animals.length} / {capacity}</small>
              </button>
            )}
            {visibleAnimals.length === 0 && (animals.length >= capacity || filter !== 'all') && (
              <p className="coop-empty-message">
                {filter === 'favorites' ? 'Ще немає улюблених тварин.' : filter === 'ready' ? 'Поки немає готового врожаю.' : 'Тут поки порожньо.'}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
