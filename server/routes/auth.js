import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Farm from '../models/Farm.js';
import { getLevelProgress } from '../config/progression.js';
import { createStarterFarmTiles } from '../services/starterFarm.js';
import LevelReward from '../models/LevelReward.js';
import { getGameItem } from '../services/gameCatalog.js';
import { ensureDefaultAvatar, getRandomDefaultAvatar } from '../services/avatars.js';

const router = express.Router();

const getTokenPayload = (req) => {
    const authorization = req.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return typeof payload === 'object' && typeof payload.userId === 'string' ? payload : null;
};

router.get('/me', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        const user = await User.findById(payload.userId).select('username role coins rubies xp level avatar inventory itemInventory');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        await ensureDefaultAvatar(user);
        const progression = getLevelProgress(user.xp ?? 0);
        return res.json({
            id: user._id,
            username: user.username,
            role: user.role,
            coins: user.coins ?? 0,
            rubies: user.rubies ?? 0,
            xp: user.xp ?? 0,
            level: progression.level,
            avatar: user.avatar ?? '',
            inventory: Object.fromEntries(user.inventory ?? []),
            itemInventory: Object.fromEntries(user.itemInventory ?? []),
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося оновити профіль', error: error.message });
    }
});

router.get('/level-rewards/pending', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) return res.status(401).json({ message: 'Недійсна сесія' });
        const user = await User.findById(payload.userId).select('xp claimedLevelRewards');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        const currentLevel = getLevelProgress(user.xp ?? 0).level;
        const claimed = new Set(user.claimedLevelRewards ?? []);
        const configuredLevels = await LevelReward.find({ level: { $gte: 2, $lte: currentLevel } }).lean();
        const configuredByLevel = new Map(configuredLevels.map((entry) => [entry.level, entry.rewards]));
        const rewards = [];
        for (let level = 2; level <= currentLevel; level += 1) {
            if (claimed.has(level)) continue;
            const configuredRewards = configuredByLevel.get(level) ?? [];
            rewards.push({
                level,
                rewards: configuredRewards.length ? configuredRewards : [{ kind: 'rubies', amount: 1 }],
            });
        }
        return res.json({ rewards });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося завантажити нагороди', error: error.message });
    }
});

router.post('/level-rewards/claim', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) return res.status(401).json({ message: 'Недійсна сесія' });
        const level = req.body?.level;
        if (!Number.isSafeInteger(level) || level < 2) return res.status(400).json({ message: 'Некоректний рівень нагороди' });
        const user = await User.findById(payload.userId).select('xp');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        if (getLevelProgress(user.xp ?? 0).level < level) return res.status(403).json({ message: 'Цей рівень ще не досягнуто' });
        const levelReward = await LevelReward.findOne({ level }).lean();
        const rewards = levelReward?.rewards?.length
            ? levelReward.rewards
            : [{ kind: 'rubies', amount: 1 }];

        const increments = {};
        for (const reward of rewards) {
            if (reward.kind === 'coins' || reward.kind === 'rubies') {
                increments[reward.kind] = (increments[reward.kind] ?? 0) + reward.amount;
            } else if (reward.kind === 'item' && getGameItem(reward.itemId)) {
                increments[`itemInventory.${reward.itemId}`] = (increments[`itemInventory.${reward.itemId}`] ?? 0) + reward.amount;
            }
        }
        const claimedUser = await User.findOneAndUpdate(
            { _id: payload.userId, xp: { $gte: (100 * (level - 1) * level) / 2 }, claimedLevelRewards: { $ne: level } },
            { $push: { claimedLevelRewards: level }, $inc: increments },
            { new: true }
        );
        if (!claimedUser) return res.status(409).json({ message: 'Цю нагороду вже забрали' });
        return res.json({
            success: true,
            user: {
                id: claimedUser._id,
                coins: claimedUser.coins,
                rubies: claimedUser.rubies,
                xp: claimedUser.xp,
                level: getLevelProgress(claimedUser.xp ?? 0).level,
                inventory: Object.fromEntries(claimedUser.inventory ?? []),
                itemInventory: Object.fromEntries(claimedUser.itemInventory ?? []),
            },
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося отримати нагороду', error: error.message });
    }
});

router.get('/admin-gifts/pending', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) return res.status(401).json({ message: 'Недійсна сесія' });
        const user = await User.findById(payload.userId).select('adminGifts');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        return res.json({ gifts: user.adminGifts.filter((gift) => !gift.claimed).map((gift) => ({
            id: String(gift._id),
            title: gift.title,
            description: gift.description,
            items: gift.items.map(({ kind, itemId, amount }) => ({ kind, itemId, amount })),
        })) });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося завантажити подарунки', error: error.message });
    }
});

