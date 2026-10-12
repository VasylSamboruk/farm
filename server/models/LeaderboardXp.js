import mongoose from 'mongoose';

const leaderboardXpSchema = new mongoose.Schema({
    weekId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    xp: { type: Number, min: 0, default: 0 },
    isHidden: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

leaderboardXpSchema.index({ weekId: 1, userId: 1 }, { unique: true });
leaderboardXpSchema.index({ weekId: 1, xp: -1, userId: 1 });

export default mongoose.model('LeaderboardXp', leaderboardXpSchema);
