import { snakeConsole as console } from '../src/client';
import { GameMap, Coordinate, Snake } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction, RelativeDirection, TileType } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';

// // Disable logging
// console = {
//   log: () => {},
//   error: () => {},
//   warn: () => {},
//   info: () => {},
// } as Console;

const DEPTH = 3;
const FLOODFILL_LIMIT = 150;
const alliedSnakesPrefix = 'area';

const allDirections = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

function getPossibleMoves(gameMap: GameMap, snakeId: string): Direction[] {
  const snake = gameMap.snakes.get(snakeId)!;
  const head = snake.headCoordinate;

  const playerId = gameMap.playerId;
  const playerHead = gameMap.playerSnake.headCoordinate;

  return allDirections.filter((direction) => {
    const newHead = head.translateByDirection(direction);

    // If minimizing player
    if (snakeId !== playerId) {
      // Kamikaze is valid option for minimizing player
      if (newHead.manhattanDistanceTo(playerHead) === 0) {
        return true;
      }
    }

    return gameMap.isTileFree(newHead);
  });
}

function isSameTile(a: Coordinate, b: Coordinate): boolean {
  return a.x === b.x && a.y === b.y;
}

function isSnakeClosestToTile(gameMap: GameMap, head: Coordinate, tile: Coordinate): boolean {
  const distance = head.manhattanDistanceTo(tile);

  for (const otherSnake of gameMap.snakes.values()) {
    const otherHead: Coordinate = otherSnake.headCoordinate;
    if (!otherHead || isSameTile(head, otherHead)) continue;
    if (otherHead.manhattanDistanceTo(tile) < distance) {
      return false;
    }
  }
  return true;
}

function higherOrderIsSnakeClosestToTile(
  gameMap: GameMap,
  snakeIdsToIgnore: string[],
): (head: Coordinate, tile: Coordinate) => boolean {
  const snakesArr = Array.from(gameMap.snakes.values()).filter((snake) => !snakeIdsToIgnore.includes(snake.id));

  return (head: Coordinate, tile: Coordinate) => {
    const distance = head.manhattanDistanceTo(tile);

    for (const otherSnake of snakesArr) {
      const otherHead: Coordinate = otherSnake.headCoordinate;
      if (!otherHead || isSameTile(head, otherHead)) continue;
      if (otherHead.manhattanDistanceTo(tile) < distance) {
        return false;
      }
    }
    return true;
  };
}

function oldGetAvailableSpace(
  gameMap: GameMap,
  head: undefined | Coordinate,
  floodfillLimit = FLOODFILL_LIMIT,
): number {
  if (head === undefined) {
    return 0;
  }

  // Flood fill available space
  const visited = new Set<string>();
  const queue = [head];
  let availableSpace = 0;
  while (queue.length > 0 && availableSpace < floodfillLimit) {
    const current = queue.shift()!;
    if (visited.has(JSON.stringify(current))) {
      continue;
    }
    visited.add(JSON.stringify(current));
    if (current === undefined) throw new Error('WHOOPS');
    if (gameMap.isTileFree(current)) {
      availableSpace++;

      // Attempt to score on distance to player
      // const addScore = 30 - head.manhattanDistanceTo(current);
      // if (addScore <= 0) throw new Error('Should not add a non positive score');
      // availableSpace += addScore;
    }
    for (const direction of allDirections) {
      const neighbor = current.translateByDirection(direction);
      if (gameMap.isTileFree(neighbor) && isSnakeClosestToTile(gameMap, head, neighbor))
        //&& neighbor.manhattanDistanceTo(head) < 2) { // IMPORTANT: RESTRICT DISTANCE FROM HEAD OR RESTRICT AVAILABLE SPACE
        queue.push(neighbor);
    }
  }
  // console.log(`Available space: ${availableSpace}`);
  return availableSpace;
}

