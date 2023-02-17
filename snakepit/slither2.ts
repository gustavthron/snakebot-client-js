import { GameMap } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction } from '../src/types';
import type { MapUpdateEventMessage, Message } from '../src/types_messages';
import { createGameMap2, getGameMap2, TileType2, translateByDirection } from '../src/utils2/game';

const allDirections = Object.values(Direction); // [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

// Get random item in array
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * This is where you write your AI code. You will be given a GameMap object containing the current state of the game.
 * Use this object to determine your next move. Remember to return a Direction enum value before your time runs out!
 * (Default time is 250ms)
 */
export async function getNextMove(_gm: GameMap): Promise<Direction> {
  const gameMap = await getGameMap2(_gm);
  const { player } = gameMap;
  if (player === undefined) {
    return getRandomItem(allDirections);
  }
  const possibleMoves = allDirections.filter((direction) =>
    gameMap.walkable(translateByDirection(player.head, direction)),
  ); //Filters safe directions to move in

  // If there are no safe moves, bad luck!
  if (possibleMoves.length === 0) {
    return Direction.Down;
  }

  // Go toward food if it's nearby
  for (const direction of possibleMoves) {
    const nextPosition = translateByDirection(player.head, direction); // Gets the next position of the snake
    if (gameMap.getTileType(nextPosition) === TileType2.Food) {
      return direction;
    }
  }

  console.log(gameMap.paint());
  // Otherwise, choose a random direction
  return getRandomItem(possibleMoves);
}

/**
 * This is an optional handler that you can use if you want to listen for specific events.
 * Check out the MessageType enum for a list of events that can be listened to.
 */
export function onMessage(message: Message) {
  //logger.info(message);
  if (message.type === MessageType.MapUpdate) {
    createGameMap2(message as MapUpdateEventMessage);
  }
}

// Settings ommitted are set to default values from the server, change this if you want to override them
export const trainingGameSettings = {
  // maxNoofPlayers: 2,
  // obstaclesEnabled: false,
  // ...
} as GameSettings;
