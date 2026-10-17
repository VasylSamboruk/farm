import AchievementConfig from '../models/AchievementConfig.js';
import { getMediaSettings, resolveAssetSource } from './mediaStorage.js';

export const GARDEN_ACHIEVEMENT_ID = 'garden-master';
export const ANIMAL_ACHIEVEMENT_ID = 'animal-keeper';
export const TREE_ACHIEVEMENT_ID = 'tree-gardener';

export const DEFAULT_GARDEN_ACHIEVEMENT = {
    _id: GARDEN_ACHIEVEMENT_ID,
    title: 'Майстер городини',
    description: 'Висаджуй городину на своїй фермі та отримуй нагороди!',
    image: '/assets/ui/gorodnik.png',
    tiers: [
        { id: 'bronze', label: 'Бронза', requiredCount: 500, rubies: 7, image: '/assets/ui/gorodnik1.png' },
        { id: 'silver', label: 'Срібло', requiredCount: 5000, rubies: 13, image: '/assets/ui/gorodnik2.png' },
        { id: 'gold', label: 'Золото', requiredCount: 15000, rubies: 25, image: '/assets/ui/gorodnik3.png' },
    ],
};

export const DEFAULT_ANIMAL_ACHIEVEMENT = {
    _id: ANIMAL_ACHIEVEMENT_ID,
    title: 'Великий тваринник',
    description: 'Виставляй тварин на своїй фермі та отримуй нагороди!',
    image: '/assets/ui/tvarinnik.png',
    tiers: [
        { id: 'bronze', label: 'Бронза', requiredCount: 500, rubies: 7, image: '/assets/ui/tvarinnik1.png' },
        { id: 'silver', label: 'Срібло', requiredCount: 5000, rubies: 13, image: '/assets/ui/tvarinnik2.png' },
        { id: 'gold', label: 'Золото', requiredCount: 15000, rubies: 25, image: '/assets/ui/tvarinnik3.png' },
    ],
};

export const DEFAULT_TREE_ACHIEVEMENT = {
    _id: TREE_ACHIEVEMENT_ID,
    title: 'Садівник',
    description: 'Висаджуй дерева на своїй фермі та отримуй нагороди!',
    image: '/assets/ui/sadivnyk.png',
    tiers: [
        { id: 'bronze', label: 'Бронза', requiredCount: 500, rubies: 7, image: '/assets/ui/sadivnyk1.png' },
        { id: 'silver', label: 'Срібло', requiredCount: 5000, rubies: 13, image: '/assets/ui/sadivnyk2.png' },
        { id: 'gold', label: 'Золото', requiredCount: 15000, rubies: 25, image: '/assets/ui/sadivnyk3.png' },
    ],
};

export const DEFAULT_ACHIEVEMENTS = [
    DEFAULT_GARDEN_ACHIEVEMENT,
    DEFAULT_ANIMAL_ACHIEVEMENT,
    DEFAULT_TREE_ACHIEVEMENT,
];

export const getAchievementConfig = async (achievementId) => {
    const defaults = DEFAULT_ACHIEVEMENTS.find(entry => entry._id === achievementId);
    if (!defaults) return null;
    const stored = await AchievementConfig.findOneAndUpdate(
        { _id: achievementId },
        { $setOnInsert: {
            title: defaults.title,
            description: defaults.description,
            image: defaults.image,
            tiers: defaults.tiers,
        } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    const mediaSettings = await getMediaSettings();
    return {
        id: achievementId,
        kind: ({
            [GARDEN_ACHIEVEMENT_ID]: 'crops',
            [ANIMAL_ACHIEVEMENT_ID]: 'animals',
            [TREE_ACHIEVEMENT_ID]: 'trees',
        })[achievementId],
        countLabel: ({
            [GARDEN_ACHIEVEMENT_ID]: 'Посаджено городини',
            [ANIMAL_ACHIEVEMENT_ID]: 'Виставлено тварин',
            [TREE_ACHIEVEMENT_ID]: 'Посаджено дерев',
        })[achievementId],
        title: stored.title,
        description: stored.description,
        image: resolveAssetSource(stored.image, mediaSettings),
        tiers: stored.tiers.map(tier => ({
            id: tier.id,
            label: tier.label,
            requiredCount: tier.requiredCount,
            rubies: tier.rubies,
            image: resolveAssetSource(tier.image, mediaSettings),
        })),
    };
};

export const getGardenAchievement = () => getAchievementConfig(GARDEN_ACHIEVEMENT_ID);

export const getAllAchievementConfigs = () => Promise.all(
    DEFAULT_ACHIEVEMENTS.map(achievement => getAchievementConfig(achievement._id)),
);

export const getAchievementProgressField = (achievementId) => ({
    [GARDEN_ACHIEVEMENT_ID]: 'plantedVegetableCount',
    [ANIMAL_ACHIEVEMENT_ID]: 'placedAnimalCount',
    [TREE_ACHIEVEMENT_ID]: 'plantedTreeCount',
})[achievementId] ?? null;
