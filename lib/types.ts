export type CoordinateKey = string;

export interface Coordinate {
  readonly x: number;
  readonly y: number;
  readonly key: CoordinateKey;
}

export type SnakeID = string;

export interface Snake {
  id: SnakeID;
  name: string;
  points: number;
  length: number;
  tailProtectedForGameTicks: number;
  head: Coordinate;
  tail: Coordinate;
  getBodyParts(): IterableIterator<Coordinate>;
  getBodyPart(index: number): Coordinate | undefined;
  getBodyPartIndex(coordinate: Coordinate): number | undefined;
}

export enum TileType {
  Empty = 'Empty',
  Food = 'Food',
  Obstacle = 'Obstacle',
  Snake = 'Snake',
  OutOfBounds = 'OutOfBounds',
}

export interface GameMap {
  tick: number;
  playerId: SnakeID;
  player?: Snake;
  height: number;
  width: number;
  getFoods(): IterableIterator<Coordinate>;
  getObstacles(): IterableIterator<Coordinate>;
  getSnakes(): IterableIterator<Snake>;
  getSnakeById(id: SnakeID): Snake | undefined;
  getSnakeByCoordinate(coordinate: Coordinate): Snake | undefined;
  getTileType(coordinate: Coordinate): TileType;
  walkable(coordinate: Coordinate): boolean;
  paint(prepaintedTiles?: IterableIterator<[Coordinate, string]>): string;
}
