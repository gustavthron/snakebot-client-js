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
  tileType: TileType.Snake;
  snake: Snake;
  isHead: boolean;
  isTail: boolean;
  isPlayer: boolean;
  isCertain: boolean;
}

interface SnakeMove extends SnakeTile {
  snake: Snake;
  direction: Direction;
  collisionTileType: TileType;
  willGrow: boolean;
}

interface ExplorationCache {
  found: Set<number>;
  walkableArea: number;
}

function cartesianProduct<T>(sets: T[][]): T[][] {
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

  constructor(uniqueImmutable = false) {
    this.unique = uniqueImmutable;
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
    if (this.unique && low < this.array.length && this.array[low].priority === priority) {
      return;
    }
    this.array.splice(low, 0, { element, priority });
  }

  dequeue(): T | undefined {
    return this.array.pop()?.element;
  }
}

class World {
  gameMap: GameMap;
  tiles: Map<number, Tile>;
  explorations: ExplorationCache[];

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

  explore(startCoordinate: Coordinate, maxArea: number): number {
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
          }
        } catch {
          continue;
        }
      }
    }
    this.explorations.push({ found, walkableArea });
    return walkableArea;
  }
}

/**
 * Generate snake tiles with tail tiles with uncertain walkability if all snakes will not grow.
 * Generate moves for each snake but skip moves that are certain to be unwalkable.
 * For the player snake, save the moves for analysing.
 * For snakes with less than 2 moves, apply the move with certainty that they will happen. That includes making the tails walkability certain and setting their walkability based on if it will move or not.
 * For the 2 first snakes with more than 1 move, save the moves for the scenarios.
 * For the rest of the snakes with more than 1 move, apply the moves with uncertainty. That includes making the tails walkability certain if all moves will lead to growth or no growth and setting their walkability based on if it will move or not.
 * Generate all scenarios based on unapplied moves.
 *
 * The base tiles used for each scenario includes all snake tiles and applied moves and their certainty and walkability depend on:
 *   If all snakes will grow:
 *     Tiles from snakes with multiple applied moves will be uncertain.
 *     Rest of the tiles will be certain.
 *     All snake tiles will be unwalkable.
 *   If no or some snakes will grow:
 *     Tiles from snakes with multiple applied moves will be uncertain.
 *     Tail tiles from snakes with multiple applied moves could be anything.
 *     Tiles from snakes with one applied move will be certain.
 *     Tail tiles from snakes with one applid move will be certain but can be either walkable or non walkable.
 *     Player tail tile will be uncertain and walkable.
 *
 *     Opponent snake tiles
 * Iterate the scenarios:
 *   Iterate the opponent moves:
 *     If a move collides with a snake and it is certain to move
 *   Apply
 */
