import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ImagePlus, Package, PawPrint, RotateCcw, Sprout, TreePine, Warehouse, X } from 'lucide-react';
import { adminApi, type AdminCatalogItem } from '../../api/admin.api';
import { AdminImageUrlInput } from './AdminImageUrlInput';
import { AdminDurationInput } from './AdminDurationInput';
import { useAdminToast } from './adminToast';
import { drawPlacedItem } from '../../game/placedItems';
import { loadGameImage } from '../../game/sprites';
import { drawTree } from '../../game/trees';
import { resolveImageUrl } from '../../game/assetUrls';
import { durationPartsToMilliseconds, EMPTY_DURATION, type DurationParts } from '../../game/durationInput';
import type { GameItemConfig } from '../../types/game';

type FootprintMode = 'mini' | 'large';
type ItemType = AdminCatalogItem['type'];

const itemTypes: { type: ItemType; label: string; icon: React.ReactNode; iconText: string }[] = [
  { type: 'TREE', label: 'Дерево', icon: <TreePine size={18} />, iconText: '🌳' },
  { type: 'CROP', label: 'Рослина', icon: <Sprout size={18} />, iconText: '🌱' },
  { type: 'ANIMAL', label: 'Тварина', icon: <PawPrint size={18} />, iconText: '🐮' },
  { type: 'BUILDING', label: 'Будівля', icon: <Warehouse size={18} />, iconText: '🏠' },
  { type: 'OTHER', label: 'Інше', icon: <Package size={18} />, iconText: '🧰' },
];

const getRectangle = (cells: { x: number; y: number }[]) => {
  if (cells.length === 0) return null;
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width * height !== cells.length) return null;
  return { x: minX, y: minY, width, height };
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data;
      if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') return data.message;
    }
  }
  return error instanceof Error ? error.message : 'Не вдалося створити товар.';
};

interface AdminCreateItemProps {
  onCancel: () => void;
  onCreated: () => void;
}

interface PreviewSelection {
  title: string;
  image?: string;
  icon?: string;
}

interface AdminPreviewSpriteProps {
  type: ItemType;
  image: string;
  icon: string;
  spriteScale: number;
  footprint: { width: number; height: number };
}

const AdminPreviewSprite: React.FC<AdminPreviewSpriteProps> = ({ type, image, icon, spriteScale, footprint }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let active = true;

    const draw = () => {
      if (!active) return;
      const item: GameItemConfig = {
        id: 'admin_preview',
        name: 'Попередній перегляд',
        type,
        price: 0,
        plantingXp: 0,
        footprint,
        spriteScale,
        shopIcon: icon,
        growthImages: image ? [image] : [],
      };
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (type === 'TREE') drawTree(context, item, {}, canvas.width / 2, canvas.height - 8, 0, false);
      else drawPlacedItem(context, item, {}, canvas.width / 2, canvas.height - 8, 0, false);
    };

    if (!image) draw();
    else void loadGameImage(image).then(draw).catch(draw);

    return () => { active = false; };
  }, [footprint, icon, image, spriteScale, type]);

  return <canvas ref={canvasRef} className="admin-preview-sprite-canvas" width={200} height={300} aria-hidden="true" />;
};

