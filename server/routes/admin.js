import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Farm, { FARM_STARTING_SIZE } from '../models/Farm.js';
import LevelReward from '../models/LevelReward.js';
import AchievementConfig from '../models/AchievementConfig.js';
import GiftShopItem from '../models/GiftShopItem.js';
import User, { USER_STARTING_COINS, USER_STARTING_RUBIES } from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';
import { createStarterFarmTiles } from '../services/starterFarm.js';
import { createCustomGameItem, getGameItem, listGameItems, listPermanentlyDeletedGameItems, permanentlyDeleteGameItem, reorderGameItem, restorePermanentlyDeletedGameItem, updateGameItemConfig, updateGameItemPrices } from '../services/gameCatalog.js';
import { getOccupiedCells, getOccupiedQuadrants } from '../services/footprint.js';
import { getLevelIcons, getMediaSettings, normalizeAssetSource, resolveAssetSource, resolveGameItemImages, restorePreviousAssetBaseUrl, setAssetBaseUrl, setLevelIcons } from '../services/mediaStorage.js';
import { listGiftShopItems } from '../services/giftShop.js';
import { DEFAULT_ACHIEVEMENTS, getAllAchievementConfigs, getAchievementConfig } from '../services/achievements.js';
import {
    createLeaderboardCompetition,
    deleteLeaderboardCompetition,
    getAdminLeaderboardPlayers,
    getLeaderboardSettings,
    listLeaderboardCompetitions,
    saveLeaderboardSettings,
    setAdminLeaderboardPlayerVisibility,
    setLeaderboardCompetitionActive,
    updateLeaderboardCompetition,
} from '../services/leaderboard.js';

const router = express.Router();
const MAX_PAGE_SIZE = 100;
const isValidSkinList = (skins, type) => {
    if (!Array.isArray(skins) || skins.length > 30 || !['TREE', 'ANIMAL'].includes(type)) return false;
    const ids = new Set();
    return skins.every((skin) => {
        const imageCount = type === 'TREE' ? 2 : 1;
        if (!skin || typeof skin.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(skin.id) ||
            ids.has(skin.id) || typeof skin.name !== 'string' || skin.name.trim().length < 2 ||
            skin.name.trim().length > 80 || !Number.isSafeInteger(skin.price) || skin.price < 0 ||
            skin.price > 1_000_000_000 || !['coins', 'rubies'].includes(skin.priceCurrency ?? 'coins') ||
            (skin.rarity !== undefined && !['common', 'rare', 'exclusive'].includes(skin.rarity)) ||
            (skin.shopImage !== undefined && skin.shopImage !== null && skin.shopImage !== '' && !isImageSource(skin.shopImage)) ||
            !Array.isArray(skin.images) || skin.images.length !== imageCount || skin.images.some((source) => !isImageSource(source)) ||
            (skin.productionTimeBonus !== undefined && (
                !skin.productionTimeBonus ||
                typeof skin.productionTimeBonus.enabled !== 'boolean' ||
                !Number.isSafeInteger(skin.productionTimeBonus.reductionPercent) ||
                skin.productionTimeBonus.reductionPercent < 1 ||
                skin.productionTimeBonus.reductionPercent > 90
            ))) {
            return false;
        }
        ids.add(skin.id);
        return true;
    });
};

router.use(async (req, res, next) => {
    const authorization = req.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Потрібно увійти в акаунт' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (typeof payload !== 'object' || typeof payload.userId !== 'string') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        const user = await User.findById(payload.userId).select('role');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        if (user.role !== 'admin') return res.status(403).json({ message: 'Потрібні права адміністратора' });
        req.adminId = String(user._id);
        return next();
    } catch {
        return res.status(401).json({ message: 'Недійсна або прострочена сесія' });
    }
});

const serializeInventory = (inventory) => {
    if (!inventory) return {};
    if (inventory instanceof Map) return Object.fromEntries(inventory);
    return Object.fromEntries(Object.entries(inventory));
};

const serializeAdminUser = (user, farm, mediaSettings = {}) => ({
    id: String(user._id),
    username: user.username,
    role: user.role,
    avatar: user.avatar ?? '',
    coins: user.coins ?? 0,
    rubies: user.rubies ?? 0,
    xp: user.xp ?? 0,
    level: getLevelProgress(user.xp ?? 0).level,
    inventory: serializeInventory(user.inventory),
    createdAt: user.createdAt,
    isBanned: user.isBanned ?? false,
    banUntil: user.banUntil ?? null,
    banReason: user.banReason ?? '',
    lastSeenAt: user.lastSeenAt ?? null,
    isOnline: Boolean(user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 120_000),
    farmSize: farm?.size ?? FARM_STARTING_SIZE,
    grassStyle: farm?.grassStyle ?? 'classic',
    backgroundStyle: farm?.backgroundStyle ?? 'classic',
    backgroundIsNight: farm?.backgroundIsNight ?? false,
    farmItems: (farm?.tiles ?? [])
        .map((tile) => {
            const item = getGameItem(tile.itemId);
            return {
                itemId: tile.itemId,
                name: tile.isDirt ? 'Грядка' : item?.name ?? tile.itemId,
                type: tile.isDirt ? 'DIRT' : item?.type ?? 'UNKNOWN',
                image: resolveAssetSource(item?.shopImage ?? item?.growthImages?.at(-1) ?? item?.yieldImage ?? '', mediaSettings),
                x: tile.x,
                y: tile.y,
                quadrant: tile.quadrant,
                isDirt: tile.isDirt ?? false,
                surfaceType: tile.surfaceType,
                stage: tile.stage ?? 0,
                occupiedQuadrants: tile.occupiedQuadrants ?? [],
                occupiedCells: tile.occupiedCells ?? [],
                flipX: tile.flipX ?? false,
                placedAt: tile.placedAt,
                lastHarvestedAt: tile.lastHarvestedAt,
            };
        }),
});

const serializeCatalogItem = (item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    yieldItem: item.yieldItem,
    yieldName: item.yieldName,
    yieldIcon: item.yieldIcon,
    yieldImage: item.yieldImage,
    shopImage: item.shopImage ?? item.growthImages?.at(-1),
    placementSurface: item.placementSurface,
    price: item.price,
    priceCurrency: item.priceCurrency ?? 'coins',
    sellPrice: item.sellPrice,
    plantingXp: item.plantingXp,
    requiredLevel: item.requiredLevel ?? 1,
    sortOrder: item.sortOrder,
    shopBadge: item.shopBadge ?? null,
    originalPrice: item.originalPrice ?? null,
    discountPercent: item.discountPercent ?? null,
    productionTimeMs: item.productionTimeMs,
    mechanic: item.mechanic,
    grassTexture: item.grassTexture,
    backgroundImage: item.backgroundImage,
    backgroundNightImage: item.backgroundNightImage,
    appearanceAnimation: item.appearanceAnimation ?? 'none',
    skinsEnabled: item.skinsEnabled ?? false,
    skins: item.skins ?? [],
    grassEdgeOverlap: item.grassEdgeOverlap,
    grassEdgeBlur: item.grassEdgeBlur,
    accelerationMs: item.accelerationMs,
    yieldAmount: item.yieldAmount,
    canFlip: item.canFlip,
    flipX: item.flipX,
    spriteScale: item.spriteScale,
    firstStageScale: item.firstStageScale,
    shopIcon: item.shopIcon,
    growthImages: item.growthImages ?? [],
    footprint: item.footprint,
    largeFootprint: item.largeFootprint,
    housing: item.housing,
    buildingCategory: item.buildingCategory ?? (item.housing ? 'PEN' : 'DECOR'),
    factoryInputItemId: item.factoryInputItemId,
    factoryCapacity: item.factoryCapacity,
    access: item.access ?? 'all',
    giftOnly: Boolean(item.giftOnly),
    custom: Boolean(item.custom),
    disabled: Boolean(item.disabled),
    permanentlyDeleted: Boolean(item.permanentlyDeleted),
});

const isImageSource = (source) => {
    if (typeof source !== 'string' || source.length > 2048) return false;
    if (/^\/?(?:assets\/)?[A-Za-z0-9_./-]+$/.test(source) && !source.includes('..')) return true;
    try {
        return new URL(source).protocol === 'https:';
    } catch {
        return false;
    }
};

const isFootprint = (footprint, maxSize = 2) => footprint &&
    Number.isInteger(footprint.width) && Number.isInteger(footprint.height) &&
    footprint.width >= 1 && footprint.height >= 1 &&
    footprint.width <= maxSize && footprint.height <= maxSize;

router.get('/media/settings', async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        return res.json(await getMediaSettings());
    } catch (error) {
        return next(error);
    }
});

router.put('/media/settings', async (req, res, next) => {
    try {
        return res.json(await setAssetBaseUrl(req.body?.assetBaseUrl));
    } catch (error) {
        return res.status(400).json({ message: error.message || 'Некоректна базова адреса зображень' });
    }
});

router.post('/media/settings/restore', async (_req, res, next) => {
    try {
        const settings = await restorePreviousAssetBaseUrl();
        if (!settings) return res.status(409).json({ message: 'Немає попередньої адреси для відновлення' });
        return res.json(settings);
    } catch (error) {
        return next(error);
    }
});

