import express from 'express';
import mongoose from 'mongoose';
import Farm from '../models/Farm.js';
import User from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';
import { getGameItem, listGameItems } from '../services/gameCatalog.js';
import { getTreeHarvestReadyAt } from '../services/treeMechanics.js';
import { getMovedOccupiedCells, getOccupiedCells, getOccupiedQuadrants } from '../services/footprint.js';

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

const getTileOccupiedCells = (tile) => {
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

router.get('/:userId', async (req, res) => {
    try {
        const farm = await Farm.findOne({ userId: req.params.userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
        const responseFarm = farm.toObject();
        responseFarm.tiles = responseFarm.tiles.map(tile => {
            const item = getGameItem(tile.itemId);
            const occupiedCells = item ? getTileOccupiedCells(tile) : null;
            return occupiedCells ? { ...tile, occupiedCells } : tile;
        });
        res.json(responseFarm);
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера', error: error.message });
    }
});

router.post('/add-coins', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        
        user.coins += amount;
        await user.save();
        res.json({ success: true, coins: user.coins });
    } catch (error) {
        res.status(500).json({ message: 'Помилка', error: error.message });
    }
});

// ПОСАДКА: Знімає гроші, дає XP
router.post('/place', async (req, res) => {
    try {
        const { userId, x, y, quadrant, itemId } = req.body;
        const item = getGameItem(itemId);
        if (!item) {
            return res.status(400).json({ message: 'Товар не знайдено' });
        }
        const occupiedQuadrants = getOccupiedQuadrants(quadrant, item);
        const occupiedCells = getOccupiedCells(x, y, quadrant, item, false);
        if (!occupiedCells || occupiedCells.some(cell => cell.x < 0 || cell.x >= 15 || cell.y < 0 || cell.y >= 15)) {
            return res.status(400).json({ message: 'Цей розмір предмета не поміщається в це місце' });
        }
        
        const user = await User.findById(userId);
        if (!user || user.coins < item.price) {
            return res.status(400).json({ message: 'Недостатньо монет!' });
        }

        const farm = await Farm.findOne({ userId });
        if (!farm) return res.status(404).json({ message: 'Ферму не знайдено' });
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
        user.coins -= item.price;
        user.xp += item.plantingXp;
        user.level = getLevelProgress(user.xp).level;
        await user.save();

        const newTile = { x, y, quadrant, occupiedQuadrants: occupiedQuadrants ?? [quadrant], occupiedCells, itemId, isDirt: false, stage: 0, placedAt: new Date() };
        farm.tiles.push(newTile);
        await farm.save();

        res.json({ 
            success: true, 
            newTile, 
            user: { coins: user.coins, xp: user.xp, level: user.level } 
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

        farm.tiles = farm.tiles.filter(t => !(t.x === x && t.y === y && t.quadrant === quadrant));
        await farm.save();

        res.json({ success: true });
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

        tile.flipX = !tile.flipX;
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
            const destinationOccupied = farm.tiles.some(t => t !== tile && t.x === x && t.y === y);
            if (quadrant !== -1 || x < 0 || x >= 15 || y < 0 || y >= 15 || destinationOccupied) {
                return res.status(400).json({ message: 'Ця грядка не поміщається в це місце' });
            }
            tile.x = x;
            tile.y = y;
            await farm.save();
            return res.json({ success: true, tile });
        }

        const item = tile.isDirt ? null : getGameItem(tile.itemId);
        if (item?.type === 'CROP' && farm.tiles.some(t => t.isDirt && t.x === tile.x && t.y === tile.y)) {
            return res.status(400).json({ message: 'Грядку з культурою не можна переміщати' });
        }
        if (!item) {
            if (!tile.isDirt) return res.status(400).json({ message: 'Товар не знайдено' });
        }
        const occupiedQuadrants = getOccupiedQuadrants(quadrant, item);
        const occupiedCells = getMovedOccupiedCells(
            getTileOccupiedCells(tile),
            x,
            y,
            quadrant,
            { ...item, flipX: tile.flipX ?? false }
        );
        if (!occupiedCells || occupiedCells.some(cell => cell.x < 0 || cell.x >= 15 || cell.y < 0 || cell.y >= 15)) {
            return res.status(400).json({ message: 'Цей розмір предмета не поміщається в це місце' });
        }

        const sourceDirt = item.type === 'CROP'
            ? farm.tiles.find(t => t.isDirt && t.x === tile.x && t.y === tile.y)
            : null;
        const destinationHasTile = farm.tiles.some(t =>
            t !== tile && t !== sourceDirt && t.x === x && t.y === y
        );
        if (sourceDirt && destinationHasTile) {
            return res.status(400).json({ message: 'Місце зайняте!' });
        }

        const occupiedDirtTiles = farm.tiles.filter(t => t.isDirt && occupiedCells.some(cell => cell.x === t.x && cell.y === t.y));
        if (!sourceDirt && item.placementSurface === 'soil' && occupiedDirtTiles.length !== new Set(occupiedCells.map(cell => `${cell.x},${cell.y}`)).size) {
            return res.status(400).json({ message: 'Цей товар можна ставити лише на грядку' });
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
        if (sourceDirt) {
            sourceDirt.x = x;
            sourceDirt.y = y;
        }
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

router.post('/save', async (req, res) => {
    try {
        const { userId, tiles } = req.body;
        const updatedFarm = await Farm.findOneAndUpdate(
            { userId },
            { $set: { tiles } },
            { new: true, upsert: true }
        );
        res.json({ success: true, farm: updatedFarm });
    } catch (error) {
        res.status(500).json({ message: 'Помилка збереження', error: error.message });
    }
});

export default router;