function getAvailableSpace(
  gameMap: GameMap,
  head: Coordinate | undefined,
  snakeId: string,
  floodfillMap: Map<number, { id: string; distance: number }>,
  snakesSpacesMap: Map<string, number>,
  updateFloodfillMap = true,
  floodfillLimit = FLOODFILL_LIMIT,
  additionalNeighbourCheck = (head: Coordinate, tile: Coordinate) => true,
): number {
  if (head === undefined) {
    return 0;
  }

  // Flood fill available space
  const visited = new Set<string>();
  const queue: { coord: Coordinate; distance: number }[] = [];
  for (const direction of allDirections) {
    const neighbor = head.translateByDirection(direction);
    if (!neighbor.isOutOfBounds(gameMap.width, gameMap.height) && gameMap.isTileFree(neighbor)) {
      queue.push({ coord: neighbor, distance: 1 });
    }
  }
  let availableSpace = 0;
  while (queue.length > 0 && availableSpace < floodfillLimit) {
    const { coord: current, distance: distance } = queue.shift()!;
    if (visited.has(JSON.stringify(current))) {
      continue;
    }
    visited.add(JSON.stringify(current));
    if (current === undefined) throw new Error('WHOOPS');
    const currPos = current.toPosition(gameMap.width, gameMap.height);
    const prevClosestSnake = floodfillMap.get(currPos);
    if (gameMap.isTileFree(current) && (prevClosestSnake === undefined || prevClosestSnake.distance > distance)) {
      availableSpace++;
      if (updateFloodfillMap) {
        // Decrease available space of previous closest snake if it exists (since it is no longer the closest)
        if (prevClosestSnake !== undefined) {
          snakesSpacesMap.set(prevClosestSnake.id, snakesSpacesMap.get(prevClosestSnake.id)! - 1);
        }
        floodfillMap.set(currPos, { id: snakeId, distance });
      }
      for (const direction of allDirections) {
        const neighbor = current.translateByDirection(direction);
        if (
          gameMap.isTileFree(neighbor) &&
          !neighbor.isOutOfBounds(gameMap.width, gameMap.height) &&
          additionalNeighbourCheck(head, neighbor) // used for optimal manhattandistance check (isSnakeClosestToTile)
        ) {
          queue.push({ coord: neighbor, distance: distance + 1 });
        }
      }
    }
  }
  // console.log(`Available space: ${availableSpace}`);
  // return availableSpace;
  if (updateFloodfillMap) snakesSpacesMap.set(snakeId, availableSpace);

  return availableSpace;
}

function isAlliedSnake(snake: Snake) {
  return snake.name.startsWith(alliedSnakesPrefix);
}

function heuristic(gameMap: GameMap, playerId: string, opponentId: string): number {
  // return gameMap.playerSnake.length - gameMap.snakes.get(opponentId)!.length;

  // Heuristic of available space
  const playerHead = gameMap.snakes.get(playerId)?.coordinates[0];
  const opponentHead = gameMap.snakes.get(opponentId)?.coordinates[0];

  const floodFillMap: Map<number, { id: string; distance: number }> = new Map();
  const snakeSpacesMap: Map<string, number> = new Map();
  // Initialize the snakeSpacesMap with 0 points for each snake
  const snakesArr = Array.from(gameMap.snakes.values());
  snakesArr.forEach((snake) => snakeSpacesMap.set(snake.id, 0));

  const snakeIdsToIgnore = [playerId, opponentId];
  const isSnakeCloserToTile = higherOrderIsSnakeClosestToTile(gameMap, snakeIdsToIgnore);
  let opponentAvailableSpace = getAvailableSpace(
    gameMap,
    opponentHead,
    opponentId,
    floodFillMap,
    snakeSpacesMap,
    true,
    FLOODFILL_LIMIT,
    isSnakeCloserToTile,
  );
  const playerAvailableSpace = getAvailableSpace(
    gameMap,
    playerHead,
    playerId,
    floodFillMap,
    snakeSpacesMap,
    true,
    FLOODFILL_LIMIT,
    isSnakeCloserToTile,
  );

  // Update with the decrease from the player takes spaces
  opponentAvailableSpace = snakeSpacesMap.get(opponentId)!;

  // If name starts with 'area' then help the snake
  // if (isAlliedSnake(gameMap.snakes.get(opponentId)!)) return playerAvailableSpace + opponentAvailableSpace / 2;
  return playerAvailableSpace - opponentAvailableSpace;
}

