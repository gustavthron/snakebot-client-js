import { MessageType } from '../src/messages';
import { Direction, TileType } from '../src/types';
import { MapUpdateEventMessage, Message } from '../src/types_messages';
import { Coordinate, GameMap } from '../src/utils';

//export const getNextMove = getNextMovePaceCheck(getNextMoveTimer(_getNextMove))

interface GetNextMoveFn {
  (gameMap: GameMap): Promise<Direction>;
}

export function getNextMoveTimer(getNextMove: GetNextMoveFn): GetNextMoveFn {
  return async function (gameMap) {
    console.time(`getNextMove${gameMap.gameTick}`);
    const nextMove = await getNextMove(gameMap);
    console.timeEnd(`getNextMove${gameMap.gameTick}`);
    return nextMove;
  };
}

export function getNextMovePaceCheck(getNextMove: GetNextMoveFn): GetNextMoveFn {
  let lastGameTick = -1;
  return async function (gameMap) {
    if (lastGameTick !== gameMap.gameTick - 1) {
      console.warn('Out of pace');
    }
    const nextMove = await getNextMove(gameMap);
    lastGameTick = gameMap.gameTick;
    return nextMove;
  };
}

const mapUpdateCache: { gameTick: number; message?: MapUpdateEventMessage } = {
  gameTick: -1,
};

export function getNextMoveAwaitMapUpdate(getNextMove: GetNextMoveFn): GetNextMoveFn {
  return async function (gameMap) {
    while (mapUpdateCache.gameTick !== gameMap.gameTick) {
      await async function () {
        return;
      };
    }
    const nextMove = await getNextMove(gameMap);
    return nextMove;
  };
}

interface OnMessageFn {
  (message: Message): void;
}

export function onMessageMapUpdate(onMessage: OnMessageFn): OnMessageFn {
  return function (message) {
    if (message.type === MessageType.MapUpdate) {
      mapUpdateCache.message = <MapUpdateEventMessage>message;
      mapUpdateCache.gameTick = (<MapUpdateEventMessage>message).gameTick;
    }
    onMessage(message);
  };
}

type _Coordinate = [number, number]

function to_Coordinate(coordinate: Coordinate): _Coordinate {
  return [coordinate.x, coordinate.y]
}

function manhattanDistance([x0, y0]: _Coordinate, [x1, y1]: _Coordinate) {
  return Math.abs(x1 - x0) + Math.abs(y1 - y0);
}

const headCoordinateCache = {
  gameTick: -1,
  coordinates: new Set<_Coordinate>(),
};

function getOthersHeadCoordinates(gameMap: GameMap): Set<_Coordinate> {
  if (gameMap.gameTick === headCoordinateCache.gameTick) {
    return headCoordinateCache.coordinates;
  }
  const coordinates = new Set<_Coordinate>();
  for (const [id, snake] of gameMap.snakes) {
    if (id === gameMap.playerId || snake.headCoordinate === undefined) {
      continue;
    }
    coordinates.add(to_Coordinate(snake.headCoordinate));
  }
  headCoordinateCache.gameTick = gameMap.gameTick;
  headCoordinateCache.coordinates = coordinates;
  return coordinates;
}

const tailCoordinateCache = {
  gameTick: -1,
  coordinates: new Set<_Coordinate>(),
};

function getOthersTailCoordinates(gameMap: GameMap): Set<_Coordinate> {
  if (gameMap.gameTick === tailCoordinateCache.gameTick) {
    return tailCoordinateCache.coordinates;
  }
  const coordinates = new Set<_Coordinate>();
  for (const [id, snake] of gameMap.snakes) {
    if (
      id === gameMap.playerId || snake.tailCoordinate === undefined ||
      mapUpdateCache.message?.map.snakeInfos.findIndex((s) => s.id === snake.id && s.tailProtectedForGameTicks > 0) !==
        -1
    ) {
      continue;
    }
    coordinates.add(to_Coordinate(snake.tailCoordinate));
  }
  tailCoordinateCache.gameTick = gameMap.gameTick;
  tailCoordinateCache.coordinates = coordinates;
  return coordinates;
}

enum ExtendedTileType {
  SnakeHead = "SnakeHead"
}

type _TileType = TileType | ExtendedTileType;

const walkableTileTypes: Set<_TileType> = new Set([TileType.Empty, TileType.Food])

export interface Tile {
  position: number;
  coordinate: Coordinate;
  tileType: _TileType;
  walkable: boolean;
}

const tileCache = {
  gameTick: -1,
  tiles: new Map<[number, number], Tile>(),
};

export function getTile(gameMap: GameMap, coordinate: Coordinate): Tile {
  if (gameMap.gameTick !== tileCache.gameTick) {
    tileCache.gameTick = gameMap.gameTick;
    tileCache.tiles = new Map<[number, number], Tile>();
  }
  const _coordinate = to_Coordinate(coordinate);
  const cachedTile = tileCache.tiles.get(_coordinate);
  if (cachedTile) {
    return cachedTile;
  }
  let position: number | undefined = undefined;
  let tileType: _TileType;
  try {
    position = coordinate.toPosition(gameMap.width, gameMap.height);
    tileType = gameMap.tiles.get(position) ?? TileType.Empty;
    if (tileType === TileType.Snake &&
      getOthersHeadCoordinates(gameMap).has(_coordinate)) {
        tileType = ExtendedTileType.SnakeHead;
    }
  } catch (e) {
    tileType = TileType.Obstacle;
    position = -1;
  }
  let walkable = walkableTileTypes.has(tileType) ||
    (tileType === TileType.Snake &&
      getOthersTailCoordinates(gameMap).has(_coordinate));
  for (const _c of getOthersHeadCoordinates(gameMap)) {
    if (manhattanDistance(_c, _coordinate) === 1) {
      walkable = false;
      break;
    }
  }
  const tile: Tile = { position, coordinate, tileType, walkable };
  tileCache.tiles.set(_coordinate, tile);
  return tile;
}

export const allDirections = Object.values(Direction);

export const directionMap = new Map<Direction, Direction[]>(
  allDirections.map((d) => [
    d,
    [...allDirections].sort((a, b) => {
      if (a === d) {
        return -1;
      } else if (b === d) {
        return 1;
      }
      return 0;
    }),
  ]),
);

export interface EdgeTile extends Tile {
  direction: Direction;
}

export function getEdgeTiles(gameMap: GameMap, coordinate: Coordinate, priority = Direction.Up): EdgeTile[] {
  return (directionMap.get(priority) ?? allDirections).map((d) => {
    const edge = getTile(gameMap, coordinate.translateByDirection(d)) as EdgeTile;
    edge.direction = d;
    return edge;
  });
}

export function onlyTilesWithReach(gameMap: GameMap, tiles: Tile[], coordinate: Coordinate): Tile[] {
  const goals = new Set(tiles.map((t) => t.position));
  const reached = new Set<number | undefined>();
  const queue: Tile[] = [getTile(gameMap, coordinate)];
  const explored = new Set(queue.map((n) => n.position));
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    for (const edge of getEdgeTiles(gameMap, node.coordinate)) {
      if (edge.walkable && !explored.has(edge.position)) {
        queue.push(edge);
        explored.add(edge.position);
        if (goals.has(edge.position)) {
          reached.add(edge.position);
        }
      }
    }
  }
  return tiles.filter((t) => reached.has(t.position));
}
