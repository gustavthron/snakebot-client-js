import { Direction, TileType } from '../src/types';
import { Coordinate, GameMap, Snake } from '../src/utils';

export const allDirections = Object.values(Direction);

export class PriorityQueue<T> {
  #array: { element: T; priority: number }[] = [];

  get length(): number {
    return this.#array.length;
  }

  enqueue(element: T, priority: number): void {
    let low = 0,
      high = this.#array.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.#array[mid].priority < priority) low = mid + 1;
      else high = mid;
    }
    this.#array.splice(low, 0, { element, priority });
  }

  dequeue(): T | undefined {
    return this.#array.pop()?.element;
  }
}

export function areOppositeDirections(direction1: Direction, direction2: Direction) {
  switch (direction1) {
    case Direction.Up:
      return direction2 === Direction.Down;
    case Direction.Down:
      return direction2 === Direction.Up;
    case Direction.Left:
      return direction2 === Direction.Right;
    case Direction.Right:
      return direction2 === Direction.Left;
    default:
      throw new Error(`Unknown direction: ${direction1}`);
  }
}

export function cartesianProduct<T>(sets: T[][]): T[][] {
  if (sets.length === 0) {
    return [];
  }
  let res: T[][] = [[]];
  for (const s1 of sets) {
    const tmp: T[][] = [];
    for (const e of s1) {
      for (const s2 of res) {
        tmp.push([e, ...s2]);
      }
    }
    res = tmp;
  }
  return res;
}

export function willSnakesGrow(gameMap: GameMap) {
  return gameMap.gameTick % 3 === 0;
}

export function isTailProtected(snake: Snake) {
  return snake.tailProtectedForGameTicks > 0;
}

export interface Tile {
  position: number;
  coordinate: Coordinate;
  tileType: TileType;
  predictions: Prediction[];
}

export interface SnakeTile extends Tile {
  snake: Snake | undefined;
  tileType: TileType.Snake;
  isTail: boolean;
}

export interface Prediction {
  probability: number;
  tileType: TileType;
}

export interface MovePrediction extends Prediction {
  snake: Snake;
  tileType: TileType.Snake;
  path: number[];
  isTail: boolean;
}

export class GameMapUtil {
  gameMap: GameMap;
  tiles: Map<number, Tile>;
  width: number;
  height: number;
  snakesWillGrow: boolean;

  constructor(gameMap: GameMap) {
    this.gameMap = gameMap;
    this.tiles = new Map<number, Tile>();
    this.width = gameMap.width;
    this.height = gameMap.height;
    this.snakesWillGrow = willSnakesGrow(gameMap);
    this.#loadTails();
    this.#loadHeadPredictions();
  }

  #loadTails() {
    for (const snake of this.gameMap.snakes.values()) {
      if (snake.length === 0) {
        continue;
      }
      const tailTile = this.getSnakeTile(snake, -1); // creates the tail tile if it doesn't exist
      if (this.snakesWillGrow) {
        continue;
      }
      // create tail move predictions
      tailTile.predictions.push({ probability: 1, tileType: TileType.Empty });
      const tailPrediction: MovePrediction = {
        probability: 1,
        tileType: TileType.Snake,
        snake,
        path: [tailTile.position],
        isTail: true,
      };
      const tailPredictionTile = this.getSnakeTile(snake, -2);
      tailPredictionTile.predictions.push(tailPrediction);
    }
  }

  // must not run before #loadTails()
  #loadHeadPredictions() {
    for (const snake of this.gameMap.snakes.values()) {
      if (snake.length === 0 || snake.id === this.gameMap.playerId) {
        continue;
      }
      const headCoordinate = snake.headCoordinate;
      const moveTiles: Tile[] = [];
      let foodCount = 0;
      for (const direction of allDirections) {
        if (areOppositeDirections(direction, snake.direction)) {
          continue;
        }
        try {
          const tile = this.getTileByCoordinate(headCoordinate.translateByDirection(direction));
          if (tile.tileType === TileType.Snake) {
            const snakeTile = tile as SnakeTile;
            // simplified logic: opponents will only walk on snake tiles that are tails and when that tail will move.
            if (this.snakesWillGrow || !snakeTile.isTail) {
              continue;
            }
          } else if (tile.tileType === TileType.Food) {
            foodCount++;
          } else if (tile.tileType === TileType.Obstacle) {
            continue;
          }
          moveTiles.push(tile);
        } catch {
          continue;
        }
      }
      if (moveTiles.length === 0) {
        continue;
      }
      const moveProbability = 1 / moveTiles.length;
      for (const tile of moveTiles) {
        const prediction: MovePrediction = {
          probability: moveProbability,
          tileType: TileType.Snake,
          snake,
          path: [tile.position],
          isTail: false,
        };
        tile.predictions.push(prediction);
      }
      if (this.snakesWillGrow || foodCount === 0) {
        continue;
      }
      // fix tail move prediction
      const tailMoveProvability = 1 - 1 / foodCount;
      const tailTile = this.getSnakeTile(snake, -1);
      tailTile.predictions.find((p) => p.tileType === TileType.Empty)!.probability = tailMoveProvability;
      const tailPredictionTile = this.getSnakeTile(snake, -2);
      tailPredictionTile.predictions.find(
        (p) => p.tileType === TileType.Snake && (p as MovePrediction).snake.id === snake.id,
      )!.probability = tailMoveProvability;
    }
  }

  getTile(position: number, coordinate?: Coordinate): Tile {
    let tile = this.tiles.get(position);
    if (tile === undefined) {
      coordinate ??= Coordinate.fromPosition(position, this.width);
      const tileType = this.gameMap.tiles.get(position) ?? TileType.Empty;
      if (tileType === TileType.Snake) {
        const snakeTile: SnakeTile = {
          position,
          coordinate,
          tileType: TileType.Snake,
          snake: undefined,
          isTail: false,
          predictions: [],
        };
        tile = snakeTile;
      } else {
        tile = { position, coordinate, tileType, predictions: [] };
      }
      this.tiles.set(position, tile);
    }
    return tile;
  }

  getTileByCoordinate(coordinate: Coordinate): Tile {
    const position = coordinate.toPosition(this.width, this.height);
    return this.getTile(position, coordinate);
  }

  getSnakeTile(snake: Snake, index: number): SnakeTile {
    const coordinate = snake.coordinates.at(index);
    if (coordinate === undefined) {
      throw new Error('Could not find snake tile.');
    }
    const position = coordinate.toPosition(this.width, this.height);
    let tile = this.tiles.get(position);
    if (tile === undefined) {
      const snakeTile: SnakeTile = {
        position,
        coordinate,
        tileType: TileType.Snake,
        snake,
        isTail: index === snake.length - 1,
        predictions: [],
      };
      tile = snakeTile;
      this.tiles.set(position, tile);
    }
    return tile as SnakeTile;
  }

  getNeighborTiles(coordinate: Coordinate): Tile[] {
    const tiles: Tile[] = [];
    for (const direction of allDirections) {
      try {
        tiles.push(this.getTileByCoordinate(coordinate.translateByDirection(direction)));
      } catch {
        continue;
      }
    }
    return tiles;
  }
}
