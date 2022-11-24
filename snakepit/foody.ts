// npm start -- -s snakepit/foody.ts -n foody
import { GameMap, Coordinate } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction, TileType } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';

const allDirections = Object.values(Direction); // [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

interface Node {
  coordinate: Coordinate;
  position: number;
  tileType: TileType;
  walkable: boolean;
  direction?: Direction;
}

let headDirection = Direction.Up;

export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  function getNodeFrom(from: Coordinate, direction: Direction): Node | null {
    const coordinate = from.translateByDirection(direction);
    let position: number;
    try {
      position = coordinate.toPosition(gameMap.width, gameMap.height);
    } catch (e) {
      return null;
    }
    const tileType = gameMap.tiles.get(position) ?? TileType.Empty;
    const walkable = [TileType.Empty, TileType.Food].includes(tileType);
    return { coordinate, position, tileType, walkable, direction };
  }

  const queue: Node[] = [];
  const possibleDirectionNodes: Node[] = [];
  const goals = new Map<number, Node>();
  for (const direction of allDirections) {
    const node = getNodeFrom(gameMap.playerSnake.headCoordinate, direction);
    if (node && node.walkable) {
      if (node.direction === headDirection) {
        possibleDirectionNodes.unshift(node);
      } else {
        possibleDirectionNodes.push(node);
      }
      goals.set(node.position, node);
    }
  }

  const open: Node[] = [
    {
      coordinate: gameMap.playerSnake.tailCoordinate,
      position: gameMap.playerSnake.tailCoordinate.toPosition(gameMap.width, gameMap.height),
      walkable: false,
      tileType: TileType.Snake,
    },
  ];
  const closed: number[] = open.map((node) => node.position);
  while (open.length > 0 && goals.size > 0) {
    const node = open.shift();
    if (!node) break;
    closed.push(node.position);
    for (const direction of allDirections) {
      const edge = getNodeFrom(node.coordinate, direction);
      if (edge && edge.walkable && !closed.includes(edge.position)) {
        open.push(edge);
        closed.push(edge.position);
        if (goals.has(edge.position)) {
          const goal = goals.get(edge.position);
          goals.delete(edge.position);
          if (goal?.direction === headDirection) {
            queue.unshift(goal);
          } else if (goal) {
            queue.push(goal);
          }
        }
      }
    }
  }

  if (queue.length === 0) {
    queue.push(...possibleDirectionNodes);
  }

  // Use BFS to find closest food
  const explored = queue.map((node) => node.position);
  let nextMove = headDirection;
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    nextMove = node.direction ?? nextMove;
    if (node.tileType === TileType.Food) {
      break;
    }
    for (const direction of allDirections) {
      const edge = getNodeFrom(node.coordinate, direction);
      if (edge && edge.walkable && !explored.includes(edge.position)) {
        edge.direction = node.direction;
        queue.push(edge);
        explored.push(edge.position);
      }
    }
  }
  headDirection = nextMove;
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
    case MessageType.SnakeDead: {
      message = message as SnakeDeadEventMessage; // Cast to correct type
      break;
    }
  }
}

// Settings ommitted are set to default values from the server, change this if you want to override them
export const trainingGameSettings = {
  timeInMsPerTick: 1000,
  // obstaclesEnabled: false,
  // ...
} as GameSettings;
