import { PriorityQueue, WalkabilityUtil, allDirections, areOppositeDirections, getPossibleMoves } from '../ost/utils';
import { Direction } from '../src/types';
import { Coordinate, GameMap } from '../src/utils';

interface Tile {
  position: number;
  coordinate: Coordinate;
  walkability: number;
}

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  console.log('##################################');
  const walkabilityUtil = new WalkabilityUtil(gameMap);
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
    const moveWalkability = walkabilityUtil.getWalkability(movePosition);
    if (moveWalkability === 0) {
      continue;
    }
    const open = new PriorityQueue<Tile>();
    open.enqueue({ position: movePosition, coordinate: moveCoordinate, walkability: moveWalkability }, moveWalkability);
    const closed = new Set<number>();
    let safeScore = 0;
    let unsafeScore = 0;
    const walkabilities = [];
    while (open.length > 0) {
      const { position, coordinate, walkability } = open.dequeue()!;
      if (closed.has(position)) {
        continue;
      }
      walkabilities.push(walkability);
      if (walkability === 1) {
        safeScore += 1;
      } else {
        unsafeScore += walkability;
      }
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
    const score = safeScore + unsafeScore;
    if (score > nextMoveScore) {
      nextMoveScore = score;
      nextMove = direction;
    }
    console.log(`direction: ${direction}, score: ${score}, safeScore: ${safeScore}, unsafeScore: ${unsafeScore}`);
    //console.log(`walkabilities: ${JSON.stringify(walkabilities)}`);
  }
  console.log(`nextMove: ${nextMove}`);
  return nextMove;
}
