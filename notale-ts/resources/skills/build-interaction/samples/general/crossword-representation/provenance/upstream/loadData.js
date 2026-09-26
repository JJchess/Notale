import usa2020 from "../data/usa2020.json";
import up2020 from "../data/up2020.json";
import nyt2020 from "../data/nyt2020.json";
import wsj2020 from "../data/wsj2020.json";
import lat2020 from "../data/lat2020.json";

import nyt1940s from "../data/nyt1940s.json";
import nyt1950s from "../data/nyt1950s.json";
import nyt1960s from "../data/nyt1960s.json";
import nyt1970s from "../data/nyt1970s.json";
import nyt1980s from "../data/nyt1980s.json";
import nyt1990s from "../data/nyt1990s.json";
import nyt2000s from "../data/nyt2000s.json";
import nyt2010s from "../data/nyt2010s.json";

const puzzlesToday = [
	{
		id: "lat2020",
		value: "LA Times",
		data: lat2020,
		urm: "25%",
		white: "75%",
		woman: "32%",
		man: "68%",
	},
	{
		id: "nyt2020",
		value: "New York Times",
		data: nyt2020,
		urm: "28%",
		white: "72%",
		woman: "36%",
		man: "64%",
	},
	{
		id: "up2020",
		value: "Universal",
		data: up2020,
		urm: "29%",
		white: "71%",
		woman: "46%",
		man: "54%",
	},
	{
		id: "usa2020",
		value: "USA Today",
		data: usa2020,
		urm: "48%",
		white: "52%",
		woman: "72%",
		man: "28%",
	},
	{
		id: "wsj2020",
		value: "Wall Street Journal",
		data: wsj2020,
		urm: "24%",
		white: "76%",
		woman: "31%",
		man: "69%",
	},
];

const puzzlesNYT = [
	{
		id: "nyt1940s",
		value: "1940s",
		data: nyt1940s,
		urm: "6%",
		white: "94%",
		woman: "10%",
		man: "90%",
	},
	{
		id: "nyt1950s",
		value: "1950s",
		data: nyt1950s,
		urm: "9%",
		white: "91%",
		woman: "16%",
		man: "84%",
	},
	{
		id: "nyt1960s",
		value: "1960s",
		data: nyt1960s,
		urm: "7%",
		white: "93%",
		woman: "15%",
		man: "85%",
	},
	{
		id: "nyt1970s",
		value: "1970s",
		data: nyt1970s,
		urm: "91%",
		white: "91%",
		woman: "20%",
		man: "80%",
	},
	{
		id: "nyt1980s",
		value: "1980s",
		data: nyt1980s,
		urm: "7%",
		white: "93%",
		woman: "17%",
		man: "83%",
	},
	{
		id: "nyt1990s",
		value: "1990s",
		data: nyt1990s,
		urm: "11%",
		white: "89%",
		woman: "22%",
		man: "78%",
	},
	{
		id: "nyt2000s",
		value: "2000s",
		data: nyt2000s,
		urm: "15%",
		white: "85%",
		woman: "28%",
		man: "72%",
	},
	{
		id: "nyt2010s",
		value: "2010s",
		data: nyt2010s,
		urm: "25%",
		white: "75%",
		woman: "27%",
		man: "73%",
	},
];

export { puzzlesNYT, puzzlesToday };