export const crops = [
	{
		id: 'wheat',
		name: 'Пшениця',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		price: 15,
		plantingXp: 1,
	    shopImage: '/assets/gradka/pshen/stage_4_fruiting.png',
        growthImages: [
            '/assets/gradka/pshen/stage_1_seedling.png',
            '/assets/gradka/pshen/stage_2_young.png',
            '/assets/gradka/pshen/stage_3_mature.png',
            '/assets/gradka/pshen/stage_4_fruiting.png'
        ],

		productionTimeMs: 60000,
		yieldItem: 'wheat',
		yieldName: 'Пшениця',
		yieldIcon: '🌾',
		yieldImage: '/assets/gradka/pshen/wheat.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	},

	{
		id: 'polunitsa',
		name: 'Полуниця',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		price: 15,
		plantingXp: 1,
	    shopImage: '/assets/gradka/polunitsa/polunitsa4.png',
        growthImages: [
            '/assets/gradka/polunitsa/polunitsa1.png',
            '/assets/gradka/polunitsa/polunitsa2.png',
            '/assets/gradka/polunitsa/polunitsa3.png',
            '/assets/gradka/polunitsa/polunitsa4.png'
        ],

		productionTimeMs: 30000,
		yieldItem: 'polunitsa',
		yieldName: 'Полуниця',
		yieldIcon: '🍓',
		yieldImage: '/assets/gradka/polunitsa/polunitsa.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	}
];