// Modifies the gameMap by simulating the move, and returns the tail if it was removed
function applyMove(gameMap: GameMap, move: Direction, snakeId: string): null | Coordinate {
  const snake = gameMap.snakes.get(snakeId);
  if (snake === undefined) throw new Error('Snake not found');
  const head = snake.headCoordinate;
  const newHead = head.translateByDirection(move);
  snake.coordinates.unshift(newHead);
  gameMap.tiles.set(newHead.toPosition(gameMap.width, gameMap.height), TileType.Snake);

  // Every third move, don't remove the tail
  let tail: null | Coordinate = null;
  if (gameMap.gameTick % 3 !== 0) {
    tail = snake.coordinates.pop()!;
    gameMap.tiles.set(tail!.toPosition(gameMap.width, gameMap.height), TileType.Empty);
  }
  return tail;
}

function undoMove(gameMap: GameMap, possibleRemovedTail: null | Coordinate, snakeId: string): void {
  const snake = gameMap.snakes.get(snakeId);
  if (snake === undefined) throw new Error('Snake not found');
  const prevHead = snake.coordinates.shift();
  gameMap.tiles.set(prevHead!.toPosition(gameMap.width, gameMap.height), TileType.Empty);

  // Add the tail back
  if (possibleRemovedTail !== null) {
    snake.coordinates.push(possibleRemovedTail);
    gameMap.tiles.set(possibleRemovedTail.toPosition(gameMap.width, gameMap.height), TileType.Snake);
  }
}

// minimax with alpha-beta pruning
function minimax(
  gameMap: GameMap,
  depth: number,
  playerId: string,
  opponentId: string,
  maximizingPlayer: boolean,
  alpha: number,
  beta: number,
  gameTick: number,
): number {
  const snakeId = maximizingPlayer ? playerId : opponentId;
  const otherId = maximizingPlayer ? opponentId : playerId;
  const possibleMoves = getPossibleMoves(gameMap, snakeId);

  if (depth === 0 || possibleMoves.length === 0) {
    return heuristic(gameMap, playerId, opponentId);
  }

  // Sort moves for alpha-beta pruning
  const closestSnakeHead = gameMap.snakes.get(otherId)!.headCoordinate;
  possibleMoves.sort((a, b) => {
    const aHead = gameMap.snakes.get(snakeId)!.headCoordinate.translateByDirection(a);
    const bHead = gameMap.snakes.get(snakeId)!.headCoordinate.translateByDirection(b);
    return aHead.manhattanDistanceTo(closestSnakeHead) - bHead.manhattanDistanceTo(closestSnakeHead);
  });

  if (maximizingPlayer) {
    let bestScore = -Infinity;
    for (const move of possibleMoves) {
      const possibleRemovedTail = applyMove(gameMap, move, playerId);
      const score = minimax(gameMap, depth, playerId, opponentId, false, alpha, beta, gameTick);
      undoMove(gameMap, possibleRemovedTail, playerId);
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) {
        break;
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (const move of possibleMoves) {
      const newHead = gameMap.snakes.get(opponentId)!.headCoordinate.translateByDirection(move);
      if (newHead.manhattanDistanceTo(gameMap.playerSnake.headCoordinate) === 0) {
        // console.log('######################### opponent can kamikaze! ####################################');
        return -1; // Kamikaze is valid move for the opponent, but generally not the best
      }

      const possibleRemovedTail = applyMove(gameMap, move, opponentId);
      const score = minimax(gameMap, depth - 1, playerId, opponentId, true, alpha, beta, gameTick + 1);
      undoMove(gameMap, possibleRemovedTail, opponentId);
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) {
        break;
      }
    }
    return bestScore;
  }
}

