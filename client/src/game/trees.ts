import type { GameItemConfig } from '../types/game';
import { getLoadedGameImage } from './sprites';

export interface TreeTileTiming {
  placedAt?: string;
  lastHarvestedAt?: string;
  flipX?: boolean;
}

export const TREE_RENDER_HEIGHT = 256;
export const getTreeRenderHeight = (item: GameItemConfig) => TREE_RENDER_HEIGHT * (item.spriteScale ?? 1);

export const formatGameDuration = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds)) return '—';
  const duration = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(duration / 1000);
  if (totalSeconds < 60) return `${totalSeconds} с`;

  const hours = Math.floor(duration / 3_600_000);
  const remainingMilliseconds = duration - hours * 3_600_000;
  const minutes = Math.min(59, Math.ceil(remainingMilliseconds / 60_000));
  if (hours === 0) return `${Math.max(1, minutes)} хв`;
  return minutes ? `${hours} год ${minutes} хв` : `${hours} год`;
};

const GROWTH_PHASE_RATIO = 0.8;
const DEFAULT_TREE_GROWTH_ICONS = ['🌱', '🌿', '🌳'];

export const getTreeHarvestReadyAt = (tile: TreeTileTiming, item: GameItemConfig) => {
  const lastHarvestedAt = tile.lastHarvestedAt
    ? new Date(tile.lastHarvestedAt).getTime()
    : null;
  const baseTime = lastHarvestedAt ?? new Date(tile.placedAt ?? '').getTime();

  return Number.isFinite(baseTime) && item.productionTimeMs !== undefined
    ? baseTime + item.productionTimeMs
    : Number.POSITIVE_INFINITY;
};

export const getTreeGrowthStage = (tile: TreeTileTiming, item: GameItemConfig, now: number) => {
  const hasFruitingImage = (item.growthImages?.length ?? 0) > 0;
  const growthStageCount = hasFruitingImage
    ? (item.growthImages?.length ?? 0) - 1
    : DEFAULT_TREE_GROWTH_ICONS.length;
  const productionTimeMs = item.productionTimeMs;

  if (growthStageCount === 0 || productionTimeMs === undefined || productionTimeMs <= 0) return 0;
  const placedAt = new Date(tile.placedAt ?? '').getTime();
  if (!Number.isFinite(placedAt)) return 0;

  const readyAt = getTreeHarvestReadyAt(tile, item);
  if (hasFruitingImage && now >= readyAt) return growthStageCount;
  if (tile.lastHarvestedAt) return growthStageCount - 1;

  const elapsed = Math.max(0, now - placedAt);
  const growthDuration = productionTimeMs * GROWTH_PHASE_RATIO;
  const stageDuration = growthStageCount > 1
    ? growthDuration / (growthStageCount - 1)
    : productionTimeMs;

  return Math.min(growthStageCount - 1, Math.floor(elapsed / stageDuration));
};

const getTreeStageImage = (item: GameItemConfig, stage: number) => {
  return getLoadedGameImage(item.growthImages?.[stage]);
};