router.get('/catalog', async (_req, res, next) => {
    try {
        const settings = await getMediaSettings();
        const items = [
            ...listGameItems(),
            ...listPermanentlyDeletedGameItems(),
        ].map((item) => serializeCatalogItem(resolveGameItemImages(item, settings)));
        return res.json({ items });
    } catch (error) {
        return next(error);
    }
});

router.post('/catalog/:itemId/restore', async (req, res) => {
    try {
        const item = await restorePermanentlyDeletedGameItem(req.params.itemId);
        if (!item) return res.status(404).json({ message: 'Стандартний товар не знайдено або він уже відновлений' });
        const settings = await getMediaSettings();
        return res.json({ item: serializeCatalogItem(resolveGameItemImages(item, settings)) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося відновити стандартний товар', error: error.message });
    }
});

router.get('/level-rewards', async (_req, res, next) => {
    try {
        const levels = await LevelReward.find({}).sort({ level: 1 }).lean();
        return res.json({ levels: levels.map(({ level, rewards }) => ({ level, rewards })) });
    } catch (error) {
        return next(error);
    }
});

router.get('/achievements', async (_req, res, next) => {
    try {
        return res.json({ achievements: await getAllAchievementConfigs() });
    } catch (error) {
        return next(error);
    }
});

router.put('/achievements/:achievementId', async (req, res) => {
    const { achievementId } = req.params;
    const defaults = DEFAULT_ACHIEVEMENTS.find(entry => entry._id === achievementId);
    if (!defaults) return res.status(404).json({ message: 'Досягнення не знайдено' });
    const { title, description, image, tiers } = req.body ?? {};
    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 80 ||
        typeof description !== 'string' || description.trim().length < 1 || description.trim().length > 200 ||
        !isImageSource(image) || !Array.isArray(tiers) || tiers.length !== defaults.tiers.length) {
        return res.status(400).json({ message: 'Перевір назву, опис, іконку та три рівні нагород' });
    }
    const normalizedTiers = [];
    for (let index = 0; index < tiers.length; index += 1) {
        const tier = tiers[index];
        const expectedTier = defaults.tiers[index];
        if (!tier || tier.id !== expectedTier.id || !Number.isSafeInteger(tier.requiredCount) ||
            tier.requiredCount < 1 || tier.requiredCount > 1_000_000_000 ||
            !Number.isSafeInteger(tier.rubies) || tier.rubies < 1 || tier.rubies > 100_000 ||
            !isImageSource(tier.image) ||
            (index > 0 && tier.requiredCount <= normalizedTiers[index - 1].requiredCount)) {
            return res.status(400).json({ message: 'Пороги мають зростати, а нагороди й зображення мають бути коректними' });
        }
        normalizedTiers.push({
            id: expectedTier.id,
            label: expectedTier.label,
            requiredCount: tier.requiredCount,
            rubies: tier.rubies,
            image: tier.image,
        });
    }
    try {
        const mediaSettings = await getMediaSettings();
        await AchievementConfig.findOneAndUpdate(
            { _id: achievementId },
            {
                $set: {
                    title: title.trim(),
                    description: description.trim(),
                    image: normalizeAssetSource(image, mediaSettings),
                    tiers: normalizedTiers.map(tier => ({
                        ...tier,
                        image: normalizeAssetSource(tier.image, mediaSettings),
                    })),
                },
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
        return res.json({ achievement: await getAchievementConfig(achievementId) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося зберегти налаштування досягнення', error: error.message });
    }
});

router.get('/level-icons', async (_req, res, next) => {
    try {
        return res.json({ levelIcons: await getLevelIcons() });
    } catch (error) {
        return next(error);
    }
});

router.put('/level-icons', async (req, res) => {
    const levelIcons = req.body?.levelIcons;
    if (!Array.isArray(levelIcons) || levelIcons.length > 20) {
        return res.status(400).json({ message: 'Додай не більше 20 налаштувань іконок рівнів' });
    }
    const levels = new Set();
    for (const entry of levelIcons) {
        if (!entry || !Number.isSafeInteger(entry.minLevel) || entry.minLevel < 2 || entry.minLevel > 999 ||
            levels.has(entry.minLevel) || !isImageSource(entry.icon)) {
            return res.status(400).json({ message: 'Перевір рівень початку та адресу іконки. Рівні мають бути унікальними, від 2 до 999' });
        }
        levels.add(entry.minLevel);
    }
    try {
        const mediaSettings = await getMediaSettings();
        const normalized = levelIcons
            .sort((left, right) => left.minLevel - right.minLevel)
            .map(({ minLevel, icon }) => ({ minLevel, icon: normalizeAssetSource(icon, mediaSettings) }));
        return res.json({ levelIcons: await setLevelIcons(normalized) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося зберегти іконки рівнів', error: error.message });
    }
});

router.get('/gift-shop', async (_req, res, next) => {
    try {
        return res.json({ items: await listGiftShopItems({ includeDisabled: true }) });
    } catch (error) {
        return next(error);
    }
});

router.put('/gift-shop/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { price, priceCurrency, enabled } = req.body ?? {};
    if (!getGameItem(itemId)?.giftOnly) return res.status(404).json({ message: 'Подарунок не знайдено' });
    if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000 ||
        !['coins', 'rubies'].includes(priceCurrency) || typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'Перевір ціну, валюту та статус подарунка' });
    }
    try {
        await GiftShopItem.findOneAndUpdate(
            { itemId },
            { $set: { price, priceCurrency, enabled } },
            { new: true, upsert: true, runValidators: true }
        ).lean();
        const serialized = (await listGiftShopItems({ includeDisabled: true })).find((entry) => entry.itemId === itemId);
        if (!serialized) return res.status(404).json({ message: 'Подарунок не знайдено' });
        return res.json({ item: serialized });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося зберегти подарунок', error: error.message });
    }
});

router.put('/level-rewards/:level', async (req, res) => {
    const level = Number(req.params.level);
    const rewards = req.body?.rewards;
    if (!Number.isSafeInteger(level) || level < 2 || level > 999 || !Array.isArray(rewards) || rewards.length > 20) {
        return res.status(400).json({ message: 'Вкажи рівень від 2 до 999 та до 20 нагород' });
    }
    for (const reward of rewards) {
        if (!reward || !Number.isSafeInteger(reward.amount) || reward.amount < 1 || reward.amount > 100_000) {
            return res.status(400).json({ message: 'Кількість нагороди має бути цілим числом від 1 до 100 000' });
        }
        if (reward.kind === 'item') {
            if (typeof reward.itemId !== 'string' || !getGameItem(reward.itemId)) {
                return res.status(400).json({ message: 'Обраного предмета немає в каталозі' });
            }
        } else if (!['coins', 'rubies'].includes(reward.kind)) {
            return res.status(400).json({ message: 'Невідомий тип нагороди' });
        }
    }
    try {
        const entry = await LevelReward.findOneAndUpdate(
            { level },
            { $set: { level, rewards } },
            { new: true, upsert: true, runValidators: true }
        ).lean();
        return res.json({ level: entry.level, rewards: entry.rewards });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося зберегти нагороди', error: error.message });
    }
});

router.delete('/level-rewards/:level', async (req, res) => {
    const level = Number(req.params.level);
    if (!Number.isSafeInteger(level) || level < 2 || level > 999) {
        return res.status(400).json({ message: 'Рівень має бути від 2 до 999' });
    }
    try {
        const deleted = await LevelReward.findOneAndDelete({ level });
        if (!deleted) return res.status(404).json({ message: 'Нагороди цього рівня не знайдено' });
        return res.json({ success: true, level });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося видалити нагороди рівня', error: error.message });
    }
});

router.get('/leaderboard/prizes', async (_req, res, next) => {
    try {
        return res.json(await getLeaderboardSettings());
    } catch (error) {
        return next(error);
    }
});

function validateLeaderboardPrizeRanges(prizeRanges) {
    if (!Array.isArray(prizeRanges) || prizeRanges.length > 100) {
        return 'Додай не більше 100 діапазонів призів';
    }
    const sortedRanges = [...prizeRanges].sort((left, right) => left.rankFrom - right.rankFrom);
    let previousRankTo = 0;
    for (const range of sortedRanges) {
        if (!range || !Number.isSafeInteger(range.rankFrom) || !Number.isSafeInteger(range.rankTo) ||
            range.rankFrom < 1 || range.rankTo < range.rankFrom || range.rankTo > 1_000_000 ||
            range.rankFrom <= previousRankTo || !Array.isArray(range.rewards) || range.rewards.length < 1 || range.rewards.length > 20) {
            return 'Перевір діапазони місць і склад призів: місця не мають перетинатися';
        }
        previousRankTo = range.rankTo;
        for (const reward of range.rewards) {
            if (!reward || !Number.isSafeInteger(reward.amount) || reward.amount < 1 || reward.amount > 100_000) {
                return 'Кількість призу має бути цілим числом від 1 до 100 000';
            }
            if (reward.kind === 'item') {
                if (typeof reward.itemId !== 'string' || !getGameItem(reward.itemId)) {
                    return 'Предмет для призу відсутній у каталозі';
                }
            } else if (!['coins', 'rubies'].includes(reward.kind)) {
                return 'Невідомий тип призу';
            }
        }
    }
    return null;
}

router.get('/leaderboard/competitions', async (_req, res, next) => {
    try {
        return res.json(await listLeaderboardCompetitions());
    } catch (error) {
        return next(error);
    }
});

router.get('/leaderboard/players', async (req, res, next) => {
    const type = req.query.type === 'total' || req.query.type === 'competition' ? req.query.type : null;
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!type) return res.status(400).json({ message: 'Невідомий тип рейтингу.' });
    if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
        return res.status(400).json({ message: 'Некоректна сторінка рейтингу.' });
    }
    try {
        return res.json(await getAdminLeaderboardPlayers({
            type,
            competitionId: typeof req.query.competitionId === 'string' ? req.query.competitionId : '',
            page,
            search: typeof req.query.search === 'string' ? req.query.search : '',
        }));
    } catch (error) {
        return next(error);
    }
});

router.patch('/leaderboard/players/:userId/visibility', async (req, res, next) => {
    const { type, competitionId, hidden } = req.body ?? {};
    if (!['total', 'competition'].includes(type) || typeof hidden !== 'boolean') {
        return res.status(400).json({ message: 'Некоректні налаштування видимості гравця.' });
    }
    try {
        await setAdminLeaderboardPlayerVisibility({
            type,
            competitionId: typeof competitionId === 'string' ? competitionId : '',
            userId: req.params.userId,
            hidden,
        });
        return res.json({ success: true });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не вдалося змінити видимість гравця.' });
    }
});

router.post('/leaderboard/competitions', async (req, res, next) => {
    const { prizeRanges, competitionStartAt, competitionEndAt } = req.body ?? {};
    const validationError = validateLeaderboardPrizeRanges(prizeRanges);
    if (validationError) return res.status(400).json({ message: validationError });
    if (typeof competitionStartAt !== 'string' || typeof competitionEndAt !== 'string') {
        return res.status(400).json({ message: 'Вкажи коректний час початку та завершення змагання' });
    }
    try {
        return res.status(201).json(await createLeaderboardCompetition({ prizeRanges, competitionStartAt, competitionEndAt }));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не вдалося створити змагання', error: error.message });
    }
});

router.put('/leaderboard/competitions/:competitionId', async (req, res, next) => {
    const { prizeRanges, competitionStartAt, competitionEndAt } = req.body ?? {};
    const validationError = validateLeaderboardPrizeRanges(prizeRanges);
    if (validationError) return res.status(400).json({ message: validationError });
    if (typeof competitionStartAt !== 'string' || typeof competitionEndAt !== 'string') {
        return res.status(400).json({ message: 'Вкажи коректний час початку та завершення змагання' });
    }
    try {
        return res.json(await updateLeaderboardCompetition(req.params.competitionId, { prizeRanges, competitionStartAt, competitionEndAt }));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не вдалося оновити змагання', error: error.message });
    }
});

router.patch('/leaderboard/competitions/:competitionId/active', async (req, res, next) => {
    if (typeof req.body?.isActive !== 'boolean') {
        return res.status(400).json({ message: 'Вкажи статус змагання' });
    }
    try {
        return res.json(await setLeaderboardCompetitionActive(req.params.competitionId, req.body.isActive));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не вдалося змінити статус змагання', error: error.message });
    }
});

router.delete('/leaderboard/competitions/:competitionId', async (req, res, next) => {
    try {
        return res.json(await deleteLeaderboardCompetition(req.params.competitionId));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не вдалося видалити змагання', error: error.message });
    }
});

router.put('/leaderboard/prizes', async (req, res) => {
    const prizeRanges = req.body?.prizeRanges;
    const { competitionStartAt, competitionEndAt } = req.body || {};
    if (!Array.isArray(prizeRanges) || prizeRanges.length > 100) {
        return res.status(400).json({ message: 'Додай не більше 100 діапазонів призів' });
    }
    if (typeof competitionStartAt !== 'string' || typeof competitionEndAt !== 'string' ||
        !Number.isFinite(new Date(competitionStartAt).getTime()) ||
        !Number.isFinite(new Date(competitionEndAt).getTime()) ||
        new Date(competitionEndAt) <= new Date(competitionStartAt)) {
        return res.status(400).json({ message: 'Вкажи коректний час початку та завершення змагання' });
    }
    const sortedRanges = [...prizeRanges].sort((left, right) => left.rankFrom - right.rankFrom);
    let previousRankTo = 0;
    for (const range of sortedRanges) {
        if (!range || !Number.isSafeInteger(range.rankFrom) || !Number.isSafeInteger(range.rankTo) ||
            range.rankFrom < 1 || range.rankTo < range.rankFrom || range.rankTo > 1_000_000 ||
            range.rankFrom <= previousRankTo || !Array.isArray(range.rewards) || range.rewards.length < 1 || range.rewards.length > 20) {
            return res.status(400).json({ message: 'Перевір діапазони місць і склад призів: місця не мають перетинатися' });
        }
        previousRankTo = range.rankTo;
        for (const reward of range.rewards) {
            if (!reward || !Number.isSafeInteger(reward.amount) || reward.amount < 1 || reward.amount > 100_000) {
                return res.status(400).json({ message: 'Кількість призу має бути цілим числом від 1 до 100 000' });
            }
            if (reward.kind === 'item') {
                if (typeof reward.itemId !== 'string' || !getGameItem(reward.itemId)) {
                    return res.status(400).json({ message: 'Предмет для призу відсутній у каталозі' });
                }
            } else if (!['coins', 'rubies'].includes(reward.kind)) {
                return res.status(400).json({ message: 'Невідомий тип призу' });
            }
        }
    }
    try {
        const prizeRangesToSave = sortedRanges.map((range) => ({
            rankFrom: range.rankFrom,
            rankTo: range.rankTo,
            rewards: range.rewards.map(({ kind, amount, itemId = '' }) => ({ kind, amount, itemId })),
        }));
        return res.json(await saveLeaderboardSettings({
            prizeRanges: prizeRangesToSave,
            competitionStartAt,
            competitionEndAt,
        }));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не вдалося зберегти призи рейтингу', error: error.message });
    }
});

router.post('/catalog', async (req, res) => {
    const body = req.body ?? {};
    const { id, name, type, price, priceCurrency = 'coins', plantingXp, requiredLevel, productionTimeMs, yieldItem, yieldName,
        yieldIcon, yieldAmount, sellPrice, placementSurface, spriteScale, firstStageScale, shopImage, shopIcon, housing,
        yieldImage, growthImages, footprint, largeFootprint, canFlip, access, mechanic, accelerationMs, grassTexture,
        backgroundImage, backgroundNightImage, skinsEnabled = false, skins = [],
        grassEdgeOverlap = 12, grassEdgeBlur = 0, appearanceAnimation = 'none', giftOnly = false,
        buildingCategory = housing ? 'PEN' : 'DECOR', factoryInputItemId, factoryCapacity = 25 } = body;
    const allowedTypes = ['TREE', 'CROP', 'ANIMAL', 'BUILDING', 'OTHER'];
    const isFactory = type === 'BUILDING' && buildingCategory === 'FACTORY';
    const producesItems = ['TREE', 'CROP', 'ANIMAL'].includes(type) || isFactory;
    const validFactoryInput = getGameItem(factoryInputItemId);
    const validId = typeof id === 'string' && /^[a-z][a-z0-9_]{1,47}$/.test(id);
    const validImageList = Array.isArray(growthImages) && growthImages.length <= 12 && growthImages.every(isImageSource);

    if (!validId || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120 ||
        !allowedTypes.includes(type) || !Number.isSafeInteger(price) || price < 0 || !['coins', 'rubies'].includes(priceCurrency) ||
        !Number.isSafeInteger(plantingXp) || plantingXp < 0 ||
        !Number.isSafeInteger(requiredLevel) || requiredLevel < 1 || requiredLevel > 999 ||
        (producesItems && (!Number.isSafeInteger(productionTimeMs) || productionTimeMs < 1000)) ||
        (producesItems && (typeof yieldItem !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(yieldItem))) ||
        (producesItems && (typeof yieldName !== 'string' || !yieldName.trim() || yieldName.trim().length > 120)) ||
        (yieldIcon !== undefined && (typeof yieldIcon !== 'string' || yieldIcon.length > 16)) ||
        (producesItems && (!Number.isSafeInteger(yieldAmount) || yieldAmount < 1)) ||
        (sellPrice !== undefined && (!Number.isSafeInteger(sellPrice) || sellPrice < 0)) ||
        !['grass', 'soil', 'water'].includes(placementSurface) ||
        !Number.isFinite(spriteScale) || spriteScale < 0.1 || spriteScale > 8 ||
        (firstStageScale !== undefined && (!['TREE', 'CROP'].includes(type) ||
            !Number.isFinite(firstStageScale) || firstStageScale < 0.1 || firstStageScale > 5)) ||
        !isFootprint(footprint) ||
        (type === 'BUILDING' && !['DECOR', 'PEN', 'FACTORY'].includes(buildingCategory)) ||
        (type === 'BUILDING' && buildingCategory === 'PEN' && !housing) ||
        (isFactory && (!validFactoryInput?.yieldItem || !Number.isSafeInteger(factoryCapacity) || factoryCapacity < 1 || factoryCapacity > 1000)) ||
        (isFactory && (validFactoryInput.type === 'BUILDING' || validFactoryInput.type === 'OTHER')) ||
        (isFactory && (typeof yieldItem !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(yieldItem) ||
            listGameItems().some((catalogItem) => catalogItem.yieldItem === yieldItem))) ||
        (isFactory && sellPrice === undefined) ||
        (largeFootprint !== null && largeFootprint !== undefined && !isFootprint(largeFootprint, 8)) ||
        (shopImage !== null && shopImage !== undefined && shopImage !== '' && !isImageSource(shopImage)) ||
        (grassTexture !== undefined && grassTexture !== null && grassTexture !== '' && !isImageSource(grassTexture)) ||
        (backgroundImage !== undefined && backgroundImage !== null && backgroundImage !== '' && !isImageSource(backgroundImage)) ||
        (backgroundNightImage !== undefined && backgroundNightImage !== null && backgroundNightImage !== '' && !isImageSource(backgroundNightImage)) ||
        (mechanic === 'grass_style' && (!Number.isInteger(grassEdgeOverlap) || grassEdgeOverlap < 0 || grassEdgeOverlap > 24 ||
            !Number.isFinite(grassEdgeBlur) || grassEdgeBlur < 0 || grassEdgeBlur > 4)) ||
        !['none', 'snow', 'blizzard'].includes(appearanceAnimation) ||
        typeof skinsEnabled !== 'boolean' || (skinsEnabled && !isValidSkinList(skins, type)) ||
        (!skinsEnabled && !Array.isArray(skins)) ||
        (yieldImage !== null && yieldImage !== undefined && yieldImage !== '' && !isImageSource(yieldImage)) ||
        !validImageList ||
        (shopIcon !== undefined && (typeof shopIcon !== 'string' || shopIcon.length > 16)) ||
        (housing !== undefined && (
            type !== 'BUILDING' ||
            !Number.isSafeInteger(housing?.capacity) || housing.capacity < 1 || housing.capacity > 1000 ||
            !Array.isArray(housing?.animalTypes) || housing.animalTypes.length < 1 || housing.animalTypes.length > 20 ||
            new Set(housing.animalTypes).size !== housing.animalTypes.length ||
            housing.animalTypes.some((animalId) => getGameItem(animalId)?.type !== 'ANIMAL')
        )) ||
        (type === 'OTHER' && mechanic != null && !['expand_farm', 'accelerate_growth', 'grass_style', 'background_style'].includes(mechanic)) ||
        (mechanic === 'grass_style' && (type !== 'OTHER' || !isImageSource(grassTexture))) ||
        (mechanic === 'background_style' && (type !== 'OTHER' || !isImageSource(backgroundImage) || !isImageSource(backgroundNightImage))) ||
        (mechanic != null && type !== 'OTHER') ||
        (mechanic === 'accelerate_growth' && (type !== 'OTHER' || !Number.isSafeInteger(accelerationMs) || accelerationMs < 1000 || accelerationMs > 2_592_000_000)) ||
        (accelerationMs !== undefined && mechanic !== 'accelerate_growth') ||
        typeof canFlip !== 'boolean' || !['all', 'admin'].includes(access) || typeof giftOnly !== 'boolean' ||
        (giftOnly && type === 'OTHER') ||
        (!shopImage && !growthImages.length && !shopIcon)) {
        return res.status(400).json({ message: 'Перевір обов’язкові поля, розміри та посилання на зображення.' });
    }

    try {
        const mediaSettings = await getMediaSettings();
        const normalizeImage = (source) => source ? normalizeAssetSource(source, mediaSettings) : source;
        const sortOrder = listGameItems().filter((item) => item.type === type)
            .reduce((highest, item) => Math.max(highest, item.sortOrder ?? 0), 0) + 1;
        const item = await createCustomGameItem({
            id,
            name: name.trim(),
            type,
            price,
            priceCurrency,
            plantingXp,
            requiredLevel,
            sortOrder,
            ...(producesItems ? { productionTimeMs, yieldItem, yieldName: yieldName.trim(), yieldAmount } : {}),
            ...(yieldIcon ? { yieldIcon } : {}),
            ...(sellPrice === undefined ? {} : { sellPrice }),
            placementSurface,
            spriteScale,
            ...(firstStageScale === undefined ? {} : { firstStageScale }),
            shopImage: normalizeImage(shopImage) || undefined,
            ...(mechanic === 'grass_style' ? { grassTexture: normalizeImage(grassTexture) } : {}),
            ...(mechanic === 'grass_style' ? { grassEdgeOverlap, grassEdgeBlur } : {}),
            ...(mechanic === 'grass_style' || mechanic === 'background_style' ? { appearanceAnimation } : {}),
            ...(mechanic === 'background_style' ? {
                backgroundImage: normalizeImage(backgroundImage),
                backgroundNightImage: normalizeImage(backgroundNightImage),
            } : {}),
            ...(skinsEnabled ? {
                skinsEnabled,
                skins: skins.map((skin) => ({
                    ...skin,
                    name: skin.name.trim(),
                    priceCurrency: skin.priceCurrency ?? 'coins',
                    rarity: skin.rarity ?? 'common',
                    ...(skin.shopImage ? { shopImage: normalizeImage(skin.shopImage) } : {}),
                    images: skin.images.map((source) => normalizeImage(source)),
                })),
            } : {}),
            shopIcon: shopIcon || undefined,
            yieldImage: normalizeImage(yieldImage) || undefined,
            growthImages: growthImages.map((source) => normalizeImage(source)),
            footprint,
            largeFootprint: largeFootprint || undefined,
            ...(housing ? { housing: { capacity: housing.capacity, animalTypes: housing.animalTypes } } : {}),
            ...(type === 'BUILDING' ? { buildingCategory } : {}),
            ...(isFactory ? { factoryInputItemId, factoryCapacity } : {}),
            ...(type === 'OTHER' && mechanic ? { mechanic } : {}),
            ...(mechanic === 'accelerate_growth' ? { accelerationMs } : {}),
            canFlip,
            access,
            giftOnly,
        });
        if (!item) return res.status(409).json({ message: 'Товар з таким ID уже існує.' });
        return res.status(201).json({ item: serializeCatalogItem(item) });
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ message: 'Товар з таким ID уже існує.' });
        return res.status(500).json({ message: 'Не вдалося створити товар', error: error.message });
    }
});

