import paint from './palette';
import { createLogger, format, transports } from 'winston';
import { MapUpdateEventMessage } from '../src/types_messages';

const CONSOLE_LEVEL = 'info';

export const logger = createLogger({
  format: format.printf(({ message }) => {
    if (typeof message === 'string') {
      return message;
    }
    return JSON.stringify(message, null, 2);
  }),
  transports: [
    new transports.File({ filename: `${Date.now()}.log` }),
    new transports.Console({ level: CONSOLE_LEVEL }),
  ],
});

const TILE = '  ';

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function paintGameMap({ map, receivingPlayerId, gameId, gameTick }: MapUpdateEventMessage, console = true) {
  const newGame = gameTick === 0;
  const tiles = new Map<number, string>();
  for (const f of map.foodPositions) {
    tiles.set(f, colors.bgYellow(TILE));
  }
  for (const o of map.obstaclePositions) {
    tiles.set(o, colors.bgRed(TILE));
  }
  for (const [i, s] of map.snakeInfos.entries()) {
    const isPlayer = s.id === receivingPlayerId;
    let first = true;
    let tile = isPlayer ? colors.bgBlue(':)') : colors.bgGreen(':(');
    for (const p of s.positions) {
      tiles.set(p, tile);
      if (first) {
        tile = isPlayer ? colors.bgBlue.red('▒▒') : colors.bgGreen('░░');
        first = false;
      }
    }
  }
  let res = '';
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = (x % 2) + (y % 2) === 1 ? '░░' : '  ';
      const position = x + y * map.width;
      res += tiles.get(position) ?? tile;
    }
    res += '\n';
  }
  //logger.log(console ? CONSOLE_LEVEL : 'silly', res);
}
