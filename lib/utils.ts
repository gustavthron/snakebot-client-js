import { Direction, TileType } from '../src/types';
import { Coordinate, GameMap, Snake } from '../src/utils';

export const allDirections = Object.values(Direction);

export class Node {
  position: number;
  coordinate: Coordinate;
  edges: Set<number>;
  constructor(position: number, coordinate: Coordinate) {
    this.position = position;
    this.coordinate = coordinate;
    this.edges = new Set();
  }
}

export class GameMapSearcher {
  gameMap: GameMap;
  positionToSnake: Map<number, Snake>;
  otherSnakeHeads: Set<Coordinate>;
  nodes: Map<number, Node>[];
  futurePlayerPositions: number[];

  constructor(gameMap: GameMap, futurePlayerPositions: number[] = []) {
    this.gameMap = gameMap;
    this.positionToSnake = new Map();
    this.otherSnakeHeads = new Set();
    this.nodes = [];
    this.futurePlayerPositions = futurePlayerPositions;
    for (const [id, snake] of gameMap.snakes) {
      if (snake.length === 0) {
        continue;
      }
      for (const position of snake.snakeInfo.positions) {
        this.positionToSnake.set(position, snake);
      }
      if (id !== this.gameMap.playerId) {
        this.otherSnakeHeads.add(snake.headCoordinate);
      }
    }
  }

  isWalkable(coordinate: Coordinate): boolean {
    switch (this.gameMap.getTileType(coordinate)) {
      case TileType.Empty:
      case TileType.Food: {
        for (const snakeHead of this.otherSnakeHeads) {
          if (snakeHead.manhattanDistanceTo(coordinate) <= 1 + this.futurePlayerPositions.length) {
            return false;
          }
        }
        return (
          this.futurePlayerPositions.findIndex(
            (p) => p == coordinate.toPosition(this.gameMap.width, this.gameMap.height),
          ) < 0
        );
      }
      case TileType.Obstacle:
        return false;
      case TileType.Snake: {
        const position = coordinate.toPosition(this.gameMap.width, this.gameMap.height);
        const snake = this.positionToSnake.get(position);
        if (snake === undefined) {
          throw new Error('Bug: Could not find snake');
        }
        if (snake.id == this.gameMap.playerId) {
          return false;
        }
        const index = snake.snakeInfo.positions.findIndex((p) => p === position);
        let minWalkableIndex = snake.length - 1 - this.futurePlayerPositions.length;
        /*if (this.gameMap.gameTick % 3 !== 0) {
          minWalkableIndex -= 1;
        }*/
        if (snake.snakeInfo.tailProtectedForGameTicks !== 0) {
          minWalkableIndex += 1;
        }
        return index >= minWalkableIndex;
      }
    }
  }

  explore(start: Coordinate): Map<number, Node> {
    if (!this.isWalkable(start)) {
      return new Map<number, Node>();
    }
    const startPosition = start.toPosition(this.gameMap.width, this.gameMap.height);
    const cache = this.nodes.find((explored) => explored.has(startPosition));
    if (cache !== undefined) {
      return cache;
    }
    const startNode = new Node(startPosition, start);
    const open = [startNode];
    const closed = new Map<number, Node>();
    const found = new Set<number>([startPosition]);
    while (open.length > 0) {
      const node = open.shift();
      if (node === undefined) {
        throw new Error('Bug: Could not find node');
      }
      closed.set(node.position, node);
      for (const direction of allDirections) {
        const edgeCoordinate = node.coordinate.translateByDirection(direction);
        try {
          const edgePosition = edgeCoordinate.toPosition(this.gameMap.width, this.gameMap.height);
          if (found.has(edgePosition) || !this.isWalkable(edgeCoordinate)) {
            continue;
          }
          found.add(edgePosition);
          node.edges.add(edgePosition);
          const edge = new Node(edgePosition, edgeCoordinate);
          open.push(edge);
        } catch (e) {
          // eslint-disable-line
        }
      }
    }
    return closed;
  }
}
