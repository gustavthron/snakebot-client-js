import colors from 'colors';

export enum Shade {
  light = '░░',
  medium = '▒▒',
  dark = '▓▓',
}

export enum Color {
  black = 'bgBlack',
  red = 'bgRed',
  green = 'bgGreen',
  yellow = 'bgYellow',
  blue = 'bgBlue',
  magenta = 'bgMagenta',
  cyan = 'bgCyan',
  white = 'bgWhite',
}

export enum ShadeColor {
  black = 'black',
  red = 'red',
  green = 'green',
  yellow = 'yellow',
  blue = 'blue',
  magenta = 'magenta',
  cyan = 'cyan',
  white = 'white',
}

export interface Brush {
  (): string; //(shadeOverride): string;
}

export interface ShadeBrush extends Brush {
  blue: Brush;
  magenta: Brush;
  cyan: Brush;
  green: Brush;
  red: Brush;
  yellow: Brush;
  black: Brush;
  white: Brush;
}

export interface ColorBrush extends Brush {
  light: ShadeBrush;
  medium: ShadeBrush;
  dark: ShadeBrush;
}

const noColor = ((s) => s) as colors.Color;

export function paint(color?: Color, shade?: Shade, shadeColor?: ShadeColor): string {
  const colorFn: colors.Color = color !== undefined ? colors[color] : noColor;
  const content: string = shade ?? '  ';
  const shadeColorFn: colors.Color = shadeColor !== undefined ? colors[shadeColor] : noColor;
  return colorFn(shadeColorFn(content));
}

export function createBrush(color: Color | undefined, shade: Shade, shadeColor: ShadeColor): Brush {
  return (() => paint(color, shade, shadeColor)) as Brush;
}

export function createShadeBrush(color: Color | undefined, shade: Shade): ShadeBrush {
  const tile = (() => paint(color)) as ShadeBrush;
  for (const [key, value] of Object.entries(ShadeColor)) {
    tile[<keyof typeof ShadeColor>key] = createBrush(color, shade, value);
  }
  return tile;
}

export function createColorBrush(color?: Color): ColorBrush {
  const tile = (() => paint(color)) as ColorBrush;
  for (const [key, value] of Object.entries(Shade)) {
    tile[<keyof typeof Shade>key] = createShadeBrush(color, value);
  }
  return tile;
}

export function printColors() {
  for (const color of Object.values(Color)) {
    let s = '';
    for (const shadeColor of Object.values(ShadeColor)) {
      for (const shade of Object.values(Shade)) {
        s += paint(color, shade, shadeColor);
      }
    }
    console.log(s);
  }
}

export const transparent = createColorBrush();
export const black = createColorBrush(Color.black);
export const red = createColorBrush(Color.red);
export const green = createColorBrush(Color.green);
export const yellow = createColorBrush(Color.yellow);
export const blue = createColorBrush(Color.blue);
export const magenta = createColorBrush(Color.magenta);
export const cyan = createColorBrush(Color.cyan);
export const white = createColorBrush(Color.white);
export const orange = red.medium.yellow;
export const purple = blue.medium.magenta;
export const gray = black.medium.white;

export default {
  transparent,
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  orange,
  purple,
  gray,
};

//printColors();
