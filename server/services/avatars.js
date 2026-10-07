import User from '../models/User.js';

export const DEFAULT_AVATARS = Array.from(
    { length: 6 },
    (_, index) => `/assets/ui/avatar/ava${index + 1}.png`
);

export const getRandomDefaultAvatar = () =>
    DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];

export const ensureDefaultAvatar = async (user) => {
    if (user.avatar) return user.avatar;

    const avatar = getRandomDefaultAvatar();
    if (typeof user.save === 'function') {
        user.avatar = avatar;
        await user.save();
        return user.avatar;
    }

    const updatedUser = await User.findOneAndUpdate(
        {
            _id: user._id,
            $or: [
                { avatar: { $exists: false } },
                { avatar: '' },
                { avatar: null },
            ],
        },
        { $set: { avatar } },
        { new: true, projection: 'avatar' }
    ).lean();
    if (updatedUser) {
        user.avatar = updatedUser.avatar;
        return user.avatar;
    }

    const latestUser = await User.findById(user._id).select('avatar').lean();
    if (!latestUser) throw new Error('Гравця не знайдено під час призначення аватара');
    user.avatar = latestUser.avatar ?? '';
    return user.avatar;
};
