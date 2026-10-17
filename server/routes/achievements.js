import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {
    DEFAULT_ACHIEVEMENTS,
    getAchievementConfig,
    getAchievementProgressField,
} from '../services/achievements.js';

const router = express.Router();

const getTokenPayload = (req) => {
    const authorization = req.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return typeof payload === 'object' && typeof payload.userId === 'string' ? payload : null;
};

router.get('/', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) return res.status(401).json({ message: 'Недійсна сесія' });
        const [user, achievements] = await Promise.all([
            User.findById(payload.userId).select('plantedVegetableCount placedAnimalCount plantedTreeCount claimedAchievementTiers rubies'),
            Promise.all(DEFAULT_ACHIEVEMENTS.map(entry => getAchievementConfig(entry._id))),
        ]);
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        res.set('Cache-Control', 'no-store');
        return res.json({
            achievements: achievements.map(achievement => {
                const progressField = getAchievementProgressField(achievement.id);
                return {
                    achievement,
                    progress: {
                        count: user[progressField] ?? 0,
                        claimedTiers: user.claimedAchievementTiers ?? [],
                        rubies: user.rubies ?? 0,
                    },
                };
            }),
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося завантажити досягнення', error: error.message });
    }
});

router.post('/claim', async (req, res) => {
    try {
        const payload = getTokenPayload(req);
        if (!payload) return res.status(401).json({ message: 'Недійсна сесія' });
        const { achievementId, tierId } = req.body ?? {};
        if (!DEFAULT_ACHIEVEMENTS.some(entry => entry._id === achievementId)) {
            return res.status(400).json({ message: 'Невідоме досягнення' });
        }
        const achievement = await getAchievementConfig(achievementId);
        const tier = achievement.tiers.find(entry => entry.id === tierId);
        if (!tier) return res.status(400).json({ message: 'Невідомий рівень досягнення' });
        const progressField = getAchievementProgressField(achievementId);
        const claimId = `${achievementId}:${tier.id}`;
        const updatedUser = await User.findOneAndUpdate(
            {
                _id: payload.userId,
                [progressField]: { $gte: tier.requiredCount },
                claimedAchievementTiers: { $ne: claimId },
            },
            {
                $inc: { rubies: tier.rubies },
                $addToSet: { claimedAchievementTiers: claimId },
            },
            { new: true },
        ).select(`rubies ${progressField} claimedAchievementTiers`);
        if (!updatedUser) {
            const user = await User.findById(payload.userId).select(`${progressField} claimedAchievementTiers`);
            if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
            if ((user[progressField] ?? 0) < tier.requiredCount) {
                return res.status(403).json({ message: 'Це досягнення ще не виконано' });
            }
            return res.status(409).json({ message: 'Цю нагороду вже забрали' });
        }
        return res.json({
            success: true,
            achievementId,
            rubies: updatedUser.rubies ?? 0,
            count: updatedUser[progressField] ?? 0,
            claimedTiers: updatedUser.claimedAchievementTiers ?? [],
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        return res.status(500).json({ message: 'Не вдалося забрати нагороду', error: error.message });
    }
});

export default router;
