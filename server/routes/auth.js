import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Farm from '../models/Farm.js';
import { getLevelProgress } from '../config/progression.js';
import { createStarterFarmTiles } from '../services/starterFarm.js';

const router = express.Router();

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
            password: hashedPassword
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
                level: progression.level,
                xp: user.xp,
                avatar: user.avatar ?? '',
                inventory: Object.fromEntries(user.inventory ?? [])
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера', error: error.message });
    }
});

export default router;