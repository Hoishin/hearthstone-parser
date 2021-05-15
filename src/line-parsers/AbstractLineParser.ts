import debug from "debug";

import { GameState } from "../game-state";

import { HspEventsEmitter } from "./index";

/**
 * Root class of all classes that read lines and emit events.
 */
export abstract class LineParser {
	abstract readonly eventName: string;

	// eslint-disable-next-line @typescript-eslint/member-ordering
	private _logger: debug.IDebugger;

	get logger(): debug.IDebugger {
		if (!this._logger) {
			this._logger = debug(`hlp:${this.eventName}`);
		}

		return this._logger;
	}

	abstract handleLine(
		emitter: HspEventsEmitter,
		gameState: GameState,
		line: string
	): boolean;
}
