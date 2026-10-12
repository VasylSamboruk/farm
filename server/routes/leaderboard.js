import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {
    claimCompetitionRewards,
    closeExpiredLeaderboardPeriods,
    getLeaderboard,
    getPendingCompetitionRewards,
} from '../services/leaderboard.js';

const router = express.Router();

router.use(async (req, res, next) => {
    const authorization = req.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Потрібно увійти в акаунт' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (typeof payload !== 'object' || typeof payload.userId !== 'string') {
            return res.status(401).json({ message: 'Недійсна сесія' });
        }
        const user = await User.findById(payload.userId).select('_id isBanned banUntil');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        if (user.isBanned && (!user.banUntil || user.banUntil > new Date())) {
            return res.status(403).json({ message: 'Акаунт заблоковано', banUntil: user.banUntil });
        }
        req.authUserId = String(user._id);
        return next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Недійсна або прострочена сесія' });
        }
        return next(error);
    }
});

router.get('/', async (req, res, next) => {
    const type = req.query.type === 'competition' ? 'competition' : req.query.type === 'total' ? 'total' : null;
    if (!type) return res.status(400).json({ message: 'Невідомий тип рейтингу' });
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
        return res.status(400).json({ message: 'Некоректна сторінка рейтингу' });
    }
    try {
        return res.json(await getLeaderboard({ userId: req.authUserId, type, page }));
    } catch (error) {
        return next(error);
    }
});

router.get('/competition-rewards/pending', async (req, res, next) => {
    try {
        await closeExpiredLeaderboardPeriods();
        return res.json({ rewards: await getPendingCompetitionRewards(req.authUserId) });
    } catch (error) {
        return next(error);
    }
});

router.post('/competition-rewards/claim', async (req, res, next) => {
    const competitionId = req.body?.competitionId;
    if (typeof competitionId !== 'string' || competitionId.length < 10 || competitionId.length > 100) {
        return res.status(400).json({ message: 'Некоректний ідентифікатор змагання' });
    }
    try {
        const result = await claimCompetitionRewards(req.authUserId, competitionId);
        if (!result) return res.status(409).json({ message: 'Цей приз уже забрали або він недоступний' });
        return res.json(result);
    } catch (error) {
        return next(error);
    }
});

export default router;
