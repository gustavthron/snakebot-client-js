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

export function* getPossibleMoves(direction: Direction) {
  for (const direction of allDirections) {
    if (areOppositeDirections(direction, direction)) {
      continue;
    }
    yield direction;
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
      for (const direction of getPossibleMoves(snake.direction)) {
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

export class WalkabilityUtil {
  #gameMap: GameMap;
  #walkability: Map<number, number>;

  constructor(gameMap: GameMap, forwardTicks = 0) {
    this.#gameMap = gameMap;
    this.#walkability = new Map<number, number>(); // position -> probability
    const snakesWillGrow = willSnakesGrow(gameMap);
    for (const snake of gameMap.snakes.values()) {
      if (snake.length === 0 || snake.id === gameMap.playerSnake.id) {
        continue;
      }
      // next opponent move walkability
      const snakeHeadCoordinate = snake.headCoordinate;
      const moves = [];
      let foodCount = 0;
      for (const direction of getPossibleMoves(snake.direction)) {
        const moveCoordinate = snakeHeadCoordinate.translateByDirection(direction);
        let movePosition = 0;
        try {
          movePosition = moveCoordinate.toPosition(gameMap.width, gameMap.height);
        } catch {
          continue;
        }
        const tileType = gameMap.tiles.get(movePosition) ?? TileType.Empty;
        if (tileType === TileType.Obstacle || tileType === TileType.Snake) {
          // simple check for now
          this.#walkability.set(movePosition, 0);
          continue;
        } else if (tileType === TileType.Food) {
          foodCount++;
        }
        moves.push(movePosition);
      }
      const noMoveProbability = 1 - 1 / moves.length;
      for (const movePosition of moves) {
        const existingProbability = this.#walkability.get(movePosition) ?? 1;
        this.#walkability.set(movePosition, existingProbability * noMoveProbability);
      }
      // tail walkability
      const growthProbability = snakesWillGrow ? 1 : foodCount / moves.length;
      const tailPosition = snake.coordinates.at(-1)!.toPosition(gameMap.width, gameMap.height);
      const tailWalkability = isTailProtected(snake) ? 0 : 1;
      if (growthProbability === 1) {
        this.#walkability.set(tailPosition, tailWalkability);
      } else {
        this.#walkability.set(tailPosition, tailWalkability * growthProbability);
        this.#walkability.set(
          snake.coordinates.at(-2)!.toPosition(gameMap.width, gameMap.height),
          tailWalkability * (1 - growthProbability),
        );
      }
      // future opponent move walkability
      for (let i = 0; i < forwardTicks; i++) {
        for (const movePosition of moves) {
          const newMoves = [];
          const moveCoordinate = Coordinate.fromPosition(movePosition, gameMap.width);
          for (const direction of getPossibleMoves(moveCoordinate.directionTo(snakeHeadCoordinate))) {
            const newMoveCoordinate = moveCoordinate.translateByDirection(direction);
            let newMovePosition = 0;
            try {
              newMovePosition = newMoveCoordinate.toPosition(gameMap.width, gameMap.height);
            } catch {
              continue;
            }
            const tileType = gameMap.tiles.get(newMovePosition) ?? TileType.Empty;
            if (tileType === TileType.Obstacle || tileType === TileType.Snake) {
              // simple check for now
              this.#walkability.set(newMovePosition, 0);
              continue;
            }
            newMoves.push(newMovePosition);
          }
          const newNoMoveProbability = (1 - 1 / newMoves.length) * this.#walkability.get(movePosition)!;
          for (const newMove of newMoves) {
            const existingProbability = this.#walkability.get(newMove) ?? 1;
            this.#walkability.set(newMove, existingProbability * newNoMoveProbability);
          }
        }
      }
    }
  }

  getWalkability(position: number): number {
    let walkability = this.#walkability.get(position);
    if (walkability === undefined) {
      const tileType = this.#gameMap.tiles.get(position) ?? TileType.Empty;
      if (tileType === TileType.Obstacle || tileType === TileType.Snake) {
        walkability = 0;
      } else {
        walkability = 1;
      }
      this.#walkability.set(position, walkability);
    }
    return walkability;
  }
}
