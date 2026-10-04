import mongoose from 'mongoose';

const rewardSchema = new mongoose.Schema({
    kind: { type: String, enum: ['coins', 'rubies', 'item'], required: true },
    amount: { type: Number, min: 1, max: 100000, required: true },
    itemId: { type: String, default: '' },
}, { _id: false });

const levelRewardSchema = new mongoose.Schema({
    level: { type: Number, min: 2, max: 999, required: true, unique: true },
    rewards: { type: [rewardSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('LevelReward', levelRewardSchema);
