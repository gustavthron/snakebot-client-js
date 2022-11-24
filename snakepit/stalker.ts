import { snakeConsole as console } from '../src/client';
import { GameMap } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction, TileType } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';
import { getEdgeTiles, onMessageMapUpdate, onlyTilesWithReach, EdgeTile, getNextMoveAwaitMapUpdate } from './utils';

let headDirection = Direction.Up;

async function _getNextMove(gameMap: GameMap): Promise<Direction> {
  let nextMove = headDirection;

  const headEdges = getEdgeTiles(gameMap, gameMap.playerSnake.headCoordinate, headDirection).filter((t) => t.walkable)

  const headEdgesWithTailReach = onlyTilesWithReach(gameMap, headEdges, gameMap.playerSnake.tailCoordinate) as EdgeTile[];

  // Use BFS to find closest tail
  const queue = headEdgesWithTailReach.length > 0 ? headEdgesWithTailReach : headEdges;
  const explored = new Set(queue.map((node) => node.position));
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    nextMove = node.direction ?? nextMove;
    if (node.tileType === TileType.Snake) {
      break;
    }
    for (const edge of getEdgeTiles(gameMap, node.coordinate, headDirection)) {
      if (edge.walkable && !explored.has(edge.position)) {
          edge.direction = node.direction;
          queue.push(edge);
          explored.add(edge.position)
      }
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
      console.log(message)
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
