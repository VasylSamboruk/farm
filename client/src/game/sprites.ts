import type { GameItemConfig } from '../types/game';

const imageCache = new Map<string, HTMLImageElement>();
const imageLoadCache = new Map<string, Promise<HTMLImageElement>>();
const spriteBoundsCache = new WeakMap<HTMLImageElement, { x: number; y: number; width: number; height: number }>();
const spriteAlphaCache = new WeakMap<HTMLImageElement, Uint8Array>();
const CROP_GROWTH_PHASE_RATIO = 0.8;
const CROP_SEEDLING_SCALE = 0.55;

const getVisibleSpriteBounds = (image: HTMLImageElement) => {
  const cachedBounds = spriteBoundsCache.get(image);
  if (cachedBounds) return cachedBounds;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  sourceContext.drawImage(image, 0, 0);
  let pixels: Uint8ClampedArray;
  try {
    pixels = sourceContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
  } catch {
    const bounds = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    spriteBoundsCache.set(image, bounds);
    return bounds;
  }
  const alphaPixels = new Uint8Array(image.naturalWidth * image.naturalHeight);
  let minX = image.naturalWidth;
  let minY = image.naturalHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.naturalHeight; y++) {
    for (let x = 0; x < image.naturalWidth; x++) {
      const alpha = pixels[(y * image.naturalWidth + x) * 4 + 3];
      alphaPixels[y * image.naturalWidth + x] = alpha;
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bounds = maxX < minX
    ? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  spriteBoundsCache.set(image, bounds);
  spriteAlphaCache.set(image, alphaPixels);
  return bounds;
};

export const isPointOnSprite = (
  worldX: number,
  worldY: number,
  image: HTMLImageElement,
  left: number,
  top: number,
  width: number,
  height: number,
  sourceBounds?: { x: number; y: number; width: number; height: number }
) => {
  const visibleBounds = getVisibleSpriteBounds(image);
  const bounds = sourceBounds ?? visibleBounds;
  if (
    width <= 0 || height <= 0 ||
    worldX < left || worldX > left + width ||
    worldY < top || worldY > top + height
  ) return false;

  const sourceX = bounds.x + Math.min(
    bounds.width - 1,
    Math.floor(((worldX - left) / width) * bounds.width)
  );
  const sourceY = bounds.y + Math.min(
    bounds.height - 1,
    Math.floor(((worldY - top) / height) * bounds.height)
  );
  const alphaPixels = spriteAlphaCache.get(image);
  return !alphaPixels || alphaPixels[sourceY * image.naturalWidth + sourceX] > 8;
};

export const loadGameImage = (src: string): Promise<HTMLImageElement> => {
  const cachedImage = imageCache.get(src);
  if (cachedImage?.complete && cachedImage.naturalWidth > 0) return Promise.resolve(cachedImage);

  const pendingLoad = imageLoadCache.get(src);
  if (pendingLoad) return pendingLoad;

  const image = cachedImage ?? new Image();
  imageCache.set(src, image);
  const load = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(src);
      imageLoadCache.delete(src);
      reject(new Error(`Не вдалося завантажити зображення: ${src}`));
    };
    image.src = src;
  });
  imageLoadCache.set(src, load);
  return load;
};

export const preloadGameImages = async (items: GameItemConfig[]) => {
  const sources = new Set(items.flatMap((item) => [
    ...(item.growthImages ?? []),
    ...(item.shopImage ? [item.shopImage] : []),
    ...(item.yieldImage ? [item.yieldImage] : []),
  ]));
  sources.add('/assets/ui/coin.png');
  sources.add('/assets/ui/rubin.png');
  if (items.some((item) => item.yieldItem === 'flour')) {
    sources.add('/assets/buildings/fabrik/muka.png');
  }
  await Promise.all([...sources].map(loadGameImage));
};

export const getLoadedGameImage = (src?: string) => {
  if (!src) return undefined;
  const image = imageCache.get(src);
  return image?.complete && image.naturalWidth > 0 ? image : undefined;
};

export const getPlacedItemImage = (item: GameItemConfig, tile: { placedAt?: string }, now: number) => {
  const images = item.growthImages;
  if (!images?.length) return undefined;

  if (item.type !== 'CROP' || images.length === 1 || !tile.placedAt || !item.productionTimeMs) {
    return getLoadedGameImage(images[0]);
  }

  const placedAt = new Date(tile.placedAt).getTime();
  if (!Number.isFinite(placedAt)) return getLoadedGameImage(images[0]);

  const elapsed = Math.max(0, now - placedAt);
  if (elapsed >= item.productionTimeMs) return getLoadedGameImage(images[images.length - 1]);

  const visualGrowthTime = item.productionTimeMs * CROP_GROWTH_PHASE_RATIO;
  const growthStageCount = images.length - 1;
  const stageDuration = growthStageCount > 1
    ? visualGrowthTime / (growthStageCount - 1)
    : item.productionTimeMs;
  const growthStage = Math.min(growthStageCount - 1, Math.floor(elapsed / stageDuration));
  return getLoadedGameImage(images[growthStage]);
};

export const drawGameSprite = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  item: GameItemConfig,
  centerX: number,
  groundY: number,
  opacity = 1
) => {
  const bounds = getVisibleSpriteBounds(image);
  const { width, height } = getGameSpriteSize(image, item);

  ctx.save();
  ctx.globalAlpha *= opacity;
  if (item.flipX) {
    ctx.translate(centerX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-centerX, 0);
  }
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    centerX - width / 2,
    groundY - height,
    width,
    height
  );
  ctx.restore();
  return { width, height };
};

export const getGameSpriteSize = (image: HTMLImageElement, item: GameItemConfig) => {
  const footprint = item.footprint ?? { width: 1, height: 1 };
  const bounds = getVisibleSpriteBounds(image);
  const spriteScale = item.spriteScale ?? 1;
  const maxWidth = footprint.width * 88 * spriteScale;
  const maxHeight = footprint.height * 82 * spriteScale;
  const isSeedling = item.type === 'CROP' && (item.growthImages?.length ?? 0) > 1 &&
    getLoadedGameImage(item.growthImages?.[0]) === image;
  const growthScale = isSeedling ? CROP_SEEDLING_SCALE : 1;
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height) * growthScale;

  return { width: bounds.width * scale, height: bounds.height * scale };
};
