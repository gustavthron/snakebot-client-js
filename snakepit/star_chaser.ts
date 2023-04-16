import { snakeConsole as console } from '../src/client';
import { GameMap } from '../src/utils';
import { MessageType } from '../src/messages';
import { GameSettings, Direction, RelativeDirection, TileType } from '../src/types';
import type { GameStartingEventMessage, Message, SnakeDeadEventMessage } from '../src/types_messages';
import { performance } from 'perf_hooks';
import { start } from 'repl';
import { Coordinate } from '../src/utils';

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
export async function getNextMove(gameMap: GameMap): Promise<Direction> {
  var startTime = performance.now();
  var endTime = performance.now();

  let visited: boolean[][] = Array<Array<boolean>>();

  const possibleMoves = allDirections.filter((direction) => gameMap.playerSnake.canMoveInDirection(direction)); //Filters safe directions to move in
  let score: number[] = Array<number>();
  let first_star: number[] = Array<number>();

  for (let move of possibleMoves) {
    let star_found = false;

    for (let i = 0; i < gameMap.width; i++) {
      visited[i] = [];
      for (let j = 0; j < gameMap.height; j++) {
        visited[i][j] = false;
      }
    }

    let searchQueue: Coordinate[] = Array<Coordinate>();
    searchQueue.push(gameMap.playerSnake.headCoordinate.translateByDirection(move));
    let num = 0;
    do {
      num += 1;
      const position = searchQueue.shift();

      for (var direction of allDirections) {
        let new_pos = position!.translateByDirection(direction);

        if (!new_pos.isOutOfBounds(gameMap.width, gameMap.height)) {
          if (!visited[new_pos.x][new_pos.y]) {
            if (gameMap.getTileType(new_pos) != TileType.Obstacle && gameMap.getTileType(new_pos) != TileType.Snake) {
              searchQueue.push(new_pos);
              visited[new_pos!.x][new_pos!.y] = true;

              if (gameMap.getTileType(new_pos) == TileType.Food && !star_found) {
                first_star.push(num);
                star_found = true;
              }
            }
          }
        }
      }

      endTime = performance.now();
    } while (endTime - startTime < 200 && searchQueue.length != 0);
    if (!star_found) {
      first_star.push(Number.MAX_VALUE);
    }
    score.push(num);
  }

  let max_score = Math.max(...score);

  let i = 0;
  let max_index: number[] = Array<number>();
  for (let s of score) {
    if (s == max_score) {
      max_index.push(i);
    }
    i += 1;
  }

  let closest_star = Number.MAX_VALUE;
  let chosenDirection: Direction = possibleMoves[score.indexOf(max_score)];
  for (let i of max_index) {
    if (first_star[i] < closest_star) {
      closest_star = first_star[i];
      chosenDirection = possibleMoves[i];
    }
  }

  return chosenDirection!;
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
