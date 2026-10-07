import { getGameItem } from './gameCatalog.js';
import { getOccupiedCells } from './footprint.js';

export const getTileOccupiedCells = (tile) => {
    const cells = getOccupiedCells(tile.x, tile.y, tile.quadrant, getGameItem(tile.itemId), tile.flipX ?? false);
    if (!cells?.length) return [{ x: tile.x, y: tile.y, quadrant: tile.quadrant }];
    const anchorIndex = cells.findIndex(cell =>
        cell.x === tile.x && cell.y === tile.y && cell.quadrant === tile.quadrant
    );
    if (anchorIndex > 0) {
        const [anchor] = cells.splice(anchorIndex, 1);
        cells.unshift(anchor);
    }
    return cells;
};

export const getFarmTilesWithOccupiedCells = (tiles) => tiles.map((tile) => ({
    ...tile,
    occupiedCells: getTileOccupiedCells(tile),
    ...(tile.housedAnimals ? {
        housedAnimals: tile.housedAnimals.map((animal) => ({
            id: String(animal._id ?? animal.id),
            itemId: animal.itemId,
            placedAt: animal.placedAt,
            lastHarvestedAt: animal.lastHarvestedAt,
        })),
    } : {}),
}));
