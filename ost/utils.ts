import { Direction } from '../src/types';
import { GameMap, Snake } from '../src/utils';

export const allDirections = Object.values(Direction);

export class PriorityQueue<T> {
  #array: { element: T; priority: number }[] = [];

  get length(): number {
    return this.#array.length;
  }

  enqueue(element: T, priority: number): void {
    let low = 0,
      high = this.#array.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.#array[mid].priority < priority) low = mid + 1;
      else high = mid;
    }
    this.#array.splice(low, 0, { element, priority });
  }

  dequeue(): T | undefined {
    return this.#array.pop()?.element;
  }
}

export function areOppositeDirections(direction1: Direction, direction2: Direction) {
  switch (direction1) {
    case Direction.Up:
      return direction2 === Direction.Down;
    case Direction.Down:
      return direction2 === Direction.Up;
    case Direction.Left:
      return direction2 === Direction.Right;
    case Direction.Right:
      return direction2 === Direction.Left;
    default:
      throw new Error(`Unknown direction: ${direction1}`);
  }
}

export function* getPossibleMoves(direction: Direction) {
  for (const direction of allDirections) {
    if (areOppositeDirections(direction, direction)) {
      continue;
    }
    yield direction;
  }
}

export function cartesianProduct<T>(sets: T[][]): T[][] {
  if (sets.length === 0) {
    return [];
  }
  let res: T[][] = [[]];
  for (const s1 of sets) {
    const tmp: T[][] = [];
    for (const e of s1) {
      for (const s2 of res) {
        tmp.push([e, ...s2]);
      }
    }
    res = tmp;
  }
  return res;
}

export function willSnakesGrow(gameMap: GameMap) {
  return gameMap.gameTick % 3 === 0;
}

export function isTailProtected(snake: Snake) {
  return snake.tailProtectedForGameTicks > 0;
}
