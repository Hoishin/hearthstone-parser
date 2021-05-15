import debug from "debug";

import { GameState } from "../game-state";

export type LineParser<T extends string> = (
	line: string,
	gameState: GameState,
	eventName: T
) => boolean;

export const label = {
	Power: {
		GameState: {
			DebugPrintPower: /\[Power\] GameState\.DebugPrintPower\(\)/,
			DebugPrintEntitiesChosen: /\[Power\] GameState\.DebugPrintEntitiesChosen\(\)/,
		},
		PowerTaskList: {
			DebugPrintPower: /\[Power\] PowerTaskList\.DebugPrintPower\(\)/,
		},
	},
	Zone: {
		ZoneChangeList: {
			ProcessChanges: /\[Zone\] ZoneChangeList\.ProcessChanges\(\)/,
		},
	},
	LoadingScreen: {
		MulliganManager: {
			HandleGameStart: /\[LoadingScreen\] MulliganManager.HandleGameStart\(\)/,
		},
	},
};

const makeFullRegex = (label: RegExp, content: RegExp) =>
	new RegExp(`${label} -(?<indent>\\s+)${content}`);

export const lineParserFactory = <Name extends string>(options: {
	name: Name;
	label: RegExp;
	regex: RegExp;
	matchesHandler: (
		groups: Record<string, string>,
		gameState: GameState,
		logger: debug.Debugger
	) => boolean;
}): LineParser<Name> => {
	const debugLogger = debug(`hlp:${options.name}`);
	const fullRegex = makeFullRegex(options.label, options.regex);
	return (line: string, gameState: GameState) => {
		const matches = fullRegex.exec(line);
		if (!matches) {
			return false;
		}
		const groups = matches.groups ?? {};
		const updated = options.matchesHandler(groups, gameState, debugLogger);
		return updated;
	};
};

export interface BlockParserOptions<
	T extends string,
	S extends Record<string, unknown>
> {
	name: T;
	label: RegExp;
	startRegex: RegExp;
	initializeBlockState: (
		groups: Record<string, string>,
		gameState: GameState,
		logger: debug.Debugger
	) => S | undefined;
	blockLineParser: (
		line: string,
		gameState: GameState,
		blockState: S,
		logger: debug.Debugger
	) => void;
}

export const blockParserFactory = <
	T extends string,
	S extends Record<string, string>
>(
	options: BlockParserOptions<T, S>
): LineParser<T> => {
	const debugLogger = debug(`hlp:${options.name}`);
	const startFullRegex = makeFullRegex(options.label, options.startRegex);

	let blockState: S | null = null;
	let indent = 0;

	return (line: string, gameState: GameState) => {
		// If matches with start regex, initialize block state
		const startMatches = startFullRegex.exec(line);
		if (startMatches?.groups) {
			indent = startMatches.groups.indent.length;
			const initialState = options.initializeBlockState(
				startMatches.groups,
				gameState,
				debugLogger
			);
			if (initialState) {
				blockState = initialState;
			}
			return false;
		}

		if (!blockState) {
			return false;
		}

		const indentMatches = makeFullRegex(options.label, /.*/).exec(line);
		if (indentMatches && indentMatches.groups) {
			if (parseInt(indentMatches.groups.indent) === indent) {
				options.blockLineParser(
					line,
					gameState,
					blockState,
					debugLogger
				);
			}
		}

		return false;
	};
};
