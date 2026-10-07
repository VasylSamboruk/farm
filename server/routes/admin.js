import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Farm from '../models/Farm.js';
import LevelReward from '../models/LevelReward.js';
import GiftShopItem from '../models/GiftShopItem.js';
import User, { USER_STARTING_COINS } from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';
import { createStarterFarmTiles } from '../services/starterFarm.js';
import { createCustomGameItem, getGameItem, listGameItems, permanentlyDeleteGameItem, reorderGameItem, updateGameItemConfig, updateGameItemPrices } from '../services/gameCatalog.js';
import { getOccupiedCells, getOccupiedQuadrants } from '../services/footprint.js';
import { getMediaSettings, normalizeAssetSource, resolveAssetSource, resolveGameItemImages, restorePreviousAssetBaseUrl, setAssetBaseUrl } from '../services/mediaStorage.js';
import { listGiftShopItems } from '../services/giftShop.js';

const router = express.Router();
const MAX_PAGE_SIZE = 100;

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
    farmSize: farm?.size ?? 15,
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
    productionTimeMs: item.productionTimeMs,
    mechanic: item.mechanic,
    accelerationMs: item.accelerationMs,
    yieldAmount: item.yieldAmount,
    canFlip: item.canFlip,
    flipX: item.flipX,
    spriteScale: item.spriteScale,
    shopIcon: item.shopIcon,
    growthImages: item.growthImages ?? [],
    footprint: item.footprint,
    largeFootprint: item.largeFootprint,
    housing: item.housing,
    access: item.access ?? 'all',
    giftOnly: Boolean(item.giftOnly),
    custom: Boolean(item.custom),
    disabled: Boolean(item.disabled),
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
        const items = listGameItems().map((item) => serializeCatalogItem(resolveGameItemImages(item, settings)));
        return res.json({ items });
    } catch (error) {
        return next(error);
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

router.post('/catalog', async (req, res) => {
    const body = req.body ?? {};
    const { id, name, type, price, priceCurrency = 'coins', plantingXp, requiredLevel, productionTimeMs, yieldItem, yieldName,
        yieldIcon, yieldAmount, sellPrice, placementSurface, spriteScale, shopImage, shopIcon, housing,
        yieldImage, growthImages, footprint, largeFootprint, canFlip, access, mechanic, accelerationMs, giftOnly = false } = body;
    const allowedTypes = ['TREE', 'CROP', 'ANIMAL', 'BUILDING', 'OTHER'];
    const producesItems = ['TREE', 'CROP', 'ANIMAL'].includes(type);
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
        !['grass', 'soil'].includes(placementSurface) ||
        !Number.isFinite(spriteScale) || spriteScale < 0.1 || spriteScale > 8 ||
        !isFootprint(footprint) ||
        (largeFootprint !== null && largeFootprint !== undefined && !isFootprint(largeFootprint, 8)) ||
        (shopImage !== null && shopImage !== undefined && shopImage !== '' && !isImageSource(shopImage)) ||
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
        (type === 'OTHER' && mechanic !== undefined && !['expand_farm', 'accelerate_growth'].includes(mechanic)) ||
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
            shopImage: normalizeImage(shopImage) || undefined,
            shopIcon: shopIcon || undefined,
            yieldImage: normalizeImage(yieldImage) || undefined,
            growthImages: growthImages.map((source) => normalizeImage(source)),
            footprint,
            largeFootprint: largeFootprint || undefined,
            ...(housing ? { housing: { capacity: housing.capacity, animalTypes: housing.animalTypes } } : {}),
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
            'yieldIcon', 'yieldAmount', 'placementSurface', 'spriteScale', 'canFlip', 'footprint',
            'largeFootprint', 'shopImage', 'shopIcon', 'yieldImage', 'growthImages', 'flipX', 'access', 'requiredLevel', 'sortOrder', 'disabled',
            'housing',
            'giftOnly',
            'mechanic', 'accelerationMs',
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
            if (field === 'mechanic') {
                if (item.type !== 'OTHER' || (value !== null && !['expand_farm', 'accelerate_growth'].includes(value))) {
                    return res.status(400).json({ message: 'Механіка може бути розширенням або прискоренням часу для товару «Інше»' });
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
            if (field === 'spriteScale') {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 5) return res.status(400).json({ message: 'spriteScale має бути від 0.1 до 5' });
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
            if (['shopImage', 'yieldImage'].includes(field)) {
                if (value === '' || value === null) { updates[field] = null; continue; }
                if (!isImageSource(value)) {
                    return res.status(400).json({ message: `${field} має бути HTTPS URL або локальним шляхом /assets/...` });
                }
                updates[field] = value;
                continue;
            }
            if (field === 'placementSurface') {
                if (value !== 'grass' && value !== 'soil') return res.status(400).json({ message: 'Поверхня має бути grass або soil' });
                updates[field] = value;
                continue;
            }
            if (typeof value !== 'string' || value.trim().length > 120) return res.status(400).json({ message: `${field} має бути текстом до 120 символів` });
            updates[field] = value.trim();
        }

        if (!Object.keys(updates).length) return res.status(400).json({ message: 'Не передано змін конфігурації' });
        const resultingMechanic = updates.mechanic === undefined ? item.mechanic : updates.mechanic;
        const resultingAcceleration = updates.accelerationMs === undefined ? item.accelerationMs : updates.accelerationMs;
        if (resultingMechanic === 'accelerate_growth' &&
            (!Number.isSafeInteger(resultingAcceleration) || resultingAcceleration < 1000 || resultingAcceleration > 2_592_000_000)) {
            return res.status(400).json({ message: 'Для добрива задай прискорення від 1 секунди до 30 днів' });
        }
        const mediaSettings = await getMediaSettings();
        if (updates.growthImages) updates.growthImages = updates.growthImages.map((source) => normalizeAssetSource(source, mediaSettings));
        for (const field of ['shopImage', 'yieldImage']) {
            if (updates[field]) updates[field] = normalizeAssetSource(updates[field], mediaSettings);
        }
        const { sortOrder, ...configUpdates } = updates;
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
        const filter = search
            ? mongoose.isValidObjectId(search)
                ? { _id: search }
                : { username: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
            : {};
        const [total, users] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select('_id username role avatar coins rubies xp inventory createdAt isBanned banUntil banReason')
                .sort({ createdAt: -1, _id: 1 })
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
        user.xp = 0;
        user.level = 1;
        user.inventory = new Map();

        await Promise.all([
            user.save(),
            Farm.findOneAndUpdate(
                { userId: user._id },
                { $set: { tiles: starterTiles } },
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
        if (!occupiedCells?.length || occupiedCells.some((cell) => cell.x < 0 || cell.x >= 15 || cell.y < 0 || cell.y >= 15)) {
            return res.status(400).json({ message: 'Footprint не поміщається в межі ферми' });
        }

        const uniqueSurfaceCells = new Set(occupiedCells.map((cell) => `${cell.x},${cell.y}`));
        const occupiedDirtCells = new Set(farm.tiles
            .filter((entry) => entry.isDirt && occupiedCells.some((cell) => cell.x === entry.x && cell.y === entry.y))
            .map((entry) => `${entry.x},${entry.y}`));
        if (item.placementSurface === 'soil' && [...uniqueSurfaceCells].some((cell) => !occupiedDirtCells.has(cell))) {
            return res.status(400).json({ message: 'Цю культуру можна розмістити лише на грядці' });
        }
        if (item.placementSurface === 'grass' && occupiedDirtCells.size > 0) {
            return res.status(400).json({ message: 'Предмет можна розмістити лише на траві' });
        }

        const overlaps = farm.tiles.some((entry) => {
            if (entry === tile || entry.isDirt) return false;
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
        const items = req.body?.items;
        if (title.length < 2 || title.length > 100 || description.length > 300 ||
            !Array.isArray(items) || items.length < 1 || items.length > 20) {
            return res.status(400).json({ message: 'Вкажи назву, опис до 300 символів і від 1 до 20 предметів' });
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
            { $push: { adminGifts: { title, description, items: giftItems } } },
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
            if (!occupiedCells?.length || occupiedCells.some((cell) => cell.x < 0 || cell.x >= 15 || cell.y < 0 || cell.y >= 15)) return null;

            const uniqueSurfaceCells = new Set(occupiedCells.map((cell) => `${cell.x},${cell.y}`));
            const occupiedDirtCells = new Set(farm.tiles
                .filter((tile) => tile.isDirt && occupiedCells.some((cell) => cell.x === tile.x && cell.y === tile.y))
                .map((tile) => `${tile.x},${tile.y}`));
            if (item.placementSurface === 'soil' && [...uniqueSurfaceCells].some((cell) => !occupiedDirtCells.has(cell))) return null;
            if (item.placementSurface === 'grass' && occupiedDirtCells.size > 0) return null;

            const overlaps = farm.tiles.some((tile) => {
                if (tile.isDirt) return false;
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
            search: for (let y = 0; y < 15; y++) {
                for (let x = 0; x < 15; x++) {
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
