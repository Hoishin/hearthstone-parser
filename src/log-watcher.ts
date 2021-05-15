import fs from "fs";
import os from "os";
import path from "path";

import chokidar, { FSWatcher } from "chokidar";
import debug from "debug";
import { EventEmitter2 } from "eventemitter2";
import filenamify from "filenamify/filenamify";
import _ from "lodash";
import splitLines from "split-lines";

import { GameState } from "./game-state";
import { lineParsers } from "./line-parsers-v2";
import { readLogFile } from "./utils/read-log-file";

export interface Options {
	logFile: string;
	configFile: string;

	/**
	 * Path to save any log files
	 */
	logDirectory?: string;

	/**
	 * The number of lines in each parsing group.
	 */
	linesPerUpdate?: number;

	/**
	 * Whether an update event should be sent out when the turn has changed
	 */
	updateEveryTurn?: boolean;
}

const log = debug("hlp");

const makeDefaultOptions = (): Options => {
	const isWindows = os.platform() === "win32";
	const isMacOS = os.platform() === "darwin";
	if (isWindows) {
		log("Windows platform detected.");
		return {
			logFile: path.resolve(
				process.env.UserProfile!,
				"AppData/LocalLow/Blizzard Entertainment/Hearthstone/output_log.txt"
			),
			configFile: path.resolve(
				process.env.LOCALAPPDATA!,
				"Blizzard/Hearthstone/log.config"
			),
		};
	}
	if (isMacOS) {
		log("OS X platform detected.");
		return {
			logFile: path.resolve(
				process.env.HOME!,
				"Library/Logs/Unity/Player.log"
			),
			configFile: path.resolve(
				process.env.HOME!,
				"Library/Preferences/Blizzard/Hearthstone/log.config"
			),
		};
	}
	throw new Error("Invalid platform");
};

// The watcher is an event emitter so we can emit events based on what we parse in the log.
export class LogWatcher extends EventEmitter2 {
	gameState = new GameState();

	#options: Options;
	#lastFileSize = 0;
	#watcher: FSWatcher | null;
	#logStream: fs.WriteStream | null = null;
	#linesQueued: string[] = [];

	constructor(options?: Partial<Options>) {
		super();

		const defaultOptions = makeDefaultOptions();
		this.#options = { ...defaultOptions, ...options };

		log(`config file path: ${this.#options.configFile}`);
		if (!fs.existsSync(path.dirname(this.#options.configFile))) {
			throw new Error("Config file path does not exist.");
		}
		fs.copyFileSync(
			path.resolve(__dirname, "../log.config"),
			this.#options.configFile
		);

		log(`log file path: ${this.#options.logFile}`);
		if (!fs.existsSync(path.dirname(this.#options.logFile))) {
			throw new Error("Log file path does not exist.");
		}

		if (this.#options.logDirectory) {
			log(`output log directory: ${this.#options.logDirectory}`);
			fs.mkdirSync(this.#options.logDirectory, { recursive: true });
		}
	}

	start(): void {
		this.gameState.reset();
		log("Log watcher started.");

		this.#watcher = chokidar.watch(this.#options.logFile, {
			persistent: true,
			disableGlobbing: true,
			usePolling: true,
		});
		this.#watcher.on("add", (filePath, stats) => {
			if (stats) {
				this.update(filePath, stats);
			}
		});
		this.#watcher.on("change", (filePath, stats) => {
			if (stats) {
				this.update(filePath, stats);
			}
		});
	}

	stop(): void {
		if (!this.#watcher) {
			return;
		}

		this.#watcher.close();
		this.#watcher = null;
		this.#lastFileSize = 0;
	}

	private update = _.throttle(async (filePath: string, stats: fs.Stats) => {
		const lines = await readLogFile(
			filePath,
			this.#lastFileSize,
			stats.size
		);
		this.#lastFileSize = stats.size;
		if (this.#options.linesPerUpdate) {
			const lineChunks = _.chunk(lines, this.#options.linesPerUpdate);
			for (const chunk of lineChunks) {
				this.parseLines(chunk);
			}
		} else {
			this.parseLines(lines);
		}
	}, 100);

	private parseLines(lines: string[]) {
		let updated = false;
		let lastTurnTime = this.gameState.turnStartTime;

		for (const line of lines) {
			// Run each line through our entire array of line parsers.
			for (const lineParser of lineParsers) {
				lineParser(line, this.gameState);
			}

			// If an update is sent when the turn changes, check so here
			if (
				updated &&
				this.#options.updateEveryTurn &&
				this.gameState.turnStartTime !== lastTurnTime
			) {
				lastTurnTime = this.gameState.turnStartTime;
				this.emit("gamestate-changed", this.gameState);
				updated = false;
			}

			this.outputNewLines(line, this.gameState);
		}

		if (updated) {
			this.emit("gamestate-changed", this.gameState);
		}

		return this.gameState;
	}

	/**
	 * Internal method to potentially write a line to the output log (if enabled).
	 * @param line
	 * @param gameState
	 */
	private outputNewLines(line: string, gameState: GameState) {
		const activeOrComplete = gameState.active || gameState.complete;
		if (!this.#options.logDirectory || !activeOrComplete) {
			return;
		}

		// If there's no file stream and we have enough info to create one, then create one.
		if (
			!this.#logStream &&
			gameState.active &&
			gameState.numPlayers === 2
		) {
			const [player1, player2] = gameState.getAllPlayers();
			const p1name = player1?.name ?? "unknown";
			const p2name = player2?.name ?? "unknown";
			const ext = path.extname(this.#options.logFile);
			const filename = filenamify(
				`${gameState.startTime}_${p1name}_vs_${p2name}${ext}`
			);

			const filepath = path.resolve(this.#options.logDirectory, filename);
			this.#logStream = fs.createWriteStream(path.normalize(filepath));

			this.#logStream.write(this.#linesQueued.join(""));
			this.#linesQueued = [];
		}

		// Write to output log.
		// If we are still waiting for players to load,write to a buffer beforehand.
		// This is because the filename is decided AFTER the file has started.
		if (gameState.active || (gameState.complete && this.#logStream)) {
			if (this.#logStream) {
				this.#logStream.write(line + "\n");
			} else {
				// No file stream, so write to our "buffer"
				this.#linesQueued.push(line + "\n");
			}
		}

		// If the game is complete, close the output stream
		if (gameState.complete && this.#logStream) {
			this.#logStream.end();
			this.#logStream = null;
		}
	}

	/**
	 * testing/debugging purpose only
	 */
	parseBuffer(buffer: Buffer): GameState {
		const lines = splitLines(buffer.toString());
		return this.parseLines(lines);
	}
}
