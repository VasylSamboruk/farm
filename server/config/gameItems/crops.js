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
	},

	{
		id: 'morkva',
		name: 'Морква',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		price: 35,
		plantingXp: 1,
	    shopImage: '/assets/gradka/morkva/morkva4.png',
        growthImages: [
            '/assets/gradka/morkva/morkva1.png',
            '/assets/gradka/morkva/morkva2.png',
            '/assets/gradka/morkva/morkva3.png',
            '/assets/gradka/morkva/morkva4.png'
        ],

		productionTimeMs: 30000,
		yieldItem: 'morkva',
		yieldName: 'Морква',
		yieldIcon: '🥕',
		yieldImage: '/assets/gradka/morkva/morkva.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	},

	{
		id: 'pomidor',
		name: 'Помідор',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		price: 35,
		plantingXp: 1,
	    shopImage: '/assets/gradka/pomidor/pomidor4.png',
        growthImages: [
            '/assets/gradka/pomidor/pomidor1.png',
            '/assets/gradka/pomidor/pomidor3.png',
            '/assets/gradka/pomidor/pomidor3.png',
            '/assets/gradka/pomidor/pomidor4.png'
        ],

		productionTimeMs: 35000,
		yieldItem: 'pomidor',
		yieldName: 'Помідор',
		yieldIcon: '🍅',
		yieldImage: '/assets/gradka/pomidor/pomidor.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	},

	{
		id: 'perec',
		name: 'Перець',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		price: 35,
		plantingXp: 1,
		requiredLevel: 11,
	    shopImage: '/assets/gradka/perec/perec4.png',
        growthImages: [
            '/assets/gradka/perec/perec1.png',
            '/assets/gradka/perec/perec2.png',
            '/assets/gradka/perec/perec3.png',
            '/assets/gradka/perec/perec4.png'
        ],

		productionTimeMs: 35000,
		yieldItem: 'perec',
		yieldName: 'Перець',
		yieldIcon: '�️',
		yieldImage: '/assets/gradka/perec/perec.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	},

{
		id: 'cybulya',
		name: 'Цибуля',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.79,
		price: 35,
		plantingXp: 1,
		requiredLevel: 11,
	    shopImage: '/assets/gradka/cybulya/cybulya4.png',
        growthImages: [
            '/assets/gradka/cybulya/cybulya1.png',
            '/assets/gradka/cybulya/cybulya2.png',
            '/assets/gradka/cybulya/cybulya3.png',
            '/assets/gradka/cybulya/cybulya4.png'
        ],

		productionTimeMs: 35000,
		yieldItem: 'cybulya',
		yieldName: 'Цибуля',
		yieldIcon: '�️',
		yieldImage: '/assets/gradka/cybulya/cybulya.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	},

	{
		id: 'pump',
		name: 'Гарбуз',
		type: 'CROP',
		footprint: { width: 1, height: 1 },
		price: 35,
		plantingXp: 1,
		requiredLevel: 11,
	    shopImage: '/assets/gradka/pump/pump4.png',
        growthImages: [
            '/assets/gradka/pump/pump1.png',
            '/assets/gradka/pump/pump2.png',
            '/assets/gradka/pump/pump3.png',
            '/assets/gradka/pump/pump4.png'
        ],

		productionTimeMs: 35000,
		yieldItem: 'pump',
		yieldName: 'Гарбуз',
		yieldIcon: '🎃',
		yieldImage: '/assets/gradka/pump/pump4.png',
		yieldAmount: 1,
		sellPrice: 5,
		placementSurface: 'soil'
	}
];
