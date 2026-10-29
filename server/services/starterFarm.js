import { getGameItem } from './gameCatalog.js';
import { getOccupiedCells, getOccupiedQuadrants } from './footprint.js';

const starterBeds = [
    { x: 3, y: 4, itemId: 'wheat', remainingByQuadrant: [9000, 10000, 11000, 12000] },
    { x: 4, y: 4, itemId: 'wheat', remainingByQuadrant: [8000, 9000, 10000, 11000] },
    { x: 3, y: 5, itemId: 'polunitsa', remainingByQuadrant: [1500, 2500, 3500, 4500] },
    { x: 4, y: 5, itemId: 'polunitsa', remainingByQuadrant: [2000, 3000, 4000, 5000] },
    { x: 3, y: 6, itemId: 'pump', remainingByQuadrant: [2000, 3000, 4000, 5000] },
    { x: 4, y: 6, itemId: 'pump', remainingByQuadrant: [3000, 4000, 5000, 6000] },
    { x: 5, y: 6, itemId: 'pump', remainingByQuadrant: [1000, 2500, 4000, 6500] },
];

const starterPlants = [
    { x: 4, y: 1, quadrant: 0, itemId: 'apple_tree', remainingMs: 2000 },
    { x: 6, y: 3, quadrant: 0, itemId: 'chicken', remainingMs: 85000 },
    { x: 7, y: 1, quadrant: 0, itemId: 'malina', remainingMs: 1500 },
    { x: 8, y: 1, quadrant: 0, itemId: 'malina', remainingMs: 2200 },
    { x: 9, y: 1, quadrant: 0, itemId: 'malina', remainingMs: 2900 },
    { x: 2, y: 3, quadrant: 0, itemId: 'kolodiaz' },
];

const getPlacedAt = (itemId, now, remainingMs) => {
    const productionTimeMs = getGameItem(itemId)?.productionTimeMs;
    if (!Number.isFinite(productionTimeMs) || productionTimeMs <= 0 || remainingMs === undefined) return now;

    const remaining = Math.max(0, Math.min(productionTimeMs, remainingMs));
    return new Date(now.getTime() - productionTimeMs + remaining);
};

// Повертає null, якщо товар видалений/змінений в адмінці — такий елемент просто пропускаємо.
const createPlacedItem = (x, y, quadrant, itemId, placedAt) => {
    const item = getGameItem(itemId);
    if (!item) return null;

    let occupiedCells;
    let occupiedQuadrants;
    try {
        occupiedCells = getOccupiedCells(x, y, quadrant, item);
        occupiedQuadrants = getOccupiedQuadrants(quadrant, item);
    } catch {
        return null;
    }
    if (!occupiedCells || !occupiedQuadrants) return null;

    return {
        x,
        y,
        quadrant,
        occupiedQuadrants,
        occupiedCells,
        itemId,
        isDirt: false,
        stage: 0,
        placedAt,
    };
};

export const createStarterFarmTiles = () => {
    const placedAt = new Date();
    const tiles = [];

    for (const bed of starterBeds) {
        tiles.push({
            x: bed.x,
            y: bed.y,
            quadrant: -1,
            occupiedQuadrants: [],
            occupiedCells: [],
            itemId: 'dirt',
            isDirt: true,
            stage: 0,
            placedAt,
        });

        for (let quadrant = 0; quadrant < 4; quadrant++) {
            const placed = createPlacedItem(
                bed.x,
                bed.y,
                quadrant,
                bed.itemId,
                getPlacedAt(bed.itemId, placedAt, bed.remainingByQuadrant[quadrant])
            );
            if (placed) tiles.push(placed);
        }
    }

    for (const plant of starterPlants) {
        const placed = createPlacedItem(
            plant.x,
            plant.y,
            plant.quadrant,
            plant.itemId,
            getPlacedAt(plant.itemId, placedAt, plant.remainingMs)
        );
        if (placed) tiles.push(placed);
    }

    return tiles;
};