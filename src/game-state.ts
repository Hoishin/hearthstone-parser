import { merge } from "lodash";

import { Class } from "./data/meta";
import {
	CardEntity,
	EntityProps,
	EntityTags,
	identifySpecialTags,
} from "./entity";
import { Team } from "./line-parsers-v2/consts";
import { MatchLogEntry } from "./match-log";

const UNKNOWN_CARDNAME = "UNKNOWN ENTITY [cardType=INVALID]";

/**
 * Tests if a card name is empty or the "empty string"
 * @param cardName
 */
const isEmpty = (cardName?: string) => {
	return !cardName || cardName === UNKNOWN_CARDNAME;
};

export interface Secret {
	entityId: number;
	cardId: string;
	cardClass: Class;
	cardName: string;
	timestamp: number;
}

export interface Quest {
	entityId: number;
	cardName: string;
	class: Class;
	progress: number;
	requirement: number;
	sidequest: boolean;
	timestamp: number;
}

export type CardState = "DECK" | "HAND" | "OTHERS";

export interface Card {
	/**
	 * ID used by logs to distinguish same cards
	 */
	entityId: number;

	/**
	 * Numeric ID for the card (same for same card)
	 * Unknown card has this undefined
	 */
	cardId?: number;

	/**
	 * Unknown card has this undefined
	 */
	cardName?: string;

	state: CardState;

	/**
	 * If card is originally from the deck
	 */
	readonly isSpawnedCard: boolean;

	tags: EntityTags[];
}

export interface Discovery {
	enabled: boolean;
	id: string | null;
	source?: EntityProps;
	chosen?: EntityProps;
	options: EntityProps[];
}

export interface Player {
	id: number;
	name: string;
	status: "LOST" | "WON" | "TIED" | "";
	turn: boolean;
	turnHistory: Array<{
		startTime: number;
		duration?: number;
	}>;
	quests: Quest[];
	timeout: number;
	cardCount: number;
	cards: Card[];
	position: "top" | "bottom";
	secrets: Secret[];
	discovery: Discovery;
	discoverHistory: Discovery[];
	cardsReplacedInMulligan: number;
	availableMana: number;
	manaSpent: number;
}

export class GameState {
	startTime: number;

	matchDuration: number;

	playerCount: number;

	gameOverCount: number;

	players: Player[];

	beginPhaseActive: boolean;

	mulliganActive: boolean;

	turnStartTime: Date;

	matchLog: MatchLogEntry[];

	entities: { [id: number]: CardEntity | undefined } = {};

	/**
	 * Internal set used to optimize card reveals
	 */
	readonly #missingEntityIds = new Set<number>();

	constructor() {
		this.reset();
	}

	get numPlayers(): number {
		return this.players.length;
	}

	/**
	 * Returns true if the game state is active for an ongoing game
	 */
	get active(): boolean {
		return Boolean(this.startTime) && !this.complete;
	}

	/**
	 * Returns true if the gamestate is representing a completed game.
	 */
	get complete(): boolean {
		return this.gameOverCount === 2;
	}

	/**
	 * Resets the game state to default conditions.
	 */
	reset(): void {
		this.players = [];
		this.matchLog = [];
		this.beginPhaseActive = true;
		this.gameOverCount = 0;
		this.entities = {};
		this.#missingEntityIds.clear();
	}

	/**
	 * Resets the game state to default conditions and marks it as a game that has begun.
	 */
	start(): void {
		this.reset();
		this.startTime = Date.now();
	}

	getPlayerById(index: number): Player | undefined {
		return this.players.find((player) => player.id === index);
	}

	getPlayerByPosition(position: "top" | "bottom"): Player | undefined {
		return this.players.find((player) => player.position === position);
	}

	getPlayerByName(name: string): Player | undefined {
		return this.players.find((player) => player.name === name);
	}

	getAllPlayers(): Player[] {
		return this.players.slice(0);
	}

