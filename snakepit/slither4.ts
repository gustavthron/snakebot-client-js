import { Coordinate, GameMap, Snake } from '../src/utils';
import { Direction, TileType } from '../src/types';

const allDirections = Object.values(Direction);

const gameMapArea = 1564;

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
  isHead: boolean;
  isTail: boolean;
  isPlayer: boolean;
}

interface SnakeMoveTile extends SnakeTile {
  direction: Direction;
  moveTileType: TileType;
}

interface SnakeMove {
  snake: Snake;
  isPlayer: boolean;
  snakeMoveTiles: SnakeMoveTile[];
}

interface Exploration {
  walkableArea: number;
  foundOpponentHead: boolean;
}

interface ExplorationCache extends Exploration {
  found: Set<number>;
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
  array: { element: T; priority: number }[] = [];
  unique: boolean;

  constructor(unique = false) {
    this.unique = unique;
  }

  get length(): number {
    return this.array.length;
  }

  enqueue(element: T, priority: number): void {
    let low = 0,
      high = this.array.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.array[mid].priority > priority) low = mid + 1;
      else high = mid;
    }
    const deleteCount = this.unique && low < this.array.length && this.array[low].priority === priority ? 1 : 0;
    this.array.splice(low, deleteCount, { element, priority });
  }

  dequeue(): T | undefined {
    return this.array.pop()?.element;
  }
}

class World {
  gameMap: GameMap;
  tiles: Map<number, Tile>;
  explorations: ExplorationCache[];
  static emptyExploration: Exploration = { walkableArea: 0, foundOpponentHead: false };

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