export const drawYieldBadge = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  icon: string,
  now: number,
  scale = 1,
  image?: HTMLImageElement
) => {
  const bob = Math.sin(now / 260) * 2 * scale;
  ctx.save();
  if (image) {
    const maxSize = 44 * scale;
    const imageScale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
    const width = image.naturalWidth * imageScale;
    const height = image.naturalHeight * imageScale;
    ctx.shadowColor = 'rgba(255, 202, 67, 0.75)';
    ctx.shadowBlur = 10 * scale;
    ctx.drawImage(image, centerX - width / 2, centerY + bob - height / 2, width, height);
    ctx.restore();
    return;
  }
  ctx.shadowColor = 'rgba(255, 202, 67, 0.75)';
  ctx.shadowBlur = 14 * scale;
  ctx.fillStyle = 'rgba(255, 247, 214, 0.96)';
  ctx.strokeStyle = '#f4c95d';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(centerX, centerY + bob, 17 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = `${21 * scale}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, centerX, centerY + bob + 1);
  ctx.restore();
};

export const drawTree = (
  ctx: CanvasRenderingContext2D,
  item: GameItemConfig,
  tile: TreeTileTiming,
  centerX: number,
  groundY: number,
  now: number,
  isHovered: boolean
) => {
  const stage = getTreeGrowthStage(tile, item, now);
  const readyAt = getTreeHarvestReadyAt(tile, item);
  const isReady = now >= readyAt;
  const image = getTreeStageImage(item, stage);
  const renderHeight = getTreeRenderHeight(item);

  ctx.save();
  if (isHovered) {
    ctx.shadowColor = isReady ? 'rgba(255, 211, 92, 0.95)' : 'rgba(179, 232, 153, 0.9)';
    ctx.shadowBlur = 16;
  }

  if (image) {
    const width = renderHeight * image.naturalWidth / image.naturalHeight;
    if (tile.flipX) {
      ctx.translate(centerX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-centerX, 0);
    }
    ctx.drawImage(image, centerX - width / 2, groundY - renderHeight, width, renderHeight);
  } else {
    const fallbackStage = Math.min(stage, DEFAULT_TREE_GROWTH_ICONS.length - 1);
    ctx.font = `${40 * (item.spriteScale ?? 1)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(DEFAULT_TREE_GROWTH_ICONS[fallbackStage], centerX, groundY - 5);
  }
  ctx.restore();

  if (isReady && item.yieldIcon && !image) {
    drawYieldBadge(ctx, centerX, groundY - 54, item.yieldIcon, now);
  }

  return { stage, readyAt, isReady };
};

export const drawTreePreview = (
  ctx: CanvasRenderingContext2D,
  item: GameItemConfig,
  centerX: number,
  groundY: number,
  isValidPlacement: boolean
) => {
  const image = getTreeStageImage(item, 0);
  const renderHeight = getTreeRenderHeight(item);
  ctx.save();
  ctx.globalAlpha = 0.68;
  ctx.shadowColor = isValidPlacement ? 'rgba(128, 235, 119, 0.9)' : 'rgba(255, 83, 80, 0.9)';
  ctx.shadowBlur = 14;

  if (image) {
    const width = renderHeight * image.naturalWidth / image.naturalHeight;
    if (item.flipX) {
      ctx.translate(centerX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-centerX, 0);
    }
    ctx.drawImage(image, centerX - width / 2, groundY - renderHeight, width, renderHeight);
  } else {
    ctx.font = `${40 * (item.spriteScale ?? 1)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(DEFAULT_TREE_GROWTH_ICONS[0], centerX, groundY - 5);
  }

  ctx.restore();
};

export const drawTreeTimer = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  secondsLeft: number
) => {
  const width = 72;
  const height = 26;
  const left = centerX - width / 2;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  ctx.save();
  ctx.fillStyle = 'rgba(22, 31, 27, 0.94)';
  ctx.strokeStyle = 'rgba(220, 242, 219, 0.78)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, topY, width, height, 9);
  ctx.fill();
  ctx.stroke();
  ctx.font = "800 12px 'FarmBody', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, centerX, topY + height / 2);
  ctx.restore();
};

export const isPointOnReadyTree = (
  worldX: number,
  worldY: number,
  item: GameItemConfig,
  stage: number,
  centerX: number,
  groundY: number,
  now: number
) => {
  const image = getTreeStageImage(item, stage);
  if (image) {
    const renderHeight = getTreeRenderHeight(item);
    const width = renderHeight * image.naturalWidth / image.naturalHeight;
    const left = centerX - width / 2;
    const top = groundY - renderHeight;
    const padding = 12;
    return worldX >= left - padding && worldX <= left + width + padding &&
      worldY >= top - padding && worldY <= groundY + padding;
  }

  if (!item.yieldIcon) return false;
  const badgeX = centerX;
  const badgeY = groundY - 54 + Math.sin(now / 260) * 2;
  return Math.hypot(worldX - badgeX, worldY - badgeY) <= 20;
};
