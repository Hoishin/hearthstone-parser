import _ from "lodash";

import { CardEntity, EntityProps, identifySpecialTags } from "./entity";

type MatchLogType = "attack" | "play" | "trigger";

export class MatchLogEntry {
	type: MatchLogType;
	manaSpent = 0;
	source: EntityProps;
	targets: EntityProps[];

	constructor(type: MatchLogType, source: CardEntity) {
		this.type = type;
		this.setSource(source);
		this.targets = [];
	}

	/**
	 * Sets the source of this match log entry, with the ability to specify
	 * additional merge properties.
	 */
	setSource(
		entity: CardEntity,
		...props: Array<Partial<EntityProps> | undefined>
	): void {
		this.source = this.createProps(entity, ...props);
	}

	/**
	 * Adds a target to this match log entry, with the ability to specify
	 * additional merge properties. Ignored if the entity is falsey
	 * or if it is already added.
	 */
	addTarget(
		entity: CardEntity | undefined | null,
		...props: Array<Partial<EntityProps> | undefined>
	): void {
		if (
			!entity ||
			this.targets.findIndex((t) => t.entityId === entity.entityId) !== -1
		) {
			return;
		}

		this.targets.push(this.createProps(entity, ...props));
	}

	/**
	 * Marks targets/sources using the death entries.
	 * Returns the entity ids of the cards that were successfully marked.
	 * @param deaths Entity IDs that need to be marked
	 * @returns the subset of deaths that were present in this log entry
	 */
	markDeaths(deaths: Set<number>): Set<number> {
		const marked = new Set<number>();

		if (deaths.has(this.source.entityId)) {
			this.source.dead = true;
			marked.add(this.source.entityId);
		}

		for (const target of this.targets) {
			if (deaths.has(target.entityId)) {
				target.dead = true;
				marked.add(target.entityId);
			}
		}

		return marked;
	}

	private createProps(
		entity: CardEntity,
		...props: Array<Partial<EntityProps> | undefined>
	) {
		const tags = identifySpecialTags(entity);
		const merged = _.merge(entity, ...props);
		if (tags) {
			merged.tags = tags;
		}

		return merged;
	}
}
