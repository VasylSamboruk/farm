import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Farm from '../models/Farm.js';
import User from '../models/User.js';
import { getLevelProgress } from '../config/progression.js';
import { getFarmTilesWithOccupiedCells } from '../services/farmTiles.js';
import { getGameItem } from '../services/gameCatalog.js';
import { listGiftShopItems } from '../services/giftShop.js';
import { DEFAULT_AVATARS, ensureDefaultAvatar } from '../services/avatars.js';

const router = express.Router();
const AVATAR_MAX_LENGTH = 180_000;
const SOCIAL_GIFT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

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
    isOnline: Boolean(user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 120_000),
    lastOnlineAt: user.lastSeenAt ?? null,
});

const getCurrentUser = (userId) => User.findById(userId);
const hasId = (list, id) => list.some((entry) => String(entry) === String(id));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.post('/presence', async (req, res) => {
    try {
        const lastSeenAt = new Date();
        const result = await User.updateOne({ _id: req.authUserId }, { $set: { lastSeenAt } });
        if (!result.matchedCount) return res.status(404).json({ message: 'Гравця не знайдено' });
        return res.json({ lastSeenAt });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося оновити статус присутності', error: error.message });
    }
});

router.get('/gift-shop', async (_req, res, next) => {
    try {
        return res.json({ items: await listGiftShopItems() });
    } catch (error) {
        return next(error);
    }
});

router.get('/gifts', async (req, res) => {
    try {
        const user = await User.findById(req.authUserId).select('pendingSocialGifts socialGiftCooldowns');
        if (!user) return res.status(404).json({ message: 'Гравця не знайдено' });
        const pending = (user.pendingSocialGifts ?? []).filter((gift) => gift.status === 'pending')
            .map((gift) => ({
                id: String(gift._id),
                senderId: String(gift.senderId),
                senderName: gift.senderName,
                senderAvatar: gift.senderAvatar ?? '',
                senderLevel: gift.senderLevel ?? 1,
                itemId: gift.itemId,
                itemName: gift.itemName,
                image: gift.image,
                type: gift.type,
                sentAt: gift.sentAt,
            }));
        const now = Date.now();
        const cooldowns = Object.fromEntries(
            [...(user.socialGiftCooldowns ?? new Map()).entries()]
                .filter(([, until]) => new Date(until).getTime() > now)
                .map(([friendId, until]) => [friendId, new Date(until).toISOString()])
        );
        return res.json({ gifts: pending, cooldowns });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося завантажити подарунки', error: error.message });
    }
});

router.post('/gifts', async (req, res) => {
    try {
        const { friendId, itemId } = req.body ?? {};
        if (!mongoose.isValidObjectId(friendId) || typeof itemId !== 'string') {
            return res.status(400).json({ message: 'Некоректний друг або подарунок' });
        }

        const item = getGameItem(itemId);
        if (!item?.giftOnly) return res.status(404).json({ message: 'Подарунок не знайдено' });
        const [sender, friend] = await Promise.all([
            User.findById(req.authUserId).select('username avatar xp friends coins rubies'),
            User.findById(friendId).select('_id username'),
        ]);
        if (!sender || !friend) return res.status(404).json({ message: 'Гравця не знайдено' });
        if (!hasId(sender.friends ?? [], friend._id)) return res.status(403).json({ message: 'Подарунки можна надсилати лише друзям' });

        const giftProduct = (await listGiftShopItems()).find((entry) => entry.itemId === itemId);
        if (!giftProduct) return res.status(404).json({ message: 'Цей подарунок зараз недоступний' });

        const now = new Date();
        const cooldownUntil = new Date(now.getTime() + SOCIAL_GIFT_COOLDOWN_MS);
        const cooldownPath = `socialGiftCooldowns.${friend._id}`;
        const balancePath = giftProduct.priceCurrency === 'rubies' ? 'rubies' : 'coins';
        const chargedSender = await User.findOneAndUpdate(
            {
                _id: sender._id,
                [balancePath]: { $gte: giftProduct.price },
                $or: [
                    { [cooldownPath]: { $exists: false } },
                    { [cooldownPath]: { $lte: now } },
                ],
            },
            {
                $inc: { [balancePath]: -giftProduct.price },
                $set: { [cooldownPath]: cooldownUntil },
            },
            { new: true, projection: '_id coins rubies' }
        );
        if (!chargedSender) {
            const latestSender = await User.findById(sender._id).select(`${balancePath} socialGiftCooldowns`);
            if (!latestSender) return res.status(404).json({ message: 'Гравця не знайдено' });
            const existingCooldown = latestSender.socialGiftCooldowns?.get(String(friend._id));
            if (existingCooldown && existingCooldown > now) {
                return res.status(429).json({
                    message: 'Цьому другові вже надіслано подарунок. Спробуй знову через 12 годин.',
                    cooldownUntil: existingCooldown,
                });
            }
            if ((latestSender.get(balancePath) ?? 0) < giftProduct.price) {
                return res.status(400).json({ message: 'Не вистачає коштів на цей подарунок' });
            }
            return res.status(409).json({ message: 'Не вдалося списати оплату. Спробуй ще раз.' });
        }

        try {
            const recipientUpdate = await User.updateOne(
                { _id: friend._id },
                { $push: { pendingSocialGifts: {
                    senderId: sender._id,
                    senderName: sender.username,
                    senderAvatar: sender.avatar ?? '',
                    senderLevel: getLevelProgress(sender.xp ?? 0).level,
                    itemId: giftProduct.itemId,
                    itemName: giftProduct.name,
                    image: giftProduct.image,
                    type: giftProduct.type,
                    price: giftProduct.price,
                    priceCurrency: giftProduct.priceCurrency,
                    sentAt: now,
                    status: 'pending',
                } } }
            );
            if (!recipientUpdate.matchedCount) throw new Error('Отримувача подарунка не знайдено');
        } catch (error) {
            await User.updateOne(
                { _id: sender._id, [cooldownPath]: cooldownUntil },
                {
                    $inc: { [balancePath]: giftProduct.price },
                    $unset: { [cooldownPath]: '' },
                }
            );
            throw error;
        }

        return res.status(201).json({
            message: `Подарунок надіслано гравцю ${friend.username}`,
            coins: chargedSender.coins,
            rubies: chargedSender.rubies,
            cooldownUntil: cooldownUntil.toISOString(),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося надіслати подарунок', error: error.message });
    }
});

router.post('/gifts/:giftId/accept', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.giftId)) return res.status(404).json({ message: 'Подарунок не знайдено' });
        const receiver = await User.findOne({
            _id: req.authUserId,
            pendingSocialGifts: { $elemMatch: { _id: req.params.giftId, status: 'pending' } },
        }).select('pendingSocialGifts');
        const gift = receiver?.pendingSocialGifts.find((entry) => String(entry._id) === req.params.giftId && entry.status === 'pending');
        if (!gift) return res.status(404).json({ message: 'Подарунок уже оброблено або не знайдено' });
        const item = getGameItem(gift.itemId);
        if (!item?.giftOnly) return res.status(409).json({ message: 'Предмет подарунка більше недоступний' });

        const updatedReceiver = await User.findOneAndUpdate(
            { _id: req.authUserId, pendingSocialGifts: { $elemMatch: { _id: gift._id, status: 'pending' } } },
            {
                $inc: { [`itemInventory.${gift.itemId}`]: 1 },
                $pull: { pendingSocialGifts: { _id: gift._id, status: 'pending' } },
            },
            { new: true, projection: 'itemInventory' }
        );
        if (!updatedReceiver) return res.status(409).json({ message: 'Подарунок уже оброблено' });
        return res.json({ message: 'Подарунок прийнято і додано до інвентаря', itemInventory: Object.fromEntries(updatedReceiver.itemInventory ?? []) });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося прийняти подарунок', error: error.message });
    }
});

