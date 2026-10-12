import mongoose from 'mongoose';

const prizeSchema = new mongoose.Schema({
    rankFrom: { type: Number, required: true, min: 1, max: 1_000_000 },
    rankTo: { type: Number, required: true, min: 1, max: 1_000_000 },
    rewards: {
        type: [{
            kind: { type: String, enum: ['coins', 'rubies', 'item'], required: true },
            amount: { type: Number, min: 1, max: 100_000, required: true },
            itemId: { type: String, default: '' },
        }],
        default: [],
        validate: (rewards) => rewards.length <= 20,
    },
}, { _id: false });

const leaderboardSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'weekly-prizes' },
    prizeRanges: { type: [prizeSchema], default: [] },
    competitionStartAt: { type: Date, default: null },
    competitionEndAt: { type: Date, default: null },
    competitionId: { type: String, default: '' },
}, { versionKey: false });

export default mongoose.model('LeaderboardSettings', leaderboardSettingsSchema);
