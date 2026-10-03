import mongoose from 'mongoose';

const mediaSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'assets' },
    assetBaseUrl: { type: String, default: '' },
    previousAssetBaseUrl: { type: String, default: '' },
    assetBaseUrlHistory: { type: [String], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.model('MediaSettings', mediaSettingsSchema);