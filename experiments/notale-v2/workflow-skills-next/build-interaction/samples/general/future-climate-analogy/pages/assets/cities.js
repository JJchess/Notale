/* Copied from climate-zones/src/components/data.svelte at b75ff23010bd2da67a5d22f728c8c6875a2f90f6. */
window.CITIES = [
		{
			id: 0,
			name: "Oslo",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Temperate, no dry season, warm summer",
			temp_2023: 5.28,
			temp_2070: 8.3,
			clicked: false
		},
		{
			id: 1,
			name: "Helsinki",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Temperate, no dry season, warm summer",
			temp_2023: 5.65,
			temp_2070: 9.16,
			clicked: false
		},
		{
			id: 2,
			name: "Stockholm",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Temperate, no dry season, warm summer",
			temp_2023: 6.98,
			temp_2070: 10.12,
			clicked: false
		},
		{
			id: 3,
			name: "Berlin",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 9.7,
			temp_2070: 12.79,
			clicked: false
		},
		{
			id: 4,
			name: "Copenhagen",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Temperate, no dry season, warm summer",
			temp_2023: 8.38,
			temp_2070: 11.16,
			clicked: false
		},
		{
			id: 5,
			name: "Moscow",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Cold, no dry season, hot summer",
			temp_2023: 5.68,
			temp_2070: 9.6,
			clicked: false
		},
		{
			id: 6,
			name: "Warsaw",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Arid, steppe, cold",
			temp_2023: 8.72,
			temp_2070: 12.15,
			clicked: false
		},
		{
			id: 7,
			name: "London",
			color: "rgb(100,255,80)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 10.41,
			temp_2070: 12.85,
			clicked: false
		},
		{
			id: 8,
			name: "Prague",
			color: "rgb(119, 119, 119)",
			type_2023: "Arid, steppe, cold",
			type_2070: "Arid, steppe, cold",
			temp_2023: 8.82,
			temp_2070: 12.21,
			clicked: false
		},
		{
			id: 9,
			name: "Amsterdam",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Temperate, no dry season, warm summer",
			temp_2023: 10.41,
			temp_2070: 12.92,
			clicked: false
		},
		{
			id: 10,
			name: "Paris",
			color: "rgb(100,255,80)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 11.96,
			temp_2070: 14.87,
			clicked: false
		},
		{
			id: 11,
			name: "Vancouver",
			color: "rgb(200,200,0)",
			type_2023: "Temperate, dry summer, warm summer",
			type_2070: "Temperate, dry summer, hot summer",
			temp_2023: 10.03,
			temp_2070: 13.49,
			clicked: false
		},
		{
			id: 12,
			name: "Zurich",
			color: "rgb(100,255,80)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 5.48,
			temp_2070: 8.84,
			clicked: false
		},
		{
			id: 13,
			name: "Vienna",
			color: "rgb(55,200,255)",
			type_2023: "Cold, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 9.26,
			temp_2070: 12.6,
			clicked: false
		},
		{
			id: 14,
			name: "Milan",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 12.32,
			temp_2070: 15.76,
			clicked: false
		},
		{
			id: 15,
			name: "Budapest",
			color: "rgb(0,255,255)",
			type_2023: "Cold, no dry season, hot summer",
			type_2070: "Arid, steppe, cold",
			temp_2023: 9.71,
			temp_2070: 13.36,
			clicked: false
		},
		{
			id: 16,
			name: "Bucharest",
			color: "rgb(0,255,255)",
			type_2023: "Cold, no dry season, hot summer",
			type_2070: "Arid, steppe, cold",
			temp_2023: 12.07,
			temp_2070: 15.81,
			clicked: false
		},
		{
			id: 17,
			name: "Toronto",
			color: "rgb(0,255,255)",
			type_2023: "Cold, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 7.56,
			temp_2070: 11.73,
			clicked: false
		},
		{
			id: 18,
			name: "Rome",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Temperate, dry summer, hot summer",
			temp_2023: 16.36,
			temp_2070: 19.58,
			clicked: false
		},
		{
			id: 19,
			name: "Chicago",
			color: "rgb(0,255,255)",
			type_2023: "Cold, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 9.75,
			temp_2070: 13.91,
			clicked: false
		},
		{
			id: 20,
			name: "New York",
			color: "rgb(0,255,255)",
			type_2023: "Cold, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 11.57,
			temp_2070: 15.3,
			clicked: false
		},
		{
			id: 21,
			name: "Boston",
			color: "rgb(0,255,255)",
			type_2023: "Cold, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 10.72,
			temp_2070: 14.46,
			clicked: false
		},
		{
			id: 22,
			name: "Istanbul",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Temperate, dry summer, hot summer",
			temp_2023: 14.49,
			temp_2070: 17.5,
			clicked: false
		},
		{
			id: 23,
			name: "Barcelona",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 16.93,
			temp_2070: 19.77,
			clicked: false
		},
		{
			id: 24,
			name: "Beijing",
			color: "rgb(170,175,255)",
			type_2023: "Cold, dry winter, hot summer",
			type_2070: "Temperate, dry winter, hot summer",
			temp_2023: 10.12,
			temp_2070: 13.85,
			clicked: false
		},
		{
			id: 25,
			name: "Madrid",
			color: "rgb(255,220,100)",
			type_2023: "Arid, steppe, cold",
			type_2070: "Arid, steppe, hot",
			temp_2023: 15.12,
			temp_2070: 18.77,
			clicked: false
		},
		{
			id: 26,
			name: "Lisbon",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Temperate, dry summer, hot summer",
			temp_2023: 17.1,
			temp_2070: 19.41,
			clicked: false
		},
		{
			id: 27,
			name: "Washington,  D.C.",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 13.67,
			temp_2070: 17.31,
			clicked: false
		},
		{
			id: 28,
			name: "Athens",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 17.13,
			temp_2070: 20.12,
			clicked: false
		},
		{
			id: 29,
			name: "San Francisco",
			color: "rgb(200,200,0)",
			type_2023: "Temperate, dry summer, warm summer",
			type_2070: "Temperate, dry summer, hot summer",
			temp_2023: 14.98,
			temp_2070: 17.84,
			clicked: false
		},
		{
			id: 30,
			name: "Tunis",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 18.86,
			temp_2070: 21.87,
			clicked: false
		},
		{
			id: 31,
			name: "Seoul",
			color: "rgb(170,175,255)",
			type_2023: "Cold, dry winter, hot summer",
			type_2070: "Temperate, dry winter, hot summer",
			temp_2023: 10.48,
			temp_2070: 14.13,
			clicked: false
		},
		{
			id: 32,
			name: "Tokyo",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 14.62,
			temp_2070: 17.58,
			clicked: false
		},
		{
			id: 33,
			name: "Tehran",
			color: "rgb(255,220,100)",
			type_2023: "Arid, steppe, cold",
			type_2070: "Arid, steppe, hot",
			temp_2023: 12.02,
			temp_2070: 15.71,
			clicked: false
		},
		{
			id: 34,
			name: "Los Angeles",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 15.44,
			temp_2070: 18.43,
			clicked: false
		},
		{
			id: 35,
			name: "Albuquerque",
			color: "rgb(255,150,150)",
			type_2023: "Arid, desert, cold",
			type_2070: "Arid, desert, hot",
			temp_2023: 11.12,
			temp_2070: 14.71,
			clicked: false
		},
		{
			id: 36,
			name: "Casablanca",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 18.79,
			temp_2070: 21.0,
			clicked: false
		},
		{
			id: 37,
			name: "Atlanta",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 16.36,
			temp_2070: 19.46,
			clicked: false
		},
		{
			id: 38,
			name: "Shanghai",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 16.62,
			temp_2070: 19.85,
			clicked: false
		},
		{
			id: 39,
			name: "Tel Aviv",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 19.96,
			temp_2070: 23.04,
			clicked: false
		},
		{
			id: 40,
			name: "Cairo",
			color: "rgb(119, 119, 119)",
			type_2023: "Arid, desert, hot",
			type_2070: "Arid, desert, hot",
			temp_2023: 21.86,
			temp_2070: 25.06,
			clicked: false
		},
		{
			id: 41,
			name: "Austin",
			color: "rgb(200,255,80)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 20.3,
			temp_2070: 23.63,
			clicked: false
		},
		{
			id: 42,
			name: "Miami",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, monsoon",
			type_2070: "Tropical, monsoon",
			temp_2023: 24.8,
			temp_2070: 27.2,
			clicked: false
		},
		{
			id: 43,
			name: "New Delhi",
			color: "rgb(119, 119, 119)",
			type_2023: "Arid, steppe, hot",
			type_2070: "Arid, steppe, hot",
			temp_2023: 25.14,
			temp_2070: 28.22,
			clicked: false
		},
		{
			id: 44,
			name: "Taipei",
			color: "rgb(200,255,80)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Tropical, rainforest",
			temp_2023: 22.21,
			temp_2070: 24.56,
			clicked: false
		},
		{
			id: 45,
			name: "Riyadh",
			color: "rgb(119, 119, 119)",
			type_2023: "Arid, desert, hot",
			type_2070: "Arid, desert, hot",
			temp_2023: 26.3,
			temp_2070: 30.34,
			clicked: false
		},
		{
			id: 46,
			name: "Hong Kong",
			color: "rgb(150,255,150)",
			type_2023: "Temperate, dry winter, hot summer",
			type_2070: "Tropical, monsoon",
			temp_2023: 23.46,
			temp_2070: 26.03,
			clicked: false
		},
		{
			id: 47,
			name: "Dubai",
			color: "rgb(119, 119, 119)",
			type_2023: "Arid, desert, hot",
			type_2070: "Arid, desert, hot",
			temp_2023: 27.79,
			temp_2070: 31.1,
			clicked: false
		},
		{
			id: 48,
			name: "Mumbai",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, monsoon",
			type_2070: "Tropical, monsoon",
			temp_2023: 27.39,
			temp_2070: 29.83,
			clicked: false
		},
		{
			id: 49,
			name: "Hanoi",
			color: "rgb(150,255,150)",
			type_2023: "Temperate, dry winter, hot summer",
			type_2070: "Tropical, savannah",
			temp_2023: 24.33,
			temp_2070: 27.26,
			clicked: false
		},
		{
			id: 50,
			name: "Mexico City",
			color: "rgb(100,200,100)",
			type_2023: "Temperate, dry winter, warm summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 18.33,
			temp_2070: 21.44,
			clicked: false
		},
		{
			id: 51,
			name: "Bangkok",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, savannah",
			type_2070: "Tropical, savannah",
			temp_2023: 28.36,
			temp_2070: 30.93,
			clicked: false
		},
		{
			id: 52,
			name: "Manila",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, savannah",
			type_2070: "Tropical, savannah",
			temp_2023: 26.54,
			temp_2070: 28.73,
			clicked: false
		},
		{
			id: 53,
			name: "Lagos",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, savannah",
			type_2070: "Tropical, savannah",
			temp_2023: 27.25,
			temp_2070: 29.52,
			clicked: false
		},
		{
			id: 54,
			name: "Caracas",
			color: "rgb(70,170,250)",
			type_2023: "Tropical, savannah",
			type_2070: "Arid, steppe, hot",
			temp_2023: 24.78,
			temp_2070: 26.97,
			clicked: false
		},
		{
			id: 55,
			name: "Kuala Lumpur",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, rainforest",
			type_2070: "Tropical, rainforest",
			temp_2023: 26.39,
			temp_2070: 28.83,
			clicked: false
		},
		{
			id: 56,
			name: "Bogota",
			color: "rgb(200,200,0)",
			type_2023: "Temperate, dry summer, warm summer",
			type_2070: "Temperate, no dry season, warm summer",
			temp_2023: 15.0,
			temp_2070: 18.13,
			clicked: false
		},
		{
			id: 57,
			name: "Nairobi",
			color: "rgb(100,255,80)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Tropical, savannah",
			temp_2023: 18.92,
			temp_2070: 21.32,
			clicked: false
		},
		{
			id: 58,
			name: "Singapore",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, rainforest",
			type_2070: "Tropical, rainforest",
			temp_2023: 27.77,
			temp_2070: 29.99,
			clicked: false
		},
		{
			id: 59,
			name: "Lima",
			color: "rgb(119, 119, 119)",
			type_2023: "Arid, desert, hot",
			type_2070: "Arid, desert, hot",
			temp_2023: 17.14,
			temp_2070: 20.14,
			clicked: false
		},
		{
			id: 60,
			name: "Jakarta",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, monsoon",
			type_2070: "Tropical, monsoon",
			temp_2023: 27.35,
			temp_2070: 29.61,
			clicked: false
		},
		{
			id: 61,
			name: "Rio de Janeiro",
			color: "rgb(119, 119, 119)",
			type_2023: "Tropical, savannah",
			type_2070: "Tropical, savannah",
			temp_2023: 23.52,
			temp_2070: 25.86,
			clicked: false
		},
		{
			id: 62,
			name: "Lusaka",
			color: "rgb(150,255,150)",
			type_2023: "Temperate, dry winter, hot summer",
			type_2070: "Tropical, savannah",
			temp_2023: 21.98,
			temp_2070: 24.9,
			clicked: false
		},
		{
			id: 63,
			name: "Johannesburg",
			color: "rgb(100,200,100)",
			type_2023: "Temperate, dry winter, warm summer",
			type_2070: "Temperate, dry winter, hot summer",
			temp_2023: 17.66,
			temp_2070: 21.04,
			clicked: false
		},
		{
			id: 64,
			name: "Sao Paulo",
			color: "rgb(200,255,80)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Tropical, savannah",
			temp_2023: 20.98,
			temp_2070: 23.52,
			clicked: false
		},
		{
			id: 65,
			name: "Cape Town",
			color: "rgb(200,200,0)",
			type_2023: "Temperate, dry summer, warm summer",
			type_2070: "Temperate, dry summer, hot summer",
			temp_2023: 16.67,
			temp_2070: 18.57,
			clicked: false
		},
		{
			id: 66,
			name: "Santiago",
			color: "rgb(255,255,0)",
			type_2023: "Temperate, dry summer, hot summer",
			type_2070: "Arid, steppe, hot",
			temp_2023: 12.9,
			temp_2070: 15.55,
			clicked: false
		},
		{
			id: 67,
			name: "Auckland",
			color: "rgb(100,255,80)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 14.64,
			temp_2070: 16.88,
			clicked: false
		},
		{
			id: 68,
			name: "Buenos Aires",
			color: "rgb(119, 119, 119)",
			type_2023: "Temperate, no dry season, hot summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 16.71,
			temp_2070: 18.79,
			clicked: false
		},
		{
			id: 69,
			name: "Melbourne",
			color: "rgb(100,255,80)",
			type_2023: "Temperate, no dry season, warm summer",
			type_2070: "Temperate, no dry season, hot summer",
			temp_2023: 14.61,
			temp_2070: 17.02,
			clicked: false
		}
];
