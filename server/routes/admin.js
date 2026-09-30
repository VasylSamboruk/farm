import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Farm from '../models/Farm.js';
import User from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';
import { getGameItem, listGameItems } from '../config/gameItems/index.js';
import { getOccupiedCells, getOccupiedQuadrants } from '../services/footprint.js';

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

const serializeAdminUser = (user, farm) => ({
    id: String(user._id),
    username: user.username,
    role: user.role,
    avatar: user.avatar ?? '',
    coins: user.coins ?? 0,
    xp: user.xp ?? 0,
    level: getLevelProgress(user.xp ?? 0).level,
    inventory: serializeInventory(user.inventory),
    createdAt: user.createdAt,
    farmItems: (farm?.tiles ?? [])
        .filter((tile) => !tile.isDirt)
        .map((tile) => {
            const item = getGameItem(tile.itemId);
            return {
                itemId: tile.itemId,
                name: item?.name ?? tile.itemId,
                type: item?.type ?? 'UNKNOWN',
                x: tile.x,
                y: tile.y,
                quadrant: tile.quadrant,
                placedAt: tile.placedAt,
            };
        }),
});

router.get('/catalog', (_req, res) => {
    const items = listGameItems().map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        yieldItem: item.yieldItem,
        yieldName: item.yieldName,
        yieldIcon: item.yieldIcon,
        yieldImage: item.yieldImage,
        placementSurface: item.placementSurface,
        price: item.price,
        plantingXp: item.plantingXp,
        footprint: item.footprint,
        largeFootprint: item.largeFootprint,
    }));
    return res.json({ items });
});

router.get('/users', async (req, res) => {
    try {
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
                .select('_id username role avatar coins xp inventory createdAt')
                .sort({ createdAt: -1, _id: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        const farms = await Farm.find({ userId: { $in: users.map((user) => user._id) } })
            .select('userId tiles')
            .lean();
        const farmsByUserId = new Map(farms.map((farm) => [String(farm.userId), farm]));

        return res.json({
            users: users.map((user) => serializeAdminUser(user, farmsByUserId.get(String(user._id)))),
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося завантажити гравців', error: error.message });
    }
});

router.patch('/users/:userId/stats', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const coinsDelta = req.body.coinsDelta ?? 0;
        const xpDelta = req.body.xpDelta ?? 0;
        if (!Number.isSafeInteger(coinsDelta) || !Number.isSafeInteger(xpDelta)) {
            return res.status(400).json({ message: 'Монети й XP мають бути цілими числами' });
        }

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (String(user._id) === req.adminId && user.role === 'admin' && req.body.role === 'user') {
            return res.status(400).json({ message: 'Не можна зняти права адміністратора із самого себе' });
        }

        const nextCoins = (user.coins ?? 0) + coinsDelta;
        const nextXp = (user.xp ?? 0) + xpDelta;
        if (nextCoins < 0 || nextXp < 0) return res.status(400).json({ message: 'Баланс і XP не можуть бути меншими за нуль' });

        user.coins = nextCoins;
        user.xp = nextXp;
        user.level = getLevelProgress(nextXp).level;
        await user.save();
        return res.json({ user: serializeAdminUser(user.toObject(), null) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити показники', error: error.message });
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
