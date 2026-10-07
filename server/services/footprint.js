export const getOccupiedQuadrants = (anchorQuadrant, item) => {
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

    if (footprint.width === 2 && footprint.height === 2) return [0, 1, 2, 3];

    const anchorColumn = anchorQuadrant % 2;
    const anchorRow = Math.floor(anchorQuadrant / 2);
    if (anchorColumn + footprint.width > 2 || anchorRow + footprint.height > 2) return null;

    const quadrants = [];
    for (let rowOffset = 0; rowOffset < footprint.height; rowOffset++) {
        for (let columnOffset = 0; columnOffset < footprint.width; columnOffset++) {
            const row = anchorRow + rowOffset;
            const column = anchorColumn + columnOffset;
            quadrants.push(row * 2 + column);
        }
    }

    return quadrants;
};

export const getOccupiedCells = (x, y, anchorQuadrant, item, flipX = false) => {
    if (!item) return null;
    const footprint = item.footprint ?? { width: 1, height: 1 };
    if (item.largeFootprint) {
        const width = flipX ? item.largeFootprint.height : item.largeFootprint.width;
        const height = flipX ? item.largeFootprint.width : item.largeFootprint.height;
        const cells = [];
        for (let rowOffset = 0; rowOffset < height; rowOffset++) {
            for (let colOffset = 0; colOffset < width; colOffset++) {
                for (let quadrant = 0; quadrant < 4; quadrant++) {
                    cells.push({ x: x + colOffset, y: y + rowOffset, quadrant });
                }
            }
        }
        return cells;
    }
    if (footprint.width === 2 && footprint.height === 1 && flipX) {
        if (anchorQuadrant === 0) return [{ x, y, quadrant: 2 }, { x, y, quadrant: 3 }];
        if (anchorQuadrant === 2) return [{ x, y, quadrant: 0 }, { x, y, quadrant: 1 }];
    }
    const quadrants = getOccupiedQuadrants(anchorQuadrant, item);
    return quadrants?.map(quadrant => ({ x, y, quadrant })) ?? null;
};

export const getMovedOccupiedCells = (source, x, y, quadrant, item) => {
    return getOccupiedCells(x, y, quadrant, item, item.flipX ?? false);
};