import { Coordinate, GameMap, Snake } from '../src/utils';
import { Direction, TileType } from '../src/types';

const allDirections = Object.values(Direction);

const gameMapArea = 1564;

function getDirectionDelta(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case Direction.Up:
      return { x: 0, y: -1 };
    case Direction.Down:
      return { x: 0, y: 1 };
    case Direction.Left:
      return { x: -1, y: 0 };
    case Direction.Right:
      return { x: 1, y: 0 };
    default:
      throw new Error(`Unknown direction: ${direction}`);
  }
}

function areOppositeDirections(direction1: Direction, direction2: Direction) {
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

interface Tile {
  position: number;
  coordinate: Coordinate;
  tileType: TileType;
  walkable: boolean;
}

interface SnakeTile extends Tile {
  snake: Snake;
  index: number;
  isTail: boolean;
}

interface SnakeMoveTile extends Tile {
  direction: Direction;
  moveTileType: TileType;
}

interface SnakeMove {
  snake: Snake;
  isPlayer: boolean;
  tiles: SnakeMoveTile[];
}

interface Exploration {
  found: Set<number>;
  walkableArea: number;
}

function cartesianProduct<T>(sets: T[][]): T[][] {
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

class PriorityQueue<T> {
  #array: { element: T; priority: number }[] = [];

  get length(): number {
    return this.#array.length;
  }

  enqueue(element: T, priority: number): void {
    let low = 0,
      high = this.#array.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.#array[mid].priority > priority) low = mid + 1;
      else high = mid;
    }
    this.#array.splice(low, 0, { element, priority });
  }

  dequeue(): T | undefined {
    return this.#array.pop()?.element;
  }
}

class World {
  gameMap: GameMap;
  tiles: Map<number, Tile>;
  explorations: Exploration[];

  constructor(gameMap: GameMap, tiles: Map<number, Tile>) {
    this.gameMap = gameMap;
    this.tiles = tiles;
    this.explorations = [];
  }

  getTile(position: number, coordinate: Coordinate): Tile {
    let tile = this.tiles.get(position);
    if (tile === undefined) {
      const tileType = this.gameMap.tiles.get(position) ?? TileType.Empty;
      const walkable = tileType === TileType.Empty || tileType === TileType.Food;
      tile = { position, coordinate, tileType, walkable };
      this.tiles.set(position, tile);
    }
    return tile;
  }

  explore(startCoordinate: Coordinate, max: number): number {
    let startPosition: number;
    try {
      startPosition = startCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
    } catch {
      return 0;
    }
    const cache = this.explorations.find((e) => e.found.has(startPosition));
    if (cache !== undefined) {
      return cache.walkableArea;
    }
    const startTile = this.getTile(startPosition, startCoordinate);
    if (!startTile.walkable) {
      return 0;
    }
    const open: Tile[] = [this.getTile(startPosition, startCoordinate)];
    const found = new Set<number>([startPosition]);
    let walkableArea = 0;
    while (open.length > 0 && walkableArea <= max) {
      const tile = open.pop();
      if (tile === undefined) {
        throw new Error('Bug: Could not find tile');
      }
      ++walkableArea;
      for (const direction of allDirections) {
        const edgeCoordinate = tile.coordinate.translateByDirection(direction);
        try {
          const edgePosition = edgeCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
          if (found.has(edgePosition)) {
            continue;
          }
          found.add(edgePosition);
          const edgeTile = this.getTile(edgePosition, edgeCoordinate);
          if (edgeTile.walkable) {
            open.push(edgeTile);
          }
        } catch {
          continue;
        }
      }
    }
    const exploration: Exploration = { found, walkableArea };
    this.explorations.push(exploration);
    return walkableArea;
  }
}

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log(`##############################`);
  console.log(`Got: ${gameMap.gameTick}`);

  const possibleDirections: Direction[] = [];
  for (const direction of allDirections) {
    const index = Math.floor(Math.random() * (possibleDirections.length + 1));
    if (!areOppositeDirections(direction, gameMap.playerSnake.direction)) {
      possibleDirections.splice(index, 0, direction);
    }
  }

  const snakesToMove = new PriorityQueue<Snake>();

  // Snake tiles
  const snakeTiles = new Map<number, SnakeTile>();
  for (const snake of gameMap.snakes.values()) {
    if (snake.length === 0) {
      continue;
    }
    snakesToMove.enqueue(snake, snake.headCoordinate.manhattanDistanceTo(gameMap.playerSnake.headCoordinate));
    const tailIndex = snake.length - 1;
    for (const [index, coordinate] of snake.coordinates.entries()) {
      try {
        const position = coordinate.toPosition(gameMap.width, gameMap.height);
        snakeTiles.set(position, {
          position,
          coordinate,
          tileType: TileType.Snake,
          walkable: false,
          snake,
          index,
          isTail: index === tailIndex,
        });
      } catch {
        continue;
      }
    }
  }

  // Snake moves
  let singleTilePerMoveCount = 0;
  const allPlayersSnakeMoves: SnakeMove[][] = [];
  for (const snake of gameMap.snakes.values()) {
    if (snake.length === 0) {
      continue;
    }
    const headCoordinate = snake.headCoordinate;
    const snakeMoveTiles: SnakeMoveTile[] = [];
    for (const direction of allDirections) {
      if (areOppositeDirections(direction, snake.direction)) {
        continue;
      }
      try {
        const coordinate = headCoordinate.translateByDirection(direction);
        const position = coordinate.toPosition(gameMap.width, gameMap.height);
        const moveTileType = gameMap.tiles.get(position) ?? TileType.Empty;
        if (
          moveTileType === TileType.Obstacle ||
          (moveTileType === TileType.Snake && !snakeTiles.get(position)!.isTail)
        ) {
          continue;
        }
        snakeMoveTiles.push({
          position,
          coordinate,
          tileType: TileType.Snake,
          walkable: false,
          direction,
          moveTileType,
        });
      } catch {
        continue;
      }
    }
    const isPlayer = snake.id === gameMap.playerId;
    const snakeMoves: SnakeMove[] = [];
    if (singleTilePerMoveCount < 4) {
      ++singleTilePerMoveCount;
      for (const snakeMoveTile of snakeMoveTiles) {
        snakeMoves.push({ snake, isPlayer, tiles: [snakeMoveTile] });
      }
    } else {
      snakeMoves.push({ snake, isPlayer, tiles: snakeMoveTiles });
    }
    if (snakeMoves.length > 0) {
      allPlayersSnakeMoves.push(snakeMoves);
    }
  }
  const snakesWillGrow = gameMap.gameTick % 3 === 0;
  const allScenarios = cartesianProduct(allPlayersSnakeMoves);
  const directionsMinWalkableArea = new Map<Direction, number | null>(
    possibleDirections.map((direction) => [direction, null]),
  );

  let countAbortion1 = 0,
    countAbortion2 = 0;

  for (const scenario of allScenarios) {
    const tiles = new Map<number, Tile>(snakeTiles);
    let abortScenario = false;
    const tailSnakeMoveTiles = new Map<number, SnakeMoveTile>();
    let playerSnakeMoveTile: SnakeMoveTile | null = null;
    for (const snakeMove of scenario) {
      let snakeWillGrow = snakesWillGrow || snakeMove.isPlayer; // TODO: Remove when bug is fixed
      let moveOnTail = false;
      for (const snakeMoveTile of snakeMove.tiles) {
        if (snakeMoveTile.moveTileType === TileType.Snake) {
          moveOnTail = true;
          if (snakeWillGrow) {
            break;
          }
          tailSnakeMoveTiles.set(snakeMoveTile.position, snakeMoveTile);
        } else {
          if (snakeMoveTile.moveTileType === TileType.Food) {
            snakeWillGrow = true;
          }
          tiles.set(snakeMoveTile.position, snakeMoveTile);
        }
        if (snakeMove.isPlayer) {
          playerSnakeMoveTile = snakeMoveTile;
        }
      }
      abortScenario = snakeWillGrow && moveOnTail;
      if (abortScenario) {
        break;
      }
      if (!snakeWillGrow) {
        try {
          const coordinate = snakeMove.snake.coordinates[snakeMove.snake.length - 1];
          const position = coordinate.toPosition(gameMap.width, gameMap.height);
          tiles.set(position, {
            position,
            coordinate,
            tileType: TileType.Empty,
            walkable: true,
          });
        } catch {
          console.error('ERROR: Could not get tail Coordinate.');
        }
      }
    }

    if (abortScenario) {
      ++countAbortion1;
      continue;
    }

    if (playerSnakeMoveTile === null) {
      console.error('ERROR: Could not find player move.');
      continue;
    }

    while (!abortScenario && tailSnakeMoveTiles.size > 0) {
      abortScenario = true;
      for (const snakeMove of tailSnakeMoveTiles.values()) {
        const tile = tiles.get(snakeMove.position);
        if (tile === undefined || tile.walkable) {
          tailSnakeMoveTiles.delete(snakeMove.position);
          tiles.set(snakeMove.position, snakeMove);
          abortScenario = false;
        }
      }
    }

    if (abortScenario) {
      ++countAbortion2;
      continue;
    }

    const world = new World(gameMap, tiles);
    for (const direction of allDirections) {
      if (areOppositeDirections(direction, playerSnakeMoveTile.direction)) {
        continue;
      }
      const startCoordinate = playerSnakeMoveTile.coordinate.translateByDirection(direction);
      const minWalkableArea = directionsMinWalkableArea.get(playerSnakeMoveTile.direction);
      const walkableArea = world.explore(startCoordinate, minWalkableArea ?? gameMapArea);
      if (minWalkableArea == null || walkableArea < minWalkableArea) {
        directionsMinWalkableArea.set(playerSnakeMoveTile.direction, walkableArea);
      }
    }
  }

  console.log(`First: ${countAbortion1}, Second: ${countAbortion2}, scenarios ${allScenarios.length}`);

  let nextMove = possibleDirections[0];
  let maxWalkableArea = -1;
  for (const [direction, minWalkableArea] of directionsMinWalkableArea) {
    console.log(`${direction} ${minWalkableArea}`);
    if (minWalkableArea != null && minWalkableArea > maxWalkableArea) {
      nextMove = direction;
      maxWalkableArea = minWalkableArea;
    }
  }
  console.log(`Sent: ${gameMap.gameTick} ${nextMove}`);
  return nextMove;
}
