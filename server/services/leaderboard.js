import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import LeaderboardXp from '../models/LeaderboardXp.js';
import LeaderboardPeriod from '../models/LeaderboardPeriod.js';
import LeaderboardSettings from '../models/LeaderboardSettings.js';
import User from '../models/User.js';

const DEFAULT_PRIZE_RANGES = [];
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

function normalizePrizeRanges(prizeRanges) {
    return Array.isArray(prizeRanges) ? prizeRanges.map((range) => ({
        rankFrom: Number(range.rankFrom),
        rankTo: Number(range.rankTo),
        rewards: Array.isArray(range.rewards) ? range.rewards.map((reward) => ({
            kind: reward.kind,
            amount: Number(reward.amount),
            itemId: reward.itemId || '',
        })) : [],
    })) : [];
}

function getCurrentCompetitionId(settings) {
    if (!settings?.competitionId || !settings.competitionStartAt || !settings.competitionEndAt) return null;
    const now = Date.now();
    const startsAt = new Date(settings.competitionStartAt).getTime();
    const endsAt = new Date(settings.competitionEndAt).getTime();
    return Number.isFinite(startsAt) && Number.isFinite(endsAt) && now >= startsAt && now < endsAt
        ? settings.competitionId
        : null;
}

async function getLeaderboardSettings() {
    const settings = await LeaderboardSettings.findById('weekly-prizes').lean();
    return {
        prizeRanges: normalizePrizeRanges(settings?.prizeRanges || DEFAULT_PRIZE_RANGES),
        competitionId: settings?.competitionId || '',
        competitionStartAt: settings?.competitionStartAt || null,
        competitionEndAt: settings?.competitionEndAt || null,
    };
}

