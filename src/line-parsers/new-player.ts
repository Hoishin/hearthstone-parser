import {AbstractLineParser} from './AbstractLineParser';
import {GameState} from '../GameState';

// Check for players entering play and track their team IDs.
export class NewPlayerLineParser extends AbstractLineParser {
	regex = /\[Power\] GameState\.DebugPrintGame\(\) - PlayerID=(\d), PlayerName=(.*)$/;
	eventName = 'player-joined';

	lineMatched(parts: string[], gameState: GameState) {
		gameState.addPlayer({
			id: parseInt(parts[1], 10),
			name: parts[2],
			status: '',
			turn: false
		});
	}

	formatLogMessage(parts: string[], _gameState: GameState) {
		return `Player "${parts[2]}" has joined (ID: ${parseInt(parts[1], 10)}).`;
	}

	shouldEmit(_gameState: GameState) {
		return true;
	}
}