	getOpponentPlayer(player: Player): Player | undefined {
		return this.players.find((p) => p.id !== player.id);
	}

	getPlayerByTeam(team: Team) {
		switch (team) {
			case Team.Friendly:
				return this.getPlayerByPosition("bottom");
			case Team.Opposing:
				return this.getPlayerByPosition("top");
			default:
				return undefined;
		}
	}

	/**
	 * Adds match log entries to the gamestate, and flags any entities
	 * that need filling out by future events.
	 * @param entries
	 */
	addMatchLogEntry(...entries: MatchLogEntry[]): void {
		for (const entry of entries) {
			if (isEmpty(entry.source?.cardName)) {
				this.#missingEntityIds.add(entry.source.entityId);
			}

			for (const target of entry.targets) {
				if (isEmpty(target.cardName)) {
					this.#missingEntityIds.add(target.entityId);
				}
			}
		}

		this.matchLog.push(...entries);
	}

	/**
	 * Updates any unresolved entities in any sub-data.
	 * Very often hearthstone won't assign a name to an entity until later,
	 * this handles the name resolution. Recommended place is the TAG_CHANGE event.
	 * @param entity
	 */
	resolveEntity(
		entity: Pick<CardEntity, "entityId"> & Partial<CardEntity>
	): void {
		const existing = this.entities[entity.entityId];
		const newEntity = merge(
			{
				type: "card",
				tags: {},
				player: "bottom",
				cardName: "",
			},
			existing,
			entity
		);

		this.entities[entity.entityId] = newEntity;
		const { cardName, entityId, cardId } = newEntity;
		const newProps = { entityId, cardName, cardId };

		// Update player cards in case this entity updated any important tags (like corrupt)
		for (const player of this.players) {
			for (const card of player.cards.filter(
				(c) => c.entityId === entity.entityId
			)) {
				const tags = identifySpecialTags(this.entities[card.entityId]);
				if (tags) {
					card.tags = tags;
				}
			}
		}

		if (isEmpty(cardName) || !this.#missingEntityIds.has(entityId)) {
			return;
		}

		// Update entities for each match log entry (only card name, entity id, and card id)
		for (const entry of this.matchLog) {
			if (
				isEmpty(entry.source.cardName) &&
				entry.source.entityId === entityId
			) {
				entry.source = { ...entry.source, ...newProps };
			}

			for (const [idx, target] of entry.targets.entries()) {
				if (isEmpty(target.cardName) && target.entityId === entityId) {
					entry.targets[idx] = { ...target, ...newProps };
				}
			}
		}
	}

	getEntity(id: number): CardEntity | undefined {
		return this.entities[id];
	}
}

export const newPlayer = (id: number, name: string): Player => {
	return {
		id,
		name,
		status: "",
		turn: false,
		turnHistory: [],
		timeout: 45,
		cardCount: 0,
		cards: [],
		position: "bottom",
		secrets: [],
		quests: [],
		discovery: {
			enabled: false,
			id: null,
			options: [],
		},
		discoverHistory: [],
		cardsReplacedInMulligan: 0,
		availableMana: 0,
		manaSpent: 0,
	};
};

/**
 * Update card in given list or push one if there isn't one already
 */
export const putCards = (
	cardList: Card[],
	{
		entityId,
		cardId,
		cardName,
		isSpawnedCard,
		state,
	}: Partial<Card> & { entityId: number }
) => {
	const card = cardList.find((c) => c.entityId === entityId);
	if (card) {
		if (cardId) {
			card.cardId = cardId;
		}
		if (cardName) {
			card.cardName = cardName;
		}
		if (state) {
			card.state = state;
		}
	} else if (state && typeof isSpawnedCard !== "undefined") {
		cardList.push({
			entityId,
			state,
			isSpawnedCard,
			cardId,
			cardName,
			tags: [],
		});
	}
};