async function saveLeaderboardSettings({ prizeRanges, competitionStartAt, competitionEndAt }) {
    const startAt = new Date(competitionStartAt);
    const endAt = new Date(competitionEndAt);
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
        const error = new Error('Competition start and end dates are invalid.');
        error.status = 400;
        throw error;
    }

    await finalizeExpiredCompetitions();
    const now = new Date();
    const settings = await LeaderboardSettings.findById('weekly-prizes');
    const sameSchedule = settings
        && settings.competitionStartAt?.getTime() === startAt.getTime()
        && settings.competitionEndAt?.getTime() === endAt.getTime();
    const currentHasStarted = settings?.competitionStartAt
        && settings.competitionEndAt
        && now >= settings.competitionStartAt
        && now < settings.competitionEndAt;

    if (currentHasStarted && !sameSchedule) {
        const error = new Error('An active competition cannot be rescheduled. Its prizes can still be edited.');
        error.status = 409;
        throw error;
    }

    const competitionId = sameSchedule && settings.competitionId
        ? settings.competitionId
        : startAt.toISOString();
    const existingPeriod = await LeaderboardPeriod.findById(competitionId).lean();
    if (existingPeriod?.prizesApplied) {
        const samePrizes = JSON.stringify(normalizePrizeRanges(existingPeriod.prizeRanges))
            === JSON.stringify(normalizePrizeRanges(prizeRanges));
        if (!sameSchedule || !samePrizes) {
            const error = new Error('This competition has already been finalized. Choose a new start time to change its prizes.');
            error.status = 409;
            throw error;
        }
    }
    if (!sameSchedule && startAt <= now) {
        const error = new Error('A new competition must start in the future.');
        error.status = 400;
        throw error;
    }
    const ranges = normalizePrizeRanges(prizeRanges);
    await LeaderboardSettings.findOneAndUpdate(
        { _id: 'weekly-prizes' },
        { $set: {
            prizeRanges: ranges,
            competitionId,
            competitionStartAt: startAt,
            competitionEndAt: endAt,
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await LeaderboardPeriod.findOneAndUpdate(
        { _id: competitionId },
        { $set: { startsAt: startAt, endsAt: endAt, prizeRanges: ranges, isActive: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return getLeaderboardSettings();
}

function validateCompetitionDates(competitionStartAt, competitionEndAt, requireFutureStart = false) {
    const startsAt = new Date(competitionStartAt);
    const endsAt = new Date(competitionEndAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
        const error = new Error('Competition start and end dates are invalid.');
        error.status = 400;
        throw error;
    }
    if (requireFutureStart && startsAt <= new Date()) {
        const error = new Error('Дата початку нового змагання має бути в майбутньому.');
        error.status = 400;
        throw error;
    }
    return { startsAt, endsAt };
}

function validateCompetitionPrizes(prizeRanges) {
    if (!Array.isArray(prizeRanges) || prizeRanges.length > 100) {
        const error = new Error('Додай не більше 100 діапазонів призів.');
        error.status = 400;
        throw error;
    }
    const ranges = normalizePrizeRanges(prizeRanges).sort((left, right) => left.rankFrom - right.rankFrom);
    let previousRankTo = 0;
    for (const range of ranges) {
        if (!Number.isSafeInteger(range.rankFrom) || !Number.isSafeInteger(range.rankTo) ||
            range.rankFrom < 1 || range.rankTo < range.rankFrom || range.rankTo > 1_000_000 ||
            range.rankFrom <= previousRankTo || range.rewards.length < 1 || range.rewards.length > 20) {
            const error = new Error('Перевір діапазони місць і склад призів: місця не мають перетинатися.');
            error.status = 400;
            throw error;
        }
        previousRankTo = range.rankTo;
        for (const reward of range.rewards) {
            if (!Number.isSafeInteger(reward.amount) || reward.amount < 1 || reward.amount > 100_000 ||
                !['coins', 'rubies', 'item'].includes(reward.kind) ||
                (reward.kind === 'item' && !reward.itemId)) {
                const error = new Error('Перевір тип, кількість та предмет у призі.');
                error.status = 400;
                throw error;
            }
        }
    }
    return ranges;
}

async function listLeaderboardCompetitions() {
    const [settings, periods] = await Promise.all([
        LeaderboardSettings.findById('weekly-prizes').lean(),
        LeaderboardPeriod.find({}).sort({ startsAt: -1, _id: -1 }).lean(),
    ]);
    const activeCompetitionId = settings?.competitionId || '';
    return {
        activeCompetitionId,
        competitions: periods.map((period) => ({
            competitionId: period._id,
            competitionStartAt: period.startsAt || null,
            competitionEndAt: period.endsAt || null,
            prizeRanges: normalizePrizeRanges(period.prizeRanges),
            prizesApplied: Boolean(period.prizesApplied),
            isActive: period.isActive !== false && activeCompetitionId === period._id,
        })),
    };
}

async function createLeaderboardCompetition({ prizeRanges, competitionStartAt, competitionEndAt }) {
    const { startsAt, endsAt } = validateCompetitionDates(competitionStartAt, competitionEndAt, true);
    const ranges = validateCompetitionPrizes(prizeRanges);
    const now = new Date();
    await finalizeExpiredCompetitions();
    const settings = await LeaderboardSettings.findById('weekly-prizes').lean();
    if (settings?.competitionId && settings.competitionEndAt > now) {
        const error = new Error('Спочатку деактивуй поточне змагання.');
        error.status = 409;
        throw error;
    }
    const competitionId = `${startsAt.toISOString()}-${randomUUID()}`;
    await LeaderboardPeriod.create({
        _id: competitionId,
        startsAt,
        endsAt,
        prizeRanges: ranges,
        prizesApplied: false,
        isActive: true,
    });
    await LeaderboardSettings.findOneAndUpdate(
        { _id: 'weekly-prizes' },
        { $set: { competitionId, competitionStartAt: startsAt, competitionEndAt: endsAt, prizeRanges: ranges } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return listLeaderboardCompetitions();
}

async function updateLeaderboardCompetition(competitionId, { prizeRanges, competitionStartAt, competitionEndAt }) {
    const period = await LeaderboardPeriod.findById(competitionId);
    if (!period) {
        const error = new Error('Змагання не знайдено.');
        error.status = 404;
        throw error;
    }
    if (period.prizesApplied) {
        const error = new Error('Завершене змагання не можна редагувати.');
        error.status = 409;
        throw error;
    }
    const { startsAt, endsAt } = validateCompetitionDates(competitionStartAt, competitionEndAt);
    const ranges = validateCompetitionPrizes(prizeRanges);
    const now = new Date();
    const alreadyStarted = period.isActive !== false && period.startsAt && now >= period.startsAt && now < period.endsAt;
    if (alreadyStarted && (startsAt.getTime() !== period.startsAt.getTime() || endsAt.getTime() !== period.endsAt.getTime())) {
        const error = new Error('Дати активного змагання змінювати не можна.');
        error.status = 409;
        throw error;
    }
    if (startsAt <= now && (!period.startsAt || startsAt.getTime() !== period.startsAt.getTime())) {
        const error = new Error('Нове змагання має починатися в майбутньому.');
        error.status = 400;
        throw error;
    }
    period.startsAt = startsAt;
    period.endsAt = endsAt;
    period.prizeRanges = ranges;
    await period.save();
    if (String((await LeaderboardSettings.findById('weekly-prizes').select('competitionId').lean())?.competitionId) === competitionId) {
        await LeaderboardSettings.updateOne(
            { _id: 'weekly-prizes' },
            { $set: { competitionStartAt: startsAt, competitionEndAt: endsAt, prizeRanges: ranges } },
        );
    }
    return listLeaderboardCompetitions();
}

async function setLeaderboardCompetitionActive(competitionId, isActive) {
    const period = await LeaderboardPeriod.findById(competitionId);
    if (!period) {
        const error = new Error('Змагання не знайдено.');
        error.status = 404;
        throw error;
    }
    const settings = await LeaderboardSettings.findById('weekly-prizes').lean();
    const now = new Date();
    if (isActive) {
        if (period.prizesApplied || period.endsAt <= now) {
            const error = new Error('Це змагання вже завершилося.');
            error.status = 409;
            throw error;
        }
        const anotherCompetitionIsScheduled = settings?.competitionId && settings.competitionId !== competitionId
            && settings.competitionEndAt > now;
        if (anotherCompetitionIsScheduled) {
            const error = new Error('Спочатку деактивуй поточне або заплановане змагання.');
            error.status = 409;
            throw error;
        }
        period.isActive = true;
        await period.save();
        await LeaderboardSettings.findOneAndUpdate(
            { _id: 'weekly-prizes' },
            { $set: {
                competitionId,
                competitionStartAt: period.startsAt,
                competitionEndAt: period.endsAt,
                prizeRanges: period.prizeRanges,
            } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    } else {
        period.isActive = false;
        await period.save();
        if (settings?.competitionId === competitionId) {
            await LeaderboardSettings.updateOne(
                { _id: 'weekly-prizes' },
                { $set: { competitionId: '', competitionStartAt: null, competitionEndAt: null } },
            );
        }
    }
    return listLeaderboardCompetitions();
}

async function deleteLeaderboardCompetition(competitionId) {
    const period = await LeaderboardPeriod.findById(competitionId).lean();
    if (!period) {
        const error = new Error('Змагання не знайдено.');
        error.status = 404;
        throw error;
    }
    const settings = await LeaderboardSettings.findById('weekly-prizes').select('competitionId').lean();
    if (settings?.competitionId === competitionId) {
        const error = new Error('Перед видаленням деактивуй змагання.');
        error.status = 409;
        throw error;
    }
    await Promise.all([
        LeaderboardXp.deleteMany({ weekId: competitionId }),
        User.updateMany(
            { pendingLeaderboardRewards: { $elemMatch: { $or: [{ competitionId }, { weekId: competitionId }] } } },
            { $pull: { pendingLeaderboardRewards: { $or: [{ competitionId }, { weekId: competitionId }] } } },
        ),
        LeaderboardPeriod.deleteOne({ _id: competitionId }),
    ]);
    return listLeaderboardCompetitions();
}

async function recordLeaderboardXp(userId, amount) {
    const xp = Math.max(0, Math.floor(Number(amount) || 0));
    if (!xp || !mongoose.Types.ObjectId.isValid(userId)) return;

    const now = new Date();
    const settings = await LeaderboardSettings.findById('weekly-prizes').lean();
    const configuredId = getCurrentCompetitionId(settings);
    let competitionId = null;
    if (configuredId) {
        const configuredPeriod = await LeaderboardPeriod.findById(configuredId)
            .select('_id isActive prizesApplied startsAt endsAt')
            .lean();
        const periodIsCurrent = configuredPeriod
            && configuredPeriod.isActive !== false
            && !configuredPeriod.prizesApplied
            && configuredPeriod.startsAt <= now
            && configuredPeriod.endsAt > now;
        if (!configuredPeriod || periodIsCurrent) competitionId = configuredId;
    } else {
        const activePeriod = await LeaderboardPeriod.findOne({
            isActive: { $ne: false },
            prizesApplied: false,
            startsAt: { $lte: now },
            endsAt: { $gt: now },
        }).sort({ startsAt: -1 }).select('_id').lean();
        competitionId = activePeriod?._id || null;
    }
    if (!competitionId) return;

    try {
        const result = await LeaderboardXp.updateOne(
            { weekId: competitionId, userId },
            { $inc: { xp } },
            { upsert: true },
        );
        if (!result.modifiedCount && !result.upsertedCount) {
            throw new Error(`Leaderboard XP was not recorded for competition ${competitionId}.`);
        }
    } catch (error) {
        if (error.code !== 11000) throw error;
        const retry = await LeaderboardXp.updateOne(
            { weekId: competitionId, userId },
            { $inc: { xp } },
        );
        if (!retry.modifiedCount) throw error;
    }
}

async function seedPreviousCompetitionParticipants(competitionId, startsAt) {
    const seedClaim = await LeaderboardPeriod.findOneAndUpdate(
        { _id: competitionId, participantsSeeded: { $ne: true } },
        { $set: { participantsSeeded: true } },
        { new: true },
    ).select('_id').lean();
    if (!seedClaim) return;

    try {
        const previousPeriods = await LeaderboardPeriod.find({
            _id: { $ne: competitionId },
            startsAt: { $lt: startsAt },
        }).sort({ startsAt: -1 }).select('_id').lean();
        let previousParticipants = [];
        for (const previousPeriod of previousPeriods) {
            previousParticipants = await LeaderboardXp.distinct('userId', { weekId: previousPeriod._id });
            if (previousParticipants.length) break;
        }
        if (previousParticipants.length) {
            await LeaderboardXp.bulkWrite(previousParticipants.map((userId) => ({
                updateOne: {
                    filter: { weekId: competitionId, userId },
                    update: { $setOnInsert: { xp: 0 } },
                    upsert: true,
                },
            })), { ordered: false });
        }
    } catch (error) {
        await LeaderboardPeriod.updateOne({ _id: competitionId }, { $set: { participantsSeeded: false } });
        throw error;
    }
}

async function getLeaderboardPeriod(competitionId) {
    if (competitionId) {
        return LeaderboardPeriod.findById(competitionId).lean();
    }
    return null;
}

async function getLeaderboard({ type = 'competition', page = 1, limit = 25, userId }) {
    await finalizeExpiredCompetitions();
    const settings = await LeaderboardSettings.findById('weekly-prizes').lean();
    const configuredId = settings?.competitionId || null;
    const selectedPeriod = await getLeaderboardPeriod(configuredId);
    const period = selectedPeriod?.isActive === false ? null : selectedPeriod;
    const competitionId = selectedPeriod?.isActive === false ? null : period?._id || configuredId;
    if (type === 'competition' && period?._id && period.startsAt) {
        try {
            await seedPreviousCompetitionParticipants(period._id, period.startsAt);
        } catch (error) {
            console.error('Не вдалося перенести учасників попереднього змагання:', error);
        }
    }
    const startsAt = period?.startsAt || settings?.competitionStartAt || null;
    const endsAt = period?.endsAt || settings?.competitionEndAt || null;
    const status = !startsAt || !endsAt
        ? 'not_configured'
        : Date.now() < new Date(startsAt).getTime()
            ? 'scheduled'
            : Date.now() < new Date(endsAt).getTime() ? 'active' : 'ended';

    const skip = (Math.max(1, page) - 1) * limit;
    const currentUser = userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
    let entries;
    let total;
    let userRank;
    let self = null;
    const withPresence = (user) => {
        const lastOnlineAt = user.lastSeenAt || null;
        return {
            isOnline: Boolean(lastOnlineAt && Date.now() - new Date(lastOnlineAt).getTime() < 120_000),
            lastOnlineAt,
        };
    };
    if (type === 'total') {
        const visibleUsers = { leaderboardHidden: { $ne: true } };
        const [users, count, current] = await Promise.all([
            User.find(visibleUsers).sort({ xp: -1, _id: 1 }).skip(skip).limit(limit).select('username avatar level xp lastSeenAt').lean(),
            User.countDocuments(visibleUsers),
            currentUser ? User.findOne({ _id: currentUser, ...visibleUsers }).select('username avatar level xp lastSeenAt').lean() : null,
        ]);
        total = count;
        entries = users.map((entry, index) => ({
            id: String(entry._id),
            username: entry.username,
            avatar: entry.avatar || '',
            xp: entry.xp || 0,
            level: entry.level || 1,
            rank: skip + index + 1,
            ...withPresence(entry),
        }));
        userRank = current
            ? await User.countDocuments({
                ...visibleUsers,
                $or: [
                    { xp: { $gt: current.xp } },
                    { xp: current.xp, _id: { $lt: currentUser } },
                ],
            }) + 1
            : count + 1;
        self = current ? {
            id: String(currentUser),
            username: current.username,
            avatar: current.avatar || '',
            xp: current.xp || 0,
            level: current.level || 1,
            rank: userRank,
            ...withPresence(current),
        } : null;
    } else {
        const query = { weekId: competitionId || '__none__', isHidden: { $ne: true } };
        const [rows, count] = await Promise.all([
            LeaderboardXp.find(query)
                .sort({ xp: -1, userId: 1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username avatar level lastSeenAt')
                .lean(),
            LeaderboardXp.countDocuments(query),
        ]);
        total = count;
        const current = currentUser
            ? await LeaderboardXp.findOne({ ...query, userId: currentUser }).select('xp').lean()
            : null;
        userRank = current
            ? await LeaderboardXp.countDocuments({
                ...query,
                $or: [
                    { xp: { $gt: current.xp } },
                    { xp: current.xp, userId: { $lt: currentUser } },
                ],
            }) + 1
            : count + 1;
        entries = rows.map((row, index) => ({
            id: String(row.userId?._id || ''),
            username: row.userId?.username || '',
            avatar: row.userId?.avatar || '',
            xp: row.xp,
            level: row.userId?.level || 1,
            rank: skip + index + 1,
            ...withPresence(row.userId || {}),
        })).filter((row) => row.id);
        const selfRow = currentUser
            ? await LeaderboardXp.findOne({ ...query, userId: currentUser })
                .populate('userId', 'username avatar level lastSeenAt')
                .lean()
            : null;
        self = selfRow?.userId ? {
            id: String(selfRow.userId._id),
            username: selfRow.userId.username,
            avatar: selfRow.userId.avatar || '',
            xp: selfRow.xp,
            level: selfRow.userId.level || 1,
            rank: userRank,
            ...withPresence(selfRow.userId),
        } : null;
    }
    return {
        type,
        entries,
        total,
        page: Math.max(1, page),
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        self,
        userRank,
        userXp: self?.xp || 0,
        competitionId: competitionId || '',
        competitionStartAt: startsAt ? new Date(startsAt).getTime() : null,
        competitionEndAt: endsAt ? new Date(endsAt).getTime() : null,
        competitionStatus: status,
        prizeRanges: period?.prizeRanges || settings?.prizeRanges || [],
        prizesApplied: Boolean(period?.prizesApplied),
    };
}

async function getAdminLeaderboardPlayers({ type, competitionId = '', page = 1, limit = 50, search = '' }) {
    const normalizedSearch = String(search).trim().slice(0, 80);
    const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameFilter = escapedSearch ? { username: { $regex: escapedSearch, $options: 'i' } } : {};
    const skip = (page - 1) * limit;
    const presence = (user) => ({
        isOnline: Boolean(user?.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 120_000),
        lastOnlineAt: user?.lastSeenAt || null,
    });

    if (type === 'total') {
        const [users, total] = await Promise.all([
            User.find(nameFilter).sort({ xp: -1, _id: 1 }).skip(skip).limit(limit)
                .select('username avatar level xp lastSeenAt leaderboardHidden').lean(),
            User.countDocuments(nameFilter),
        ]);
        const entries = await Promise.all(users.map(async (user) => ({
            id: String(user._id),
            username: user.username,
            avatar: user.avatar || '',
            xp: user.xp || 0,
            level: user.level || 1,
            hidden: user.leaderboardHidden === true,
            rank: user.leaderboardHidden ? null : await User.countDocuments({
                leaderboardHidden: { $ne: true },
                $or: [{ xp: { $gt: user.xp || 0 } }, { xp: user.xp || 0, _id: { $lt: user._id } }],
            }) + 1,
            ...presence(user),
        })));
        return { entries, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
    }

    if (type !== 'competition' || !competitionId) {
        return { entries: [], total: 0, page, pages: 1 };
    }
    const matchingUsers = escapedSearch
        ? await User.find(nameFilter).distinct('_id')
        : null;
    const query = {
        weekId: competitionId,
        ...(matchingUsers ? { userId: { $in: matchingUsers } } : {}),
    };
    const [rows, total] = await Promise.all([
        LeaderboardXp.find(query).sort({ xp: -1, userId: 1 }).skip(skip).limit(limit)
            .populate('userId', 'username avatar level lastSeenAt').lean(),
        LeaderboardXp.countDocuments(query),
    ]);
    const entries = await Promise.all(rows.filter((row) => row.userId).map(async (row) => ({
        id: String(row.userId._id),
        username: row.userId.username,
        avatar: row.userId.avatar || '',
        xp: row.xp || 0,
        level: row.userId.level || 1,
        hidden: row.isHidden === true,
        rank: row.isHidden ? null : await LeaderboardXp.countDocuments({
            weekId: competitionId,
            isHidden: { $ne: true },
            $or: [{ xp: { $gt: row.xp || 0 } }, { xp: row.xp || 0, userId: { $lt: row.userId._id } }],
        }) + 1,
        ...presence(row.userId),
    })));
    return { entries, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

async function setAdminLeaderboardPlayerVisibility({ type, competitionId = '', userId, hidden }) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        const error = new Error('Некоректний ідентифікатор гравця.');
        error.status = 400;
        throw error;
    }
    let result;
    if (type === 'total') {
        result = await User.updateOne({ _id: userId }, { $set: { leaderboardHidden: hidden } });
    } else if (type === 'competition' && competitionId) {
        result = await LeaderboardXp.updateOne(
            { weekId: competitionId, userId },
            { $set: { isHidden: hidden } },
        );
    } else {
        const error = new Error('Вкажи тип рейтингу та змагання.');
        error.status = 400;
        throw error;
    }
    if (!result.matchedCount) {
        const error = new Error(type === 'total' ? 'Гравця не знайдено.' : 'Гравець не брав участь у цьому змаганні.');
        error.status = 404;
        throw error;
    }
}

async function finalizeCompetition(competitionId) {
    const now = new Date();
    const leaseExpired = new Date(now.getTime() - PROCESSING_LEASE_MS);
    const period = await LeaderboardPeriod.findOneAndUpdate(
        {
            _id: competitionId,
            isActive: { $ne: false },
            prizesApplied: false,
            endsAt: { $lte: now },
            $or: [
                { processingAt: null },
                { processingAt: { $exists: false } },
                { processingAt: { $lte: leaseExpired } },
            ],
        },
        { $set: { processingAt: now } },
        { new: true },
    );
    if (!period) return;

    try {
        const rows = await LeaderboardXp.find({ weekId: competitionId, xp: { $gt: 0 } })
            .sort({ xp: -1, userId: 1 })
            .select('userId xp')
            .lean();
        const ranges = normalizePrizeRanges(period.prizeRanges);

        for (let index = 0; index < rows.length; index += 1) {
            const rank = index + 1;
            const prizes = ranges
                .filter((range) => rank >= range.rankFrom && rank <= range.rankTo)
                .flatMap((range) => range.rewards);
            if (!prizes.length) continue;

            await User.updateOne(
                { _id: rows[index].userId },
                { $addToSet: { pendingLeaderboardRewards: { competitionId, rank, rewards: prizes } } },
            );
        }

        await LeaderboardPeriod.updateOne(
            { _id: competitionId, prizesApplied: false, processingAt: now },
            { $set: { prizesApplied: true, closedAt: now }, $unset: { processingAt: 1 } },
        );
    } catch (error) {
        await LeaderboardPeriod.updateOne(
            { _id: competitionId, processingAt: now },
            { $unset: { processingAt: 1 } },
        );
        throw error;
    }
}

async function finalizeExpiredCompetitions() {
    const now = new Date();
    const expired = await LeaderboardPeriod.find({ isActive: { $ne: false }, prizesApplied: false, endsAt: { $lte: now } })
        .select('_id')
        .lean();
    for (const period of expired) await finalizeCompetition(period._id);
}

async function getPendingCompetitionRewards(userId) {
    const user = await User.findById(userId).select('pendingLeaderboardRewards').lean();
    return (user?.pendingLeaderboardRewards || []).map((reward) => ({
        competitionId: reward.competitionId || reward.weekId,
        rank: reward.rank,
        rewards: reward.rewards || [],
    }));
}

async function claimCompetitionRewards(userId, competitionId) {
    const user = await User.findById(userId).select('pendingLeaderboardRewards').lean();
    const reward = (user?.pendingLeaderboardRewards || [])
        .find((entry) => (entry.competitionId || entry.weekId) === competitionId);
    if (!reward) return null;

    const increments = {};
    for (const prize of reward.rewards) {
        if (prize.kind === 'coins') increments.coins = (increments.coins || 0) + prize.amount;
        else if (prize.kind === 'rubies') increments.rubies = (increments.rubies || 0) + prize.amount;
        else if (prize.kind === 'item' && prize.itemId) {
            const path = `itemInventory.${prize.itemId}`;
            increments[path] = (increments[path] || 0) + prize.amount;
        }
    }
    const idQuery = { $or: [{ competitionId }, { weekId: competitionId }] };
    const result = await User.updateOne(
        {
            _id: userId,
            pendingLeaderboardRewards: { $elemMatch: idQuery },
        },
        {
            $pull: { pendingLeaderboardRewards: idQuery },
            ...(Object.keys(increments).length ? { $inc: increments } : {}),
        },
    );
    if (!result.modifiedCount) return null;

    const updatedUser = await User.findById(userId).select('coins rubies xp level inventory itemInventory').lean();
    return {
        coins: updatedUser.coins,
        rubies: updatedUser.rubies,
        xp: updatedUser.xp,
        level: updatedUser.level,
        inventory: { ...(updatedUser.inventory || {}) },
        itemInventory: { ...(updatedUser.itemInventory || {}) },
        reward: {
            competitionId: reward.competitionId || reward.weekId,
            rank: reward.rank,
            rewards: reward.rewards,
        },
    };
}

async function closeExpiredLeaderboardPeriods() {
    await finalizeExpiredCompetitions();
}

export {
    recordLeaderboardXp,
    getLeaderboard,
    getAdminLeaderboardPlayers,
    setAdminLeaderboardPlayerVisibility,
    getLeaderboardSettings,
    saveLeaderboardSettings,
    listLeaderboardCompetitions,
    createLeaderboardCompetition,
    updateLeaderboardCompetition,
    setLeaderboardCompetitionActive,
    deleteLeaderboardCompetition,
    getPendingCompetitionRewards,
    claimCompetitionRewards,
    closeExpiredLeaderboardPeriods,
};
