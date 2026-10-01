import React, { useRef, useEffect } from 'react';
import { HARVEST_QUEUE_DURATION_MS, useFarmStore } from '../../store/useFarmStore';
import { useToolStore } from '../../store/useToolStore';
import { useAuthStore } from '../../store/authStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { findPlacedItemAtQuadrant, getMovedOccupiedCells, getOccupiedCells } from '../../game/footprint';
import {
  drawPlacedItem,
  drawPlacedItemPreview,
  isPointOnReadyPlacedItem,
} from '../../game/placedItems';
import {
  drawTree,
  drawTreePreview,
  getTreeRenderHeight,
  getTreeGrowthStage,
  getTreeHarvestReadyAt,
  isPointOnReadyTree,
  formatGameDuration,
  TREE_RENDER_HEIGHT,
} from '../../game/trees';
import { getLoadedGameImage, preloadGameImages } from '../../game/sprites';
import type { TileData } from '../../store/useFarmStore';

// Тип для вилітаючих текстів
interface FloatingText {
  id: number;
  x: number;
  y: number;
  lines: { msg: string; color: string; image?: string }[];
  createdAt: number;
  targetX?: number;
  targetY?: number;
}

type FloatingTarget = 'inventory' | 'level';

const GRID_CONFIG = { cols: 15, rows: 15, tileWidth: 200, tileHeight: 100 };

interface FarmCanvasProps {
  readOnly?: boolean;
  previewTiles?: Record<string, TileData>;
}