export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log(`##############################`);
  console.log(`GameTick ${gameMap.gameTick} direction ${gameMap.playerSnake.direction}`);

  const snakesWillGrow = gameMap.gameTick % 3 === 0;

  const playerSnaheHeadCoordinate = gameMap.playerSnake.headCoordinate;
  const allDirectionsShuffled: Direction[] = [];
  let foodCount = 0;
  for (const direction of allDirections) {
    if (gameMap.getTileType(playerSnaheHeadCoordinate.translateByDirection(direction)) === TileType.Food) {
      allDirectionsShuffled.splice(0, 0, direction);
      ++foodCount;
    } else {
      const index = Math.floor(Math.random() * (allDirectionsShuffled.length - foodCount + 1));
      allDirectionsShuffled.splice(index + foodCount, 0, direction);
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
        const isTail = index === tailIndex;
        const isCertain = !isTail || snakesWillGrow;
        snakeTiles.set(position, {
          position,
          coordinate,
          tileType: TileType.Snake,
          walkable: !isCertain,
          snake,
          isHead: index === 0, // NOTE: Set to false because is not head after move.
          isTail,
          isPlayer,
          isCertain: isCertain,
        });
      } catch {
        continue;
      }
    }
  }

  // Snake moves
  let playerSnakeMoves: SnakeMove[] = [];
  let opponentsMovesGeneratedCounter = 0;
  const opponentSnakeMoves: SnakeMove[][] = [];
  const certainSnakeMoves: SnakeMove[] = [];
  while (snakesToMove.length > 0) {
    const snake = snakesToMove.dequeue()!;
    const snakeMoves: SnakeMove[] = [];
    const isPlayer = snake.id === gameMap.playerId;
    const headCoordinate = snake.headCoordinate;
    let moveOnFood = false;
    for (const direction of allDirectionsShuffled) {
      if (areOppositeDirections(direction, snake.direction)) {
        continue;
      }
      try {
        const coordinate = headCoordinate.translateByDirection(direction);
        const position = coordinate.toPosition(gameMap.width, gameMap.height);
        const collisionTileType = gameMap.tiles.get(position) ?? TileType.Empty;
        switch (collisionTileType) {
          case TileType.Obstacle:
            continue;
          case TileType.Snake: {
            const snakeCollisionTile = snakeTiles.get(position);
            if (
              snakeCollisionTile == null ||
              (snakeCollisionTile.isCertain && !snakeCollisionTile.walkable) ||
              snakeCollisionTile.snake.id === snake.id
            ) {
              // TODO: Remove id comparison when bug is fixed
              continue;
            }
            // Move on tail
            break;
          }
          case TileType.Food:
            moveOnFood = true;
            break;
        }
        snakeMoves.push({
          position,
          coordinate,
          tileType: TileType.Snake,
          walkable: false,
          direction,
          collisionTileType,
          snake,
          isHead: false,
          isTail: false,
          isPlayer,
          isCertain: false,
          willGrow: moveOnFood || snakesWillGrow,
        });
      } catch {
        continue;
      }
    }
    if (isPlayer) {
      playerSnakeMoves = snakeMoves;
      continue;
    }

    // Apply moves
    if (snakeMoves.length == 1) {
      const snakeMove = snakeMoves[0];
      snakeMove.isCertain = true;
      certainSnakeMoves.push();
    } else if (snakeMoves.length === 0 || opponentsMovesGeneratedCounter > 2) {
      let snakeWillNotGrow = !snakesWillGrow;
      let snakeWillGrow = snakesWillGrow;
      for (const snakeMove of snakeMoves) {
        snakeWillNotGrow &&= !snakeMove.willGrow;
        snakeWillGrow &&= snakeMove.willGrow;
        snakeTiles.set(snakeMove.position, snakeMove);
      }
      if (snakeWillGrow || snakeWillNotGrow) {
        try {
          const coordinate = snake.coordinates[snake.length - 1];
          const position = coordinate.toPosition(gameMap.width, gameMap.height);
          const snakeTailTile = snakeTiles.get(position);
          if (snakeTailTile != null && snakeTailTile.isTail) {
            snakeTailTile.walkable = snakeWillNotGrow;
            snakeTailTile.isCertain = true;
            snakeTiles.set(position, snakeTailTile);
          }
        } catch {
          console.error('ERROR: Could not get tail Coordinate.');
        }
      }
    } else {
      ++opponentsMovesGeneratedCounter;
      opponentSnakeMoves.push(snakeMoves);
    }
  }

  // Apply certain snake moves.
  for (const snakeMove of certainSnakeMoves) {
    snakeTiles.set(snakeMove.position, snakeMove);
    try {
      const coordinate = snakeMove.snake.coordinates[snakeMove.snake.length - 1];
      const position = coordinate.toPosition(gameMap.width, gameMap.height);
      const snakeTailTile = snakeTiles.get(position);
      if (snakeTailTile != null && snakeTailTile.isTail) {
        // Need to check if tail because it could be a applied uncertain snake move.
        snakeTailTile.walkable = !snakeMove.willGrow;
        snakeTailTile.isCertain = true;
        snakeTiles.set(position, snakeTailTile);
      }
    } catch {
      console.error('ERROR: Could not get tail Coordinate.');
    }
  }

  const opponentScenarios = cartesianProduct(opponentSnakeMoves);
  const dangerousMoves: Direction[] = [];
  const directionsExplorations = new Map<Direction, Map<Direction, number>>();

  let abortCount = 0;

  for (const opponentSnakeMoves of opponentScenarios) {
    const tiles = new Map<number, Tile>(snakeTiles);
    let abortScenario = false;
    for (const snakeMove of opponentSnakeMoves) {
      const collisionTile = tiles.get(snakeMove.position);
      // There are some tails that are walkable
      if (collisionTile?.tileType === TileType.Snake) {
        if ((collisionTile as SnakeTile).isCertain && !(collisionTile as SnakeTile).walkable) {
          // Collision with an applied certain move.
          // There will be other scenarios where this doesn't happen for this snake and they will have smaller walkable area.
          abortScenario = true;
          break;
        }
        //moveOnPlayerSnakeTail = (collisionTile as SnakeTile).isTail && (collisionTile as SnakeTile).isPlayer;
      }
      tiles.set(snakeMove.position, snakeMove);
      if (!snakeMove.willGrow) {
        try {
          const coordinate = snakeMove.snake.coordinates[snakeMove.snake.length - 1];
          const position = coordinate.toPosition(gameMap.width, gameMap.height);
          const snakeTailTile = tiles.get(position);
          // Only replace tail if it is still a tail
          if (snakeTailTile?.tileType === TileType.Snake && (snakeTailTile as SnakeTile).isTail) {
            tiles.set(position, {
              position,
              coordinate,
              tileType: TileType.Empty,
              walkable: true,
            });
          }
        } catch {
          console.error('ERROR: Could not get tail Coordinate.');
        }
      }
    }

    if (abortScenario) {
      ++abortCount;
      continue;
    }

    for (const snakeMove of playerSnakeMoves) {
      let collisionTile = tiles.get(snakeMove.position);
      if (collisionTile?.tileType === TileType.Snake && !(collisionTile as SnakeTile).walkable) {
        dangerousMoves.push(snakeMove.direction);
        if ((collisionTile as SnakeTile).isCertain) {
          continue;
        }
      }

      if (collisionTile == null) {
        const tileType = gameMap.tiles.get(snakeMove.position) ?? TileType.Empty;
        const walkable = tileType === TileType.Empty || tileType === TileType.Food;
        collisionTile = {
          position: snakeMove.position,
          coordinate: snakeMove.coordinate,
          tileType,
          walkable,
        };
      }
      tiles.set(snakeMove.position, snakeMove);

      const world = new World(gameMap, tiles);
      for (const direction of allDirectionsShuffled) {
        if (areOppositeDirections(direction, snakeMove.direction)) {
          continue;
        }
        const startCoordinate = snakeMove.coordinate.translateByDirection(direction);
        const walkableArea = world.explore(startCoordinate, gameMapArea);
        const explorations = directionsExplorations.get(snakeMove.direction) ?? new Map<Direction, number>();
        const minWalkableArea = explorations.get(direction) ?? gameMapArea;
        if (walkableArea < minWalkableArea) {
          explorations.set(direction, walkableArea);
          directionsExplorations.set(snakeMove.direction, explorations);
        }
      }
      tiles.set(snakeMove.position, collisionTile);
    }
  }

  console.log(
    `scenarios ${opponentScenarios.length * playerSnakeMoves.length} aborted ${abortCount * playerSnakeMoves.length}`,
  );

  let nextMove: Direction | null = null;
  let nextMaxWalkableArea = -1;
  let isNextDangerous = true;

  for (const [direction, explorations] of directionsExplorations) {
    const isDangerous = dangerousMoves.includes(direction);
    console.log(`${direction} ${isDangerous ? 'dangerous' : 'safe'} ${JSON.stringify([...explorations])}`);
    if (!isNextDangerous && isDangerous) {
      // Priotize non-dangerous moves
      continue;
    }
    let maxWalkableArea = -1;
    for (const walkableArea of explorations.values()) {
      maxWalkableArea = Math.max(walkableArea, maxWalkableArea);
    }
    if ((isNextDangerous && !isDangerous && maxWalkableArea >= 0) || maxWalkableArea > nextMaxWalkableArea) {
      nextMove = direction;
      nextMaxWalkableArea = maxWalkableArea;
      isNextDangerous = isDangerous;
    }
  }

  console.log(`Move with maxMinWalkableArea ${nextMove}`);

  nextMove ??=
    allDirectionsShuffled.find((d) => !areOppositeDirections(d, gameMap.playerSnake.direction)) ?? Direction.Up;

  console.log(`Sent move ${nextMove} for game tick ${gameMap.gameTick}`);
  return nextMove;
}
