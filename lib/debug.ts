import palette, { Brush } from './palette';
import { Direction, TileType } from '../src/types';
import { Coordinate, GameMap } from '../src/utils';

interface GetNextMoveFn {
  (gameMap: GameMap): Promise<Direction>;
}

export function timeGetNextMove(getNextMove: GetNextMoveFn): GetNextMoveFn {
  return async function (gameMap) {
    console.time(`getNextMove${gameMap.gameTick}`);
    const nextMove = await getNextMove(gameMap);
    console.timeEnd(`getNextMove${gameMap.gameTick}`);
    return nextMove;
  };
}

export function paceCheckGetNextMove(getNextMove: GetNextMoveFn): GetNextMoveFn {
  let lastGameTick = -1;
  return async function (gameMap) {
    if (lastGameTick !== gameMap.gameTick - 1) {
      console.warn('Out of pace');
    }
    const nextMove = await getNextMove(gameMap);
    lastGameTick = gameMap.gameTick;
    return nextMove;
  };
}

export class GameMapCanvas {
  width: number;
  height: number;
  tiles: Map<number, Brush>;

  constructor(gameMap: GameMap) {
    this.tiles = new Map<number, Brush>();
    this.width = gameMap.width;
    this.height = gameMap.height;
    const playerSnakePositions = new Set(
      gameMap.playerSnake.coordinates.map((c) => c.toPosition(this.width, this.height)),
    );
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const coordinate = new Coordinate(x, y);
        const position = coordinate.toPosition(this.width, this.height);
        let tile: Brush;
        switch (gameMap.getTileType(coordinate)) {
          case TileType.Empty:
            tile = (x % 2) + (y % 2) === 1 ? palette.black.light.white : palette.white.dark.black;
            break;
          case TileType.Food:
            tile = palette.black.light.yellow;
            break;
          case TileType.Obstacle:
            tile = palette.black.light.red;
            break;
          case TileType.Snake:
            tile = playerSnakePositions.has(position) ? palette.green : palette.cyan;
            break;
          default:
            throw new Error('Unknown tile type');
        }
        this.tiles.set(position, tile);
      }
    }
  }

  paint(): void {
    let output = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const coordinate = new Coordinate(x, y);
        const position = coordinate.toPosition(this.width, this.height);
        const brush = this.tiles.get(position);
        if (brush) {
          output += brush();
        }
      }
      output += '\n';
    }
    console.log(output);
  }
}
