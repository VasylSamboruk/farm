import mongoose from 'mongoose';

const leaderboardPeriodSchema = new mongoose.Schema({
    _id: { type: String },
    prizesApplied: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    participantsSeeded: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    prizeRanges: { type: [{
        rankFrom: { type: Number, required: true },
        rankTo: { type: Number, required: true },
        rewards: [{
            kind: { type: String, enum: ['coins', 'rubies', 'item'], required: true },
            amount: { type: Number, required: true },
            itemId: { type: String, default: '' },
        }],
    }], default: [] },
}, { versionKey: false });

export default mongoose.model('LeaderboardPeriod', leaderboardPeriodSchema);
