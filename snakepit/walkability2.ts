import { PriorityQueue, WalkabilityUtil, allDirections, getPossibleMoves } from '../ost/utils';
import { Direction } from '../src/types';
import { Coordinate, GameMap } from '../src/utils';

interface Tile {
  position: number;
  coordinate: Coordinate;
  walkability: number;
}

function getScore(
  path: number[],
  nextTile: Tile,
  direction: Direction,
  forwardTicks: number,
  gameMap: GameMap,
  walkabilityUtil: WalkabilityUtil,
) {
  if (forwardTicks === 0) {
    const open = new PriorityQueue<Tile>();
    open.enqueue(nextTile, nextTile.walkability);
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
          neighborPosition = neighborCoordinate.toPosition(gameMap.width, gameMap.height);
        } catch {
          continue;
        }
        if (closed.has(neighborPosition)) {
          continue;
        }
        const neighborWalkability = walkabilityUtil.getWalkability(neighborPosition) * walkability;
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
  } else {
    let bestScore = 0;
    const { position, coordinate, walkability } = nextTile;
    for (const nextDirection of getPossibleMoves(direction)) {
      const neighborCoordinate = coordinate.translateByDirection(nextDirection);
      let neighborPosition = 0;
      try {
        neighborPosition = neighborCoordinate.toPosition(gameMap.width, gameMap.height);
      } catch {
        continue;
      }
      const neighborWalkability = walkabilityUtil.getWalkability(neighborPosition) * walkability;
      if (neighborWalkability === 0) {
        continue;
      }
      const score = getScore(
        [position, ...path],
        { position: neighborPosition, coordinate: neighborCoordinate, walkability: neighborWalkability },
        nextDirection,
        forwardTicks - 1,
        gameMap,
        walkabilityUtil,
      );
      bestScore = Math.max(bestScore, score);
    }
    return bestScore;
  }
}

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log('##################################');
  const walkabilityUtil = new WalkabilityUtil(gameMap, 3);
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
    const moveWalkability = walkabilityUtil.getWalkability(movePosition);
    if (moveWalkability === 0) {
      continue;
    }
    const score = getScore(
      [],
      { position: movePosition, coordinate: moveCoordinate, walkability: moveWalkability },
      direction,
      3,
      gameMap,
      walkabilityUtil,
    );
    if (nextMove == undefined || score > nextMoveScore) {
      nextMoveScore = score;
      nextMove = direction;
    }
    console.log(`direction: ${direction}, score: ${score}`);
  }
  console.log(`nextMove: ${nextMove}`);
  return nextMove ?? Direction.Down;
}
