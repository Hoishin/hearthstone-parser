import fs from "fs";

import splitLines from "split-lines";

export const readLogFile = async (
	filePath: string,
	startByte: number,
	endByte: number
): Promise<string[]> => {
	let readSize = endByte - startByte;
	if (readSize < 0) {
		readSize = endByte;
	}
	const buffer = Buffer.alloc(readSize);
	const file = await fs.promises.open(filePath, "r");
	await fs.promises.read(file, buffer, 0, readSize, startByte);
	await file.close();
	return splitLines(buffer.toString());
};
