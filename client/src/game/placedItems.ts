import type { GameItemConfig } from '../types/game';
import { drawYieldBadge, drawTreeTimer, getTreeHarvestReadyAt } from './trees';
import { drawGameSprite, getGameSpriteSize, getLoadedGameImage, getPlacedItemImage } from './sprites';
import type { TreeTileTiming } from './trees';

const getYieldBadgePosition = (
  item: GameItemConfig,
  tile: TreeTileTiming,
  centerX: number,
  groundY: number,
  now: number
) => {
  const image = getPlacedItemImage(item, tile, now);
  const imageHeight = image
    ? getGameSpriteSize(image, item).height
    : (item.footprint?.width ?? 1) > 1 ? 44 : 34;
  const scale = item.type === 'ANIMAL' ? 0.68 : 1;
  const badgeRadius = 17 * scale;
  const centerY = item.type === 'ANIMAL'
    ? groundY - imageHeight - badgeRadius - 4
    : groundY - ((item.footprint?.width ?? 1) > 1 ? 64 : 48);

  return { centerX, centerY, scale };
};

export const drawPlacedItem = (
  ctx: CanvasRenderingContext2D,
  item: GameItemConfig,
  tile: TreeTileTiming,
  centerX: number,
  groundY: number,
  now: number,
  isHovered: boolean
) => {
  const readyAt = getTreeHarvestReadyAt(tile, item);
  const isReady = Boolean(item.yieldItem) && now >= readyAt;
  const isWide = (item.footprint?.width ?? 1) > 1;
  const icon = item.shopIcon ?? item.yieldIcon ?? '📦';
  const image = getPlacedItemImage(item, tile, now);
  const breathingOffset = item.type === 'ANIMAL'
    ? Math.sin(now / 1100 + centerX * 0.029 + groundY * 0.017) * 1.4
    : 0;

  ctx.save();
  if (item.type === 'ANIMAL') {
    ctx.translate(0, -breathingOffset);
  }
  if (isHovered) {
    ctx.shadowColor = isReady ? 'rgba(255, 211, 92, 0.95)' : 'rgba(179, 232, 153, 0.9)';
    ctx.shadowBlur = 16;
  }
  if (image) {
    drawGameSprite(ctx, image, { ...item, flipX: tile.flipX }, centerX, groundY);
  } else {
    ctx.font = `${isWide ? 44 : 34}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, centerX, groundY - 8);
  }
  ctx.restore();

  if (isReady && (item.yieldIcon || item.yieldImage) && (item.type === 'ANIMAL' || !image)) {
    const badge = getYieldBadgePosition(item, tile, centerX, groundY, now);
    drawYieldBadge(
      ctx,
      badge.centerX,
      badge.centerY,
      item.yieldIcon ?? '📦',
      now,
      badge.scale,
      getLoadedGameImage(item.yieldImage)
    );
  }

  return { readyAt, isReady };
};

export const drawPlacedItemPreview = (
  ctx: CanvasRenderingContext2D,
  item: GameItemConfig,
  centerX: number,
  groundY: number,
  isValidPlacement: boolean
) => {
  const image = getLoadedGameImage(item.growthImages?.[0]);
  ctx.save();
  ctx.globalAlpha = 0.68;
  ctx.shadowColor = isValidPlacement ? 'rgba(128, 235, 119, 0.9)' : 'rgba(255, 83, 80, 0.9)';
  ctx.shadowBlur = 14;
  if (image) {
    drawGameSprite(ctx, image, item, centerX, groundY);
  } else {
    ctx.font = `${(item.footprint?.width ?? 1) > 1 ? 44 : 34}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(item.shopIcon ?? item.yieldIcon ?? '📦', centerX, groundY - 8);
  }
  ctx.restore();
};

export const drawPlacedItemTimer = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  groundY: number,
  secondsLeft: number
) => {
  drawTreeTimer(ctx, centerX, groundY - 66, secondsLeft);
};

export const isPointOnReadyPlacedItem = (
  worldX: number,
  worldY: number,
  item: GameItemConfig,
  tile: TreeTileTiming,
  centerX: number,
  groundY: number,
  now: number
) => {
  if (item.type === 'CROP' || item.type === 'ANIMAL' || item.type === 'BUILDING') {
    const image = getPlacedItemImage(item, tile, now);
    if (image) {
      const { width, height } = getGameSpriteSize(image, item);
      const padding = 12;
      const isOnSprite = worldX >= centerX - width / 2 - padding &&
        worldX <= centerX + width / 2 + padding &&
        worldY >= groundY - height - padding &&
        worldY <= groundY + padding;
      if (isOnSprite) return true;
      if (item.type === 'CROP' || item.type === 'BUILDING') return false;
    }
  }

  if (!item.yieldIcon && !item.yieldImage) return false;

  const badge = getYieldBadgePosition(item, tile, centerX, groundY, now);
  const yieldImage = getLoadedGameImage(item.yieldImage);
  if (yieldImage) {
    const imageSize = 44 * badge.scale;
    if (
      worldX >= badge.centerX - imageSize / 2 && worldX <= badge.centerX + imageSize / 2 &&
      worldY >= badge.centerY - imageSize / 2 - 4 && worldY <= badge.centerY + imageSize / 2 + 4
    ) return true;
  }
  const badgeY = badge.centerY + Math.sin(now / 260) * 2 * badge.scale;
  return Math.hypot(worldX - badge.centerX, worldY - badgeY) <= 17 * badge.scale + 5;
};