  explore(startCoordinate: Coordinate, maxArea: number): Exploration {
    let startPosition: number;
    try {
      startPosition = startCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
    } catch {
      return World.emptyExploration;
    }
    const cache = this.explorations.find((e) => e.found.has(startPosition));
    if (cache !== undefined) {
      return { walkableArea: cache.walkableArea, foundOpponentHead: cache.foundOpponentHead };
    }
    const startTile = this.getTile(startPosition, startCoordinate);
    if (!startTile.walkable) {
      return World.emptyExploration;
    }
    const open: Tile[] = [this.getTile(startPosition, startCoordinate)];
    const found = new Set<number>([startPosition]);
    let walkableArea = 0;
    let foundOpponentHead = false;
    while (open.length > 0 && walkableArea <= maxArea) {
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
          } else if (
            !foundOpponentHead &&
            edgeTile.tileType === TileType.Snake &&
            (edgeTile as SnakeTile).isHead &&
            !(edgeTile as SnakeTile).isPlayer
          ) {
            foundOpponentHead = true;
          }
        } catch {
          continue;
        }
      }
    }
    this.explorations.push({ found, walkableArea, foundOpponentHead });
    return { walkableArea, foundOpponentHead };
  }
}

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log(`##############################`);
  console.log(`GameTick ${gameMap.gameTick} direction ${gameMap.playerSnake.direction}`);

  const playerSnaheHeadCoordinate = gameMap.playerSnake.headCoordinate;
  const allDirectionsShuffled: Direction[] = [];
  let foodCount = 0;
  for (const direction of allDirections) {
    if (gameMap.getTileType(playerSnaheHeadCoordinate.translateByDirection(direction)) === TileType.Food) {
      allDirectionsShuffled.push(direction);
      ++foodCount;
    } else {
      const index = Math.floor(Math.random() * (allDirectionsShuffled.length - foodCount + 1));
      allDirectionsShuffled.splice(index, 0, direction);
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
    const isPlayer = snake.id === gameMap.playerId;
    for (const [index, coordinate] of snake.coordinates.entries()) {
      try {
        const position = coordinate.toPosition(gameMap.width, gameMap.height);
        snakeTiles.set(position, {
          position,
          coordinate,
          tileType: TileType.Snake,
          walkable: false,
          snake,
          isHead: false, // NOTE: Set to false because is not head after move.
          isTail: index === tailIndex,
          isPlayer,
        });
      } catch {
        continue;
      }
    }
  }

  // Snake moves
  let singleTilePerMoveCount = 0;
  const allSnakeMoves: SnakeMove[][] = [];
  while (snakesToMove.length > 0) {
    const snake = snakesToMove.dequeue()!;
    const snakeMoveTiles: SnakeMoveTile[] = [];
    const isPlayer = snake.id === gameMap.playerId;
    const headCoordinate = snake.headCoordinate;
    for (const direction of allDirectionsShuffled) {
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
          snake,
          isHead: true,
          isTail: false,
          isPlayer,
        });
      } catch {
        continue;
      }
    }
    const snakeMoves: SnakeMove[] = [];
    if (singleTilePerMoveCount < 4 && snakeMoveTiles.length > 0) {
      ++singleTilePerMoveCount;
      for (const snakeMoveTile of snakeMoveTiles) {
        snakeMoves.push({ snake, isPlayer, snakeMoveTiles: [snakeMoveTile] });
      }
    } else {
      snakeMoves.push({ snake, isPlayer, snakeMoveTiles });
    }
    allSnakeMoves.push(snakeMoves);
  }
  const snakesWillGrow = gameMap.gameTick % 3 === 0;
  const allScenarios = cartesianProduct(allSnakeMoves);
  const directionsExplorations = new Map<Direction, PriorityQueue<Exploration>>();

  let firstAbortCount = 0,
    secondAbortCount = 0;

  for (const scenario of allScenarios) {
    const tiles = new Map<number, Tile>(snakeTiles);
    let abortScenario = false;
    const tailSnakeMoveTiles = new Map<number, SnakeMoveTile>();
    let playerSnakeMoveTile: SnakeMoveTile | null = null;
    for (const snakeMove of scenario) {
      let moveOnFood = false;
      let moveOnTail = false;
      if (snakeMove.isPlayer) {
        if (snakeMove.snakeMoveTiles.length === 1) {
          playerSnakeMoveTile = snakeMove.snakeMoveTiles[0];
        } else {
          console.log('ERROR: Player snake is missing move.');
          break;
        }
      }
      for (const snakeMoveTile of snakeMove.snakeMoveTiles) {
        if (snakeMoveTile.moveTileType === TileType.Snake) {
          moveOnTail = true;
          if (snakesWillGrow) {
            break;
          }
          tailSnakeMoveTiles.set(snakeMoveTile.position, snakeMoveTile);
        } else {
          if (snakeMoveTile.moveTileType === TileType.Food) {
            moveOnFood = true;
          }
          tiles.set(snakeMoveTile.position, snakeMoveTile);
        }
      }
      abortScenario = snakesWillGrow && moveOnTail; // NOTE: If opponents snakes will grow, moves on tail are forbidden.
      if (abortScenario) {
        break;
      }
      const snakeWillGrow = snakesWillGrow || moveOnFood || snakeMove.isPlayer;
      if (!snakeWillGrow) {
        // TODO: Remove isPlayer when bug is fixed
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
      ++firstAbortCount;
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
      ++secondAbortCount;
      continue;
    }

    const world = new World(gameMap, tiles);
    for (const direction of allDirectionsShuffled) {
      if (areOppositeDirections(direction, playerSnakeMoveTile.direction)) {
        continue;
      }
      const startCoordinate = playerSnakeMoveTile.coordinate.translateByDirection(direction);
      const exploration = world.explore(startCoordinate, gameMapArea);
      const explorations =
        directionsExplorations.get(playerSnakeMoveTile.direction) ?? new PriorityQueue<Exploration>(true);
      if (!exploration.foundOpponentHead && exploration.walkableArea === 0) {
        // NOTE: These are not interesting. Because they are 100% unwalkable.
        continue;
      }
      const priority = exploration.foundOpponentHead
        ? exploration.walkableArea
        : exploration.walkableArea + gameMapArea;
      explorations.enqueue(exploration, priority);
      directionsExplorations.set(playerSnakeMoveTile.direction, explorations);
    }
  }

  console.log(
    `first abort ${firstAbortCount} second abort ${secondAbortCount} scenarios ${allScenarios.length} snakeMoves ${allSnakeMoves.length}`,
  );

  for (const [direction, explorations] of directionsExplorations) {
    console.log(`${direction} ${JSON.stringify(explorations.array)}`);
  }

  let nextMoves: Direction[];
  let done: boolean;
  do {
    done = true;
    nextMoves = [];
    let maxWalkableArea = Number.MIN_SAFE_INTEGER;
    for (const [direction, explorations] of directionsExplorations) {
      if (explorations.length !== 1) {
        done = false;
      }
      const exploration = explorations.length === 1 ? explorations.array[0].element : explorations.dequeue();
      console.log(`${direction} ${exploration?.walkableArea}`);
      if (exploration == null) {
        directionsExplorations.delete(direction);
        continue;
      }
      const { walkableArea } = exploration;

      const almostSame =
        walkableArea === maxWalkableArea || (walkableArea > 0 && Math.abs(walkableArea - maxWalkableArea) < 4);
      if (walkableArea < maxWalkableArea) {
        if (almostSame) {
          nextMoves.splice(0, 0, direction);
        } else {
          directionsExplorations.delete(direction);
        }
      } else {
        if (!almostSame) {
          for (const d of nextMoves) {
            directionsExplorations.delete(d);
          }
          nextMoves = [];
        }
        nextMoves.push(direction);
        maxWalkableArea = walkableArea;
      }
    }
  } while (directionsExplorations.size > 1 && !done);

  const nextMove =
    nextMoves.pop() ??
    allDirectionsShuffled.find((d) => !areOppositeDirections(d, gameMap.playerSnake.direction)) ??
    Direction.Up;

  console.log(`Sent: ${gameMap.gameTick} ${nextMove}`);
  return nextMove;
}