export const AdminCreateItem: React.FC<AdminCreateItemProps> = ({ onCancel, onCreated }) => {
  const showToast = useAdminToast();
  const [assetBaseUrl, setAssetBaseUrl] = useState('');
  const [availableAnimals, setAvailableAnimals] = useState<AdminCatalogItem[]>([]);
  const [type, setType] = useState<ItemType>('TREE');
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [price, setPrice] = useState('100');
  const [priceCurrency, setPriceCurrency] = useState<'coins' | 'rubies'>('coins');
  const [sellPrice, setSellPrice] = useState('');
  const [plantingXp, setPlantingXp] = useState('10');
  const [requiredLevel, setRequiredLevel] = useState('1');
  const [productionTimeParts, setProductionTimeParts] = useState<DurationParts>({ hours: '00', minutes: '01', seconds: '00' });
  const [otherMechanic, setOtherMechanic] = useState<'accelerate_growth' | 'expand_farm' | 'none'>('accelerate_growth');
  const [accelerationParts, setAccelerationParts] = useState<DurationParts>({ hours: '00', minutes: '30', seconds: '00' });
  const [yieldItem, setYieldItem] = useState('');
  const [yieldName, setYieldName] = useState('');
  const [yieldIcon, setYieldIcon] = useState('');
  const [yieldAmount, setYieldAmount] = useState('1');
  const [yieldImage, setYieldImage] = useState('');
  const [placementSurface, setPlacementSurface] = useState<'grass' | 'soil'>('grass');
  const [spriteScale, setSpriteScale] = useState('1');
  const [canFlip, setCanFlip] = useState(true);
  const [access, setAccess] = useState<'all' | 'admin'>('all');
  const [housingEnabled, setHousingEnabled] = useState(false);
  const [housingCapacity, setHousingCapacity] = useState('40');
  const [housingAnimalTypes, setHousingAnimalTypes] = useState<string[]>([]);
  const [shopImage, setShopImage] = useState('');
  const [shopIcon, setShopIcon] = useState('');
  const [growthImageSources, setGrowthImageSources] = useState<string[]>([]);
  const [footprintMode, setFootprintMode] = useState<FootprintMode>('mini');
  const [miniCells, setMiniCells] = useState([0]);
  const [largeCells, setLargeCells] = useState(['0,0']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewElapsedMs, setPreviewElapsedMs] = useState(0);
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([adminApi.getMediaSettings(), adminApi.getCatalog()])
      .then(([settings, catalog]) => {
        if (!active) return;
        setAssetBaseUrl(settings.assetBaseUrl);
        setAvailableAnimals(catalog.filter((item) => item.type === 'ANIMAL'));
      })
      .catch((loadError: unknown) => {
        if (active) showToast('error', getErrorMessage(loadError));
      });
    return () => { active = false; };
  }, [showToast]);

  const growthImages = growthImageSources.map((source) => source.trim()).filter(Boolean);
  const productionTimeMs = durationPartsToMilliseconds(productionTimeParts);
  const miniRectangle = getRectangle(miniCells.map((quadrant) => ({ x: quadrant % 2, y: Math.floor(quadrant / 2) })));
  const largeCoordinates = largeCells.map((cell) => {
    const [x, y] = cell.split(',').map(Number);
    return { x, y };
  });
  const largeRectangle = getRectangle(largeCoordinates);
  const isBuilding = type === 'BUILDING' || type === 'OTHER';
  const previewImage = shopImage.trim() || growthImages[0] || '';
  const selectedIcon = shopIcon.trim() || itemTypes.find((item) => item.type === type)?.iconText || '🌱';
  const previewDuration = Math.max(1000, productionTimeMs ?? 60_000);
  const previewProgress = Math.min(1, previewElapsedMs / previewDuration);
  const previewStageIndex = growthImages.length <= 1 || type === 'ANIMAL' || isBuilding
    ? 0
    : previewProgress >= 1
      ? growthImages.length - 1
      : Math.min(
        growthImages.length - 2,
        Math.floor((previewProgress / 0.8) * (type === 'CROP' ? growthImages.length - 1 : growthImages.length - 2))
      );
  const growingImage = growthImages[previewStageIndex] || previewImage;
  const footprintError = footprintMode === 'mini'
    ? !miniRectangle
    : !largeRectangle || largeRectangle.width > 8 || largeRectangle.height > 8;

  const changeType = (nextType: ItemType) => {
    setPreviewElapsedMs(0);
    setType(nextType);
    if (nextType === 'BUILDING') {
      setYieldItem('');
      setYieldName('');
      setYieldIcon('');
      setYieldAmount('');
      setSellPrice('');
      setProductionTimeParts({ ...EMPTY_DURATION });
    } else if (isBuilding) {
      setYieldAmount('1');
      setProductionTimeParts({ hours: '00', minutes: '01', seconds: '00' });
    }
  };

  useEffect(() => {
    if (isBuilding || type === 'ANIMAL' || growthImages.length < 2) return;
    const timer = window.setInterval(() => {
      setPreviewElapsedMs((elapsed) => Math.min(previewDuration, elapsed + 400));
    }, 400);
    return () => window.clearInterval(timer);
  }, [growthImages.length, isBuilding, previewDuration, type]);

  const restartPreviewCycle = () => {
    setPreviewElapsedMs(0);
  };

  const renderFarmPreview = (image: string, icon: string, expanded = false) => {
    const largeWidth = footprintMode === 'large' && largeRectangle ? largeRectangle.width : 1;
    const largeHeight = footprintMode === 'large' && largeRectangle ? largeRectangle.height : 1;
    const worldScale = footprintMode === 'large'
      ? Math.min(1, 2.4 / Math.max(largeWidth, largeHeight))
      : 1;
    const previewWidth = (expanded ? 360 : 240) * worldScale;
    const halfWidth = 100 * worldScale;
    const halfHeight = 50 * worldScale;
    const quadrantOffsets = [
      { x: 0, y: -halfHeight / 2 },
      { x: halfWidth / 2, y: 0 },
      { x: -halfWidth / 2, y: 0 },
      { x: 0, y: halfHeight / 2 },
    ];
    const occupiedPositions = footprintMode === 'mini'
      ? miniCells.map((quadrant) => quadrantOffsets[quadrant])
      : Array.from({ length: largeHeight }, (_, row) => Array.from({ length: largeWidth }, (_, col) => ({ row, col })))
        .flatMap((cells) => cells.flatMap(({ row, col }) => quadrantOffsets.map((offset) => ({
          x: (col - row) * halfWidth + offset.x,
          y: (col + row) * halfHeight + offset.y,
        }))));
    const objectCenterX = occupiedPositions.reduce((sum, position) => sum + position.x, 0) / occupiedPositions.length;
    const groundOffsetY = Math.max(...occupiedPositions.map((position) => position.y));
    const footprintCenterY = occupiedPositions.reduce((sum, position) => sum + position.y, 0) / occupiedPositions.length;
    const footprintWidth = footprintMode === 'mini'
      ? (miniRectangle?.width ?? 1) * halfWidth
      : Math.min((largeWidth + largeHeight) * halfWidth, previewWidth * 0.82);
    const footprintHeight = footprintMode === 'mini'
      ? (miniRectangle?.height ?? 1) * halfHeight
      : Math.min((largeWidth + largeHeight) * halfHeight, previewWidth * 0.41);
    const previewFootprint = footprintMode === 'large'
      ? { width: 2, height: 2 }
      : miniRectangle ? { width: miniRectangle.width, height: miniRectangle.height } : { width: 1, height: 1 };
    const groundLine = expanded ? 30 : 24;

    return (
      <div className={`admin-live-preview${expanded ? ' is-expanded' : ''}${placementSurface === 'soil' ? ' is-soil' : ''}`}>
        <div
          className="admin-preview-footprint"
          style={{
            left: `calc(50% + ${objectCenterX}px)`,
            top: `calc(100% - ${groundLine}px + ${footprintCenterY}px)`,
            width: `${footprintWidth}px`,
            height: `${footprintHeight}px`,
          }}
        />
        <div className="admin-live-preview-object" style={{
          left: `calc(50% + ${objectCenterX}px)`,
          top: `calc(100% - ${groundLine}px + ${groundOffsetY}px)`,
          width: `${previewWidth}px`,
          height: `${previewWidth * 1.5}px`,
        }}>
          <AdminPreviewSprite type={type} image={resolveImageUrl(image, assetBaseUrl)} icon={icon} spriteScale={Number(spriteScale) || 1} footprint={previewFootprint} />
        </div>
        <span className="admin-preview-surface-label">{placementSurface === 'grass' ? 'ТРАВА' : 'ГРЯДКА'}</span>
        {!isBuilding && type !== 'ANIMAL' && growthImages.length > 1 && <button className="admin-preview-replay" type="button" onClick={restartPreviewCycle}><RotateCcw size={13} /><span>Повторити ріст</span></button>}
      </div>
    );
  };

  const toggleMiniCell = (quadrant: number) => {
    setMiniCells((current) => current.includes(quadrant)
      ? current.filter((cell) => cell !== quadrant)
      : [...current, quadrant]);
  };

  const toggleLargeCell = (x: number, y: number) => {
    const key = `${x},${y}`;
    setLargeCells((current) => current.includes(key)
      ? current.filter((cell) => cell !== key)
      : [...current, key]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedId = id.trim().toLowerCase();
    const parsedPrice = Number(price);
    const parsedPlantingXp = Number(plantingXp);
    const parsedLevel = Number(requiredLevel);
    const parsedScale = Number(spriteScale);
    const selectedRectangle = footprintMode === 'mini' ? miniRectangle : largeRectangle;
    const parsedSellPrice = sellPrice.trim() ? Number(sellPrice) : undefined;
    const parsedProductionTime = productionTimeMs ?? undefined;
    const accelerationMs = durationPartsToMilliseconds(accelerationParts);
    const hasIncompleteStage = growthImageSources.some((source) => !source.trim());
    const parsedHousingCapacity = Number(housingCapacity);

    if (!/^[a-z][a-z0-9_]{1,47}$/.test(normalizedId)) {
      setError('ID має починатися з латинської літери та містити лише латинські літери, цифри й _.');
      showToast('error', 'Перевір формат ID товару.');
      return;
    }
    if (!name.trim() || footprintError || !selectedRectangle ||
      !Number.isSafeInteger(parsedPrice) || parsedPrice < 0 ||
      !Number.isSafeInteger(parsedPlantingXp) || parsedPlantingXp < 0 ||
      !Number.isSafeInteger(parsedLevel) || parsedLevel < 1 || parsedLevel > 999 ||
      !Number.isFinite(parsedScale) || parsedScale < 0.1 || parsedScale > 5 || hasIncompleteStage) {
      setError('Заповни назву, коректні значення та прямокутну зайняту площу.');
      showToast('error', 'Перевір назву, параметри та прямокутний footprint.');
      return;
    }
    if (!isBuilding && (!yieldItem.trim() || !yieldName.trim() || !Number.isSafeInteger(Number(yieldAmount)) || Number(yieldAmount) < 1 ||
      !Number.isSafeInteger(parsedProductionTime) || (parsedProductionTime ?? 0) < 1000 ||
      (parsedSellPrice !== undefined && (!Number.isSafeInteger(parsedSellPrice) || parsedSellPrice < 0)))) {
      setError('Для дерева, рослини чи тварини заповни дані врожаю та час виробництва.');
      showToast('error', 'Заповни всі обов’язкові параметри виробництва.');
      return;
    }
    if (type === 'ANIMAL' && ((!growthImages[0] && !shopImage.trim()) || !yieldImage.trim())) {
      setError('Для тварини додай її зображення та окреме зображення продукції (яйце, молоко тощо).');
      showToast('error', 'Тварині потрібні окремі зображення тварини й продукції.');
      return;
    }
    if (type === 'BUILDING' && housingEnabled &&
      (!Number.isSafeInteger(parsedHousingCapacity) || parsedHousingCapacity < 1 || parsedHousingCapacity > 1000 ||
        housingAnimalTypes.length === 0 || housingAnimalTypes.some((animalId) => !availableAnimals.some((animal) => animal.id === animalId)))) {
      setError('Для тваринницької будівлі вкажи місткість від 1 до 1000 та обери дозволених тварин.');
      showToast('error', 'Перевір налаштування приміщення для тварин.');
      return;
    }
    if (type === 'OTHER' && otherMechanic === 'accelerate_growth' &&
      (!Number.isSafeInteger(accelerationMs) || (accelerationMs ?? 0) < 1000 || (accelerationMs ?? 0) > 2_592_000_000)) {
      setError('Для добрива задай прискорення від 1 секунди до 30 днів.');
      showToast('error', 'Перевір тривалість прискорення добрива.');
      return;
    }

    const footprint = footprintMode === 'mini'
      ? { width: selectedRectangle.width, height: selectedRectangle.height }
      : { width: 2, height: 2 };
    const largeFootprint = footprintMode === 'large'
      ? { width: selectedRectangle.width, height: selectedRectangle.height }
      : undefined;

    setSaving(true);
    try {
      await adminApi.createItem({
        id: normalizedId,
        name: name.trim(),
        type,
        price: parsedPrice,
        priceCurrency,
        plantingXp: parsedPlantingXp,
        requiredLevel: parsedLevel,
        access,
        footprint,
        ...(largeFootprint ? { largeFootprint } : {}),
        ...(type === 'BUILDING' && housingEnabled
          ? { housing: { capacity: parsedHousingCapacity, animalTypes: housingAnimalTypes } }
          : {}),
        ...(type === 'OTHER' && otherMechanic !== 'none' ? {
          mechanic: otherMechanic,
          ...(otherMechanic === 'accelerate_growth' ? { accelerationMs } : {}),
        } : {}),
        placementSurface,
        spriteScale: parsedScale,
        canFlip,
        ...(isBuilding ? {} : {
          sellPrice: parsedSellPrice,
          productionTimeMs: parsedProductionTime,
          yieldItem: yieldItem.trim(),
          yieldName: yieldName.trim(),
          yieldIcon: yieldIcon.trim() || undefined,
          yieldAmount: Number(yieldAmount),
          yieldImage: yieldImage.trim() || undefined,
        }),
        shopImage: shopImage.trim() || undefined,
        shopIcon: shopIcon.trim() || selectedIcon,
        growthImages,
      });
      showToast('success', `Товар «${name.trim()}» створено.`);
      onCreated();
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const renderFootprintTile = (index: number) => {
    const x = index % 8;
    const y = Math.floor(index / 8);
    const key = `${x},${y}`;
    const largeSelected = largeCells.includes(key);
    return (
      <div className={`admin-footprint-tile${largeSelected ? ' is-large-selected' : ''}`} key={key}>
        {[0, 1, 2, 3].map((quadrant) => {
          const selected = footprintMode === 'large'
            ? largeSelected
            : index === 0 && miniCells.includes(quadrant);
          return (
            <button
              className={`admin-footprint-mini${selected ? ' is-selected' : ''}`}
              key={quadrant}
              type="button"
              disabled={footprintMode === 'mini' && index !== 0}
              aria-label={`Тайл ${x + 1}, ${y + 1}, сектор ${quadrant + 1}`}
              aria-pressed={selected}
              onClick={() => footprintMode === 'mini' ? toggleMiniCell(quadrant) : toggleLargeCell(x, y)}
            />
          );
        })}
      </div>
    );
  };

  const previewPosition = footprintMode === 'large' && largeRectangle
    ? {
      left: `${largeRectangle.x / 8 * 100}%`,
      top: `${largeRectangle.y / 8 * 100}%`,
      width: `${largeRectangle.width / 8 * 100}%`,
      height: `${largeRectangle.height / 8 * 100}%`,
    }
    : miniRectangle ? {
      left: `${miniRectangle.x / 16 * 100}%`,
      top: `${miniRectangle.y / 16 * 100}%`,
      width: `${miniRectangle.width / 16 * 100}%`,
      height: `${miniRectangle.height / 16 * 100}%`,
    } : undefined;

  return (
    <section className="admin-create-page" aria-labelledby="admin-create-title">
      <header className="admin-create-heading">
        <div>
          <span className="admin-eyebrow">НОВИЙ ПРЕДМЕТ</span>
          <h1 id="admin-create-title">Додати товар</h1>
          <p>Створи предмет каталогу та перевір його вигляд на полі</p>
        </div>
        <button className="admin-create-cancel" type="button" onClick={onCancel}><ArrowLeft size={16} />До магазину</button>
      </header>

      {error && <p className="admin-alert is-error" role="alert">{error}</p>}

      <form className="admin-create-layout" onSubmit={handleSubmit}>
        <div className="admin-create-form">
          <section className="admin-create-section">
            <div className="admin-create-section-heading"><span>01</span><div><h2>Тип і назва</h2><p>Основна інформація про товар</p></div></div>
            <div className="admin-type-picker" role="group" aria-label="Тип товару">
              {itemTypes.map((item) => (
                <button className={type === item.type ? 'is-active' : ''} key={item.type} type="button" aria-pressed={type === item.type} onClick={() => changeType(item.type)}>
                  {item.icon}<span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="admin-create-fields">
              <label>Назва товару<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Наприклад, Персикове дерево" required /></label>
              <label>ID у грі<input value={id} maxLength={48} onChange={(event) => setId(event.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())} placeholder="peach_tree" required /></label>
            </div>
          </section>

          <section className="admin-create-section">
            <div className="admin-create-section-heading"><span>02</span><div><h2>Економіка та доступ</h2><p>Налаштування покупки й розміщення</p></div></div>
            <div className="admin-create-fields admin-create-fields-three">
              <label>Ціна покупки<input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
              <label>Валюта покупки<select value={priceCurrency} onChange={(event) => setPriceCurrency(event.target.value as 'coins' | 'rubies')}><option value="coins">Монети</option><option value="rubies">Рубіни</option></select></label>
              <label>Досвід за встановлення<input type="number" min="0" step="1" value={plantingXp} onChange={(event) => setPlantingXp(event.target.value)} required /></label>
              <label>Доступ з рівня<input type="number" min="1" max="999" step="1" value={requiredLevel} onChange={(event) => setRequiredLevel(event.target.value)} required /></label>
            </div>
            <div className="admin-create-fields admin-create-fields-two">
              <fieldset className="admin-choice-field"><legend>Поверхня</legend><div className="admin-choice-row">
                <button className={placementSurface === 'grass' ? 'is-active' : ''} type="button" aria-pressed={placementSurface === 'grass'} onClick={() => setPlacementSurface('grass')}><span className="admin-surface-swatch is-grass" />Трава</button>
                <button className={placementSurface === 'soil' ? 'is-active' : ''} type="button" aria-pressed={placementSurface === 'soil'} onClick={() => setPlacementSurface('soil')}><span className="admin-surface-swatch is-soil" />Грядка</button>
              </div></fieldset>
              <label>Доступ у магазині<select value={access} onChange={(event) => setAccess(event.target.value as 'all' | 'admin')}><option value="all">Усім гравцям</option><option value="admin">Лише адміністратору</option></select></label>
            </div>
          </section>

          {type === 'BUILDING' && <section className="admin-create-section">
            <div className="admin-create-section-heading"><span>03</span><div><h2>Приміщення для тварин</h2><p>Необов’язково: увімкни зберігання та виробництво тварин усередині</p></div></div>
            <label className="admin-create-check"><input type="checkbox" checked={housingEnabled} onChange={(event) => setHousingEnabled(event.target.checked)} />Ця будівля може утримувати тварин</label>
            {housingEnabled && <>
              <div className="admin-create-fields admin-create-fields-two">
                <label>Місткість<input type="number" min="1" max="1000" step="1" value={housingCapacity} onChange={(event) => setHousingCapacity(event.target.value)} /></label>
              </div>
              <fieldset className="admin-choice-field">
                <legend>Дозволені тварини</legend>
                {availableAnimals.length === 0 ? <p>У каталозі ще немає тварин.</p> : (
                  <div className="admin-create-fields admin-create-fields-two">
                    {availableAnimals.map((animal) => (
                      <label className="admin-create-check" key={animal.id}>
                        <input
                          type="checkbox"
                          checked={housingAnimalTypes.includes(animal.id)}
                          onChange={(event) => setHousingAnimalTypes((current) => event.target.checked
                            ? [...current, animal.id]
                            : current.filter((animalId) => animalId !== animal.id))}
                        />
                        {animal.name} ({animal.id})
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </>}
          </section>}

          {type === 'OTHER' && <section className="admin-create-section">
            <div className="admin-create-section-heading"><span>03</span><div><h2>Дія предмета</h2><p>Налаштуй поведінку товару категорії «Інше»</p></div></div>
            <div className="admin-create-fields admin-create-fields-two">
              <label>Механіка<select value={otherMechanic} onChange={(event) => setOtherMechanic(event.target.value as typeof otherMechanic)}>
                <option value="accelerate_growth">Добриво — прискорення таймера</option>
                <option value="expand_farm">Розширення ферми вперед</option>
                <option value="none">Без активної механіки</option>
              </select></label>
              {otherMechanic === 'accelerate_growth' && <div className="admin-duration-form-field"><span>На скільки прискорює</span><AdminDurationInput label="Тривалість прискорення добрива" value={accelerationParts} onChange={setAccelerationParts} /></div>}
            </div>
          </section>}

          {!isBuilding && <section className="admin-create-section">
            <div className="admin-create-section-heading"><span>03</span><div><h2>Виробництво</h2><p>Урожай і винагороди</p></div></div>
            <div className="admin-create-fields admin-create-fields-three">
              {type === 'ANIMAL' && <p className="admin-product-fields-note">Зображення тварини використовується на фермі та в курнику. Зображення продукції — для готового врожаю та збору.</p>}
              <div className="admin-duration-form-field"><span>Час до врожаю</span><AdminDurationInput label="Час до врожаю" value={productionTimeParts} onChange={(value) => { setProductionTimeParts(value); restartPreviewCycle(); }} /></div>
              <label>Кількість за збір<input type="number" min="1" step="1" value={yieldAmount} onChange={(event) => setYieldAmount(event.target.value)} required /></label>
              <label>Ціна продажу<input type="number" min="0" step="1" value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} placeholder="Не продається" /></label>
              <label>ID врожаю<input value={yieldItem} maxLength={64} onChange={(event) => setYieldItem(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'))} placeholder="peach" required /></label>
              <label>Назва врожаю<input value={yieldName} maxLength={120} onChange={(event) => setYieldName(event.target.value)} placeholder="Персик" required /></label>
              <label>{type === 'ANIMAL' ? 'Запасна іконка продукції' : 'Іконка врожаю'}<input value={yieldIcon} maxLength={16} onChange={(event) => setYieldIcon(event.target.value)} placeholder={type === 'ANIMAL' ? '🥚' : '🍑'} /></label>
              <AdminImageUrlInput key={`yield-${assetBaseUrl}`} className="admin-create-field-wide" label={type === 'ANIMAL' ? 'Зображення продукції (яйце, молоко тощо)' : 'Зображення врожаю'} value={yieldImage} assetBaseUrl={assetBaseUrl} onChange={setYieldImage} />
            </div>
          </section>}

          <section className="admin-create-section">
            <div className="admin-create-section-heading"><span>{isBuilding ? '03' : '04'}</span><div><h2>Зображення</h2><p>Картинки товару та стадій росту</p></div></div>
            <div className="admin-create-fields admin-create-fields-two">
              <AdminImageUrlInput key={`shop-${assetBaseUrl}`} label={type === 'ANIMAL' ? 'Зображення тварини в магазині' : 'Зображення магазину'} value={shopImage} assetBaseUrl={assetBaseUrl} onChange={setShopImage} />
              <label>{type === 'ANIMAL' ? 'Запасна іконка тварини' : 'Іконка-запасний варіант'}<input value={shopIcon} maxLength={16} onChange={(event) => setShopIcon(event.target.value)} placeholder={selectedIcon} /></label>
              <div className="admin-create-field-wide admin-new-stage-editor">
                <div className="admin-new-stage-heading"><div><strong>{type === 'ANIMAL' ? 'Зображення тварини на фермі та в курнику' : 'Стадії зображення на полі'}</strong><small>Вибери тип джерела й укажи шлях або URL</small></div><button type="button" onClick={() => { setGrowthImageSources((current) => [...current, '']); restartPreviewCycle(); }}>Додати стадію</button></div>
                {growthImageSources.map((source, index) => (
                  <div className="admin-new-stage-row" key={`new-stage-${index}`}>
                    <div className="admin-new-stage-identity"><span>{index + 1}</span><div>{source.trim() ? <img src={resolveImageUrl(source, assetBaseUrl)} alt={`Стадія ${index + 1}`} /> : 'PNG'}</div></div>
                    <AdminImageUrlInput key={`stage-${index}-${assetBaseUrl}`} className="admin-new-stage-url" label={`Стадія ${index + 1}`} value={source} assetBaseUrl={assetBaseUrl} onChange={(value) => { setGrowthImageSources((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry)); restartPreviewCycle(); }} />
                    <button type="button" onClick={() => { setGrowthImageSources((current) => current.filter((_, entryIndex) => entryIndex !== index)); restartPreviewCycle(); }} aria-label={`Видалити стадію ${index + 1}`}><X size={15} /></button>
                  </div>
                ))}
              </div>
              <label className="admin-create-field-wide">Масштаб спрайта<input type="number" min="0.1" max="8" step="0.1" value={spriteScale} onChange={(event) => setSpriteScale(event.target.value)} /></label>
            </div>
            <label className="admin-create-check"><input type="checkbox" checked={canFlip} onChange={(event) => setCanFlip(event.target.checked)} />Дозволити дзеркальне відображення</label>
          </section>

          <section className="admin-create-section admin-footprint-section">
            <div className="admin-create-section-heading"><span>{isBuilding ? '04' : '05'}</span><div><h2>Зайнята площа</h2><p>{footprintMode === 'mini' ? 'Малі сектори одного великого тайла' : 'Великі тайли ферми'}</p></div><strong className="admin-footprint-size">
              {footprintMode === 'mini' && miniRectangle
                ? `${miniRectangle.width} × ${miniRectangle.height} малі`
                : largeRectangle ? `${largeRectangle.width} × ${largeRectangle.height} великі` : 'Вибери прямокутник'}
            </strong></div>
            <div className="admin-footprint-modes" role="group" aria-label="Розмір тайла">
              <button className={footprintMode === 'mini' ? 'is-active' : ''} type="button" aria-pressed={footprintMode === 'mini'} onClick={() => setFootprintMode('mini')}>Малі сектори</button>
              <button className={footprintMode === 'large' ? 'is-active' : ''} type="button" aria-pressed={footprintMode === 'large'} onClick={() => setFootprintMode('large')}>Великі тайли</button>
            </div>
            <div className={`admin-footprint-board${footprintMode === 'mini' ? ' is-mini-mode' : ''}`} role="group" aria-label="Сітка footprint 8 на 8">
              {Array.from({ length: 64 }, (_, index) => renderFootprintTile(index))}
              {previewPosition && <div className="admin-footprint-sprite" style={previewPosition} aria-hidden="true">
                {previewImage ? <img src={resolveImageUrl(previewImage, assetBaseUrl)} alt="" /> : <span>{selectedIcon}</span>}
              </div>}
            </div>
            <div className="admin-footprint-legend"><span><i className="is-free" />Вільно</span><span><i className="is-used" />Зайнято</span></div>
          </section>

          <footer className="admin-create-actions">
            <button className="admin-create-cancel" type="button" onClick={onCancel}><ArrowLeft size={16} />Скасувати</button>
            <button className="admin-save-button" type="submit" disabled={saving || footprintError}><Check size={16} />{saving ? 'Зберігаємо…' : 'Створити товар'}</button>
          </footer>
        </div>

        <aside className="admin-create-preview">
          <div className="admin-create-preview-heading"><ImagePlus size={17} /><strong>Попередній перегляд</strong></div>
          {renderFarmPreview(growingImage, selectedIcon)}
          <div className="admin-create-preview-name"><span>{type}</span><strong>{name.trim() || 'Новий товар'}</strong><small>{id.trim() || 'item_id'}</small></div>
          <div className="admin-preview-thumbnails" aria-label="Зображення товару">
            <button type="button" onClick={() => setPreviewSelection({ title: 'Іконка магазину', icon: selectedIcon })} aria-label="Збільшити іконку магазину"><span>{selectedIcon}</span><small>Іконка</small></button>
            {shopImage.trim() && <button type="button" onClick={() => setPreviewSelection({ title: 'Зображення магазину', image: shopImage.trim() })} aria-label="Збільшити зображення магазину"><img src={resolveImageUrl(shopImage.trim(), assetBaseUrl)} alt="" /><small>Магазин</small></button>}
            {growthImages.map((source, index) => <button type="button" key={`${source}-${index}`} onClick={() => setPreviewSelection({ title: `Стадія ${index + 1}`, image: source })} aria-label={`Збільшити стадію ${index + 1}`}><img src={resolveImageUrl(source, assetBaseUrl)} alt="" /><small>{index + 1}</small></button>)}
            {yieldImage.trim() && <button type="button" onClick={() => setPreviewSelection({ title: 'Зображення врожаю', image: yieldImage.trim(), icon: yieldIcon })} aria-label="Збільшити зображення врожаю"><img src={resolveImageUrl(yieldImage.trim(), assetBaseUrl)} alt="" /><small>Врожай</small></button>}
          </div>
          <div className="admin-create-preview-meta"><span>Поверхня</span><strong>{placementSurface === 'grass' ? 'Трава' : 'Грядка'}</strong><span>Ціна</span><strong>{Number(price || 0).toLocaleString('uk-UA')} {priceCurrency === 'rubies' ? 'рубінів' : 'монет'}</strong></div>
        </aside>
      </form>
      {previewSelection && <div className="admin-preview-lightbox" role="presentation" onClick={() => setPreviewSelection(null)}>
        <section className="admin-preview-dialog" role="dialog" aria-modal="true" aria-label={previewSelection.title} onClick={(event) => event.stopPropagation()}>
          <header><div><span>ПОПЕРЕДНІЙ ПЕРЕГЛЯД</span><strong>{previewSelection.title}</strong></div><button type="button" onClick={() => setPreviewSelection(null)} aria-label="Закрити перегляд"><X size={18} /></button></header>
          {renderFarmPreview(previewSelection.image ?? '', previewSelection.icon ?? selectedIcon, true)}
          <p>{type === 'CROP' && placementSurface === 'soil' ? 'Рослина росте на грядці' : placementSurface === 'grass' ? 'Об’єкт стоїть на траві' : 'Об’єкт розміщений на грядці'}</p>
        </section>
      </div>}
    </section>
  );
};