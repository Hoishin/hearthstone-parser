import { keyBy } from "lodash";

import cardsJson from "./cards.json";

type CardType = { dbfId: number; id: string; name: string };
const cardData = keyBy(cardsJson, (c) => c.id) as {
	[id: string]: CardType | undefined;
};

export default cardData;
