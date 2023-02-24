import { Coordinate, GameMap, Snake } from '../src/utils';
import { Direction, TileType } from '../src/types';

const allDirections = Object.values(Direction);

class Tile {
  tileType: TileType;
  position: number;
  coordinate: Coordinate;
  walkability: number;

  constructor(tileType: TileType, position: number, coordinate: Coordinate) {
    this.tileType = tileType;
    this.position = position;
    this.coordinate = coordinate;
    switch (tileType) {
      case TileType.Empty:
      case TileType.Food:
        this.walkability = 1;
        break;
      case TileType.Obstacle:
      case TileType.Snake:
        this.walkability = 0;
        break;
    }
  }
}

class SnakeTile extends Tile {
  snake: Snake;
  snakePartIndex: number;

  constructor(position: number, coordinate: Coordinate, snake: Snake, snakePartIndex: number) {
    super(TileType.Snake, position, coordinate);
    this.snake = snake;
    this.snakePartIndex = snakePartIndex;
  }
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
      if (this.#array[mid].priority < priority) low = mid + 1;
      else high = mid;
    }
    this.#array.splice(low, 0, { element, priority });
  }

  dequeue(): T | undefined {
    return this.#array.pop()?.element;
  }
}

class GameMapExplorer {
  gameMap: GameMap;
  tiles: Map<number, Tile>;
  explorations: Map<number, Tile>[];

  constructor(gameMap: GameMap) {
    this.gameMap = gameMap;
    this.tiles = new Map<number, Tile>();
    this.explorations = [];
    // Generate snake tiles
    const tailsWillMove = gameMap.gameTick % 3 !== 0;
    for (const snake of gameMap.snakes.values()) {
      if (snake.length === 0) {
        continue;
      }
      const tailIndex = snake.length - 1;
      let tailIsWalkable = tailsWillMove;
      for (const [index, coordinate] of snake.coordinates.entries()) {
        const position = coordinate.toPosition(gameMap.width, gameMap.height);
        const snakeTile = new SnakeTile(position, coordinate, snake, index);
        this.tiles.set(position, snakeTile);
        if (!tailIsWalkable) {
          continue;
        }
        if (index === 0) {
          for (const direction of allDirections) {
            const edgeCoordinate = snakeTile.coordinate.translateByDirection(direction);
            if (this.gameMap.getTileType(edgeCoordinate) === TileType.Food) {
              tailIsWalkable = false;
              break;
            }
          }
        } else if (index === tailIndex && tailIsWalkable && (snake.length > 2 || snake.id !== gameMap.playerId)) {
          snakeTile.walkability = 1;
        }
      }
    }
    // Set correct walability for possible opponent moves
    for (const snake of gameMap.snakes.values()) {
      if (snake.length === 0 || snake.id === gameMap.playerId) {
        continue;
      }
      const headPosition = snake.headCoordinate.toPosition(gameMap.width, gameMap.height);
      const headTile = this.tiles.get(headPosition);
      if (headTile === undefined) {
        throw new Error('Bug: Could not find head tile');
      }
      const possibleSnakeMoves: Tile[] = [];
      for (const direction of allDirections) {
        const edgeCoordinate = headTile.coordinate.translateByDirection(direction);
        try {
          const edgePosition = edgeCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
          const edgeTile = this.getOrCreateTile(edgePosition, edgeCoordinate);
          if (edgeTile.walkability > 0) {
            possibleSnakeMoves.push(edgeTile);
          }
        } catch {
          continue;
        }
      }
      if (possibleSnakeMoves.length === 0) {
        // TODO: is the opponent walkable if it will die?
        continue;
      }
      const walkableProbability = 1 - 1 / possibleSnakeMoves.length;
      for (const edgeTile of possibleSnakeMoves) {
        edgeTile.walkability *= walkableProbability;
      }
    }
  }

  getOrCreateTile(position: number, coordinate: Coordinate): Tile {
    let tile = this.tiles.get(position);
    if (tile === undefined) {
      tile = new Tile(this.gameMap.getTileType(coordinate), position, coordinate);
      this.tiles.set(position, tile);
    }
    return tile;
  }