router.post('/admin-gifts/claim', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) return res.status(401).json({ message: 'Недійсна сесія' });
        const giftId = req.body?.giftId;
        if (typeof giftId !== 'string' || !/^[a-f\d]{24}$/i.test(giftId)) {
            return res.status(400).json({ message: 'Некоректний подарунок' });
        }
        const giftObjectId = new mongoose.Types.ObjectId(giftId);
        const user = await User.findOne({
            _id: payload.userId,
            adminGifts: { $elemMatch: { _id: giftObjectId, claimed: false } },
        }).select('adminGifts xp');
        const gift = user?.adminGifts.id(giftObjectId);
        if (!gift) return res.status(404).json({ message: 'Подарунок уже забрали або його не знайдено' });

        const increments = {};
        let bonusXp = 0;
        let targetLevel = 1;
        for (const entry of gift.items) {
            if (entry.kind === 'item') {
                if (!getGameItem(entry.itemId)) return res.status(409).json({ message: 'Один із предметів подарунка більше недоступний' });
                increments[`itemInventory.${entry.itemId}`] = (increments[`itemInventory.${entry.itemId}`] ?? 0) + entry.amount;
            } else if (entry.kind === 'coins' || entry.kind === 'rubies') {
                increments[entry.kind] = (increments[entry.kind] ?? 0) + entry.amount;
            } else if (entry.kind === 'xp') {
                bonusXp += entry.amount;
            } else if (entry.kind === 'level') {
                targetLevel = Math.max(targetLevel, entry.amount);
            }
        }
        const currentXp = user.xp ?? 0;
        const targetLevelXp = targetLevel > 1 ? (100 * (targetLevel - 1) * targetLevel) / 2 : 0;
        const xpToGrant = Math.max(bonusXp, targetLevelXp - currentXp, 0);
        if (xpToGrant > 0) increments.xp = xpToGrant;
        const claimedUser = await User.findOneAndUpdate(
            { _id: payload.userId, adminGifts: { $elemMatch: { _id: giftObjectId, claimed: false } } },
            { $set: { 'adminGifts.$.claimed': true }, $inc: increments },
            { new: true }
        );
        if (!claimedUser) return res.status(409).json({ message: 'Цей подарунок уже забрали' });
        claimedUser.level = getLevelProgress(claimedUser.xp ?? 0).level;
        await claimedUser.save();
        return res.json({
            success: true,
            user: {
                id: claimedUser._id,
                coins: claimedUser.coins,
                rubies: claimedUser.rubies,
                xp: claimedUser.xp,
                level: getLevelProgress(claimedUser.xp ?? 0).level,
                inventory: Object.fromEntries(claimedUser.inventory ?? []),
                itemInventory: Object.fromEntries(claimedUser.itemInventory ?? []),
            },
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося забрати подарунок', error: error.message });
    }
});

// === РЕЄСТРАЦІЯ ===
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Перевіряємо чи є такий гравець
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Гравець з таким іменем вже існує!' });
        }

        // 2. Шифруємо пароль
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Зберігаємо користувача
        const newUser = new User({
            username,
            password: hashedPassword,
            avatar: getRandomDefaultAvatar(),
        });

        await newUser.save();

        // 4. Створюємо стартову ферму з посадженими культурами та тваринами
        const newFarm = new Farm({
            userId: newUser._id,
            tiles: createStarterFarmTiles()
        });
        await newFarm.save();

        res.status(201).json({ message: 'Реєстрація успішна! Ферма створена.' });
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера', error: error.message });
    }
});

// === ЛОГІН ===
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Шукаємо користувача
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Невірний логін або пароль' });
        }

        // 2. Перевіряємо пароль
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Невірний логін або пароль' });
        }

        if (user.isBanned && (!user.banUntil || user.banUntil > new Date())) {
            return res.status(403).json({
                message: user.banUntil
                    ? `Акаунт заблоковано до ${user.banUntil.toISOString()}`
                    : 'Акаунт заблоковано безстроково',
                banUntil: user.banUntil,
            });
        }

        let userNeedsSave = false;
        if (!user.avatar) {
            user.avatar = getRandomDefaultAvatar();
            userNeedsSave = true;
        }
        if (user.isBanned) {
            user.isBanned = false;
            user.banUntil = null;
            user.banReason = '';
            user.bannedAt = null;
            user.bannedBy = null;
            userNeedsSave = true;
        }

        const adminUsernames = new Set([
            ...(process.env.ADMIN_USERNAMES ?? '').split(','),
            ...(process.env.ADMIN_USERNAME ?? '').split(','),
        ].map(value => value.trim()).filter(Boolean));
        if (adminUsernames.has(user.username) && user.role !== 'admin') {
            user.role = 'admin';
            userNeedsSave = true;
        }

        const progression = getLevelProgress(user.xp);
        if (user.level !== progression.level) {
            user.level = progression.level;
            userNeedsSave = true;
        }
        if (userNeedsSave) {
            await user.save();
        }

        // 3. Створюємо токен
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 4. Віддаємо дані
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                coins: user.coins,
                rubies: user.rubies ?? 0,
                level: progression.level,
                xp: user.xp,
                avatar: user.avatar ?? '',
                inventory: Object.fromEntries(user.inventory ?? []),
                itemInventory: Object.fromEntries(user.itemInventory ?? [])
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера', error: error.message });
    }
});

export default router;