function sortedIndex(array: { coord: number; priority: number }[], value: { coord: number; priority: number }): number {
  let low = 0;
  let high = array.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (array[mid].priority < value.priority) low = mid + 1;
    else high = mid;
  }
  return low;
}

function aStar(gameMap: GameMap, start: number, goal: number, firstDirections?: Direction[]): null | Direction {
  const startCoord = Coordinate.fromPosition(start, gameMap.width);
  const goalCoord = Coordinate.fromPosition(goal, gameMap.width);

  const pQueue: { coord: number; priority: number }[] = [{ coord: start, priority: 0 }];

  // <coord, prevCoord>
  const cameFrom = new Map<number, number>();
  cameFrom.set(start, start);

  // <coord, gScore>
  const costSoFar = new Map<number, number>();
  costSoFar.set(start, 0);

  // Prioritize the first directions if they are given
  firstDirections?.forEach((dir) => {
    const newHead = startCoord.translateByDirection(dir);
    const newCoord = newHead.toPosition(gameMap.width, gameMap.height);
    pQueue.push({ coord: newCoord, priority: 0 });
    cameFrom.set(newCoord, start);
    costSoFar.set(newCoord, 0);
  });

  while (pQueue.length > 0) {
    const { coord: current, priority: currPriority } = pQueue.shift()!;
    const currentCoord = Coordinate.fromPosition(current, gameMap.width);
    if (current === goal) {
      const path = [current];

      let prev = current;
      while (prev !== start) {
        prev = cameFrom.get(prev)!;
        path.push(prev);
      }
      path.reverse();

      const first = Coordinate.fromPosition(path[0], gameMap.width);
      const second = Coordinate.fromPosition(path[1], gameMap.width);
      // const secondLast = Coordinate.fromPosition(path[path.length - 2], gameMap.width);
      // const last = Coordinate.fromPosition(path[path.length - 1], gameMap.width);
      // console.log('start:', Coordinate.fromPosition(start, gameMap.width), 'first:', first.x, first.y, 'second:', second.x, second.y, 'secondLast:', secondLast.x, secondLast.y, 'last:', last.x, last.y);

      return first.directionTo(second);
    }
    for (const direction of allDirections) {
      const neighborCoord = currentCoord.translateByDirection(direction);
      if (!gameMap.isTileFree(neighborCoord)) {
        continue;
      }
      const neighbor = neighborCoord.toPosition(gameMap.width, gameMap.height);

      const newCost = costSoFar.get(current)! + 1;
      if (!costSoFar.has(neighbor) || newCost < costSoFar.get(neighbor)!) {
        costSoFar.set(neighbor, newCost);
        const priority = newCost + neighborCoord.manhattanDistanceTo(goalCoord);
        const insertIndex = sortedIndex(pQueue, { coord: neighbor, priority });
        pQueue.splice(insertIndex, 0, { coord: neighbor, priority });
        // console.log('pQueue:', pQueue);
        cameFrom.set(neighbor, current);
      }
    }
  }
  return null;
}

