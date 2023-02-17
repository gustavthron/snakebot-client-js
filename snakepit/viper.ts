import { Coordinate, GameMap } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction, RelativeDirection, TileType } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';
import { GameMapCanvas } from '../lib/debug';
import palette from '../lib/palette';
import { GameMapSearcher, Node, allDirections } from '../lib/utils';

let prevMove = Direction.Down;

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  const headCoordinate = gameMap.playerSnake.headCoordinate;
  const searcher = new GameMapSearcher(gameMap);

  let nextMove = prevMove;
  let currentSize1 = 0;
  let currentSize2 = 0;
  const currentExplored = new Map<number, Node>();
  for (const direction of allDirections) {
    const coordinate = headCoordinate.translateByDirection(direction);
    const explored = searcher.explore(coordinate);
    if (explored.size == 0) {
      continue;
    }
    const p0 = coordinate.toPosition(gameMap.width, gameMap.height);
    const s1 = new GameMapSearcher(gameMap, [p0]);
    for (const d1 of allDirections) {
      const c1 = coordinate.translateByDirection(d1);
      const e1 = s1.explore(c1);
      if (e1.size == 0) {
        continue;
      }
      if (e1.size < currentSize1) {
        continue;
      } else if (e1.size > currentSize1) {
        currentSize1 = e1.size;
        currentSize2 = 0;
      }
      const s2 = new GameMapSearcher(gameMap, [p0, c1.toPosition(gameMap.width, gameMap.height)]);
      for (const d2 of allDirections) {
        const c2 = coordinate.translateByDirection(d2);
        const e2 = s2.explore(c2);
        if (e2.size <= currentSize2) {
          continue;
        }
        currentSize2 = e2.size;
        nextMove = direction;
      }
    }
  }

  const canvas = new GameMapCanvas(gameMap);
  for (const position of currentExplored.keys()) {
    canvas.tiles.set(position, palette.orange);
  }
  canvas.tiles.set(
    headCoordinate.translateByDirection(nextMove).toPosition(gameMap.width, gameMap.height),
    palette.green.dark.black,
  );
  canvas.paint();

  prevMove = nextMove;
  return nextMove;
}

/**
 * This is an optional handler that you can use if you want to listen for specific events.
 * Check out the MessageType enum for a list of events that can be listened to.
 */
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
  // maxNoofPlayers: 2,
  // obstaclesEnabled: false,
  // ...
} as GameSettings;
