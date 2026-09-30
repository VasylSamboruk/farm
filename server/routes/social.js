import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Farm from '../models/Farm.js';
import User from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';

const router = express.Router();
const AVATAR_MAX_LENGTH = 180_000;

router.use(async (req, res, next) => {
    const authorization = req.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Потрібно увійти в акаунт' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.userId).select('isBanned banUntil');
        if (!user) return res.status(401).json({ message: 'Гравця не знайдено' });
        if (user.isBanned && (!user.banUntil || user.banUntil > new Date())) {
            return res.status(403).json({ message: 'Акаунт заблоковано', banUntil: user.banUntil });
        }
        req.authUserId = payload.userId;
        return next();
    } catch {
        return res.status(401).json({ message: 'Сесія завершилася. Увійди знову.' });
    }
});

const publicProfile = (user) => ({
    id: String(user._id),
    username: user.username,
    avatar: user.avatar ?? '',
    xp: user.xp ?? 0,
    level: getLevelProgress(user.xp ?? 0).level,
});

const getCurrentUser = (userId) => User.findById(userId);
const hasId = (list, id) => list.some((entry) => String(entry) === String(id));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.put('/profile/avatar', async (req, res) => {
    try {
        const { avatar } = req.body;
        if (typeof avatar !== 'string' || avatar.length > AVATAR_MAX_LENGTH ||
            !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar)) {
            return res.status(400).json({ message: 'Формат або розмір аватара не підтримується' });
        }

        const user = await User.findByIdAndUpdate(
            req.authUserId,
            { $set: { avatar } },
            { new: true, select: 'avatar' }
        );
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        return res.json({ avatar: user.avatar });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося зберегти аватар', error: error.message });
    }
});

router.get('/search', async (req, res) => {
    try {
        const query = String(req.query.query ?? '').trim();
        if (query.length < 2) return res.json({ players: [] });

        const currentUser = await getCurrentUser(req.authUserId);
        if (!currentUser) return res.status(404).json({ message: 'Гравця не знайдено' });

        const criteria = mongoose.isValidObjectId(query)
            ? { _id: query }
            : { username: { $regex: escapeRegex(query), $options: 'i' } };
        const players = await User.find({ $and: [criteria, { _id: { $ne: currentUser._id } }] })
            .select('username avatar xp level friends friendRequestsReceived friendRequestsSent')
            .limit(20)
            .lean();

        return res.json({
            players: players.map((player) => ({
                ...publicProfile(player),
                relation: hasId(currentUser.friends ?? [], player._id)
                    ? 'friend'
                    : hasId(currentUser.friendRequestsSent ?? [], player._id)
                        ? 'pending_sent'
                        : hasId(currentUser.friendRequestsReceived ?? [], player._id)
                            ? 'pending_received'
                            : 'none',
            })),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося знайти гравців', error: error.message });
    }
});

router.get('/friends', async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req.authUserId);
        if (!currentUser) return res.status(404).json({ message: 'Гравця не знайдено' });
        const friends = await User.find({ _id: { $in: currentUser.friends ?? [] } })
            .select('username avatar xp level')
            .lean();
        return res.json({ friends: friends.map(publicProfile) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося завантажити друзів', error: error.message });
    }
});

router.get('/requests', async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req.authUserId);
        if (!currentUser) return res.status(404).json({ message: 'Гравця не знайдено' });
        const requests = await User.find({ _id: { $in: currentUser.friendRequestsReceived ?? [] } })
            .select('username avatar xp level')
            .lean();
        return res.json({ requests: requests.map(publicProfile) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося завантажити запити', error: error.message });
    }
});

router.post('/requests/:targetId', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.targetId)) return res.status(404).json({ message: 'Гравця не знайдено' });
        const [sender, target] = await Promise.all([
            getCurrentUser(req.authUserId),
            User.findById(req.params.targetId),
        ]);
        if (!sender || !target) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (String(sender._id) === String(target._id)) return res.status(400).json({ message: 'Не можна додати себе в друзі' });
        if (hasId(sender.friends ?? [], target._id)) return res.status(409).json({ message: 'Ви вже друзі' });
        if (hasId(sender.friendRequestsSent ?? [], target._id)) return res.status(409).json({ message: 'Запит уже надіслано' });
        if (hasId(sender.friendRequestsReceived ?? [], target._id)) return res.status(409).json({ message: 'Цей гравець уже надіслав тобі запит' });

        await Promise.all([
            User.updateOne({ _id: sender._id }, { $addToSet: { friendRequestsSent: target._id } }),
            User.updateOne({ _id: target._id }, { $addToSet: { friendRequestsReceived: sender._id } }),
        ]);
        return res.status(201).json({ message: 'Запит надіслано' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося надіслати запит', error: error.message });
    }
});

router.post('/requests/:requesterId/accept', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.requesterId)) return res.status(404).json({ message: 'Запит не знайдено' });
        const receiver = await getCurrentUser(req.authUserId);
        if (!receiver || !hasId(receiver.friendRequestsReceived ?? [], req.params.requesterId)) {
            return res.status(404).json({ message: 'Запит не знайдено' });
        }

        const requesterId = new mongoose.Types.ObjectId(req.params.requesterId);
        await Promise.all([
            User.updateOne({ _id: receiver._id }, {
                $pull: { friendRequestsReceived: requesterId, friendRequestsSent: requesterId },
                $addToSet: { friends: requesterId },
            }),
            User.updateOne({ _id: requesterId }, {
                $pull: { friendRequestsSent: receiver._id, friendRequestsReceived: receiver._id },
                $addToSet: { friends: receiver._id },
            }),
        ]);
        return res.json({ message: 'Запит прийнято' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося прийняти запит', error: error.message });
    }
});

router.delete('/requests/:otherId', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.otherId)) return res.status(404).json({ message: 'Запит не знайдено' });
        const otherId = new mongoose.Types.ObjectId(req.params.otherId);
        await Promise.all([
            User.updateOne({ _id: req.authUserId }, {
                $pull: { friendRequestsSent: otherId, friendRequestsReceived: otherId },
            }),
            User.updateOne({ _id: otherId }, {
                $pull: { friendRequestsSent: req.authUserId, friendRequestsReceived: req.authUserId },
            }),
        ]);
        return res.json({ message: 'Запит скасовано' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося скасувати запит', error: error.message });
    }
});

router.delete('/friends/:friendId', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.friendId)) return res.status(404).json({ message: 'Друга не знайдено' });
        const friendId = new mongoose.Types.ObjectId(req.params.friendId);
        await Promise.all([
            User.updateOne({ _id: req.authUserId }, { $pull: { friends: friendId } }),
            User.updateOne({ _id: friendId }, { $pull: { friends: req.authUserId } }),
        ]);
        return res.json({ message: 'Друга видалено' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося видалити друга', error: error.message });
    }
});

router.get('/profile/:friendId', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.friendId)) return res.status(404).json({ message: 'Профіль не знайдено' });
        const currentUser = await getCurrentUser(req.authUserId);
        if (!currentUser || !hasId(currentUser.friends ?? [], req.params.friendId)) {
            return res.status(403).json({ message: 'Профіль доступний лише друзям' });
        }

        const [friend, farm] = await Promise.all([
            User.findById(req.params.friendId).select('username avatar xp level'),
            Farm.findOne({ userId: req.params.friendId }).lean(),
        ]);
        if (!friend || !farm) return res.status(404).json({ message: 'Профіль або ферму не знайдено' });
        return res.json({ profile: publicProfile(friend), tiles: farm.tiles ?? [] });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося відкрити профіль', error: error.message });
    }
});

export default router;
