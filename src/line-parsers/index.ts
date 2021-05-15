import { CardInitParser } from "./card-init";
import { DiscoveryParser } from "./discovery";
import { MatchLogParser } from "./match-log";

export const lineParsers = [
	new MatchLogParser(),
	new DiscoveryParser(),
	new CardInitParser(),
];
