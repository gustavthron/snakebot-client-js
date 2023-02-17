import { snakeConsole as console } from '../src/client';
import { GameMap } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction, TileType } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';
import {
  getNextMovePaceCheck,
  getNextMoveTimer,
  getEdgeTiles,
  onMessageMapUpdate,
  getNextMoveAwaitMapUpdate,
  search,
  EdgeTile,
} from './utils';

let headDirection = Direction.Up;

async function _getNextMove(gameMap: GameMap): Promise<Direction> {
  let nextMove = headDirection;
  const tailCoordinate = gameMap.playerSnake.tailCoordinate;
  let currentWalkableSize = 0;
  let backupMove = headDirection;
  const withPath: EdgeTile[] = [];
  for (const edge of getEdgeTiles(gameMap, gameMap.playerSnake.headCoordinate, headDirection).filter(
    (t) => t.walkable,
  )) {
    const { hasPath, walkableSize } = search({ gameMap, from: edge.coordinate, to: tailCoordinate });
    if (hasPath) {
      withPath.push(edge);
    } else if (walkableSize > currentWalkableSize) {
      currentWalkableSize = walkableSize;
      backupMove = edge.direction;
    }
  }
  if (withPath.length > 1) {
    nextMove = withPath[0].direction;
    const queue = withPath;
    const explored = new Set(queue.map((node) => node.position));
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) break;
      if (node.tileType === TileType.Snake) {
        nextMove = node.direction;
        break;
      }
      for (const edge of getEdgeTiles(gameMap, node.coordinate, headDirection)) {
        if (edge.walkable && !explored.has(edge.position)) {
          edge.direction = node.direction;
          queue.push(edge);
          explored.add(edge.position);
        }
      }
    }
  } else if (withPath.length === 1) {
    nextMove = withPath[0].direction;
  } else {
    nextMove = backupMove;
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
