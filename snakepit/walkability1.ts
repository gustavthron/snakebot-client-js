import { PriorityQueue, allDirections, getPossibleMoves, isTailProtected, willSnakesGrow } from '../ost/utils';
import { Direction, TileType } from '../src/types';
import { Coordinate, GameMap } from '../src/utils';

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log('##################################');
  const gameMapUtil = new GameMapUtil(gameMap);
  const playerSnake = gameMap.playerSnake;
  const headCoordinate = gameMap.playerSnake.headCoordinate;
  let nextMoveScore = -1;
  let nextMove = Direction.Down;
  for (const direction of getPossibleMoves(playerSnake.direction)) {
    const moveCoordinate = headCoordinate.translateByDirection(direction);
    let movePosition = 0;
    try {
      movePosition = moveCoordinate.toPosition(gameMap.width, gameMap.height);
    } catch {
      continue;
    }
    const moveWalkability = gameMapUtil.getWalkability(movePosition);
    if (moveWalkability === 0) {
      continue;
    }
    const open = new PriorityQueue<Tile>();
    open.enqueue({ position: movePosition, coordinate: moveCoordinate, walkability: moveWalkability }, moveWalkability);
    const closed = new Set<number>();
    let score = 0;
    while (open.length > 0) {
      const { position, coordinate, walkability } = open.dequeue()!;
      if (closed.has(position)) {
        continue;
      }
      score += walkability;
      closed.add(position);
      for (const direction of allDirections) {
        const neighborCoordinate = coordinate.translateByDirection(direction);
        let neighborPosition = 0;
        try {
          neighborPosition = neighborCoordinate.toPosition(gameMap.width, gameMap.height);
        } catch {
          continue;
        }
        if (closed.has(neighborPosition)) {
          continue;
        }
        const neighborWalkability = gameMapUtil.getWalkability(neighborPosition) * walkability;
        if (neighborWalkability === 0) {
          // try with higher threshold
          continue;
        }
        open.enqueue(
          { position: neighborPosition, coordinate: neighborCoordinate, walkability: neighborWalkability },
          neighborWalkability,
        );
      }
    }
    if (score > nextMoveScore) {
      nextMoveScore = score;
      nextMove = direction;
    }
    console.log(`direction: ${direction}, score: ${score}`);
  }
  console.log(`nextMove: ${nextMove}`);
  return nextMove;
}

class GameMapUtil {
  #gameMap: GameMap;
  #walkability: Map<number, number>;

  constructor(gameMap: GameMap) {
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

interface Tile {
  position: number;
  coordinate: Coordinate;
  walkability: number;
}
