import _ from "lodash";

import cardData from "../data/cards";
import { DECK_CARD_COUNT } from "../data/meta";
import { questMap } from "../data/quests";
import { secretToClass } from "../data/secrets";
import { newPlayer, putCards } from "../game-state";

import { Team, unknownPlayerName, Zone } from "./consts";
import { blockParserFactory, label, lineParserFactory } from "./factory";

export const lineParsers = [
	lineParserFactory({
		name: "game-start",
		label: label.Power.GameState.DebugPrintPower,
		regex: /CREATE_GAME/,
		matchesHandler: (_, gameState, logger) => {
			gameState.start();
			logger.log("A new game has started.");
			return true;
		},
	}),
	lineParserFactory({
		name: "player-joined",
		label: label.Power.GameState.DebugPrintPower,
		regex: /PlayerID=(?<id>\d+), PlayerName=(?<name>.+)$/,
		matchesHandler: (groups, gameState, logger) => {
			const id = parseInt(groups.id);
			const name = groups.name;
			const existingPlayer = gameState.getPlayerById(id);
			if (existingPlayer) {
				if (existingPlayer.name === unknownPlayerName) {
					existingPlayer.name = name;
					return true;
				}
				return false;
			}
			if (gameState.players.length === 2) {
				return false;
			}
			gameState.players.push(newPlayer(id, name));
			logger.log(`Player "${name}" has joined (ID: ${id})`);
			return true;
		},
	}),
	lineParserFactory({
		name: "mulligan-start",
		label: label.Power.GameState.DebugPrintPower,
		regex: /tag=MULLIGAN_STATE value=INPUT/,
		matchesHandler: (_, gameState, logger) => {
			gameState.mulliganActive = true;
			logger.log("Mulligan has started.");
			return true;
		},
	}),
	lineParserFactory({
		name: "mulligan-result",
		label: label.Power.GameState.DebugPrintEntitiesChosen,
		regex: /id=\d+ Player=(?<name>.+) EntitiesCount=(?<cardsLeft>\d+)/,
		matchesHandler: (groups, gameState, logger) => {
			if (!gameState.mulliganActive) {
				return false;
			}
			const name = groups.name;
			const cardsLeft = parseInt(groups.cardsLeft, 10);
			const player = gameState.getPlayerByName(name);
			if (!player) {
				return false;
			}
			player.cardsReplacedInMulligan =
				DECK_CARD_COUNT - player.cardCount - cardsLeft;
			logger.log(
				`${player.name} replaced ${player.cardsReplacedInMulligan} cards during mulligan`
			);
			return true;
		},
	}),
	lineParserFactory({
		name: "turn-change",
		label: label.Power.GameState.DebugPrintPower,
		regex: /TAG_CHANGE Entity=(?<playerName>.*) tag=CURRENT_PLAYER value=(?<turn>\d+)/,
		matchesHandler: (groups, gameState, logger) => {
			const player = gameState.getPlayerByName(groups.playerName);
			if (!player) {
				return false;
			}
			player.turn = groups.turn === "1";
			const opponent = gameState.getOpponentPlayer(player);
			if (opponent) {
				opponent.turn = !player.turn;
			}
			if (player.turn) {
				player.turnHistory.push({ startTime: Date.now() });
			} else {
				const lastTurn = _.last(player.turnHistory);
				if (lastTurn) {
					lastTurn.duration = Date.now() - lastTurn.startTime;
				}
			}
			logger.log(
				`${player.name}'s turn has ${player.turn ? "begun" : "ended"}`
			);
			return true;
		},
	}),
	lineParserFactory({
		name: "game-over",
		label: label.Power.PowerTaskList.DebugPrintPower,
		regex: /TAG_CHANGE Entity=(?<playerName>.+) tag=PLAYSTATE value=(?<status>LOST|WON|TIED)/,
		matchesHandler: (groups, gameState, logger) => {
			if (!groups) {
				return false;
			}
			const player = gameState.getPlayerByName(groups.playerName);
			const status = groups.status;
			if (
				player &&
				(status === "WON" || status === "LOST" || status === "TIED")
			) {
				player.status = status;
			}
			gameState.gameOverCount += 1;
			if (gameState.gameOverCount >= 2) {
				const currentPlayer = gameState.players.find((p) => p.turn);
				if (currentPlayer) {
					const lastTurn = _.last(currentPlayer.turnHistory);
					if (lastTurn) {
						lastTurn.duration = Date.now() - lastTurn.startTime;
					}
				}
				gameState.matchDuration = Date.now() - gameState.startTime;
			}
			logger.log("Game has ended.");
			return true;
		},
	}),
	lineParserFactory({
		name: "zone-change",
		label: label.Zone.ZoneChangeList.ProcessChanges,
		regex: /id=\d* local=.* \[entityName=(?<entityName>.*) id=(?<entityId>\d*) zone=.* zonePos=\d* cardId=(?<cardId>.*) player=(?<playerId>\d)\] zone from ?(?<fromTeam>FRIENDLY|OPPOSING)? ?(?<fromZone>.*)? -> ?(?<toTeam>FRIENDLY|OPPOSING)? ?(?<toZone>.*)?/,
		matchesHandler: (groups, gameState, logger) => {
			if (!groups) {
				return false;
			}
			const { cardId } = groups;
			const cardName = groups.entityName;
			const playerId = parseInt(groups.playerId);
			const entityId = parseInt(groups.entityId);
			const from = {
				team: groups.fromTeam as Team,
				zone: groups.fromZone as Zone,
			};
			const to = {
				team: groups.toTeam as Team,
				zone: groups.toZone as Zone,
			};

			const cardRawData = cardData[cardId];
			if (!cardRawData) {
				logger.log(`Cannot find card ${cardId}`);
				return false;
			}
			const cardDbfId = cardRawData.dbfId;

			// TODO: Update entity info
			// gameState.resolveEntity({...data, cardId: cardRawData?.dbfId});

			const player = gameState.getPlayerById(playerId);
			if (!player) {
				return false;
			}
			const opponentPlayer = gameState.getOpponentPlayer(player);
			if (!opponentPlayer) {
				return false;
			}

			if (
				gameState.mulliganActive &&
				(to.zone === Zone.Hand || to.zone === Zone.Deck)
			) {
				if (to.team === Team.Friendly) {
					player.position = "bottom";
					opponentPlayer.position = "top";
				}
				if (to.team === Team.Opposing) {
					player.position = "top";
					opponentPlayer.position = "bottom";
				}
			}

			const fromPlayer = gameState.getPlayerByTeam(from.team);
			if (fromPlayer) {
				if (from.zone === Zone.Deck || from.zone === Zone.Hand) {
					putCards(fromPlayer.cards, {
						entityId,
						state: "OTHERS",
						cardId: cardDbfId,
						cardName,
					});
				}
				if (from.zone === Zone.Deck) {
					fromPlayer.cardCount -= 1;
				}
				if (from.zone === Zone.Secret) {
					if (questMap.has(cardId)) {
						fromPlayer.quests = fromPlayer.quests.filter(
							(quest) => quest.entityId !== entityId
						);
					}
					if (secretToClass[cardId]) {
						fromPlayer.secrets = fromPlayer.secrets.filter(
							(secret) => secret.entityId !== entityId
						);
					}
				}
			}

			const toPlayer = gameState.getPlayerByTeam(to.team);
			if (toPlayer) {
				if (to.zone === Zone.Deck || to.zone === Zone.Hand) {
					putCards(toPlayer.cards, {
						entityId,
						state: to.zone,
						cardId: cardDbfId,
						cardName,
						isSpawnedCard: !gameState.mulliganActive,
					});
				}
				if (to.zone === Zone.Deck) {
					toPlayer.cardCount += 1;
				}
				if (to.zone === Zone.Secret) {
					const quest = questMap.get(cardId);
					if (quest) {
						toPlayer.quests.push({
							...quest,
							entityId,
							cardName,
							progress: 0,
							timestamp: Date.now(),
						});
					}
					const secretClass = secretToClass[cardId];
					if (secretClass) {
						toPlayer.secrets.push({
							entityId,
							cardId,
							cardClass: secretClass,
							cardName,
							timestamp: Date.now(),
						});
					}
				}
			}

			logger.log(
				`${cardName} moved from ${from.team}'s ${from.zone} to ${to.team}'s ${to.zone}`
			);

			return true;
		},
	}),
	lineParserFactory({
		name: "tag-change",
		label: label.Power.PowerTaskList.DebugPrintPower,
		regex: /TAG_CHANGE Entity=\[entityName=(?<cardName>.*) id=(?<entityId>\d*) zone=.* zonePos=\d* cardId=(?<cardId>.*) player=(?<playerId>\d)\] tag=(?<tag>.*) value=(?<value>\d*)/,
		matchesHandler: (groups, gameState, logger) => {
			if (!groups) {
				return false;
			}

			const { tag, value, cardName } = groups;
			const playerId = parseInt(groups.playerId);
			const entityId = parseInt(groups.entityId);

			if (tag === "QUEST_PROGRESS") {
				const player = gameState.getPlayerById(playerId);
				if (player) {
					const quest = player.quests.find(
						(q) => q.entityId === entityId
					);
					if (quest) {
						quest.progress = parseInt(value);
						return true;
					}
				}
			}
			logger.log(
				`Tag ${tag} of player ${playerId}'s ${cardName} is set to ${value}`
			);
			return false;
		},
	}),
	lineParserFactory({
		name: "game-tag-change",
		label: label.Power.PowerTaskList.DebugPrintPower,
		regex: /TAG_CHANGE Entity=(?<entity>.*) tag=(?<tag>.*) value=(?<value>.*)/,
		matchesHandler: (groups, gameState, logger) => {
			if (!groups) {
				return false;
			}
			const { entity, tag, value } = groups;

			if (entity === "GameEntity") {
				if (tag === "NEXT_STEP" && value === "MAIN_READY") {
					gameState.mulliganActive = true;
				}
				if (tag === "STEP" && value === "MAIN_READY") {
					gameState.turnStartTime = new Date();
					if (gameState.players.every((player) => !player.turn)) {
						const bottom = gameState.getPlayerByPosition("bottom");
						if (bottom) {
							bottom.turn = true;
						}
					}
				}
			}

			if (tag === "TIMEOUT") {
				const timeout = parseInt(value);
				const player = gameState.getPlayerByName(entity);
				if (player) {
					player.timeout = timeout;
				}
			}

			if (tag === "MULLIGAN_STATE" && value === "INPUT") {
				gameState.mulliganActive = true;
			}

			if (tag === "RESOURCES") {
				const player = gameState.getPlayerByName(entity);
				if (player) {
					player.availableMana = parseInt(value, 10);
				}
			}

			logger.log(`Tag ${tag} of ${entity} is set to ${value}`);

			return true;
		},
	}),
	lineParserFactory({
		name: "past-begin-phase",
		label: label.LoadingScreen.MulliganManager.HandleGameStart,
		regex: /IsPastBeginPhase\(\)=False/,
		matchesHandler: (_, gameState) => {
			gameState.beginPhaseActive = false;
			return true;
		},
	}),
	blockParserFactory({
		name: "card-init",
		label: label.Power.GameState.DebugPrintPower,
		startRegex: /FULL_ENTITY - Creating ID=(?<entityId>\d+) CardID=(?<cardId>.+)/,
		initializeBlockState: (groups, gameState) => {
			if (!gameState.active || !gameState.beginPhaseActive) {
				return;
			}
			return {
				entityId: groups.entityId,
				cardId: groups.cardId,
			};
		},
		blockLineParsers: [
			{
				regex: /tag=(?<tag>.+) value=(?<value>.*)/,
				handler: (groups, gameState, blockState) => {
					console.log(groups, gameState, blockState);
				},
			},
		],
	}),
];