router.post('/gifts/:giftId/reject', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.giftId)) return res.status(404).json({ message: 'Подарунок не знайдено' });
        const receiver = await User.findOne({
            _id: req.authUserId,
            pendingSocialGifts: { $elemMatch: { _id: req.params.giftId } },
        }).select('pendingSocialGifts');
        const gift = receiver?.pendingSocialGifts.find((entry) => String(entry._id) === req.params.giftId);
        if (!gift) return res.status(404).json({ message: 'Подарунок уже оброблено або не знайдено' });

        if (gift.status === 'pending') {
            const rejected = await User.updateOne(
                { _id: req.authUserId, pendingSocialGifts: { $elemMatch: { _id: gift._id, status: 'pending' } } },
                { $set: { 'pendingSocialGifts.$.status': 'rejected', 'pendingSocialGifts.$.resolvedAt': new Date() } }
            );
            if (!rejected.modifiedCount) return res.status(409).json({ message: 'Подарунок уже оброблено' });
        } else if (gift.status !== 'rejected') {
            return res.status(409).json({ message: 'Подарунок уже прийнято' });
        }

        const balancePath = gift.priceCurrency;
        const refund = await User.updateOne(
            { _id: gift.senderId, refundedSocialGiftIds: { $ne: gift._id } },
            { $inc: { [balancePath]: gift.price }, $addToSet: { refundedSocialGiftIds: gift._id } }
        );
        if (!refund.matchedCount) {
            const senderExists = await User.exists({ _id: gift.senderId });
            if (!senderExists) return res.status(409).json({ message: 'Не вдалося повернути оплату: акаунт відправника не знайдено' });
        }
        await User.updateOne(
            { _id: req.authUserId },
            { $pull: { pendingSocialGifts: { _id: gift._id, status: 'rejected' } } }
        );
        await User.updateOne({ _id: gift.senderId }, { $pull: { refundedSocialGiftIds: gift._id } });
        return res.json({ message: 'Подарунок відхилено, кошти повернено відправнику' });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося відхилити подарунок', error: error.message });
    }
});

router.put('/profile/avatar', async (req, res) => {
    try {
        const { avatar } = req.body;
        const isDefaultAvatar = typeof avatar === 'string' && DEFAULT_AVATARS.includes(avatar);
        const isUploadedAvatar = typeof avatar === 'string' && avatar.length <= AVATAR_MAX_LENGTH &&
            /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar);
        if (!isDefaultAvatar && !isUploadedAvatar) {
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
            .select('username avatar xp level lastSeenAt friends friendRequestsReceived friendRequestsSent')
            .limit(20)
            .lean();

        await Promise.all(players.map(ensureDefaultAvatar));
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
            .select('username avatar xp level lastSeenAt')
            .lean();
        await Promise.all(friends.map(ensureDefaultAvatar));
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
            .select('username avatar xp level lastSeenAt')
            .lean();
        await Promise.all(requests.map(ensureDefaultAvatar));
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
            User.findById(req.params.friendId).select('username avatar xp level lastSeenAt'),
            Farm.findOne({ userId: req.params.friendId }).lean(),
        ]);
        if (!friend || !farm) return res.status(404).json({ message: 'Профіль або ферму не знайдено' });
        await ensureDefaultAvatar(friend);
        return res.json({
            profile: publicProfile(friend),
            size: farm.size ?? 15,
            tiles: getFarmTilesWithOccupiedCells(farm.tiles ?? []),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Не вдалося відкрити профіль', error: error.message });
    }
});

export default router;
