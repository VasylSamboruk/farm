import mongoose from 'mongoose';

const tierSchema = new mongoose.Schema({
    id: { type: String, enum: ['bronze', 'silver', 'gold'], required: true },
    label: { type: String, required: true },
    requiredCount: { type: Number, required: true, min: 1 },
    rubies: { type: Number, required: true, min: 1 },
    image: { type: String, required: true },
}, { _id: false });

const achievementConfigSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: String, required: true },
    tiers: { type: [tierSchema], required: true, validate: tiers => tiers.length === 3 },
});

export default mongoose.model('AchievementConfig', achievementConfigSchema);