router.patch('/catalog/:itemId/config', async (req, res) => {
    try {
        const item = getGameItem(req.params.itemId);
        if (!item) return res.status(404).json({ message: 'Предмет не знайдено в каталозі' });
        const allowedFields = new Set([
            'name', 'price', 'priceCurrency', 'sellPrice', 'plantingXp', 'productionTimeMs', 'yieldItem', 'yieldName',
            'yieldIcon', 'yieldAmount', 'placementSurface', 'spriteScale', 'firstStageScale', 'canFlip', 'footprint',
            'largeFootprint', 'shopImage', 'shopIcon', 'yieldImage', 'growthImages', 'flipX', 'access', 'requiredLevel', 'sortOrder', 'disabled',
            'housing',
            'buildingCategory', 'factoryInputItemId', 'factoryCapacity',
            'giftOnly',
            'mechanic', 'accelerationMs', 'grassTexture', 'grassEdgeOverlap', 'grassEdgeBlur',
            'backgroundImage', 'backgroundNightImage', 'appearanceAnimation',
            'skinsEnabled', 'skins', 'shopBadge', 'discountPercent', 'salePrice',
        ]);
        const updates = {};

        for (const [field, value] of Object.entries(req.body ?? {})) {
            if (!allowedFields.has(field)) return res.status(400).json({ message: `Поле ${field} не можна змінювати` });
            if (['price', 'sellPrice', 'plantingXp', 'yieldAmount'].includes(field)) {
                if (value === undefined) continue;
                if ((value === '' || value === null) && field === 'sellPrice') { updates[field] = null; continue; }
                const parsed = Number(value);
                if (!Number.isSafeInteger(parsed) || parsed < 0) return res.status(400).json({ message: `${field} має бути невід’ємним цілим числом` });
                updates[field] = parsed;
                continue;
            }
            if (field === 'priceCurrency') {
                if (!['coins', 'rubies'].includes(value)) return res.status(400).json({ message: 'Валюта має бути монетами або рубінами' });
                updates[field] = value;
                continue;
            }
            if (field === 'salePrice') {
                if (value === '' || value === null || value === 0) { updates[field] = null; continue; }
                if (!Number.isSafeInteger(value) || value < 1) {
                    return res.status(400).json({ message: 'Ціна зі знижкою має бути цілим числом від 1' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'discountPercent') {
                if (value === '' || value === null || value === 0) { updates[field] = 0; continue; }
                if (!Number.isInteger(value) || value < 1 || value > 90) {
                    return res.status(400).json({ message: 'Знижка має бути від 1 до 90 відсотків' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'shopBadge') {
                if (value === '' || value === null) { updates[field] = null; continue; }
                if (!['new', 'sale', 'top', 'hit'].includes(value)) {
                    return res.status(400).json({ message: 'Позначка товару має бути Новинка, Акція, Топ або Хіт' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'appearanceAnimation') {
                if (!['none', 'snow', 'blizzard'].includes(value)) {
                    return res.status(400).json({ message: 'Анімація має бути вимкнена, снігом або завірюхою' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'skinsEnabled') {
                if (typeof value !== 'boolean' || !['TREE', 'ANIMAL'].includes(item.type)) {
                    return res.status(400).json({ message: 'Скіни можна вмикати лише для дерев і тварин' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'skins') {
                if (!isValidSkinList(value, item.type)) {
                    return res.status(400).json({ message: item.type === 'TREE'
                        ? 'Для кожного скіна дерева задай дві картинки: перед плодами й із плодами'
                        : 'Для кожного скіна тварини задай одну картинку' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'giftOnly') {
                if (typeof value !== 'boolean') return res.status(400).json({ message: 'Статус подарункового предмета має бути так або ні' });
                if (value && item.type === 'OTHER') {
                    return res.status(400).json({ message: 'Для магазину подарунків обирай рослини, дерева, тварин або декор' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'requiredLevel') {
                if (!Number.isSafeInteger(value) || value < 1 || value > 999) {
                    return res.status(400).json({ message: 'Мінімальний рівень має бути цілим числом від 1 до 999' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'sortOrder') {
                if (!Number.isSafeInteger(value) || value < 1 || value > 9999) {
                    return res.status(400).json({ message: 'Позиція в магазині має бути цілим числом від 1 до 9999' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'productionTimeMs') {
                if (value === '' || value === null) { updates[field] = null; continue; }
                const parsed = Number(value);
                if (!Number.isSafeInteger(parsed) || parsed < 1000) return res.status(400).json({ message: 'Час росту має бути цілим числом не менше 1000 мс' });
                updates[field] = parsed;
                continue;
            }
            if (field === 'factoryCapacity') {
                if (item.type !== 'BUILDING' || !Number.isSafeInteger(value) || value < 1 || value > 1000) {
                    return res.status(400).json({ message: 'Місткість фабрики має бути від 1 до 1000 одиниць' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'factoryInputItemId') {
                const inputItem = getGameItem(value);
                if (item.type !== 'BUILDING' || !inputItem?.yieldItem || !['TREE', 'CROP', 'ANIMAL'].includes(inputItem.type)) {
                    return res.status(400).json({ message: 'Обери товар зі складу, який можна переробляти' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'buildingCategory') {
                if (item.type !== 'BUILDING' || !['DECOR', 'PEN', 'FACTORY'].includes(value)) {
                    return res.status(400).json({ message: 'Невідома категорія будівлі' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'mechanic') {
                if (item.type !== 'OTHER' || (value !== null && !['expand_farm', 'accelerate_growth', 'grass_style', 'background_style'].includes(value))) {
                    return res.status(400).json({ message: 'Невідома механіка товару «Інше»' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'accelerationMs') {
                if (item.type !== 'OTHER') return res.status(400).json({ message: 'Час прискорення доступний лише для товару «Інше»' });
                if (value === null) { updates[field] = null; continue; }
                if (!Number.isSafeInteger(value) || value < 1000 || value > 2_592_000_000) {
                    return res.status(400).json({ message: 'Час прискорення має бути від 1 секунди до 30 днів' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'grassEdgeOverlap') {
                if (item.type !== 'OTHER' || !Number.isInteger(value) || value < 0 || value > 24) {
                    return res.status(400).json({ message: 'Перекриття країв має бути цілим числом від 0 до 24 px' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'grassEdgeBlur') {
                if (item.type !== 'OTHER' || !Number.isFinite(value) || value < 0 || value > 4) {
                    return res.status(400).json({ message: 'М’якість краю має бути від 0 до 4 px' });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'spriteScale') {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 5) return res.status(400).json({ message: 'spriteScale має бути від 0.1 до 5' });
                updates[field] = parsed;
                continue;
            }
            if (field === 'firstStageScale') {
                const parsed = Number(value);
                if (!['TREE', 'CROP'].includes(item.type) || !Number.isFinite(parsed) || parsed < 0.1 || parsed > 5) {
                    return res.status(400).json({ message: 'Масштаб першої стадії дерева або рослини має бути від 0.1 до 5' });
                }
                updates[field] = parsed;
                continue;
            }
            if (field === 'canFlip' || field === 'flipX' || field === 'disabled') {
                if (typeof value !== 'boolean') return res.status(400).json({ message: `${field} має бути true або false` });
                updates[field] = value;
                continue;
            }
            if (field === 'access') {
                if (value !== 'all' && value !== 'admin') return res.status(400).json({ message: 'Доступ має бути all або admin' });
                updates[field] = value;
                continue;
            }
            if (field === 'footprint' || field === 'largeFootprint') {
                if (value === null || value === '') { updates[field] = null; continue; }
                const maxSize = field === 'largeFootprint' ? 8 : 2;
                if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > maxSize || value.height > maxSize) {
                    return res.status(400).json({ message: `${field} має містити width/height від 1 до ${maxSize}` });
                }
                updates[field] = { width: value.width, height: value.height };
                continue;
            }
            if (field === 'housing') {
                if (value === null) { updates[field] = null; continue; }
                if (item.type !== 'BUILDING' || !value || !Number.isSafeInteger(value.capacity) ||
                    value.capacity < 1 || value.capacity > 1000 ||
                    !Array.isArray(value.animalTypes) || value.animalTypes.length < 1 || value.animalTypes.length > 20 ||
                    new Set(value.animalTypes).size !== value.animalTypes.length ||
                    value.animalTypes.some((animalId) => getGameItem(animalId)?.type !== 'ANIMAL')) {
                    return res.status(400).json({ message: 'Вкажи місткість 1–1000 та список тварин із каталогу' });
                }
                updates[field] = { capacity: value.capacity, animalTypes: value.animalTypes };
                continue;
            }
            if (field === 'growthImages') {
                if (!Array.isArray(value) || value.length > 12 || value.some((src) => !isImageSource(src))) {
                    return res.status(400).json({ message: 'growthImages мають містити HTTPS URL або локальні шляхи /assets/...' });
                }
                updates[field] = value;
                continue;
            }
            if (['shopImage', 'yieldImage', 'grassTexture', 'backgroundImage', 'backgroundNightImage'].includes(field)) {
                if (value === '' || value === null) { updates[field] = null; continue; }
                if (!isImageSource(value)) {
                    return res.status(400).json({ message: `${field} має бути HTTPS URL або локальним шляхом /assets/...` });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'placementSurface') {
                if (!['grass', 'soil', 'water'].includes(value)) return res.status(400).json({ message: 'Поверхня має бути grass, soil або water' });
                updates[field] = value;
                continue;
            }
            if (field === 'yieldItem') {
                if (typeof value !== 'string' ||
                    (item.type === 'BUILDING' && item.buildingCategory !== 'FACTORY' && value !== '') ||
                    (item.type === 'BUILDING' && item.buildingCategory === 'FACTORY' &&
                        (!/^[a-z0-9_-]{1,64}$/.test(value) ||
                            listGameItems().some((candidate) => candidate.id !== item.id && candidate.yieldItem === value))) ||
                    (item.type !== 'BUILDING' && value !== '' && !/^[a-z0-9_-]{1,64}$/.test(value))) {
                    return res.status(400).json({ message: 'ID готового продукту фабрики має бути унікальним' });
                }
                updates[field] = value.trim();
                continue;
            }
            if (typeof value !== 'string' || value.trim().length > 120) return res.status(400).json({ message: `${field} має бути текстом до 120 символів` });
            updates[field] = value.trim();
        }

        if (!Object.keys(updates).length) return res.status(400).json({ message: 'Не передано змін конфігурації' });
        const resultingMechanic = updates.mechanic === undefined ? item.mechanic : updates.mechanic;
        const resultingSkinsEnabled = updates.skinsEnabled === undefined ? item.skinsEnabled : updates.skinsEnabled;
        const resultingSkins = updates.skins === undefined ? item.skins ?? [] : updates.skins;
        if (resultingSkinsEnabled && !isValidSkinList(resultingSkins, item.type)) {
            return res.status(400).json({ message: 'Додай коректний скін з потрібними зображеннями перед увімкненням скінів' });
        }
        const resultingAcceleration = updates.accelerationMs === undefined ? item.accelerationMs : updates.accelerationMs;
        const resultingGrassTexture = updates.grassTexture === undefined ? item.grassTexture : updates.grassTexture;
        const resultingBackgroundImage = updates.backgroundImage === undefined ? item.backgroundImage : updates.backgroundImage;
        const resultingBackgroundNightImage = updates.backgroundNightImage === undefined ? item.backgroundNightImage : updates.backgroundNightImage;
        const resultingGrassEdgeOverlap = updates.grassEdgeOverlap ?? item.grassEdgeOverlap ?? 12;
        const resultingGrassEdgeBlur = updates.grassEdgeBlur ?? item.grassEdgeBlur ?? 0;
        if (resultingMechanic === 'grass_style' && !isImageSource(resultingGrassTexture)) {
            return res.status(400).json({ message: 'Для оформлення трави задай коректну текстуру' });
        }
        if (resultingMechanic === 'background_style' &&
            (!isImageSource(resultingBackgroundImage) || !isImageSource(resultingBackgroundNightImage))) {
            return res.status(400).json({ message: 'Для оформлення фону задай окремі зображення для дня і ночі' });
        }
        if (resultingMechanic === 'grass_style' &&
            (!Number.isInteger(resultingGrassEdgeOverlap) || resultingGrassEdgeOverlap < 0 || resultingGrassEdgeOverlap > 24 ||
                !Number.isFinite(resultingGrassEdgeBlur) || resultingGrassEdgeBlur < 0 || resultingGrassEdgeBlur > 4)) {
            return res.status(400).json({ message: 'Перевір перекриття та м’якість краю оформлення трави' });
        }
        if (resultingMechanic === 'accelerate_growth' &&
            (!Number.isSafeInteger(resultingAcceleration) || resultingAcceleration < 1000 || resultingAcceleration > 2_592_000_000)) {
            return res.status(400).json({ message: 'Для добрива задай прискорення від 1 секунди до 30 днів' });
        }
        const resultingBuildingCategory = updates.buildingCategory ?? item.buildingCategory ?? (item.housing ? 'PEN' : 'DECOR');
        if (item.type === 'BUILDING' && resultingBuildingCategory === 'FACTORY') {
            const resultingInputId = updates.factoryInputItemId ?? item.factoryInputItemId;
            const resultingInputItem = getGameItem(resultingInputId);
            const resultingYieldItem = updates.yieldItem ?? item.yieldItem;
            const resultingYieldName = updates.yieldName ?? item.yieldName;
            const resultingYieldAmount = updates.yieldAmount ?? item.yieldAmount;
            const resultingProductionTime = updates.productionTimeMs ?? item.productionTimeMs;
            const resultingCapacity = updates.factoryCapacity ?? item.factoryCapacity ?? 25;
            const resultingSellPrice = updates.sellPrice === null ? null : updates.sellPrice ?? item.sellPrice;
            if (!resultingInputItem?.yieldItem || !['TREE', 'CROP', 'ANIMAL'].includes(resultingInputItem.type) ||
                !Number.isSafeInteger(resultingCapacity) || resultingCapacity < 1 || resultingCapacity > 1000 ||
                typeof resultingYieldItem !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(resultingYieldItem) ||
                listGameItems().some((candidate) => candidate.id !== item.id && candidate.yieldItem === resultingYieldItem) ||
                typeof resultingYieldName !== 'string' || !resultingYieldName.trim() ||
                !Number.isSafeInteger(resultingYieldAmount) || resultingYieldAmount < 1 ||
                !Number.isSafeInteger(resultingProductionTime) || resultingProductionTime < 1000 ||
                !Number.isSafeInteger(resultingSellPrice) || resultingSellPrice < 0) {
                return res.status(400).json({ message: 'Перевір рецепт фабрики: сировину, продукт, місткість і час переробки' });
            }
        }
        const mediaSettings = await getMediaSettings();
        if (updates.growthImages) updates.growthImages = updates.growthImages.map((source) => normalizeAssetSource(source, mediaSettings));
        for (const field of ['shopImage', 'yieldImage', 'grassTexture', 'backgroundImage', 'backgroundNightImage']) {
            if (updates[field]) updates[field] = normalizeAssetSource(updates[field], mediaSettings);
        }
        if (updates.skins) {
            updates.skins = updates.skins.map((skin) => ({
                ...skin,
                name: skin.name.trim(),
                priceCurrency: skin.priceCurrency ?? 'coins',
                rarity: skin.rarity ?? 'common',
                ...(skin.shopImage ? { shopImage: normalizeAssetSource(skin.shopImage, mediaSettings) } : {}),
                images: skin.images.map((source) => normalizeAssetSource(source, mediaSettings)),
            }));
        }
        const { sortOrder, ...configUpdates } = updates;
        delete configUpdates.salePrice;
        if (updates.price !== undefined || updates.discountPercent !== undefined || updates.salePrice !== undefined) {
            const basePrice = updates.price ?? item.originalPrice ?? item.price;
            if (updates.salePrice !== undefined) {
                if (updates.salePrice !== null && updates.salePrice >= basePrice) {
                    return res.status(400).json({ message: 'Ціна зі знижкою має бути меншою за початкову' });
                }
                if (updates.salePrice) {
                    configUpdates.originalPrice = basePrice;
                    configUpdates.price = updates.salePrice;
                    configUpdates.discountPercent = Math.max(1, Math.round((1 - updates.salePrice / basePrice) * 100));
                } else {
                    configUpdates.price = basePrice;
                    configUpdates.originalPrice = null;
                    configUpdates.discountPercent = null;
                }
            } else {
                const percent = updates.discountPercent !== undefined ? updates.discountPercent : (item.discountPercent ?? 0);
                if (percent > 0) {
                    configUpdates.originalPrice = basePrice;
                    configUpdates.price = Math.max(1, Math.round(basePrice * (1 - percent / 100)));
                    configUpdates.discountPercent = percent;
                } else {
                    configUpdates.price = basePrice;
                    configUpdates.originalPrice = null;
                    configUpdates.discountPercent = null;
                }
            }
        }
        let updatedItem = Object.keys(configUpdates).length
            ? await updateGameItemConfig(item.id, configUpdates)
            : item;
        if (sortOrder !== undefined) updatedItem = await reorderGameItem(item.id, sortOrder);
        return res.json({ item: resolveGameItemImages(updatedItem, mediaSettings) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити предмет', error: error.message });
    }
});

router.delete('/catalog/:itemId', async (req, res) => {
    try {
        const item = getGameItem(req.params.itemId);
        if (!item) return res.status(404).json({ message: 'Товар не знайдено.' });
        const archived = await updateGameItemConfig(item.id, { disabled: true });
        return res.json({ item: serializeCatalogItem(archived) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося видалити товар', error: error.message });
    }
});

router.delete('/catalog/:itemId/permanent', async (req, res) => {
    try {
        const item = getGameItem(req.params.itemId);
        if (!item) return res.status(404).json({ message: 'Товар не знайдено.' });

        await updateGameItemConfig(item.id, { disabled: true });
        const farmResult = await Farm.updateMany({}, { $pull: { tiles: { itemId: item.id } } });
        const stillProducesYield = item.yieldItem && listGameItems().some((entry) =>
            entry.id !== item.id && entry.yieldItem === item.yieldItem
        );
        if (item.yieldItem && !stillProducesYield) {
            await User.updateMany({}, { $unset: { [`inventory.${item.yieldItem}`]: 1 } });
        }

        await permanentlyDeleteGameItem(item.id);
        return res.json({ message: 'Товар видалено назавжди', removedFarmDocuments: farmResult.modifiedCount });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося видалити товар назавжди', error: error.message });
    }
});

router.patch('/catalog/:itemId/prices', async (req, res) => {
    try {
        const item = getGameItem(req.params.itemId);
        if (!item) return res.status(404).json({ message: 'Предмет не знайдено в каталозі' });

        const updates = {};
        if (req.body.price !== undefined) {
            if (!Number.isSafeInteger(req.body.price) || req.body.price < 0) {
                return res.status(400).json({ message: 'Ціна купівлі має бути невід’ємним цілим числом' });
            }
            updates.price = req.body.price;
        }
        if (req.body.sellPrice !== undefined) {
            if (!item.yieldItem) return res.status(400).json({ message: 'Цей предмет не має ціни продажу' });
            if (!Number.isSafeInteger(req.body.sellPrice) || req.body.sellPrice < 0) {
                return res.status(400).json({ message: 'Ціна продажу має бути невід’ємним цілим числом' });
            }
            updates.sellPrice = req.body.sellPrice;
        }
        if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'Не передано нових цін' });

        const updatedItem = await updateGameItemPrices(item.id, updates);
        return res.json({ item: updatedItem });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити ціни', error: error.message });
    }
});

router.get('/users', async (req, res) => {
    try {
    const mediaSettings = await getMediaSettings();
        const search = String(req.query.search ?? '').trim();
        const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50));
        const status = String(req.query.status ?? 'all');
        const filter = search
            ? mongoose.isValidObjectId(search)
                ? { _id: search }
                : { username: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
            : {};
        const onlineSince = new Date(Date.now() - 120_000);
        if (status === 'online') filter.lastSeenAt = { $gte: onlineSince };
        else if (status === 'offline') filter.$and = [{ $or: [{ lastSeenAt: null }, { lastSeenAt: { $lt: onlineSince } }] }];
        else if (status === 'banned') filter.isBanned = true;
        const [total, users] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select('_id username role avatar coins rubies xp inventory createdAt isBanned banUntil banReason lastSeenAt')
                .sort(status === 'online' ? { lastSeenAt: -1, _id: 1 } : { createdAt: -1, _id: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        const farms = await Farm.find({ userId: { $in: users.map((user) => user._id) } })
            .select('userId size tiles')
            .lean();
        const farmsByUserId = new Map(farms.map((farm) => [String(farm.userId), farm]));

        return res.json({
            users: users.map((user) => serializeAdminUser(user, farmsByUserId.get(String(user._id)), mediaSettings)),
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося завантажити гравців', error: error.message });
    }
});

router.patch('/users/:userId/profile', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });

        if (req.body.username !== undefined) {
            const username = String(req.body.username).trim();
            if (username.length < 2 || username.length > 24) return res.status(400).json({ message: 'Нік має містити від 2 до 24 символів' });
            const duplicate = await User.exists({ username, _id: { $ne: user._id } });
            if (duplicate) return res.status(409).json({ message: 'Такий нік уже зайнятий' });
            user.username = username;
        }

        if (req.body.role !== undefined) {
            if (!['user', 'admin'].includes(req.body.role)) return res.status(400).json({ message: 'Невідома роль' });
            if (String(user._id) === req.adminId && req.body.role !== 'admin') {
                return res.status(400).json({ message: 'Не можна зняти роль адміністратора із самого себе' });
            }
            user.role = req.body.role;
        }

        await user.save();
        return res.json({ user: serializeAdminUser(user.toObject(), null) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити профіль', error: error.message });
    }
});

router.post('/users/:userId/ban', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (String(req.params.userId) === req.adminId) return res.status(400).json({ message: 'Не можна заблокувати власний акаунт' });
        const { durationMinutes, reason = '' } = req.body;
        const allowedDurations = [10, 60, 1440, 10080, 43200];
        if (durationMinutes !== null && !allowedDurations.includes(durationMinutes)) {
            return res.status(400).json({ message: 'Обери 10 хв, 1 год, 1 день, 1 тиждень, 1 місяць або безстроково' });
        }
        if (typeof reason !== 'string' || reason.length > 300) return res.status(400).json({ message: 'Причина має бути коротшою за 300 символів' });
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (user.role === 'admin') return res.status(403).json({ message: 'Не можна заблокувати іншого адміністратора' });

        user.isBanned = true;
        user.banUntil = durationMinutes === null ? null : new Date(Date.now() + durationMinutes * 60_000);
        user.banReason = reason.trim();
        user.bannedAt = new Date();
        user.bannedBy = new mongoose.Types.ObjectId(req.adminId);
        await user.save();
        return res.json({ user: serializeAdminUser(user.toObject(), null) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося заблокувати гравця', error: error.message });
    }
});

router.post('/users/:userId/unban', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        user.isBanned = false;
        user.banUntil = null;
        user.banReason = '';
        user.bannedAt = null;
        user.bannedBy = null;
        await user.save();
        return res.json({ user: serializeAdminUser(user.toObject(), null) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося розблокувати гравця', error: error.message });
    }
});

router.delete('/users/:userId', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (String(req.params.userId) === req.adminId) return res.status(400).json({ message: 'Не можна видалити власний акаунт' });
        const user = await User.findById(req.params.userId).select('_id role');
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (user.role === 'admin') return res.status(403).json({ message: 'Спочатку зніми роль admin із цього акаунта' });

        await Promise.all([
            Farm.deleteOne({ userId: user._id }),
            User.updateMany({}, { $pull: {
                friends: user._id,
                friendRequestsReceived: user._id,
                friendRequestsSent: user._id,
            } }),
            User.deleteOne({ _id: user._id }),
        ]);
        return res.json({ message: 'Акаунт і ферму видалено' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося видалити акаунт', error: error.message });
    }
});

router.delete('/users/:userId/farm', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const farm = await Farm.findOne({ userId: req.params.userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        farm.tiles = [];
        await farm.save();
        return res.json({ message: 'Ферму повністю очищено' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося очистити ферму', error: error.message });
    }
});

router.post('/users/:userId/reset-progress', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });

        const starterTiles = createStarterFarmTiles();
        user.coins = USER_STARTING_COINS;
        user.rubies = USER_STARTING_RUBIES;
        user.xp = 0;
        user.level = 1;
        user.inventory = new Map();
        user.itemInventory = new Map();
        user.unlockedGrassStyles = ['classic'];
        user.unlockedBackgroundStyles = ['classic'];
        user.claimedLevelRewards = [];

        await Promise.all([
            user.save(),
            Farm.findOneAndUpdate(
                { userId: user._id },
                { $set: { size: FARM_STARTING_SIZE, tiles: starterTiles, grassStyle: 'classic', backgroundStyle: 'classic', backgroundIsNight: false } },
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
            ),
        ]);

        return res.json({ message: 'Ігровий прогрес скинуто до стартового стану' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося скинути прогрес гравця', error: error.message });
    }
});

router.delete('/users/:userId/farm-items/:x/:y/:quadrant', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const coordinates = [req.params.x, req.params.y, req.params.quadrant].map(Number);
        if (!coordinates.every(Number.isInteger)) return res.status(400).json({ message: 'Некоректні координати предмета' });
        const [x, y, quadrant] = coordinates;
        const farm = await Farm.findOne({ userId: req.params.userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        const index = farm.tiles.findIndex((tile) => tile.x === x && tile.y === y && tile.quadrant === quadrant);
        if (index < 0) return res.status(404).json({ message: 'Предмет не знайдено' });
        farm.tiles.splice(index, 1);
        await farm.save();
        return res.json({ message: 'Предмет видалено з ферми' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося видалити предмет', error: error.message });
    }
});

router.patch('/users/:userId/farm-items/:x/:y/:quadrant', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const source = [req.params.x, req.params.y, req.params.quadrant].map(Number);
        const { x = source[0], y = source[1], quadrant = source[2], flipX } = req.body;
        if (!source.every(Number.isInteger) || !Number.isInteger(x) || !Number.isInteger(y) ||
            !Number.isInteger(quadrant) || quadrant < 0 || quadrant > 3 ||
            (flipX !== undefined && typeof flipX !== 'boolean')) {
            return res.status(400).json({ message: 'Перевір координати, сектор і стан перевертання' });
        }

        const farm = await Farm.findOne({ userId: req.params.userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        const tile = farm.tiles.find((entry) => !entry.isDirt && entry.x === source[0] && entry.y === source[1] && entry.quadrant === source[2]);
        if (!tile) return res.status(404).json({ message: 'Предмет не знайдено на фермі' });
        const item = getGameItem(tile.itemId);
        if (!item) return res.status(400).json({ message: 'Предмет відсутній у каталозі' });
        if (flipX !== undefined && flipX !== (tile.flipX ?? false) && item.canFlip === false) {
            return res.status(400).json({ message: 'Цей предмет не можна перевертати' });
        }

        const nextFlipX = flipX ?? tile.flipX ?? false;
        const occupiedCells = getOccupiedCells(x, y, quadrant, item, nextFlipX);
        if (!occupiedCells?.length || occupiedCells.some((cell) => cell.x < 0 || cell.x >= farm.size || cell.y < 0 || cell.y >= farm.size)) {
            return res.status(400).json({ message: 'Footprint не поміщається в межі ферми' });
        }

        const uniqueSurfaceCells = new Set(occupiedCells.map((cell) => `${cell.x},${cell.y}`));
        const occupiedDirtCells = new Set(farm.tiles
            .filter((entry) => entry.isDirt && occupiedCells.some((cell) => cell.x === entry.x && cell.y === entry.y))
            .map((entry) => `${entry.x},${entry.y}`));
        const occupiedWaterCells = new Set(farm.tiles
            .filter((entry) => entry.surfaceType === 'water' && occupiedCells.some((cell) => cell.x === entry.x && cell.y === entry.y))
            .map((entry) => `${entry.x},${entry.y}`));
        if (item.placementSurface === 'soil' && [...uniqueSurfaceCells].some((cell) => !occupiedDirtCells.has(cell))) {
            return res.status(400).json({ message: 'Цю культуру можна розмістити лише на грядці' });
        }
        if (item.placementSurface === 'water' && [...uniqueSurfaceCells].some((cell) => !occupiedWaterCells.has(cell))) {
            return res.status(400).json({ message: 'Цей предмет можна розмістити лише на воді' });
        }
        if (item.placementSurface !== 'water' && occupiedWaterCells.size > 0) {
            return res.status(400).json({ message: 'На воду можна ставити лише предмети для води' });
        }
        if (item.placementSurface === 'grass' && occupiedDirtCells.size > 0) {
            return res.status(400).json({ message: 'Предмет можна розмістити лише на траві' });
        }

        const overlaps = farm.tiles.some((entry) => {
            if (entry === tile || entry.isDirt || entry.surfaceType) return false;
            const otherItem = getGameItem(entry.itemId);
            const otherCells = getOccupiedCells(entry.x, entry.y, entry.quadrant, otherItem, entry.flipX ?? false) ?? [
                { x: entry.x, y: entry.y, quadrant: entry.quadrant },
            ];
            return otherCells.some((otherCell) => occupiedCells.some((cell) =>
                cell.x === otherCell.x && cell.y === otherCell.y && cell.quadrant === otherCell.quadrant
            ));
        });
        if (overlaps) return res.status(409).json({ message: 'У цьому місці вже є інший предмет' });

        tile.x = x;
        tile.y = y;
        tile.quadrant = quadrant;
        tile.flipX = nextFlipX;
        tile.occupiedQuadrants = getOccupiedQuadrants(quadrant, item) ?? [quadrant];
        tile.occupiedCells = occupiedCells;
        await farm.save();
        return res.json({ message: 'Предмет ферми оновлено', item: tile });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося змінити предмет ферми', error: error.message });
    }
});

router.patch('/users/:userId/stats', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const coinsDelta = req.body.coinsDelta ?? 0;
        const rubiesDelta = req.body.rubiesDelta ?? 0;
        const xpDelta = req.body.xpDelta ?? 0;
        if (!Number.isSafeInteger(coinsDelta) || !Number.isSafeInteger(rubiesDelta) || !Number.isSafeInteger(xpDelta)) {
            return res.status(400).json({ message: 'Монети, рубіни й XP мають бути цілими числами' });
        }

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (String(user._id) === req.adminId && user.role === 'admin' && req.body.role === 'user') {
            return res.status(400).json({ message: 'Не можна зняти права адміністратора із самого себе' });
        }

        const nextCoins = (user.coins ?? 0) + coinsDelta;
        const nextRubies = (user.rubies ?? 0) + rubiesDelta;
        const nextXp = (user.xp ?? 0) + xpDelta;
        if (nextCoins < 0 || nextRubies < 0 || nextXp < 0) return res.status(400).json({ message: 'Баланс і XP не можуть бути меншими за нуль' });

        user.coins = nextCoins;
        user.rubies = nextRubies;
        user.xp = nextXp;
        user.level = getLevelProgress(nextXp).level;
        await user.save();
        return res.json({ user: serializeAdminUser(user.toObject(), null) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити показники', error: error.message });
    }
});

router.post('/users/:userId/gifts', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        const items = req.body?.items ?? [];
        const kind = ['gift', 'message', 'warning'].includes(req.body?.kind) ? req.body.kind : 'gift';
        if (title.length < 2 || title.length > 100 || description.length > 300 ||
            !Array.isArray(items) || items.length > 20 || (kind === 'gift' && items.length < 1) ||
            (kind !== 'gift' && items.length === 0 && description.length < 1)) {
            return res.status(400).json({ message: 'Вкажи заголовок, текст до 300 символів і (для подарунка) від 1 до 20 предметів' });
        }
        const giftItems = [];
        for (const entry of items) {
            if (!entry || !Number.isSafeInteger(entry.amount)) {
                return res.status(400).json({ message: 'Кількість нагороди має бути цілим числом' });
            }
            if (entry.kind === 'item') {
                const item = getGameItem(entry.itemId);
                if (!item || item.disabled || entry.amount < 1 || entry.amount > 1000) {
                    return res.status(400).json({ message: 'Перевір активний предмет і його кількість від 1 до 1000' });
                }
                giftItems.push({ kind: 'item', itemId: item.id, amount: entry.amount });
            } else if (['coins', 'rubies', 'xp'].includes(entry.kind)) {
                if (entry.amount < 1 || entry.amount > 100_000) {
                    return res.status(400).json({ message: 'Кількість валюти або XP має бути від 1 до 100 000' });
                }
                giftItems.push({ kind: entry.kind, amount: entry.amount });
            } else if (entry.kind === 'level') {
                if (entry.amount < 2 || entry.amount > 999) {
                    return res.status(400).json({ message: 'Рівень подарунка має бути від 2 до 999' });
                }
                giftItems.push({ kind: 'level', amount: entry.amount });
            } else {
                return res.status(400).json({ message: 'Невідомий тип нагороди' });
            }
        }
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { $push: { adminGifts: { title, description, kind, items: giftItems } } },
            { new: true, runValidators: true }
        ).select('_id');
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        return res.status(201).json({ success: true, message: 'Подарунок надіслано гравцю' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося надіслати подарунок', error: error.message });
    }
});

router.post('/users/:userId/inventory', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const { itemId, amountDelta } = req.body;
        if (typeof itemId !== 'string' || !Number.isSafeInteger(amountDelta) || amountDelta === 0) {
            return res.status(400).json({ message: 'Вкажи продукт і ненульову цілу кількість' });
        }
        const isHarvestable = listGameItems().some((item) => item.yieldItem === itemId);
        if (!isHarvestable) return res.status(400).json({ message: 'Цей продукт відсутній у каталозі врожаю' });

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        const inventory = user.inventory ?? new Map();
        const currentAmount = Number(inventory.get(itemId) ?? 0);
        const nextAmount = currentAmount + amountDelta;
        if (nextAmount < 0) return res.status(400).json({ message: 'У гравця недостатньо цього продукту' });
        inventory.set(itemId, nextAmount);
        user.inventory = inventory;
        await user.save();
        return res.json({ inventory: serializeInventory(user.inventory) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити інвентар', error: error.message });
    }
});

router.post('/users/:userId/inventory/remove', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const { scope = 'all', itemId, amount } = req.body ?? {};
        if (!['harvest', 'items', 'all'].includes(scope)) return res.status(400).json({ message: 'Невідомий розділ складу' });
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        const harvest = user.inventory ?? new Map();
        const owned = user.itemInventory ?? new Map();
        if (typeof itemId === 'string' && itemId) {
            const map = scope === 'items' ? owned : harvest;
            if (!map.has(itemId)) return res.status(404).json({ message: 'У гравця немає цього предмета' });
            const removeAmount = amount === undefined ? null : Number(amount);
            if (removeAmount !== null && (!Number.isSafeInteger(removeAmount) || removeAmount < 1)) {
                return res.status(400).json({ message: 'Кількість має бути цілим числом від 1' });
            }
            const left = removeAmount === null ? 0 : Number(map.get(itemId) ?? 0) - removeAmount;
            if (left > 0) map.set(itemId, left); else map.delete(itemId);
        } else {
            if (scope !== 'items') harvest.clear();
            if (scope !== 'harvest') owned.clear();
        }
        user.inventory = harvest;
        user.itemInventory = owned;
        user.markModified('inventory');
        user.markModified('itemInventory');
        await user.save();
        return res.json({
            inventory: Object.fromEntries(user.inventory ?? []),
            itemInventory: Object.fromEntries(user.itemInventory ?? []),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося очистити склад', error: error.message });
    }
});

router.post('/users/:userId/farm-items', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const { itemId, x: requestedX, y: requestedY, quadrant: requestedQuadrant } = req.body;
        const item = getGameItem(itemId);
        if (!item || !['TREE', 'CROP', 'ANIMAL', 'BUILDING'].includes(item.type)) {
            return res.status(400).json({ message: 'Предмет не знайдено в каталозі' });
        }
        if (item.disabled) return res.status(400).json({ message: 'Архівований товар не можна додати на ферму' });
        const farm = await Farm.findOne({ userId: req.params.userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });

        const tryPlaceAt = (x, y, quadrant) => {
            const occupiedCells = getOccupiedCells(x, y, quadrant, item, false);
            if (!occupiedCells?.length || occupiedCells.some((cell) => cell.x < 0 || cell.x >= farm.size || cell.y < 0 || cell.y >= farm.size)) return null;

            const uniqueSurfaceCells = new Set(occupiedCells.map((cell) => `${cell.x},${cell.y}`));
            const occupiedDirtCells = new Set(farm.tiles
                .filter((tile) => tile.isDirt && occupiedCells.some((cell) => cell.x === tile.x && cell.y === tile.y))
                .map((tile) => `${tile.x},${tile.y}`));
            const occupiedWaterCells = new Set(farm.tiles
                .filter((tile) => tile.surfaceType === 'water' && occupiedCells.some((cell) => cell.x === tile.x && cell.y === tile.y))
                .map((tile) => `${tile.x},${tile.y}`));
            if (item.placementSurface === 'soil' && [...uniqueSurfaceCells].some((cell) => !occupiedDirtCells.has(cell))) return null;
            if (item.placementSurface === 'water' && [...uniqueSurfaceCells].some((cell) => !occupiedWaterCells.has(cell))) return null;
            if (item.placementSurface !== 'water' && occupiedWaterCells.size > 0) return null;
            if (item.placementSurface === 'grass' && occupiedDirtCells.size > 0) return null;

            const overlaps = farm.tiles.some((tile) => {
                if (tile.isDirt || tile.surfaceType) return false;
                const existingItem = getGameItem(tile.itemId);
                const existingCells = getOccupiedCells(tile.x, tile.y, tile.quadrant, existingItem, tile.flipX ?? false) ?? [
                    { x: tile.x, y: tile.y, quadrant: tile.quadrant },
                ];
                return existingCells.some((existingCell) => occupiedCells.some((cell) =>
                    cell.x === existingCell.x && cell.y === existingCell.y && cell.quadrant === existingCell.quadrant
                ));
            });
            if (overlaps) return null;

            return {
                x,
                y,
                quadrant,
                occupiedQuadrants: getOccupiedQuadrants(quadrant, item) ?? [quadrant],
                occupiedCells,
                itemId,
                isDirt: false,
                stage: 0,
                placedAt: new Date(),
            };
        };

        let tile = null;
        const explicitCoordinates = requestedX !== undefined || requestedY !== undefined || requestedQuadrant !== undefined;
        if (explicitCoordinates) {
            if (!Number.isInteger(requestedX) || !Number.isInteger(requestedY) || !Number.isInteger(requestedQuadrant) || requestedQuadrant < 0 || requestedQuadrant > 3) {
                return res.status(400).json({ message: 'Вкажи координати ферми та сектор 0–3' });
            }
            tile = tryPlaceAt(requestedX, requestedY, requestedQuadrant);
            if (!tile) return res.status(409).json({ message: 'Не вдалося розмістити предмет у вибраному місці' });
        } else {
            search: for (let y = 0; y < farm.size; y++) {
                for (let x = 0; x < farm.size; x++) {
                    for (let quadrant = 0; quadrant < 4; quadrant++) {
                        tile = tryPlaceAt(x, y, quadrant);
                        if (tile) break search;
                    }
                }
            }
            if (!tile) return res.status(409).json({ message: 'На фермі немає вільного місця з потрібною поверхнею' });
        }

        farm.tiles.push(tile);
        await farm.save();
        return res.status(201).json({ message: 'Предмет додано на ферму', tile });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося додати предмет на ферму', error: error.message });
    }
});

export default router;
