export interface GameEntity {
	readonly type: "game";
}

export interface PlayerEntity {
	readonly type: "player";
	player: "top" | "bottom";
}

/**
 * Object derived from [entityName=XXX ...] strings.
 */
export type Entity = CardEntity | GameEntity | PlayerEntity;

export interface CardEntity {
	readonly type: "card";

	/**
	 * Numeric id of the card in the database.
	 */
	cardId?: number;
	cardName: string;
	entityId: number;
	player: "top" | "bottom";

	/**
	 * All tags marked for this entity.
	 */
	tags: { [key: string]: string | undefined };
}

export type EntityTags = "can-corrupt" | "corrupt";

export interface EntityProps {
	entityId: number;
	cardId?: number;
	cardName: string;
	player: "top" | "bottom";
	damage?: number;
	healing?: number;
	dead?: boolean;

	/**
	 * Additional tags for when cards have special types
	 */
	tags?: EntityTags[];
}

/**
 * Object derived from TAG_CHANGE Entity=[ENTITYSTRING] tag=X value=Y lines.
 */
export interface TagData {
	type: "tag";
	entity?: Entity;
	tag: string;
	value: string;
}
/**
 * Object derived from META_DATA -Meta=XX Data=YY lines.
 */
export interface MetaData {
	type: "meta";
	key: string;
	value: number;
}

/**
 * Returns an array of special tags that can be used to communicate additional
 * properties of a card. Currently the available properties deal with corruption.
 */
export const identifySpecialTags = (
	entity: CardEntity | undefined
): EntityTags[] | void => {
	if (!entity || !entity.tags) {
		return;
	}

	// Tags are handled here. These are the "simplified" version.
	const tags = new Array<EntityTags>();
	if (entity.tags.CORRUPTEDCARD === "1") {
		tags.push("corrupt");
	} else if (entity.tags.CORRUPT === "1") {
		tags.push("can-corrupt");
	}

	return tags.length > 0 ? tags : undefined;
};
