import { snakeConsole as console } from '../src/client';
import { GameMap } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';
import {
  getNextMovePaceCheck,
  getNextMoveTimer,
  getEdgeTiles,
  onMessageMapUpdate,
  getNextMoveAwaitMapUpdate,
  search,
} from './utils';

let headDirection = Direction.Up;

async function _getNextMove(gameMap: GameMap): Promise<Direction> {
  const tailCoordinate = gameMap.playerSnake.tailCoordinate;
  let currentWalkableSize = 0;
  let nextMove = headDirection;
  for (const edge of getEdgeTiles(gameMap, gameMap.playerSnake.headCoordinate, headDirection).filter(
    (t) => t.walkable,
  )) {
    const { hasPath, walkableSize } = search({ gameMap, from: edge.coordinate, to: tailCoordinate });
    if (hasPath) {
      nextMove = edge.direction;
      break;
    } else if (walkableSize > currentWalkableSize) {
      currentWalkableSize = walkableSize;
      nextMove = edge.direction;
    }
  }
  headDirection = nextMove;
  return nextMove;
}

export const getNextMove = getNextMoveAwaitMapUpdate(_getNextMove);

/**
 * This is an optional handler that you can use if you want to listen for specific events.
 * Check out the MessageType enum for a list of events that can be listened to.
 */
function _onMessage(message: Message) {
  switch (message.type) {
    case MessageType.GameStarting:
      message = message as GameStartingEventMessage; // Cast to correct type
      // Reset snake state here
      break;
    case MessageType.SnakeDead: {
      message = message as SnakeDeadEventMessage; // Cast to correct type
      console.log(message);
      break;
    }
    case MessageType.ClientInfo: {
      break;
    }
  }
}

export const onMessage = onMessageMapUpdate(_onMessage);

// Settings ommitted are set to default values from the server, change this if you want to override them
export const trainingGameSettings = {
  timeInMsPerTick: 1000,
  // obstaclesEnabled: false,
  // ...
} as GameSettings;
