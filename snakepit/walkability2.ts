import { PriorityQueue, allDirections, getPossibleMoves, isTailProtected, willSnakesGrow } from '../ost/utils';
import { Direction, TileType } from '../src/types';
import { Coordinate, GameMap } from '../src/utils';

const FORWARD_TICKS = 2;

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log('##################################');
  const gameMapUtil = new GameMapUtil(gameMap, FORWARD_TICKS);
  const playerSnake = gameMap.playerSnake;
  const headCoordinate = gameMap.playerSnake.headCoordinate;
  let nextMoveScore = -1;
  let nextMove = undefined;
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
    const score = gameMapUtil.findMaxWalkabilityScore({
      position: movePosition,
      coordinate: moveCoordinate,
      walkability: moveWalkability,
    });
    if (nextMove == undefined || score > nextMoveScore) {
      nextMoveScore = score;
      nextMove = direction;
    }
    console.log(`direction: ${direction}, score: ${score}`);
  }
  console.log(`nextMove: ${nextMove}`);
  return nextMove ?? Direction.Down;
}

class GameMapUtil {
  #gameMap: GameMap;
  #walkabilities: Map<number, number>;
  #forwardTicks: number;

  constructor(gameMap: GameMap, forwardTicks = 0) {
    this.#gameMap = gameMap;
    this.#walkabilities = new Map<number, number>(); // position -> probability
    this.#forwardTicks = forwardTicks;
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
          this.#walkabilities.set(movePosition, 0);
          continue;
        } else if (tileType === TileType.Food) {
          foodCount++;
        }
        moves.push(movePosition);
      }
      const noMoveProbability = 1 - 1 / moves.length;
      for (const movePosition of moves) {
        const existingProbability = this.#walkabilities.get(movePosition) ?? 1;
        this.#walkabilities.set(movePosition, existingProbability * noMoveProbability);
      }
      // tail walkability
      const growthProbability = snakesWillGrow ? 1 : foodCount / moves.length;
      const tailPosition = snake.coordinates.at(-1)!.toPosition(gameMap.width, gameMap.height);
      const tailWalkability = isTailProtected(snake) ? 0 : 1;
      if (growthProbability === 1) {
        this.#walkabilities.set(tailPosition, tailWalkability);
      } else {
        this.#walkabilities.set(tailPosition, tailWalkability * growthProbability);
        this.#walkabilities.set(
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
              this.#walkabilities.set(newMovePosition, 0);
              continue;
            }
            newMoves.push(newMovePosition);
          }
          const newNoMoveProbability = (1 - 1 / newMoves.length) * this.#walkabilities.get(movePosition)!;
          for (const newMove of newMoves) {
            const existingProbability = this.#walkabilities.get(newMove) ?? 1;
            this.#walkabilities.set(newMove, existingProbability * newNoMoveProbability);
          }
        }
      }
    }
  }

  getWalkability(position: number): number {
    let walkability = this.#walkabilities.get(position);
    if (walkability === undefined) {
      const tileType = this.#gameMap.tiles.get(position) ?? TileType.Empty;
      if (tileType === TileType.Obstacle || tileType === TileType.Snake) {
        walkability = 0;
      } else {
        walkability = 1;
      }
      this.#walkabilities.set(position, walkability);
    }
    return walkability;
  }

  findMaxWalkabilityScore(startTile: Tile): number {
    return this.#makeMoveToFindMaxWalkabilityScore([], startTile, this.#forwardTicks);
  }

  #makeMoveToFindMaxWalkabilityScore(path: number[], nextTile: Tile, forwardTicks: number) {
    let maxScore = 0;
    if (forwardTicks < 1) {
      maxScore = this.#calculateWalkabilityScoreFromTile(path, nextTile);
    } else {
      const { position, coordinate, walkability } = nextTile;
      for (const nextDirection of allDirections) {
        const neighborCoordinate = coordinate.translateByDirection(nextDirection);
        let neighborPosition = 0;
        try {
          neighborPosition = neighborCoordinate.toPosition(this.#gameMap.width, this.#gameMap.height);
        } catch {
          continue;
        }
        if (path.includes(neighborPosition)) {
          continue;
        }
        const neighborWalkability = this.getWalkability(neighborPosition) * walkability;
        if (neighborWalkability === 0) {
          continue;
        }
        const score = this.#makeMoveToFindMaxWalkabilityScore(
          [position, ...path],
          { position: neighborPosition, coordinate: neighborCoordinate, walkability: neighborWalkability },
          forwardTicks - 1,
        );
        if (score > maxScore) {
          maxScore = score;
        }
      }
    }
    return maxScore;
  }

  #calculateWalkabilityScoreFromTile(path: number[], startTile: Tile) {
    const open = new PriorityQueue<Tile>();
    open.enqueue(startTile, startTile.walkability);
    const closed = new Set<number>(path);
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
          neighborPosition = neighborCoordinate.toPosition(this.#gameMap.width, this.#gameMap.height);
        } catch {
          continue;
        }
        if (closed.has(neighborPosition)) {
          continue;
        }
        const neighborWalkability = this.getWalkability(neighborPosition) * walkability;
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
    return score;
  }
}

interface Tile {
  position: number;
  coordinate: Coordinate;
  walkability: number;
}