export const FarmCanvas: React.FC<FarmCanvasProps> = ({ readOnly = false, previewTiles }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const {
    tiles,
    digTile,
    removeTile,
    placeItem,
    rotateTile,
    moveTile,
    enqueueHarvest,
    notifyGameMessage,
    harvestQueue,
    activeHarvestStartedAt,
  } = useFarmStore();
  const { activeTool } = useToolStore();
  const { user } = useAuthStore();
  const gameItems = useGameConfigStore((state) => state.items);
  const displayedTiles = previewTiles ?? tiles;

  const cameraRef = useRef({ x: 0, y: 0, zoom: 1, minZoom: 0.5, maxZoom: 2.2 });
  const isDragging = useRef(false);
  const pointerDownOnCanvas = useRef(false);
  const pointerDownPosition = useRef({ x: 0, y: 0 });
  const startPan = useRef({ x: 0, y: 0 });
  const hoveredTile = useRef<{ row: number; col: number; quadrant: number } | null>(null);
  const lastPinchRef = useRef<{ distance: number; centerX: number; centerY: number } | null>(null);
  const touchMoveSourceRef = useRef<{ row: number; col: number; quadrant: number } | null>(null);
  const touchObjectDragRef = useRef(false);

  const activeToolRef = useRef(activeTool);
  const tilesRef = useRef(tiles);
  const userRef = useRef(user);
  const gameItemsRef = useRef(gameItems);
  const harvestQueueRef = useRef(harvestQueue);
  const activeHarvestStartedAtRef = useRef(activeHarvestStartedAt);
  const movingItemRef = useRef<{ row: number; col: number; quadrant: number; isDirt?: boolean } | null>(null);

  useEffect(() => {
    activeToolRef.current = activeTool;
    tilesRef.current = displayedTiles;
    userRef.current = user;
    gameItemsRef.current = gameItems;
    harvestQueueRef.current = harvestQueue;
    activeHarvestStartedAtRef.current = activeHarvestStartedAt;
  }, [activeTool, displayedTiles, user, gameItems, harvestQueue, activeHarvestStartedAt]);

  useEffect(() => {
    if (activeTool !== 'move') movingItemRef.current = null;
  }, [activeTool]);

  useEffect(() => {
    void preloadGameImages(Object.values(gameItems)).catch((error: unknown) => {
      console.error('Не вдалося завантажити зображення гри:', error);
    });
  }, [gameItems]);

  // Масив для збереження анімацій тексту
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const floatingIdCounter = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const backgroundImage = getLoadedGameImage('/assets/fonik1.png');
    const grassImage = getLoadedGameImage('/assets/tiles/grass_tile.png');
    const dirtImage = getLoadedGameImage('/assets/tiles/dirt_tile.png');
    let viewportWidth = 1;
    let viewportHeight = 1;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      viewportWidth = Math.max(1, Math.round(bounds.width));
      viewportHeight = Math.max(1, Math.round(bounds.height));
      canvas.width = Math.max(1, Math.round(viewportWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(viewportHeight * pixelRatio));
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    cameraRef.current.x = viewportWidth / 2;
    cameraRef.current.y = readOnly ? viewportHeight / 2 : viewportHeight / 4.5;
    if (readOnly) {
      const worldWidth = (GRID_CONFIG.cols + GRID_CONFIG.rows) * GRID_CONFIG.tileWidth / 2;
      const worldHeight = (GRID_CONFIG.cols + GRID_CONFIG.rows) * GRID_CONFIG.tileHeight / 2 + TREE_RENDER_HEIGHT;
      cameraRef.current.minZoom = 0.06;
      cameraRef.current.maxZoom = 1.4;
      cameraRef.current.zoom = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight) * 0.92;
    }

    const drawIsometricDiamond = (isoX: number, isoY: number, halfW: number, halfH: number, scale = 1) => {
      ctx.beginPath();
      ctx.moveTo(isoX, isoY - (halfH * scale) + halfH);
      ctx.lineTo(isoX + (halfW * scale), isoY + halfH);
      ctx.lineTo(isoX, isoY + (halfH * scale) + halfH);
      ctx.lineTo(isoX - (halfW * scale), isoY + halfH);
      ctx.closePath();
    };

    const getQuadrantOffset = (q: number, halfW: number, halfH: number) => {
      if (q === 0) return { dx: 0, dy: -halfH / 2 };
      if (q === 1) return { dx: halfW / 2, dy: 0 };
      if (q === 2) return { dx: -halfW / 2, dy: 0 };
      return { dx: 0, dy: halfH / 2 };
    };

    const drawMiniGrid = (isoX: number, isoY: number, halfW: number, halfH: number) => {
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        const { dx, dy } = getQuadrantOffset(quadrant, halfW, halfH);
        drawIsometricDiamond(isoX + dx, isoY + dy, halfW, halfH, 0.5);
        ctx.fillStyle = 'rgba(163, 224, 139, 0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(207, 250, 184, 0.72)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    const drawItemTooltip = (name: string, status: string, centerX: number, topY: number) => {
      ctx.save();
      const scale = 1 / cameraRef.current.zoom;
      const titleFontSize = 13 * scale;
      const statusFontSize = 11 * scale;
      const horizontalPadding = 24 * scale;
      const title = name.length > 24 ? `${name.slice(0, 23)}…` : name;
      const titleOnly = status.length === 0;
      const height = (titleOnly ? 28 : 42) * scale;
      ctx.font = `700 ${titleFontSize}px sans-serif`;
      const width = Math.max(ctx.measureText(title).width, titleOnly ? 0 : ctx.measureText(status).width) + horizontalPadding;
      const left = centerX - width / 2;
      const top = topY - height - 4 * scale;

      ctx.fillStyle = 'rgba(18, 28, 24, 0.94)';
      ctx.strokeStyle = 'rgba(213, 236, 192, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left, top, width, height, 9 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(title, centerX, titleOnly ? top + height / 2 : top + 13 * scale);
      if (!titleOnly) {
        ctx.font = `600 ${statusFontSize}px sans-serif`;
        ctx.fillStyle = '#c5e8a6';
        ctx.fillText(status, centerX, top + 30 * scale);
      }
      ctx.restore();
    };

    // ФУНКЦІЯ: Додати вилітаючий текст
    const addFloatingText = (row: number, col: number, q: number, lines: { msg: string; color: string; image?: string }[], target?: FloatingTarget) => {
      const halfW = GRID_CONFIG.tileWidth / 2;
      const halfH = GRID_CONFIG.tileHeight / 2;
      const isoX = (col - row) * halfW;
      const isoY = (col + row) * halfH;
      const { dx, dy } = getQuadrantOffset(q, halfW, halfH);
      const buttonSize = Math.min(64, Math.max(48, window.innerWidth * 0.15));
      const buttonGap = Math.min(18, Math.max(6, window.innerWidth * 0.02));
      const targetScreenX = target === 'level'
        ? 12 + 37.5
        : window.innerWidth / 2 + (buttonSize * 2 + buttonGap * 2);
      const targetScreenY = target === 'level'
        ? 12 + 37.5
        : window.innerHeight - 20 - buttonSize / 2;
      
      floatingTextsRef.current.push({
        id: floatingIdCounter.current++,
        x: isoX + dx,
        y: isoY + dy,
        lines,
        createdAt: Date.now(),
        targetX: target ? (targetScreenX - cameraRef.current.x) / cameraRef.current.zoom : undefined,
        targetY: target ? (targetScreenY - cameraRef.current.y) / cameraRef.current.zoom : undefined,
      });
    };

    const render = () => {
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);

      if (backgroundImage) {
        const backgroundScale = Math.max(
          viewportWidth / backgroundImage.naturalWidth,
          viewportHeight / backgroundImage.naturalHeight
        );
        const backgroundWidth = backgroundImage.naturalWidth * backgroundScale;
        const backgroundHeight = backgroundImage.naturalHeight * backgroundScale;
        ctx.drawImage(
          backgroundImage,
          (viewportWidth - backgroundWidth) / 2,
          (viewportHeight - backgroundHeight) / 2,
          backgroundWidth,
          backgroundHeight
        );
      } else {
        ctx.fillStyle = '#1b222d';
        ctx.fillRect(0, 0, viewportWidth, viewportHeight);
      }

      ctx.save();
      ctx.translate(cameraRef.current.x, cameraRef.current.y);
      ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);

      const { cols, rows, tileWidth, tileHeight } = GRID_CONFIG;
      const halfW = tileWidth / 2;
      const halfH = tileHeight / 2;
      const now = Date.now();
      const gridCellKeys = new Set<string>();
      const footprintCellKeys = new Set<string>();
      const hovered = hoveredTile.current;
      const activeGridTool = readOnly ? null : activeToolRef.current;
      if (hovered && activeGridTool) {
        let gridCells = [{ row: hovered.row, col: hovered.col }];
        if (activeGridTool.startsWith('place_')) {
          const previewItem = gameItemsRef.current[activeGridTool.replace('place_', '')];
          const footprintCells = previewItem
            ? getOccupiedCells(hovered.row, hovered.col, hovered.quadrant, previewItem)
            : null;
          if (footprintCells) gridCells = footprintCells;
        } else if (activeGridTool === 'move' && movingItemRef.current) {
          const source = movingItemRef.current;
          const sourceTile = tilesRef.current[`${source.row},${source.col},${source.quadrant}`];
          const movingItem = sourceTile?.itemId ? gameItemsRef.current[sourceTile.itemId] : undefined;
          const footprintCells = movingItem
            ? getMovedOccupiedCells(
              sourceTile?.occupiedCells ?? [],
              hovered.row,
              hovered.col,
              hovered.quadrant,
              source.row,
              source.col,
              source.quadrant,
              movingItem,
              sourceTile?.flipX ?? false
            )
            : null;
          if (footprintCells) gridCells = footprintCells;
        } else if (activeGridTool === 'rotate' || activeGridTool === 'move') {
          const target = findPlacedItemAtQuadrant(tilesRef.current, hovered.row, hovered.col, hovered.quadrant);
          const targetItem = target?.tile.itemId ? gameItemsRef.current[target.tile.itemId] : undefined;
          if (target && targetItem) {
            const targetKey = target.key.split(',').map(Number);
            const footprintCells = target.tile.occupiedCells?.length
              ? target.tile.occupiedCells
                : getOccupiedCells(targetKey[0], targetKey[1], target.quadrant, targetItem, target.tile.flipX ?? false);
            if (footprintCells) gridCells = footprintCells;
          }
        }
        for (const cell of gridCells) {
          gridCellKeys.add(`${cell.row},${cell.col}`);
          if ('quadrant' in cell) footprintCellKeys.add(`${cell.row},${cell.col},${cell.quadrant}`);
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const isoX = (c - r) * halfW;
          const isoY = (c + r) * halfH;

          // 1. Трава
          if (grassImage?.complete && grassImage.naturalWidth !== 0) {
            ctx.drawImage(grassImage, isoX - halfW, isoY, tileWidth, tileHeight);
          } else {
            drawIsometricDiamond(isoX, isoY, halfW, halfH);
            ctx.fillStyle = (r + c) % 2 === 0 ? '#5c9432' : '#52852b'; ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; ctx.stroke();
          }

          // 2. Грядка
          const dirtKey = `${r},${c},-1`;
          const dirtData = tilesRef.current[dirtKey];
          if (dirtData && dirtData.type === 'dirt') {
            if (dirtImage?.complete && dirtImage.naturalWidth !== 0) {
              ctx.drawImage(dirtImage, isoX - halfW, isoY, tileWidth, tileHeight);
            } else {
              drawIsometricDiamond(isoX, isoY, halfW, halfH);
              ctx.fillStyle = '#6d4c41'; ctx.fill();
              ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 2; ctx.stroke();
            }
          }

          if (gridCellKeys.has(`${r},${c}`)) {
            drawMiniGrid(isoX, isoY, halfW, halfH);
          }
          for (let quadrant = 0; quadrant < 4; quadrant++) {
            if (!footprintCellKeys.has(`${r},${c},${quadrant}`)) continue;
            const { dx, dy } = getQuadrantOffset(quadrant, halfW, halfH);
            drawIsometricDiamond(isoX + dx, isoY + dy, halfW, halfH, 0.5);
            ctx.fillStyle = 'rgba(113, 221, 129, 0.24)';
            ctx.fill();
            ctx.strokeStyle = '#a1f0a5';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // 3. Дерева (4 стадії росту)
          for (let q = 0; q < 4; q++) {
            const treeKey = `${r},${c},${q}`;
            const treeData = tilesRef.current[treeKey];
            
            if (treeData && treeData.type === 'item') {
              const item = treeData.itemId ? gameItemsRef.current[treeData.itemId] : undefined;
              if (!item) continue;

              const occupiedCells = treeData.occupiedCells?.length
                ? treeData.occupiedCells
                : getOccupiedCells(r, c, q, item) ?? [{ row: r, col: c, quadrant: q }];
              if (occupiedCells.some((cell) => cell.row !== r || cell.col !== c)) continue;
              const occupiedPositions = occupiedCells.map((cell) => {
                const cellIsoX = (cell.col - cell.row) * halfW;
                const cellIsoY = (cell.col + cell.row) * halfH;
                const offset = getQuadrantOffset(cell.quadrant, halfW, halfH);
                return { x: cellIsoX + offset.dx, groundY: cellIsoY + halfH + offset.dy };
              });
              const centerX = occupiedPositions.reduce((sum, position) => sum + position.x, 0) / occupiedPositions.length;
              const groundY = Math.max(...occupiedPositions.map((position) => position.groundY));
              const isHovered = hoveredTile.current?.row === r &&
                hoveredTile.current.col === c &&
                occupiedCells.some((cell) => cell.row === r && cell.col === c && cell.quadrant === hoveredTile.current?.quadrant);
              const queueIndex = harvestQueueRef.current.findIndex((entry) =>
                entry.row === r && entry.col === c && entry.quadrant === q
              );
              if (!readOnly && activeToolRef.current !== null) {
                ctx.save();
                if (queueIndex >= 0) {
                  ctx.globalAlpha = 0.48;
                  ctx.shadowColor = 'rgba(255, 207, 80, 0.95)';
                  ctx.shadowBlur = 22;
                }
                if (item.type === 'TREE') {
                  drawTree(ctx, item, treeData, centerX, groundY, now, isHovered);
                } else {
                  drawPlacedItem(ctx, item, treeData, centerX, groundY, now, isHovered);
                }
                ctx.restore();

                if (queueIndex === 0 && activeHarvestStartedAtRef.current !== null) {
                  const progress = Math.min(
                    1,
                    Math.max(0, (now - activeHarvestStartedAtRef.current) / HARVEST_QUEUE_DURATION_MS)
                  );
                  const barWidth = 56;
                  const barHeight = 5;
                  const barX = centerX - barWidth / 2;
                  const barY = groundY - (item.type === 'TREE' ? getTreeRenderHeight(item) : 86) - 12;
                  ctx.save();
                  ctx.fillStyle = 'rgba(16, 24, 18, 0.88)';
                  ctx.beginPath();
                  ctx.roundRect(barX, barY, barWidth, barHeight, 3);
                  ctx.fill();
                  if (progress > 0) {
                    ctx.fillStyle = '#f3d582';
                    ctx.shadowColor = 'rgba(243, 213, 130, 0.75)';
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 3);
                    ctx.fill();
                  }
                  ctx.restore();
                }

                if (isHovered) {
                  let status = 'Готово до збору';
                  if (queueIndex >= 0) {
                    if (queueIndex === 0 && activeHarvestStartedAtRef.current !== null) {
                      status = 'Збираємо';
                    } else {
                      status = 'Очікує збору';
                    }
                  } else if (Date.now() < getTreeHarvestReadyAt(treeData, item)) {
                    status = `До готовності: ${formatGameDuration(getTreeHarvestReadyAt(treeData, item) - now)}`;
                  }
                  drawItemTooltip(
                    item.name,
                    status,
                    centerX,
                    groundY - (item.type === 'TREE' ? getTreeRenderHeight(item) : 96) - 4
                  );
                }
              }
            }
          }

          // 4. Підсвітка при наведенні
          if (hoveredTile.current && hoveredTile.current.row === r && hoveredTile.current.col === c && activeToolRef.current) {
            const isMovePreview = activeToolRef.current === 'move' && movingItemRef.current;
            const movingTile = isMovePreview
              ? tilesRef.current[`${movingItemRef.current!.row},${movingItemRef.current!.col},${movingItemRef.current!.quadrant}`]
              : undefined;
            const previewItemId = activeToolRef.current.startsWith('place_')
              ? activeToolRef.current.replace('place_', '')
              : movingTile?.itemId;
            const previewItem = previewItemId ? gameItemsRef.current[previewItemId] : undefined;
            const movingSourceDirt = isMovePreview && movingItemRef.current
              ? tilesRef.current[`${movingItemRef.current.row},${movingItemRef.current.col},-1`]
              : undefined;

            if (isMovePreview && movingTile?.type === 'dirt') {
              const destinationHasTile = Object.entries(tilesRef.current).some(([key]) => {
                const [tileRow, tileCol] = key.split(',').map(Number);
                return tileRow === r && tileCol === c;
              });
              const isValidDirtMove = r >= 0 && r < rows && c >= 0 && c < cols && (!destinationHasTile ||
                (movingItemRef.current?.row === r && movingItemRef.current.col === c));
              drawIsometricDiamond(isoX, isoY, halfW, halfH);
              ctx.fillStyle = isValidDirtMove ? 'rgba(129, 199, 132, 0.42)' : 'rgba(244, 67, 54, 0.48)';
              ctx.fill();
              ctx.strokeStyle = isValidDirtMove ? '#9be7a0' : '#f44336';
              ctx.lineWidth = 2;
              ctx.stroke();
            } else if (previewItem && (activeToolRef.current.startsWith('place_') || isMovePreview)) {
              const calculatedPreviewCells = (isMovePreview && movingTile
                ? getMovedOccupiedCells(
                  movingTile.occupiedCells ?? [],
                  r,
                  c,
                  hoveredTile.current.quadrant,
                  movingItemRef.current!.row,
                  movingItemRef.current!.col,
                  movingItemRef.current!.quadrant,
                  previewItem,
                  movingTile.flipX ?? false
                )
                : getOccupiedCells(r, c, hoveredTile.current.quadrant, previewItem)) ??
                null;
              const previewCells = calculatedPreviewCells ??
                [{ row: r, col: c, quadrant: hoveredTile.current.quadrant }];
              const hasValidFootprint = Boolean(calculatedPreviewCells);
              const cellsAreInsideGrid = previewCells.every((cell) =>
                cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols
              );
              const previewSurfaceCells = previewCells.map((cell) => tilesRef.current[`${cell.row},${cell.col},-1`]);
              const movingCropWithBed = Boolean(isMovePreview && previewItem.type === 'CROP' && movingSourceDirt?.type === 'dirt');
              const isSameBedCell = movingItemRef.current?.row === r && movingItemRef.current.col === c;
              const surfaceIsValid = movingCropWithBed
                ? (!tilesRef.current[`${r},${c},-1`] || isSameBedCell)
                : previewItem.placementSurface === 'soil'
                  ? previewCells.every((_, index) => Boolean(previewSurfaceCells[index]))
                  : previewCells.every((cell) => !tilesRef.current[`${cell.row},${cell.col},-1`]);
              const footprintIsFree = previewCells.every((cell) => {
                const placed = findPlacedItemAtQuadrant(tilesRef.current, cell.row, cell.col, cell.quadrant);
                if (!placed) return true;
                return Boolean(isMovePreview &&
                  placed.key === `${movingItemRef.current!.row},${movingItemRef.current!.col},${movingItemRef.current!.quadrant}`);
              });
              const isValidPlacement = hasValidFootprint && cellsAreInsideGrid && surfaceIsValid && footprintIsFree;

              if (isMovePreview && previewItem.type === 'CROP' && movingSourceDirt?.type === 'dirt') {
                ctx.save();
                ctx.globalAlpha = isValidPlacement ? 0.58 : 0.34;
                if (dirtImage?.complete && dirtImage.naturalWidth !== 0) {
                  ctx.drawImage(dirtImage, isoX - halfW, isoY, tileWidth, tileHeight);
                } else {
                  drawIsometricDiamond(isoX, isoY, halfW, halfH);
                  ctx.fillStyle = '#6d4c41';
                  ctx.fill();
                }
                ctx.restore();
              }

              for (const cell of previewCells) {
                const cellIsoX = (cell.col - cell.row) * halfW;
                const cellIsoY = (cell.col + cell.row) * halfH;
                const { dx, dy } = getQuadrantOffset(cell.quadrant, halfW, halfH);
                drawIsometricDiamond(cellIsoX + dx, cellIsoY + dy, halfW, halfH, 0.5);
                ctx.fillStyle = isValidPlacement ? 'rgba(76, 175, 80, 0.38)' : 'rgba(244, 67, 54, 0.48)';
                ctx.fill();
                ctx.strokeStyle = isValidPlacement ? '#79e36e' : '#f44336';
                ctx.lineWidth = 2;
                ctx.stroke();
              }

              if (previewItem) {
                const previewPositions = previewCells.map((cell) => {
                  const cellIsoX = (cell.col - cell.row) * halfW;
                  const cellIsoY = (cell.col + cell.row) * halfH;
                  const offset = getQuadrantOffset(cell.quadrant, halfW, halfH);
                  return { x: cellIsoX + offset.dx, groundY: cellIsoY + halfH + offset.dy };
                });
                const previewCenterX = previewPositions.reduce((sum, position) => sum + position.x, 0) / previewPositions.length;
                const previewGroundY = Math.max(...previewPositions.map((position) => position.groundY));
                const previewRenderItem = movingTile ? { ...previewItem, flipX: movingTile.flipX } : previewItem;

                if (previewItem.type === 'TREE') {
                  drawTreePreview(ctx, previewRenderItem, previewCenterX, previewGroundY, isValidPlacement);
                } else {
                  drawPlacedItemPreview(ctx, previewRenderItem, previewCenterX, previewGroundY, isValidPlacement);
                }
              }
            } 
            else {
              drawIsometricDiamond(isoX, isoY, halfW, halfH);
              if (activeToolRef.current === 'shovel' && !dirtData) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fill();
              } else if (activeToolRef.current === 'trash') {
                ctx.fillStyle = 'rgba(255, 82, 82, 0.45)'; ctx.fill();
              }
            }
          }
        }
      }

      const activeTool = readOnly ? null : activeToolRef.current;
      const placedItems = Object.entries(tilesRef.current)
        .flatMap(([key, tile]) => {
          if (tile.type !== 'item' || !tile.placedAt) return [];
          const [row, col, quadrant] = key.split(',').map(Number);
          const item = tile.itemId ? gameItemsRef.current[tile.itemId] : undefined;
          if (!item) return [];
          const occupiedCells = tile.occupiedCells?.length
            ? tile.occupiedCells
            : getOccupiedCells(row, col, quadrant, item) ?? [{ row, col, quadrant }];
          const isCrossCell = occupiedCells.some((cell) => cell.row !== row || cell.col !== col);

          const positions = occupiedCells.map((cell) => {
            const cellIsoX = (cell.col - cell.row) * halfW;
            const cellIsoY = (cell.col + cell.row) * halfH;
            const offset = getQuadrantOffset(cell.quadrant, halfW, halfH);
            return { x: cellIsoX + offset.dx, groundY: cellIsoY + halfH + offset.dy };
          });
          return [{
            row,
            col,
            quadrant,
            tile,
            item,
            occupiedCells,
            isCrossCell,
            centerX: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
            groundY: Math.max(...positions.map((position) => position.groundY)),
          }];
        })
        .sort((a, b) => a.groundY - b.groundY || a.row - b.row || a.col - b.col || a.quadrant - b.quadrant);
      const isInFrontOf = (candidate: (typeof placedItems)[number], structure: (typeof placedItems)[number]) =>
        candidate.groundY > structure.groundY ||
        (candidate.groundY === structure.groundY && (
          candidate.row > structure.row ||
          (candidate.row === structure.row && candidate.col > structure.col) ||
          (candidate.row === structure.row && candidate.col === structure.col && candidate.quadrant > structure.quadrant)
        ));

      const drawPlacedObject = (placed: (typeof placedItems)[number], drawIndicators: boolean) => {
        const { row, col, quadrant, tile, item, occupiedCells, centerX, groundY } = placed;
        const isHovered = Boolean(hoveredTile.current && occupiedCells.some((cell) =>
          cell.row === hoveredTile.current?.row &&
          cell.col === hoveredTile.current?.col &&
          cell.quadrant === hoveredTile.current?.quadrant
        ));
        const queueIndex = harvestQueueRef.current.findIndex((entry) =>
          entry.row === row && entry.col === col && entry.quadrant === quadrant
        );
        ctx.save();
        if (queueIndex >= 0) {
          ctx.globalAlpha = 0.48;
          ctx.shadowColor = 'rgba(255, 207, 80, 0.95)';
          ctx.shadowBlur = 22;
        }
        const itemState = item.type === 'TREE'
          ? drawTree(ctx, item, tile, centerX, groundY, now, isHovered)
          : drawPlacedItem(ctx, item, tile, centerX, groundY, now, isHovered);
        ctx.restore();

        if (!drawIndicators) return;

        if (queueIndex === 0 && activeHarvestStartedAtRef.current !== null) {
          const progress = Math.min(
            1,
            Math.max(0, (now - activeHarvestStartedAtRef.current) / HARVEST_QUEUE_DURATION_MS)
          );
          const barWidth = 56;
          const barHeight = 5;
          const barX = centerX - barWidth / 2;
          const barY = groundY - (item.type === 'TREE' ? getTreeRenderHeight(item) : 86) - 12;
          ctx.save();
          ctx.fillStyle = 'rgba(16, 24, 18, 0.88)';
          ctx.beginPath();
          ctx.roundRect(barX, barY, barWidth, barHeight, 3);
          ctx.fill();
          if (progress > 0) {
            ctx.fillStyle = '#f3d582';
            ctx.shadowColor = 'rgba(243, 213, 130, 0.75)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barWidth * progress, barHeight, 3);
            ctx.fill();
          }
          ctx.restore();
        }

        if (!activeTool && isHovered) {
          let status = item.type === 'BUILDING'
            ? ''
            : itemState.isReady ? 'Готово до збору' : 'До готовності: ...';
          if (item.type !== 'BUILDING' && queueIndex >= 0) {
            status = queueIndex === 0 && activeHarvestStartedAtRef.current !== null ? 'Збираємо' : 'Очікує збору';
          } else if (item.type !== 'BUILDING' && !itemState.isReady && Number.isFinite(itemState.readyAt)) {
            status = `До готовності: ${formatGameDuration(itemState.readyAt - now)}`;
          }
          drawItemTooltip(
            item.name,
            status,
            centerX,
            groundY - (item.type === 'TREE' ? getTreeRenderHeight(item) : 96) - 4
          );
        }
      };

      if (!activeTool) {
        for (const placed of placedItems) drawPlacedObject(placed, true);
      } else {
        const crossCellItems = placedItems.filter((placed) => placed.isCrossCell);
        const foregroundPlants = placedItems.filter((placed) =>
          !placed.isCrossCell && ['TREE', 'CROP', 'ANIMAL'].includes(placed.item.type)
        );

        for (const structure of crossCellItems) {
          drawPlacedObject(structure, false);
          for (const plant of foregroundPlants) {
            if (isInFrontOf(plant, structure)) drawPlacedObject(plant, false);
          }
        }
      }

      // 5. ВІДМАЛЬОВКА ВИЛІТАЮЧИХ ТЕКСТІВ
      floatingTextsRef.current = floatingTextsRef.current.filter(ft => {
        const age = now - ft.createdAt;
        const lifeTime = 1200; // Анімація живе 1.2 секунди
        if (age > lifeTime) return false;

        const progress = age / lifeTime;
        const offsetY = progress * 60; // Піднімається на 60px вгору
        const alpha = 1 - Math.pow(progress, 3); // Плавне затухання в кінці
        const imageLine = ft.lines.find((line) => line.image);
        const popupFontSize = 15 / cameraRef.current.zoom;
        const popupOutlineWidth = 2 / cameraRef.current.zoom;

        ctx.save();
        ctx.globalAlpha = alpha;
        if (ft.targetX !== undefined && ft.targetY !== undefined) {
          const easedProgress = 1 - Math.pow(1 - progress, 3);
          const flightX = ft.x + (ft.targetX - ft.x) * easedProgress;
          const flightY = ft.y + (ft.targetY - ft.y) * easedProgress;
          const image = imageLine?.image ? getLoadedGameImage(imageLine.image) : undefined;
          if (image) {
            const imageX = ft.x + (ft.targetX - ft.x) * easedProgress;
            const imageY = ft.y + (ft.targetY - ft.y) * easedProgress;
            ctx.shadowColor = 'rgba(255, 239, 170, 0.9)';
            ctx.shadowBlur = 12;
            ctx.drawImage(image, imageX - 18, imageY - 18, 36, 36);
            ctx.restore();
            return true;
          }
          if (!imageLine?.image) {
            ctx.font = `900 ${popupFontSize}px 'Inter', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = popupOutlineWidth;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.strokeText(ft.lines[0].msg, flightX, flightY);
            ctx.fillStyle = ft.lines[0].color;
            ctx.fillText(ft.lines[0].msg, flightX, flightY);
            ctx.restore();
            return true;
          }
        }
        ctx.font = `900 ${popupFontSize}px 'Inter', sans-serif`;
        ctx.textBaseline = 'middle';
        ft.lines.forEach((line, index) => {
          const image = line.image ? getLoadedGameImage(line.image) : undefined;
          const iconSize = image ? 17 / cameraRef.current.zoom : 0;
          const gap = image ? 5 / cameraRef.current.zoom : 0;
          const horizontalPadding = 8 / cameraRef.current.zoom;
          const rowHeight = 25 / cameraRef.current.zoom;
          const textWidth = ctx.measureText(line.msg).width;
          const rowWidth = horizontalPadding * 2 + iconSize + gap + textWidth;
          const rowCenterY = ft.y - (54 / cameraRef.current.zoom) - offsetY -
            index * (rowHeight + 4 / cameraRef.current.zoom);
          const rowLeft = ft.x - rowWidth / 2;
          const rowTop = rowCenterY - rowHeight / 2;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
          ctx.shadowBlur = 8 / cameraRef.current.zoom;
          ctx.fillStyle = 'rgba(20, 29, 24, 0.9)';
          ctx.strokeStyle = 'rgba(255, 235, 190, 0.82)';
          ctx.lineWidth = 1 / cameraRef.current.zoom;
          ctx.beginPath();
          ctx.roundRect(rowLeft, rowTop, rowWidth, rowHeight, rowHeight / 2);
          ctx.fill();
          ctx.stroke();

          let textX = ft.x;
          if (image) {
            ctx.drawImage(image, rowLeft + horizontalPadding, rowCenterY - iconSize / 2, iconSize, iconSize);
            textX = rowLeft + horizontalPadding + iconSize + gap;
          }
          ctx.font = `900 ${popupFontSize}px 'Inter', sans-serif`;
          ctx.textAlign = image ? 'left' : 'center';
          ctx.lineWidth = popupOutlineWidth;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
          ctx.strokeText(line.msg, textX, rowCenterY);
          ctx.fillStyle = line.color;
          ctx.fillText(line.msg, textX, rowCenterY);
          ctx.restore();
        });
          hoveredTile.current = null;
        
        ctx.restore();
        return true;
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const getGridTileFromScreen = (screenX: number, screenY: number) => {
      const { tileWidth, tileHeight, cols, rows } = GRID_CONFIG;
      const halfW = tileWidth / 2;
      const halfH = tileHeight / 2;
      const relX = (screenX - cameraRef.current.x) / cameraRef.current.zoom;
      const relY = (screenY - cameraRef.current.y) / cameraRef.current.zoom;
      
      const localCol = (relX / halfW + relY / halfH) / 2;
      const localRow = (relY / halfH - relX / halfW) / 2;
      const col = Math.floor(localCol);
      const row = Math.floor(localRow);

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const fracCol = localCol - col;
        const fracRow = localRow - row;
        
        const quadrant = fracRow < 0.5
          ? (fracCol < 0.5 ? 0 : 1)
          : (fracCol < 0.5 ? 2 : 3);

        return { row, col, quadrant };
      }
      return null;
    };

    const getReadyItemAtScreen = (screenX: number, screenY: number, readyOnly = true) => {
      const halfW = GRID_CONFIG.tileWidth / 2;
      const halfH = GRID_CONFIG.tileHeight / 2;
      const now = Date.now();
      const worldX = (screenX - cameraRef.current.x) / cameraRef.current.zoom;
      const worldY = (screenY - cameraRef.current.y) / cameraRef.current.zoom;
      let topmostHit: { row: number; col: number; quadrant: number } | null = null;
      let closestHitDistance = Number.POSITIVE_INFINITY;

      for (const [key, treeData] of Object.entries(tilesRef.current)) {
        if (treeData.type !== 'item' || !treeData.placedAt) continue;
        const item = treeData.itemId ? gameItemsRef.current[treeData.itemId] : undefined;
        if (readyOnly && (!item?.yieldItem || !item.productionTimeMs)) continue;
        if (!item) continue;

        const [row, col, quadrant] = key.split(',').map(Number);
        const readyAt = getTreeHarvestReadyAt(treeData, item);
        if (readyOnly && (!Number.isFinite(readyAt) || now < readyAt)) continue;

        const occupiedCells = treeData.occupiedCells?.length
          ? treeData.occupiedCells
          : getOccupiedCells(row, col, quadrant, item) ?? [{ row, col, quadrant }];
        const occupiedPositions = occupiedCells.map((cell) => {
          const cellIsoX = (cell.col - cell.row) * halfW;
          const cellIsoY = (cell.col + cell.row) * halfH;
          const offset = getQuadrantOffset(cell.quadrant, halfW, halfH);
          return { x: cellIsoX + offset.dx, groundY: cellIsoY + halfH + offset.dy };
        });
        const centerX = occupiedPositions.reduce((sum, position) => sum + position.x, 0) / occupiedPositions.length;
        const groundY = Math.max(...occupiedPositions.map((position) => position.groundY));
        const isProductClicked = item.type === 'TREE'
          ? isPointOnReadyTree(worldX, worldY, item, getTreeGrowthStage(treeData, item, now), centerX, groundY, now)
          : isPointOnReadyPlacedItem(worldX, worldY, item, treeData, centerX, groundY, now);
        const objectCenterY = groundY - (item.type === 'TREE' ? getTreeRenderHeight(item) / 2 : 41);
        const hitDistance = Math.hypot(worldX - centerX, worldY - objectCenterY);
        const isInFrontOnTie = Boolean(
          topmostHit && (
            row > topmostHit.row ||
            (row === topmostHit.row && col > topmostHit.col) ||
            (row === topmostHit.row && col === topmostHit.col && quadrant > topmostHit.quadrant)
          )
        );

        if (isProductClicked && (
          hitDistance < closestHitDistance ||
          (hitDistance === closestHitDistance && isInFrontOnTie)
        )) {
          topmostHit = { row, col, quadrant };
          closestHitDistance = hitDistance;
        }
      }

      return topmostHit;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.target !== canvas || e.button !== 0) return;
      pointerDownOnCanvas.current = true;
      isDragging.current = true;
      pointerDownPosition.current = { x: e.clientX, y: e.clientY };
      startPan.current = { x: e.clientX - cameraRef.current.x, y: e.clientY - cameraRef.current.y };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) {
        const activeTool = activeToolRef.current;
        const isGridOnlyTool = activeTool?.startsWith('place_') || activeTool === 'shovel';
        hoveredTile.current = isGridOnlyTool || (activeTool === 'move' && movingItemRef.current)
          ? getGridTileFromScreen(e.clientX, e.clientY)
          : getReadyItemAtScreen(e.clientX, e.clientY, false) ?? getGridTileFromScreen(e.clientX, e.clientY);
        return;
      }
      hoveredTile.current = null;
      cameraRef.current.x = e.clientX - startPan.current.x;
      cameraRef.current.y = e.clientY - startPan.current.y;
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const wasPointerDown = pointerDownOnCanvas.current;
      const wasDragging = Math.hypot(
        e.clientX - pointerDownPosition.current.x,
        e.clientY - pointerDownPosition.current.y
      ) >= 8;
      
      isDragging.current = false;
      pointerDownOnCanvas.current = false;

      if (readOnly) return;

      if (wasPointerDown && !wasDragging) {
        const yieldIconTile = activeToolRef.current === null
          ? getReadyItemAtScreen(e.clientX, e.clientY)
          : null;
        const tool = activeToolRef.current;
        const isMoving = tool === 'move' && movingItemRef.current;
        const canSelectExistingItem = tool === 'move' || tool === 'rotate' || tool === 'trash';
        const selectedItemTile = isMoving || !canSelectExistingItem
          ? null
          : getReadyItemAtScreen(e.clientX, e.clientY, false);
        const tile = yieldIconTile ?? selectedItemTile ?? getGridTileFromScreen(e.clientX, e.clientY);
        if (tile && userRef.current?.id) {
          if (tool === 'rotate') {
            const target = selectedItemTile;
            const targetData = target?.row !== undefined
              ? tilesRef.current[`${target.row},${target.col},${target.quadrant}`]
              : undefined;
            const targetItem = targetData?.itemId ? gameItemsRef.current[targetData.itemId] : undefined;
            if (target && targetItem?.canFlip !== false) {
              await rotateTile(target.row, target.col, target.quadrant, userRef.current.id);
            } else if (targetItem?.canFlip === false) {
              notifyGameMessage('Цей об’єкт не можна перевертати');
            } else if (!target && tilesRef.current[`${tile.row},${tile.col},-1`]?.type === 'dirt') {
              await rotateTile(tile.row, tile.col, -1, userRef.current.id);
            }
          } else if (tool === 'move') {
            if (!movingItemRef.current) {
              const target = selectedItemTile;
              if (target) {
                const targetData = tilesRef.current[`${target.row},${target.col},${target.quadrant}`];
                const targetItem = targetData?.itemId ? gameItemsRef.current[targetData.itemId] : undefined;
                const hasCropBed = targetItem?.type === 'CROP' &&
                  tilesRef.current[`${target.row},${target.col},-1`]?.type === 'dirt';
                if (hasCropBed) {
                  notifyGameMessage('Грядку з культурою не можна переміщати');
                  return;
                }
                movingItemRef.current = target;
              } else {
                const dirt = tilesRef.current[`${tile.row},${tile.col},-1`];
                if (dirt?.type === 'dirt') {
                  movingItemRef.current = { row: tile.row, col: tile.col, quadrant: -1, isDirt: true };
                }
              }
            } else {
              const source = movingItemRef.current;
              const success = await moveTile(
                source.row,
                source.col,
                source.quadrant,
                tile.row,
                tile.col,
                source.isDirt ? -1 : tile.quadrant,
                userRef.current.id
              );
              if (success) movingItemRef.current = null;
            }
          } else if (tool === 'shovel') {
            const hasObjectInCell = Object.entries(tilesRef.current).some(([key, placedTile]) => {
              const [row, col] = key.split(',').map(Number);
              return row === tile.row && col === tile.col && placedTile.type === 'item';
            });
            if (!hasObjectInCell && !tilesRef.current[`${tile.row},${tile.col},-1`]) {
              digTile(tile.row, tile.col, userRef.current.id);
            }
          } else if (tool === 'trash') {
            const placedItem = findPlacedItemAtQuadrant(tilesRef.current, tile.row, tile.col, tile.quadrant);
            if (placedItem) {
              await removeTile(tile.row, tile.col, placedItem.quadrant, userRef.current.id);
            } else if (tilesRef.current[`${tile.row},${tile.col},-1`]) {
              await removeTile(tile.row, tile.col, -1, userRef.current.id);
            }
          } else if (tool && tool.startsWith('place_')) {
            const itemId = tool.replace('place_', '');
            const success = await placeItem(tile.row, tile.col, tile.quadrant, itemId, userRef.current.id);
            
            // Якщо посадка успішна, малюємо вилітаючий текст!
            if (success) {
              const item = gameItemsRef.current[itemId];
               addFloatingText(tile.row, tile.col, tile.quadrant, [
                { msg: `-${item?.price ?? 0}`, image: '/assets/ui/coin.png', color: "#ff5252" },
                { msg: `+${item?.plantingXp ?? 0} XP`, color: "#b388ff" }
               ]);
            }

          } else if (tool === null) {
            const placedItem = findPlacedItemAtQuadrant(tilesRef.current, tile.row, tile.col, tile.quadrant);
            const treeData = placedItem?.tile;
            const item = treeData?.itemId ? gameItemsRef.current[treeData.itemId] : undefined;

            if (
              placedItem &&
              treeData?.type === 'item' &&
              item?.yieldItem &&
              item.productionTimeMs &&
              Date.now() >= getTreeHarvestReadyAt(treeData, item)
            ) {
              enqueueHarvest({
                row: tile.row,
                col: tile.col,
                quadrant: placedItem.quadrant,
                itemId: item.id,
                onComplete: () => {
                  addFloatingText(tile.row, tile.col, tile.quadrant, [
                    { msg: item.yieldIcon ?? item.yieldName ?? '', image: item.yieldImage, color: '#a6e39b' }
                  ], 'inventory');
                  addFloatingText(tile.row, tile.col, tile.quadrant, [
                    { msg: '+1 XP', color: '#d2a8ff' }
                  ]);
                }
              }, userRef.current.id);
            }
          }
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newZoom = cameraRef.current.zoom * zoomFactor;
      if (newZoom >= cameraRef.current.minZoom && newZoom <= cameraRef.current.maxZoom) {
        const mouseX = e.clientX; const mouseY = e.clientY;
        cameraRef.current.x = mouseX - (mouseX - cameraRef.current.x) * zoomFactor;
        cameraRef.current.y = mouseY - (mouseY - cameraRef.current.y) * zoomFactor;
        cameraRef.current.zoom = newZoom;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        lastPinchRef.current = {
          distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
          centerX: (first.clientX + second.clientX) / 2,
          centerY: (first.clientY + second.clientY) / 2,
        };
        isDragging.current = false;
        pointerDownOnCanvas.current = false;
        touchMoveSourceRef.current = null;
        touchObjectDragRef.current = false;
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;
      const touchedItem = getReadyItemAtScreen(touch.clientX, touch.clientY, false);
      hoveredTile.current = touchedItem ?? (activeToolRef.current ? getGridTileFromScreen(touch.clientX, touch.clientY) : null);
      pointerDownOnCanvas.current = true;
      isDragging.current = true;
      pointerDownPosition.current = { x: touch.clientX, y: touch.clientY };
      startPan.current = { x: touch.clientX - cameraRef.current.x, y: touch.clientY - cameraRef.current.y };
      touchMoveSourceRef.current = !readOnly && activeToolRef.current === 'move'
        ? getReadyItemAtScreen(touch.clientX, touch.clientY, false)
        : null;
      touchObjectDragRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
        const centerX = (first.clientX + second.clientX) / 2;
        const centerY = (first.clientY + second.clientY) / 2;
        const previous = lastPinchRef.current;
        if (previous && distance > 0) {
          const zoomFactor = Math.max(0.92, Math.min(1.08, distance / previous.distance));
          const newZoom = Math.max(cameraRef.current.minZoom, Math.min(cameraRef.current.maxZoom, cameraRef.current.zoom * zoomFactor));
          const appliedFactor = newZoom / cameraRef.current.zoom;
          cameraRef.current.x = centerX - (centerX - cameraRef.current.x) * appliedFactor + (centerX - previous.centerX);
          cameraRef.current.y = centerY - (centerY - cameraRef.current.y) * appliedFactor + (centerY - previous.centerY);
          cameraRef.current.zoom = newZoom;
        }
        lastPinchRef.current = { distance, centerX, centerY };
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;
      const moveSource = touchMoveSourceRef.current;
      if (moveSource && activeToolRef.current === 'move') {
        const distance = Math.hypot(
          touch.clientX - pointerDownPosition.current.x,
          touch.clientY - pointerDownPosition.current.y
        );
        if (!touchObjectDragRef.current && distance < 8) return;
        touchObjectDragRef.current = true;
        movingItemRef.current = moveSource;
        hoveredTile.current = getGridTileFromScreen(touch.clientX, touch.clientY);
        return;
      }
      if (!isDragging.current) return;
      const panDistance = Math.hypot(
        touch.clientX - pointerDownPosition.current.x,
        touch.clientY - pointerDownPosition.current.y
      );
      if (panDistance < 8) return;
      hoveredTile.current = null;
      cameraRef.current.x = touch.clientX - startPan.current.x;
      cameraRef.current.y = touch.clientY - startPan.current.y;
    };

    const handleTouchEnd = async (e: TouchEvent) => {
      e.preventDefault();
      if (lastPinchRef.current) {
        lastPinchRef.current = null;
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) return;
      const moveSource = touchMoveSourceRef.current;
      const wasObjectDrag = touchObjectDragRef.current;
      touchMoveSourceRef.current = null;
      touchObjectDragRef.current = false;
      if (wasObjectDrag && moveSource && !readOnly) {
        pointerDownOnCanvas.current = false;
        isDragging.current = false;
        const target = getGridTileFromScreen(touch.clientX, touch.clientY);
        if (target && userRef.current?.id) {
          const moved = await moveTile(
            moveSource.row,
            moveSource.col,
            moveSource.quadrant,
            target.row,
            target.col,
            target.quadrant,
            userRef.current.id
          );
          if (moved) movingItemRef.current = null;
        }
        return;
      }
      void handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [digTile, removeTile, placeItem, rotateTile, moveTile, enqueueHarvest, notifyGameMessage, readOnly]);

  const canvas = (
    <canvas
      ref={canvasRef}
      className={readOnly ? 'friend-farm-canvas' : undefined}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, backgroundColor: '#1b222d',
        cursor: readOnly ? 'grab' : activeTool?.startsWith('place_') ? 'cell' : activeTool === 'shovel' ? 'crosshair' : activeTool === 'trash' || activeTool === 'rotate' ? 'pointer' : activeTool === 'move' ? 'move' : 'grab',
        touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
      }}
    />
  );

  return readOnly ? <div className="friend-canvas-layer">{canvas}</div> : canvas;
};