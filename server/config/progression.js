export const getLevelProgress = (totalXp) => {
    const safeTotalXp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
    const completedLevels = Math.floor((Math.sqrt(1 + (8 * safeTotalXp) / 100) - 1) / 2);
    const xpAtLevelStart = (100 * completedLevels * (completedLevels + 1)) / 2;
    const level = completedLevels + 1;

    return {
        level,
        xpInLevel: safeTotalXp - xpAtLevelStart,
        xpToNextLevel: level * 100
    };
};