  explore(startCoordinate: Coordinate): Map<number, Tile> {
    let startTile: Tile;
    try {
      const startPosition = startCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
      const cache = this.explorations.find((e) => e.has(startPosition));
      if (cache !== undefined) {
        return cache;
      }
      startTile = { ...this.getOrCreateTile(startPosition, startCoordinate) };
      if (startTile.walkability === 0) {
        return new Map<number, Tile>([[startPosition, startTile]]);
      }
    } catch {
      return new Map<number, Tile>();
    }
    const open = new PriorityQueue<Tile>();
    open.enqueue(startTile, startTile.walkability);
    const closed = new Map<number, Tile>();
    const found = new Set<number>([startTile.position]);
    while (open.length > 0) {
      const tile = open.dequeue();
      if (tile === undefined) {
        throw new Error('Bug: Could not find tile');
      }
      closed.set(tile.position, tile);
      for (const direction of allDirections) {
        const edgeCoordinate = tile.coordinate.translateByDirection(direction);
        try {
          const edgePosition = edgeCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
          if (found.has(edgePosition)) {
            continue;
          }
          found.add(edgePosition);
          const edgeTile = { ...this.getOrCreateTile(edgePosition, edgeCoordinate) };
          edgeTile.walkability = Math.min(tile.walkability, edgeTile.walkability);
          if (edgeTile.walkability === 0) {
            closed.set(edgePosition, edgeTile);
          } else {
            open.enqueue(edgeTile, edgeTile.walkability);
          }
        } catch {
          continue;
        }
      }
    }
    //this.explorations.push(closed);
    return closed;
  }
}

let playerLength = 1;

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.info('##################################');
  console.info(
    `Game tick ${gameMap.gameTick}, Length: ${gameMap.playerSnake.length}, TailWillMove: ${
      gameMap.gameTick % 3 !== 0
    }, TailMoved: ${playerLength === gameMap.playerSnake.length}`,
  );
  playerLength = gameMap.playerSnake.length;
  const gameMapExplorer = new GameMapExplorer(gameMap);

  let highScore = -1;
  let nextMove = Direction.Down;
  let walkability = 0;

  const directions = [...allDirections];
  while (directions.length > 0) {
    const index = Math.floor(Math.random() * directions.length);
    const direction = directions[index];
    directions.splice(index, 1);
    const coordinate = gameMap.playerSnake.headCoordinate.translateByDirection(direction);
    const exploration = gameMapExplorer.explore(coordinate);
    let score = 0;
    for (const tile of exploration.values()) {
      score += tile.walkability;
    }
    try {
      const position = coordinate.toPosition(gameMap.width, gameMap.height);
      const tile = exploration.get(position);
      if (tile === undefined) {
        continue;
      }
      if (score > highScore || (score === highScore && tile.walkability > walkability)) {
        highScore = score;
        nextMove = direction;
        walkability = tile.walkability;
        // paint the exploration
        /*console.info(`Direction ${direction}, Score: ${score}, Walkability ${walkability}`);
        let canvas = '';
        for (let y = 0; y < gameMap.height; y++) {
          for (let x = 0; x < gameMap.width; x++) {
            let brush = '▓▓';
            if (x === gameMap.playerSnake.headCoordinate.x && y === gameMap.playerSnake.headCoordinate.y) {
              brush = 'HH';
            } else if (x === coordinate.x && y === coordinate.y) {
              brush = 'SS';
            } else {
              const position = x + y * gameMap.width;
              const tile = exploration.get(position);
              if (tile !== undefined && tile.walkability > 0) {
                brush = tile.walkability === 1 ? '  ' : '░░';
              }
            }
            canvas += brush;
          }
          canvas += '\n';
        }
        console.info(canvas);*/
      }
    } catch {
      continue;
    }
  }

  console.info(
    `Is next move tail: ${
      gameMap.playerSnake.headCoordinate.translateByDirection(nextMove).toPosition(gameMap.width, gameMap.height) ===
      gameMap.playerSnake.tailCoordinate.toPosition(gameMap.width, gameMap.height)
    }`,
  );
  return nextMove;
}
