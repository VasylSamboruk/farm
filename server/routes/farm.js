import express from 'express';
import mongoose from 'mongoose';
import Farm from '../models/Farm.js';
import User from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';
import { getGameItem, listGameItems } from '../services/gameCatalog.js';
import { getTreeHarvestReadyAt } from '../services/treeMechanics.js';
import { getMovedOccupiedCells, getOccupiedCells, getOccupiedQuadrants } from '../services/footprint.js';
import { getFarmTilesWithOccupiedCells, getTileOccupiedCells } from '../services/farmTiles.js';

const router = express.Router();

router.use(async (req, res, next) => {
    try {
        const userId = req.body?.userId ?? (req.method === 'GET' ? req.path.slice(1).split('/')[0] : null);
        if (!mongoose.isValidObjectId(userId)) return next();
        const user = await User.findById(userId).select('isBanned banUntil');
        if (user?.isBanned && (!user.banUntil || user.banUntil > new Date())) {
            return res.status(403).json({ message: 'Акаунт заблоковано', banUntil: user.banUntil });
        }
        return next();
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося перевірити статус акаунта', error: error.message });
    }
});

router.get('/:userId', async (req, res) => {
    try {
        const farm = await Farm.findOne({ userId: req.params.userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        const responseFarm = farm.toObject();
        responseFarm.tiles = getFarmTilesWithOccupiedCells(responseFarm.tiles);
        res.json(responseFarm);
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера', error: error.message });
    }
});

router.post('/expand', async (req, res) => {
    try {
        const { userId, itemId, fromInventory = false } = req.body;
        const item = getGameItem(itemId);
        if (!item || item.mechanic !== 'expand_farm' || item.disabled) {
            return res.status(400).json({ message: 'Розширення ферми недоступне' });
        }
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        const currencyField = item.priceCurrency === 'rubies' ? 'rubies' : 'coins';
        const user = fromInventory
            ? await User.findOneAndUpdate(
                { _id: userId, [`itemInventory.${itemId}`]: { $gte: 1 } },
                { $inc: { [`itemInventory.${itemId}`]: -1 } },
                { new: true }
            )
            : await User.findOneAndUpdate(
                { _id: userId, [currencyField]: { $gte: item.price } },
                { $inc: { [currencyField]: -item.price } },
                { new: true }
            );
        if (!user) return res.status(400).json({ message: fromInventory ? 'Цього предмета немає в інвентарі' : `Недостатньо ${currencyField === 'rubies' ? 'рубінів' : 'монет'}!` });

        farm.size += 1;
        await farm.save();
        return res.json({
            success: true,
            size: farm.size,
            tiles: getFarmTilesWithOccupiedCells(farm.toObject().tiles),
            user: { coins: user.coins, rubies: user.rubies, itemInventory: Object.fromEntries(user.itemInventory ?? []) },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося розширити ферму', error: error.message });
    }
});

router.post('/buy-item', async (req, res) => {
    try {
        const { userId, itemId } = req.body;
        const item = getGameItem(itemId);
        if (!item || item.type !== 'OTHER' || item.mechanic !== 'accelerate_growth' || item.disabled) {
            return res.status(400).json({ message: 'Це добриво зараз недоступне' });
        }
        const currentUser = await User.findById(userId);
        if (!currentUser) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (getLevelProgress(currentUser.xp ?? 0).level < (item.requiredLevel ?? 1)) {
            return res.status(403).json({ message: `Цей товар доступний з ${item.requiredLevel ?? 1} рівня` });
        }
        if (item.access === 'admin' && currentUser.role !== 'admin') {
            return res.status(403).json({ message: 'Цей товар доступний лише адміністратору' });
        }

        const currencyField = item.priceCurrency === 'rubies' ? 'rubies' : 'coins';
        const user = await User.findOneAndUpdate(
            { _id: userId, [currencyField]: { $gte: item.price } },
            { $inc: { [currencyField]: -item.price, [`itemInventory.${itemId}`]: 1 } },
            { new: true }
        );
        if (!user) return res.status(400).json({ message: `Недостатньо ${currencyField === 'rubies' ? 'рубінів' : 'монет'}!` });
        return res.json({
            success: true,
            user: {
                coins: user.coins,
                rubies: user.rubies,
                itemInventory: Object.fromEntries(user.itemInventory ?? []),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося купити добриво', error: error.message });
    }
});

const findHousingBuilding = (farm, x, y, quadrant) => {
    const tile = farm.tiles.find(t => !t.isDirt && t.x === x && t.y === y && t.quadrant === quadrant);
    const item = tile ? getGameItem(tile.itemId) : null;
    return item?.type === 'BUILDING' && item.housing ? { tile, item } : null;
};

const findFactoryBuilding = (farm, x, y, quadrant) => {
    const tile = farm.tiles.find(t => !t.isDirt && t.x === x && t.y === y && t.quadrant === quadrant);
    const item = tile ? getGameItem(tile.itemId) : null;
    return item?.type === 'BUILDING' && item.buildingCategory === 'FACTORY' ? { tile, item } : null;
};

const getFarmResponseTiles = (farm) => getFarmTilesWithOccupiedCells(farm.toObject().tiles);
const isValidTilePosition = (x, y, quadrant, size) =>
    Number.isSafeInteger(x) && Number.isSafeInteger(y) &&
    Number.isSafeInteger(quadrant) && x >= 0 && x < size && y >= 0 && y < size &&
    quadrant >= 0 && quadrant <= 3;

router.post('/factory/start', async (req, res) => {
    let chargedUser;
    let chargedInputId;
    let chargedAmount = 0;
    try {
        const { userId, buildingX, buildingY, buildingQuadrant, amount } = req.body;
        if (!Number.isSafeInteger(amount) || amount < 1) {
            return res.status(400).json({ message: 'Вкажи кількість від 1 одиниці' });
        }
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        if (!isValidTilePosition(buildingX, buildingY, buildingQuadrant, farm.size)) {
            return res.status(400).json({ message: 'Некоректне місце фабрики' });
        }
        const factory = findFactoryBuilding(farm, buildingX, buildingY, buildingQuadrant);
        if (!factory) return res.status(404).json({ message: 'Фабрику не знайдено' });
        const inputItem = getGameItem(factory.item.factoryInputItemId);
        if (!inputItem?.yieldItem || !Number.isSafeInteger(factory.item.productionTimeMs) || factory.item.productionTimeMs < 1000 ||
            !factory.item.yieldItem || !Number.isSafeInteger(factory.item.yieldAmount) || factory.item.yieldAmount < 1) {
            return res.status(400).json({ message: 'Налаштування рецепта фабрики неповні' });
        }
        const queuedUnits = factory.tile.factoryQueuedUnits ?? 0;
        if (amount + queuedUnits > (factory.item.factoryCapacity ?? 25)) {
            return res.status(400).json({ message: `Фабрика вміщує не більше ${factory.item.factoryCapacity ?? 25} одиниць` });
        }
        chargedUser = await User.findOneAndUpdate(
            { _id: userId, [`inventory.${inputItem.yieldItem}`]: { $gte: amount } },
            { $inc: { [`inventory.${inputItem.yieldItem}`]: -amount } },
            { new: true }
        );
        if (!chargedUser) return res.status(400).json({ message: `Недостатньо ${inputItem.yieldName ?? inputItem.name} на складі` });
        chargedInputId = inputItem.yieldItem;
        chargedAmount = amount;
        const startedAt = factory.tile.factoryStartedAt ?? new Date();
        const queueStateMatch = queuedUnits === 0
            ? { $or: [{ factoryQueuedUnits: 0 }, { factoryQueuedUnits: { $exists: false } }] }
            : { factoryQueuedUnits: queuedUnits };
        const queueUpdate = await Farm.updateOne(
            {
                _id: farm._id,
                tiles: {
                    $elemMatch: {
                        x: buildingX,
                        y: buildingY,
                        quadrant: buildingQuadrant,
                        itemId: factory.item.id,
                        isDirt: false,
                        factoryStartedAt: factory.tile.factoryStartedAt ?? null,
                        ...queueStateMatch,
                    },
                },
            },
            {
                $set: {
                    'tiles.$.factoryQueuedUnits': queuedUnits + amount,
                    'tiles.$.factoryStartedAt': startedAt,
                    'tiles.$.factoryInputItemId': inputItem.id,
                },
            }
        );
        if (!queueUpdate.matchedCount) {
            await User.updateOne({ _id: chargedUser._id }, { $inc: { [`inventory.${chargedInputId}`]: chargedAmount } });
            chargedUser = null;
            return res.status(409).json({ message: 'Черга фабрики щойно змінилася. Онови вікно та спробуй ще раз.' });
        }
        const userForResponse = chargedUser;
        chargedUser = null;
        factory.tile.factoryQueuedUnits = queuedUnits + amount;
        factory.tile.factoryStartedAt = startedAt;
        factory.tile.factoryInputItemId = inputItem.id;
        return res.json({
            success: true,
            size: farm.size,
            tiles: getFarmResponseTiles(farm),
            user: { inventory: Object.fromEntries(userForResponse.inventory ?? []) },
        });
    } catch (error) {
        if (chargedUser && chargedInputId) {
            await User.updateOne({ _id: chargedUser._id }, { $inc: { [`inventory.${chargedInputId}`]: chargedAmount } });
        }
        return res.status(500).json({ message: 'Не вдалося запустити фабрику', error: error.message });
    }
});

router.post('/factory/collect', async (req, res) => {
    let farm;
    let tile;
    let previousQueuedUnits;
    let previousStartedAt;
    let previousInputItemId;
    let factoryStateSaved = false;
    try {
        const { userId, buildingX, buildingY, buildingQuadrant } = req.body;
        farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        if (!isValidTilePosition(buildingX, buildingY, buildingQuadrant, farm.size)) {
            return res.status(400).json({ message: 'Некоректне місце фабрики' });
        }
        const factory = findFactoryBuilding(farm, buildingX, buildingY, buildingQuadrant);
        if (!factory) return res.status(404).json({ message: 'Фабрику не знайдено' });
        tile = factory.tile;
        const { item } = factory;
        const queuedUnits = tile.factoryQueuedUnits ?? 0;
        const startedAt = tile.factoryStartedAt ? new Date(tile.factoryStartedAt).getTime() : Number.NaN;
        const processingTimeMs = item.productionTimeMs;
        if (!queuedUnits || !Number.isFinite(startedAt) || !Number.isSafeInteger(processingTimeMs) || processingTimeMs < 1000) {
            return res.status(400).json({ message: 'На фабриці немає готової продукції' });
        }
        const completedUnits = Math.min(queuedUnits, Math.floor((Date.now() - startedAt) / processingTimeMs));
        if (completedUnits < 1) return res.status(400).json({ message: 'Продукція ще переробляється' });
        const outputAmount = completedUnits * item.yieldAmount;
        previousQueuedUnits = queuedUnits;
        previousStartedAt = tile.factoryStartedAt;
        previousInputItemId = tile.factoryInputItemId;
        tile.factoryQueuedUnits = queuedUnits - completedUnits;
        tile.factoryStartedAt = tile.factoryQueuedUnits
            ? new Date(startedAt + completedUnits * processingTimeMs)
            : undefined;
        if (!tile.factoryQueuedUnits) tile.factoryInputItemId = undefined;
        await farm.save();
        factoryStateSaved = true;
        const user = await User.findOneAndUpdate(
            { _id: userId },
            { $inc: { [`inventory.${item.yieldItem}`]: outputAmount } },
            { new: true }
        );
        if (!user) {
            tile.factoryQueuedUnits = previousQueuedUnits;
            tile.factoryStartedAt = previousStartedAt;
            tile.factoryInputItemId = previousInputItemId;
            await farm.save();
            factoryStateSaved = false;
            return res.status(404).json({ message: 'Гравця не знайдено' });
        }
        factoryStateSaved = false;
        return res.json({
            success: true,
            size: farm.size,
            tiles: getFarmResponseTiles(farm),
            collected: completedUnits,
            user: { inventory: Object.fromEntries(user.inventory ?? []) },
        });
    } catch (error) {
        if (factoryStateSaved && farm && tile) {
            try {
                tile.factoryQueuedUnits = previousQueuedUnits;
                tile.factoryStartedAt = previousStartedAt;
                tile.factoryInputItemId = previousInputItemId;
                await farm.save();
            } catch (rollbackError) {
                return res.status(500).json({
                    message: 'Не вдалося зібрати продукцію фабрики та відновити чергу',
                    error: error.message,
                    rollbackError: rollbackError.message,
                });
            }
        }
        return res.status(500).json({ message: 'Не вдалося зібрати продукцію фабрики', error: error.message });
    }
});

router.post('/housing/store', async (req, res) => {
    try {
        const { userId, buildingX, buildingY, buildingQuadrant, animalX, animalY, animalQuadrant } = req.body;
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        if (!isValidTilePosition(buildingX, buildingY, buildingQuadrant, farm.size) ||
            !isValidTilePosition(animalX, animalY, animalQuadrant, farm.size)) {
            return res.status(400).json({ message: 'Некоректне місце для будівлі або тварини' });
        }

        const housing = findHousingBuilding(farm, buildingX, buildingY, buildingQuadrant);
        if (!housing) return res.status(404).json({ message: 'Будівлю для тварин не знайдено' });
        const animals = housing.tile.housedAnimals ?? (housing.tile.housedAnimals = []);
        if (animals.length >= housing.item.housing.capacity) {
            return res.status(400).json({ message: 'У будівлі більше немає місця' });
        }

        const animalTile = farm.tiles.find(t =>
            !t.isDirt && t.x === animalX && t.y === animalY && t.quadrant === animalQuadrant
        );
        const animalItem = animalTile ? getGameItem(animalTile.itemId) : null;
        if (!animalTile || animalItem?.type !== 'ANIMAL') {
            return res.status(404).json({ message: 'На вибраній клітинці немає тварини' });
        }
        if (!housing.item.housing.animalTypes.includes(animalTile.itemId)) {
            return res.status(400).json({ message: 'Ця будівля не приймає таку тварину' });
        }

        animals.push({
            itemId: animalTile.itemId,
            placedAt: animalTile.placedAt ?? new Date(),
            lastHarvestedAt: animalTile.lastHarvestedAt,
        });
        farm.tiles = farm.tiles.filter(t => t !== animalTile);
        await farm.save();
        return res.json({ success: true, size: farm.size, tiles: getFarmResponseTiles(farm) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося помістити тварину в будівлю', error: error.message });
    }
});

router.post('/housing/release', async (req, res) => {
    try {
        const { userId, buildingX, buildingY, buildingQuadrant, animalId, x, y, quadrant } = req.body;
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        if (!isValidTilePosition(buildingX, buildingY, buildingQuadrant, farm.size) ||
            !isValidTilePosition(x, y, quadrant, farm.size) ||
            typeof animalId !== 'string' || !mongoose.isValidObjectId(animalId)) {
            return res.status(400).json({ message: 'Некоректне місце або тварина' });
        }

        const housing = findHousingBuilding(farm, buildingX, buildingY, buildingQuadrant);
        if (!housing) return res.status(404).json({ message: 'Будівлю для тварин не знайдено' });
        const animals = housing.tile.housedAnimals ?? [];
        const animal = animals.find(entry => String(entry._id) === String(animalId));
        if (!animal) return res.status(404).json({ message: 'Тварину в будівлі не знайдено' });
        const item = getGameItem(animal.itemId);
        if (!item || item.type !== 'ANIMAL' || !housing.item.housing.animalTypes.includes(animal.itemId)) {
            return res.status(400).json({ message: 'Тварину не можна випустити з цієї будівлі' });
        }

        const occupiedCells = getOccupiedCells(x, y, quadrant, item, false);
        if (!occupiedCells || occupiedCells.some(cell =>
            cell.x < 0 || cell.x >= farm.size || cell.y < 0 || cell.y >= farm.size
        )) return res.status(400).json({ message: 'Тварина не поміщається в це місце' });
        if (farm.tiles.some(t => t.isDirt && occupiedCells.some(cell => cell.x === t.x && cell.y === t.y))) {
            return res.status(400).json({ message: 'Тварин можна випускати лише на траву' });
        }
        if (farm.tiles.some(t => !t.isDirt && getTileOccupiedCells(t).some(existingCell =>
            occupiedCells.some(cell => cell.x === existingCell.x && cell.y === existingCell.y && cell.quadrant === existingCell.quadrant)
        ))) return res.status(400).json({ message: 'Місце зайняте!' });

        farm.tiles.push({
            x,
            y,
            quadrant,
            occupiedQuadrants: getOccupiedQuadrants(quadrant, item) ?? [quadrant],
            occupiedCells,
            itemId: animal.itemId,
            isDirt: false,
            stage: 0,
            placedAt: animal.placedAt,
            lastHarvestedAt: animal.lastHarvestedAt,
        });
        housing.tile.housedAnimals = animals.filter(entry => String(entry._id) !== String(animalId));
        await farm.save();
        return res.json({ success: true, size: farm.size, tiles: getFarmResponseTiles(farm) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося випустити тварину', error: error.message });
    }
});

router.post('/housing/collect', async (req, res) => {
    try {
        const { userId, buildingX, buildingY, buildingQuadrant } = req.body;
        const [farm, user] = await Promise.all([
            Farm.findOne({ userId }),
            User.findById(userId),
        ]);
        if (!farm || !user) return res.status(404).json({ message: 'Ферму або гравця не знайдено' });

        const housing = findHousingBuilding(farm, buildingX, buildingY, buildingQuadrant);
        if (!housing) return res.status(404).json({ message: 'Будівлю для тварин не знайдено' });

        const now = new Date();
        const collectedByItem = new Map();
        const readyAnimals = [];
        for (const animal of housing.tile.housedAnimals ?? []) {
            const item = getGameItem(animal.itemId);
            if (!item?.yieldItem || !item.yieldAmount || now.getTime() < getTreeHarvestReadyAt(animal, item)) continue;
            const current = collectedByItem.get(item.yieldItem) ?? { yieldItem: item.yieldItem, yieldName: item.yieldName ?? item.name, amount: 0 };
            current.amount += item.yieldAmount;
            collectedByItem.set(item.yieldItem, current);
            readyAnimals.push(animal);
        }
        if (readyAnimals.length === 0) {
            return res.json({ success: true, size: farm.size, tiles: getFarmResponseTiles(farm), collected: [] });
        }

        const inventory = user.inventory ?? new Map();
        for (const product of collectedByItem.values()) {
            inventory.set(product.yieldItem, Number(inventory.get(product.yieldItem) ?? 0) + product.amount);
        }
        user.inventory = inventory;
        user.xp += readyAnimals.length;
        user.level = getLevelProgress(user.xp).level;
        for (const animal of readyAnimals) animal.lastHarvestedAt = now;
        await Promise.all([farm.save(), user.save()]);

        return res.json({
            success: true,
            size: farm.size,
            tiles: getFarmResponseTiles(farm),
            collected: [...collectedByItem.values()],
            user: {
                coins: user.coins,
                rubies: user.rubies,
                xp: user.xp,
                level: user.level,
                inventory: Object.fromEntries(user.inventory ?? []),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося зібрати продукцію з будівлі', error: error.message });
    }
});

router.post('/fertilize', async (req, res) => {
    try {
        const { userId, itemId, x, y, quadrant } = req.body;
        const fertilizer = getGameItem(itemId);
        if (!fertilizer || fertilizer.type !== 'OTHER' || fertilizer.mechanic !== 'accelerate_growth' ||
            !Number.isSafeInteger(fertilizer.accelerationMs) || fertilizer.accelerationMs < 1000) {
            return res.status(400).json({ message: 'Це добриво не налаштоване для прискорення' });
        }
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
            !Number.isSafeInteger(quadrant) || x < 0 || y < 0 || quadrant < 0 || quadrant > 3) {
            return res.status(400).json({ message: 'Некоректна ціль для добрива' });
        }

        const [farm, user] = await Promise.all([
            Farm.findOne({ userId }),
            User.findById(userId),
        ]);
        if (!farm || !user) return res.status(404).json({ message: 'Ферму або гравця не знайдено' });
        if (x >= farm.size || y >= farm.size) return res.status(400).json({ message: 'Ціль поза межами ферми' });
        const tile = farm.tiles.find(entry => !entry.isDirt && entry.x === x && entry.y === y && entry.quadrant === quadrant);
        if (!tile) return res.status(404).json({ message: 'На вибраній клітинці немає об’єкта для добрива' });

        const now = Date.now();
        const target = tile;
        const targetItem = getGameItem(tile.itemId);
        if (!['TREE', 'CROP', 'ANIMAL'].includes(targetItem?.type) ||
            !Number.isSafeInteger(targetItem.productionTimeMs) || targetItem.productionTimeMs < 1000) {
            return res.status(400).json({ message: 'Добриво можна застосувати лише до рослини, дерева або тварини на фермі — не до будівлі' });
        }

        const readyAt = getTreeHarvestReadyAt(target, targetItem);
        if (!Number.isFinite(readyAt) || readyAt <= now) {
            return res.status(400).json({ message: 'Таймер уже завершився — добриво можна використати лише під час росту' });
        }
        const remaining = readyAt - now;
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, [`itemInventory.${itemId}`]: { $gte: 1 } },
            { $inc: { [`itemInventory.${itemId}`]: -1 } },
            { new: true }
        );
        if (!updatedUser) return res.status(400).json({ message: 'Цього добрива більше немає в інвентарі' });

        const timerField = target.lastHarvestedAt ? 'lastHarvestedAt' : 'placedAt';
        target[timerField] = new Date(new Date(target[timerField]).getTime() - fertilizer.accelerationMs);
        try {
            await farm.save();
        } catch (error) {
            await User.updateOne({ _id: userId }, { $inc: { [`itemInventory.${itemId}`]: 1 } });
            throw error;
        }

        return res.json({
            success: true,
            acceleratedMs: Math.min(remaining, fertilizer.accelerationMs),
            appliedTo: targetItem.name,
            tiles: getFarmResponseTiles(farm),
            user: {
                coins: updatedUser.coins,
                rubies: updatedUser.rubies,
                itemInventory: Object.fromEntries(updatedUser.itemInventory ?? []),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося застосувати добриво', error: error.message });
    }
});

// ПОСАДКА: Знімає гроші, дає XP
router.post('/place', async (req, res) => {
    try {
        const { userId, x, y, quadrant, itemId, fromInventory = false } = req.body;
        const item = getGameItem(itemId);
        if (!item) {
            return res.status(400).json({ message: 'Товар не знайдено' });
        }
        if ((item.disabled && !fromInventory) || !['TREE', 'CROP', 'ANIMAL', 'BUILDING'].includes(item.type)) return res.status(400).json({ message: 'Цей товар не можна розмістити' });
        if (item.giftOnly && !fromInventory) return res.status(403).json({ message: 'Цей предмет можна отримати лише як подарунок' });
        const occupiedQuadrants = getOccupiedQuadrants(quadrant, item);
        const occupiedCells = getOccupiedCells(x, y, quadrant, item, false);
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        if (!occupiedCells || occupiedCells.some(cell => cell.x < 0 || cell.x >= farm.size || cell.y < 0 || cell.y >= farm.size)) {
            return res.status(400).json({ message: 'Цей розмір предмета не поміщається в це місце' });
        }
        
        const user = await User.findById(userId);
        if (user && getLevelProgress(user.xp ?? 0).level < (item.requiredLevel ?? 1)) {
            return res.status(403).json({ message: `Цей товар доступний з ${item.requiredLevel ?? 1} рівня` });
        }
        if (item.access === 'admin' && user?.role !== 'admin') {
            return res.status(403).json({ message: 'Цей товар доступний лише адміністратору' });
        }
        const currencyField = item.priceCurrency === 'rubies' ? 'rubies' : 'coins';
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (fromInventory && Number(user.itemInventory?.get(itemId) ?? 0) < 1) {
            return res.status(400).json({ message: 'Цього предмета немає в інвентарі' });
        }
        if (!fromInventory && (user[currencyField] ?? 0) < item.price) {
            return res.status(400).json({ message: `Недостатньо ${currencyField === 'rubies' ? 'рубінів' : 'монет'}!` });
        }

        const occupiedDirtTiles = farm.tiles.filter(t => t.isDirt && occupiedCells.some(cell => cell.x === t.x && cell.y === t.y));
        if (item.placementSurface === 'soil' && occupiedDirtTiles.length !== new Set(occupiedCells.map(cell => `${cell.x},${cell.y}`)).size) {
            return res.status(400).json({ message: 'Цей товар можна садити лише на грядку' });
        }
        if (item.placementSurface === 'grass' && occupiedDirtTiles.length) {
            return res.status(400).json({ message: 'Цей товар можна ставити лише на траву' });
        }

        const isOccupied = farm.tiles.find(t => !t.isDirt && getTileOccupiedCells(t).some(existingCell =>
            occupiedCells.some(cell => cell.x === existingCell.x && cell.y === existingCell.y && cell.quadrant === existingCell.quadrant)
        ));
        if (isOccupied) return res.status(400).json({ message: 'Місце зайняте!' });
        // Економіка
        if (fromInventory) {
            user.itemInventory.set(itemId, Number(user.itemInventory.get(itemId) ?? 0) - 1);
        } else {
            user[currencyField] -= item.price;
        }
        user.xp += item.plantingXp;
        user.level = getLevelProgress(user.xp).level;
        await user.save();

        const newTile = { x, y, quadrant, occupiedQuadrants: occupiedQuadrants ?? [quadrant], occupiedCells, itemId, isDirt: false, stage: 0, placedAt: new Date() };
        farm.tiles.push(newTile);
        await farm.save();

        res.json({ 
            success: true, 
            newTile, 
            user: { coins: user.coins, rubies: user.rubies, xp: user.xp, level: user.level, itemInventory: Object.fromEntries(user.itemInventory ?? []) }
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка збереження', error: error.message });
    }
});

router.post('/remove', async (req, res) => {
    try {
        const { userId, x, y, quadrant } = req.body;
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        let targetTile = farm.tiles.find(t => !t.isDirt && t.x === x && t.y === y && t.quadrant === quadrant);
        const dirtTile = farm.tiles.find(t => t.isDirt && t.x === x && t.y === y);
        if (!targetTile && quadrant !== -1) {
            return res.status(404).json({ message: 'Предмет не знайдено' });
        }
        if (!targetTile && !dirtTile) return res.status(404).json({ message: 'Предмет не знайдено' });
        if (targetTile && (targetTile.housedAnimals?.length ?? 0) > 0) {
            return res.status(400).json({ message: 'Спочатку випусти тварин із цієї будівлі' });
        }
        if (!targetTile && farm.tiles.some(t =>
            !t.isDirt && t.x === x && t.y === y && getGameItem(t.itemId)?.type === 'CROP'
        )) {
            return res.status(400).json({ message: 'Спочатку видали рослину з цієї грядки' });
        }

        const item = targetTile ? getGameItem(targetTile.itemId) : null;
        const refundCurrency = item?.priceCurrency === 'rubies' ? 'rubies' : 'coins';
        const refundEarned = item ? Math.floor(item.price / 2) : 0;
        let user = null;
        if (item) {
            user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
            user[refundCurrency] = (user[refundCurrency] ?? 0) + refundEarned;
        }

        const removedTiles = [];
        if (targetTile) {
            removedTiles.push({ x: targetTile.x, y: targetTile.y, quadrant: targetTile.quadrant });
            farm.tiles = farm.tiles.filter(t => t !== targetTile);
        } else {
            removedTiles.push({ x: dirtTile.x, y: dirtTile.y, quadrant: -1 });
            farm.tiles = farm.tiles.filter(t => t !== dirtTile);
        }
        await farm.save();
        if (user) await user.save();

        res.json({
            success: true,
            removedTiles,
            itemName: item?.name,
            refundEarned,
            refundCurrency,
            ...(user ? { user: { coins: user.coins, rubies: user.rubies } } : {})
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка видалення', error: error.message });
    }
});

router.post('/rotate', async (req, res) => {
    try {
        const { userId, x, y, quadrant } = req.body;
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });

        const tile = farm.tiles.find(t => {
            if (t.isDirt) return false;
            if (t.x === x && t.y === y && t.quadrant === quadrant) return true;
            return t.occupiedCells?.some(cell => cell.x === x && cell.y === y && cell.quadrant === quadrant);
        });
        if (!tile) return res.status(404).json({ message: 'Предмет не знайдено' });

        const item = tile.isDirt ? null : getGameItem(tile.itemId);
        if (item?.canFlip === false) {
            return res.status(400).json({ message: 'Цей об’єкт не можна перевертати' });
        }

        const nextFlipX = !tile.flipX;
        tile.flipX = nextFlipX;
        if (item) tile.occupiedCells = getOccupiedCells(tile.x, tile.y, tile.quadrant, item, tile.flipX);
        await farm.save();
        res.json({ success: true, flipX: tile.flipX, tile });
    } catch (error) {
        res.status(500).json({ message: 'Помилка перевороту', error: error.message });
    }
});

router.post('/move', async (req, res) => {
    try {
        const { userId, fromX, fromY, fromQuadrant, x, y, quadrant } = req.body;
        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });

        const tile = farm.tiles.find(t => t.x === fromX && t.y === fromY && t.quadrant === fromQuadrant);
        if (!tile) return res.status(404).json({ message: 'Предмет не знайдено' });

        if (tile.isDirt) {
            const hasCrop = farm.tiles.some(t =>
                !t.isDirt && t.x === tile.x && t.y === tile.y && getGameItem(t.itemId)?.type === 'CROP'
            );
            if (hasCrop) return res.status(400).json({ message: 'Грядку з культурою не можна переміщати' });
            const destinationOccupied = farm.tiles.some(t => t !== tile && t.x === x && t.y === y);
            if (quadrant !== -1 || x < 0 || x >= farm.size || y < 0 || y >= farm.size || destinationOccupied) {
                return res.status(400).json({ message: 'Ця грядка не поміщається в це місце' });
            }
            tile.x = x;
            tile.y = y;
            await farm.save();
            return res.json({ success: true, tile });
        }

        const item = tile.isDirt ? null : getGameItem(tile.itemId);
        if (!item) {
            if (!tile.isDirt) return res.status(400).json({ message: 'Товар не знайдено' });
        }
        if (item.type === 'CROP' && Date.now() < getTreeHarvestReadyAt(tile, item)) {
            return res.status(400).json({ message: 'Культуру можна переміщати лише після дозрівання' });
        }
        const occupiedQuadrants = getOccupiedQuadrants(quadrant, item);
        const occupiedCells = getMovedOccupiedCells(
            getTileOccupiedCells(tile),
            x,
            y,
            quadrant,
            { ...item, flipX: tile.flipX ?? false }
        );
        if (!occupiedCells || occupiedCells.some(cell => cell.x < 0 || cell.x >= farm.size || cell.y < 0 || cell.y >= farm.size)) {
            return res.status(400).json({ message: 'Цей розмір предмета не поміщається в це місце' });
        }

        const occupiedDirtTiles = farm.tiles.filter(t => t.isDirt && occupiedCells.some(cell => cell.x === t.x && cell.y === t.y));
        if (item.placementSurface === 'soil' && occupiedDirtTiles.length !== new Set(occupiedCells.map(cell => `${cell.x},${cell.y}`)).size) {
            return res.status(400).json({ message: 'Цей товар можна ставити лише на грядку' });
        }
        if (item.type === 'CROP' && farm.tiles.some(t =>
            !t.isDirt && t !== tile && t.x === x && t.y === y && getGameItem(t.itemId)?.type === 'CROP'
        )) {
            return res.status(400).json({ message: 'На цій грядці вже росте культура' });
        }
        if (item.placementSurface === 'grass' && occupiedDirtTiles.length) {
            return res.status(400).json({ message: 'Цей товар можна ставити лише на траву' });
        }

        const isOccupied = farm.tiles.some(t =>
            t !== tile && !t.isDirt && getTileOccupiedCells(t).some(existingCell =>
                occupiedCells.some(cell => cell.x === existingCell.x && cell.y === existingCell.y && cell.quadrant === existingCell.quadrant)
            )
        );
        if (isOccupied) return res.status(400).json({ message: 'Місце зайняте!' });

        tile.x = x;
        tile.y = y;
        tile.quadrant = quadrant;
        tile.occupiedQuadrants = occupiedQuadrants ?? [quadrant];
        tile.occupiedCells = occupiedCells;
        await farm.save();
        res.json({ success: true, tile });
    } catch (error) {
        res.status(500).json({ message: 'Помилка переміщення', error: error.message });
    }
});

// ЗБІР ВРОЖАЮ: Дає ТІЛЬКИ монети
router.post('/harvest', async (req, res) => {
    try {
        const { userId, x, y, quadrant } = req.body;
        const farm = await Farm.findOne({ userId });
        const user = await User.findById(userId);
        if (!farm || !user) return res.status(404).json({ message: 'Ферму або гравця не знайдено' });

        const tileIndex = farm.tiles.findIndex(t => t.x === x && t.y === y && t.quadrant === quadrant);
        if (tileIndex === -1) return res.status(400).json({ message: 'Дерево не знайдено' });

        const tile = farm.tiles[tileIndex];
        const item = getGameItem(tile.itemId);
        if (!item || !['TREE', 'CROP', 'ANIMAL'].includes(item.type) || !item.yieldItem || !item.yieldAmount) {
            return res.status(400).json({ message: 'Цей об’єкт не дає врожай' });
        }
        const readyAt = getTreeHarvestReadyAt(tile, item);
        if (!Number.isFinite(readyAt) || Date.now() < readyAt) {
            return res.status(400).json({ message: 'Врожай ще не готовий' });
        }

        const inventory = user.inventory ?? new Map();
        const currentAmount = Number(inventory.get(item.yieldItem) ?? 0);
        inventory.set(item.yieldItem, currentAmount + item.yieldAmount);
        user.inventory = inventory;
        user.xp += 1;
        user.level = getLevelProgress(user.xp).level;
        await user.save();

        const harvestedAt = new Date();
        const isCrop = item.type === 'CROP';
        if (isCrop) {
            farm.tiles.splice(tileIndex, 1);
        } else {
            farm.tiles[tileIndex].lastHarvestedAt = harvestedAt;
        }
        await farm.save();

        res.json({ 
            success: true, 
            tile: isCrop ? null : farm.tiles[tileIndex],
            removed: isCrop,
            harvestedItem: item.yieldItem,
            harvestedAmount: item.yieldAmount,
            user: {
                coins: user.coins,
                xp: user.xp,
                level: user.level,
                inventory: Object.fromEntries(user.inventory)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка збору', error: error.message });
    }
});

router.post('/sell', async (req, res) => {
    try {
        const { userId, itemId, amount } = req.body;
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Вкажіть коректну кількість для продажу' });
        }

        const item = listGameItems().find(gameItem => gameItem.yieldItem === itemId);
        if (!item || !Number.isFinite(item.sellPrice) || item.sellPrice < 0) {
            return res.status(400).json({ message: 'Цей товар не можна продати' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        const inventory = user.inventory ?? new Map();
        const currentAmount = Number(inventory.get(itemId) ?? 0);
        if (currentAmount < amount) {
            return res.status(400).json({ message: 'В інвентарі недостатньо товару' });
        }

        inventory.set(itemId, currentAmount - amount);
        user.inventory = inventory;
        user.coins += amount * item.sellPrice;
        await user.save();

        res.json({
            success: true,
            soldItem: itemId,
            soldAmount: amount,
            coinsEarned: amount * item.sellPrice,
            user: {
                coins: user.coins,
                xp: user.xp,
                level: user.level,
                inventory: Object.fromEntries(user.inventory)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка продажу', error: error.message });
    }
});

router.post('/sell-item', async (req, res) => {
    try {
        const { userId, itemId, amount } = req.body;
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Вкажіть коректну кількість для продажу' });
        }
        const item = getGameItem(itemId);
        if (!item) return res.status(400).json({ message: 'Цей предмет не можна продати' });
        if (item.giftOnly) return res.status(400).json({ message: 'Подарункові предмети не можна продати' });
        if (item.mechanic === 'accelerate_growth') {
            return res.status(400).json({ message: 'Добриво не можна продати' });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        const itemInventory = user.itemInventory ?? new Map();
        const currentAmount = Number(itemInventory.get(itemId) ?? 0);
        if (currentAmount < amount) return res.status(400).json({ message: 'В інвентарі недостатньо предметів' });

        const currencyField = item.priceCurrency === 'rubies' ? 'rubies' : 'coins';
        const earned = Math.floor(item.price / 2) * amount;
        itemInventory.set(itemId, currentAmount - amount);
        user.itemInventory = itemInventory;
        user[currencyField] = (user[currencyField] ?? 0) + earned;
        await user.save();
        return res.json({
            success: true,
            itemId,
            amount,
            earned,
            currency: currencyField,
            user: {
                coins: user.coins,
                rubies: user.rubies,
                itemInventory: Object.fromEntries(user.itemInventory ?? []),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Помилка продажу предмета', error: error.message });
    }
});

router.post('/save', async (req, res) => {
    try {
        const { userId, tiles } = req.body;
        const user = await User.findById(userId).select('role xp');
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (!Array.isArray(tiles)) return res.status(400).json({ message: 'Некоректні дані ферми' });
        const playerLevel = getLevelProgress(user.xp ?? 0).level;
        const isLockedItem = (item) => item && (
            item.disabled ||
            item.giftOnly ||
            (item.access === 'admin' && user.role !== 'admin') ||
            playerLevel < (item.requiredLevel ?? 1)
        );
        const existingFarm = await Farm.findOne({ userId }).select('tiles');
        const existingHousing = new Map();
        const submittedTileKeys = new Set(tiles
            .filter(tile => !tile.isDirt)
            .map(tile => `${tile.x},${tile.y},${tile.quadrant},${tile.itemId}`));
        for (const tile of existingFarm?.tiles ?? []) {
            if (!tile.isDirt && tile.housedAnimals?.length) {
                const key = `${tile.x},${tile.y},${tile.quadrant},${tile.itemId}`;
                if (!submittedTileKeys.has(key)) {
                    return res.status(400).json({ message: 'Спочатку випусти тварин із цієї будівлі' });
                }
                existingHousing.set(key, tile.housedAnimals);
            }
        }
        const tilesToSave = tiles.map((tile) => {
            const normalizedTile = { ...tile };
            delete normalizedTile.housedAnimals;
            if (!tile.isDirt) {
                const housedAnimals = existingHousing.get(`${tile.x},${tile.y},${tile.quadrant},${tile.itemId}`);
                if (housedAnimals) normalizedTile.housedAnimals = housedAnimals;
            }
            return normalizedTile;
        });
        const existingLockedCounts = new Map();
        for (const tile of existingFarm?.tiles ?? []) {
            const item = tile.isDirt ? null : getGameItem(tile.itemId);
            if (isLockedItem(item)) {
                existingLockedCounts.set(tile.itemId, (existingLockedCounts.get(tile.itemId) ?? 0) + 1);
            }
        }
        const submittedLockedCounts = new Map();
        for (const tile of tiles) {
            const item = tile.isDirt ? null : getGameItem(tile.itemId);
            if (!isLockedItem(item)) continue;
            const count = (submittedLockedCounts.get(tile.itemId) ?? 0) + 1;
            submittedLockedCounts.set(tile.itemId, count);
            if (count > (existingLockedCounts.get(tile.itemId) ?? 0)) {
                if (item.disabled) return res.status(403).json({ message: 'Архівований товар більше не можна додати на ферму' });
                if (item.giftOnly) return res.status(403).json({ message: 'Цей предмет можна отримати лише як подарунок' });
                if (item.access === 'admin' && user.role !== 'admin') {
                    return res.status(403).json({ message: 'Цей товар може додавати лише адміністратор' });
                }
                return res.status(403).json({ message: `Цей товар доступний з ${item.requiredLevel ?? 1} рівня` });
            }
        }
        const updatedFarm = await Farm.findOneAndUpdate(
            { userId },
            { $set: { tiles: tilesToSave } },
            { new: true, upsert: true }
        );
        res.json({ success: true, farm: updatedFarm });
    } catch (error) {
        res.status(500).json({ message: 'Помилка збереження', error: error.message });
    }
});

export default router;