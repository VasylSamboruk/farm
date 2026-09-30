const GROWTH_PHASE_RATIO = 0.8;

export const getTreeGrowthStage = (tile, item, now = Date.now()) => {
    const hasFruitingImage = (item.growthImages?.length ?? 0) > 0;
    const stageCount = hasFruitingImage
        ? item.growthImages.length - 1
        : 3;
    const productionTimeMs = item.productionTimeMs;
    if (stageCount === 0 || !Number.isFinite(productionTimeMs) || productionTimeMs <= 0) return 0;

    const placedAt = new Date(tile.placedAt).getTime();
    if (!Number.isFinite(placedAt)) return 0;

    const readyAt = getTreeHarvestReadyAt(tile, item);
    if (hasFruitingImage && now >= readyAt) return stageCount;
    if (tile.lastHarvestedAt) return stageCount - 1;

    const elapsed = Math.max(0, now - placedAt);
    const growthDuration = productionTimeMs * GROWTH_PHASE_RATIO;
    const stageDuration = stageCount > 1 ? growthDuration / (stageCount - 1) : productionTimeMs;
    return Math.min(stageCount - 1, Math.floor(elapsed / stageDuration));
};

export const getTreeHarvestReadyAt = (tile, item) => {
    const lastHarvestedAt = tile.lastHarvestedAt
        ? new Date(tile.lastHarvestedAt).getTime()
        : null;
    const baseTime = lastHarvestedAt ?? new Date(tile.placedAt).getTime();

    return Number.isFinite(baseTime) && Number.isFinite(item.productionTimeMs)
        ? baseTime + item.productionTimeMs
        : Number.POSITIVE_INFINITY;
};