export async function getNextMove(gameMap: GameMap) {
  const { gameTick, playerId, playerSnake, snakes } = gameMap;

  console.log(`\ngameTick: ${gameTick}`);

  // Sort snakes closest to player
  const playerHead = playerSnake.headCoordinate;
  let snakesArr = Array.from(snakes.values());

  // Filter dead snakes
  snakesArr = snakesArr.filter((snake) => snake.coordinates.length > 0);

  // Sort snakes closest to player
  snakesArr.sort(
    (a, b) => a.headCoordinate.manhattanDistanceTo(playerHead) - b.headCoordinate.manhattanDistanceTo(playerHead),
  );

  const closestSnake = snakesArr[1];
  const closestSnakeHead = closestSnake.headCoordinate;

  console.log('closestSnake:', closestSnake.name);

  const possibleMoves = getPossibleMoves(gameMap, playerId);
  if (possibleMoves.length === 0) {
    console.log('No possible moves');
    return Direction.Down;
  }

  // console.log('-----------------------------------------------------');
  // Sort possible moves for alpha beta pruning
  possibleMoves.sort((a, b) => {
    const aHead = gameMap.playerSnake.headCoordinate.translateByDirection(a);
    const bHead = gameMap.playerSnake.headCoordinate.translateByDirection(b);
    return aHead.manhattanDistanceTo(closestSnakeHead) - bHead.manhattanDistanceTo(closestSnakeHead);
  });

  console.log('possibleMoves:', possibleMoves);

  let bestScore = -Infinity;
  let bestMoves: Direction[] = [];
  for (const move of possibleMoves) {
    const possibleRemovedTail = applyMove(gameMap, move, playerId);
    const score = minimax(gameMap, DEPTH, playerId, closestSnake.id, false, -Infinity, Infinity, gameTick);
    console.log(`Possible Move: ${move} Score: ${score}`);
    undoMove(gameMap, possibleRemovedTail, playerId);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  console.log('bestMoves:', bestMoves);

  if (bestMoves.length === 1) return bestMoves[0];
  bestScore = 0;
  let okayMove = bestMoves[0];
  const floodFillMap: Map<number, { id: string; distance: number }> = new Map();
  const snakeSpacesMap: Map<string, number> = new Map();

  // Initialize the snakeSpacesMap with 0 points for each snake
  snakesArr.forEach((snake) => snakeSpacesMap.set(snake.id, 0));
  // Filter out the player snake
  const opponentSnakes = Array.from(snakesArr.values()).filter((snake) => snake.id !== playerId);

  for (const snake of opponentSnakes) {
    getAvailableSpace(gameMap, snake.coordinates[0], snake.id, floodFillMap, snakeSpacesMap, true, 999999);
  }
  for (const move of bestMoves) {
    const possibleRemovedTail = applyMove(gameMap, move, playerId);
    const head = gameMap.playerSnake.headCoordinate;
    let score = getAvailableSpace(gameMap, head, gameMap.playerId, floodFillMap, snakeSpacesMap, false, 999999);

    // Ugly hack to prevent the snake from wasting its own available space (best way would be to simulate an extra step or somehow detect that moving this way u would lose e.g. half of the space)
    // Get coordinate one step ahead
    const oneStepAhead = head.translateByDirection(move);
    if (oneStepAhead.isOutOfBounds(gameMap.width, gameMap.height) || !gameMap.isTileFree(oneStepAhead)) {
      // If the coordinate is not free, the snake lose some its available space
      console.log(`Moving ${move} would waste space! Penalizing (-1)`);
      score -= 1;
    }

    undoMove(gameMap, possibleRemovedTail, playerId);
    console.log(`Okay Move: ${move} Score: ${score}`);
    if (score > bestScore) {
      bestScore = score;
      okayMove = move;
    }
  }
  console.log(`Moving: ${okayMove}, Score: ${bestScore}, Best moves: ${bestMoves}`);
  return okayMove;
}

// This handler is optional
export function onMessage(message: Message) {
  switch (message.type) {
    case MessageType.GameStarting:
      message = message as GameStartingEventMessage; // Cast to correct type
      // Reset snake state here
      break;
    case MessageType.SnakeDead:
      message = message as SnakeDeadEventMessage; // Cast to correct type
      // Check how many snakes are left and switch strategy
      break;
  }
}

// Settings ommitted are set to default values from the server, change this if you want to override them
export const trainingGameSettings = {
  // obstaclesEnabled: false,
  // ...
} as GameSettings;
