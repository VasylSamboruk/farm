import type { GameItemConfig } from '../types/game';

export const getOccupiedQuadrants = (anchorQuadrant: number, item: GameItemConfig) => {
  const footprint = item.footprint ?? { width: 1, height: 1 };
  if (!Number.isInteger(anchorQuadrant) || anchorQuadrant < 0 || anchorQuadrant > 3) return null;
  if (
    !Number.isInteger(footprint.width) ||
    !Number.isInteger(footprint.height) ||
    footprint.width < 1 ||
    footprint.height < 1 ||
    footprint.width > 2 ||
    footprint.height > 2
  ) return null;

  const anchorColumn = anchorQuadrant % 2;
  const anchorRow = Math.floor(anchorQuadrant / 2);
  if (anchorColumn + footprint.width > 2 || anchorRow + footprint.height > 2) return null;

  const quadrants: number[] = [];
  for (let rowOffset = 0; rowOffset < footprint.height; rowOffset++) {
    for (let columnOffset = 0; columnOffset < footprint.width; columnOffset++) {
      quadrants.push((anchorRow + rowOffset) * 2 + anchorColumn + columnOffset);
    }
  }

  return quadrants;
};

export interface FootprintCell {
  row: number;
  col: number;
  quadrant: number;
}

export const getOccupiedCells = (
  row: number,
  col: number,
  anchorQuadrant: number,
  item: GameItemConfig,
  flipX = false
): FootprintCell[] | null => {
  if (!Number.isInteger(anchorQuadrant) || anchorQuadrant < 0 || anchorQuadrant > 3) return null;

  if (item.largeFootprint) {
    const cells: FootprintCell[] = [];
    for (let rowOffset = 0; rowOffset < item.largeFootprint.height; rowOffset++) {
      for (let colOffset = 0; colOffset < item.largeFootprint.width; colOffset++) {
        for (let quadrant = 0; quadrant < 4; quadrant++) {
          cells.push({ row: row + rowOffset, col: col + colOffset, quadrant });
        }
      }
    }
    return cells;
  }

  const footprint = item.footprint ?? { width: 1, height: 1 };
  if (footprint.width === 2 && footprint.height === 1 && flipX) {
    if (anchorQuadrant === 0) return [{ row, col, quadrant: 2 }, { row, col, quadrant: 3 }];
    if (anchorQuadrant === 2) return [{ row, col, quadrant: 0 }, { row, col, quadrant: 1 }];
  }

  const quadrants = getOccupiedQuadrants(anchorQuadrant, item);
  return quadrants?.map((quadrant) => ({ row, col, quadrant })) ?? null;
};

export const getMovedOccupiedCells = (
  _source: FootprintCell[],
  targetRow: number,
  targetCol: number,
  targetQuadrant: number,
  _sourceRow: number,
  _sourceCol: number,
  _sourceQuadrant: number,
  item: GameItemConfig,
  flipX = false
) => {
  return getOccupiedCells(targetRow, targetCol, targetQuadrant, item, flipX);
};

export interface PlacedItemTile {
  type: 'dirt' | 'item';
  quadrant?: number;
  occupiedQuadrants?: number[];
  occupiedCells?: FootprintCell[];
  flipX?: boolean;
  itemId?: string;
  placedAt?: string;
  lastHarvestedAt?: string;
}

export const findPlacedItemAtQuadrant = (
  tiles: Record<string, PlacedItemTile>,
  row: number,
  col: number,
  quadrant: number
) => {
  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.type !== 'item') continue;
    const [tileRow, tileCol, keyQuadrant] = key.split(',').map(Number);
    const anchorQuadrant = tile.quadrant ?? keyQuadrant;
    if (tile.occupiedCells?.some((cell) =>
      cell.row === row && cell.col === col && cell.quadrant === quadrant
    )) {
      return { key, quadrant: anchorQuadrant, tile };
    }
    if (tileRow !== row || tileCol !== col) continue;
    const occupiedQuadrants = tile.occupiedQuadrants?.length
      ? tile.occupiedQuadrants
      : [anchorQuadrant];
    if (occupiedQuadrants.includes(quadrant)) {
      return { key, quadrant: anchorQuadrant, tile };
    }
  }

  return null;
};