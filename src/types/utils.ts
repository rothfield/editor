/**
 * Utility types used throughout the application
 */

/**
 * Make all properties in T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties in T readonly recursively
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Extract promise type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Function that may return a value or a promise
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Nullable type
 */
export type Nullable<T> = T | null;

/**
 * Optional type
 */
export type Optional<T> = T | undefined;

/**
 * JSON-serializable types
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/**
 * Generic result type (success/error)
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Point in 2D space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Rectangle (bounding box)
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Size (dimensions)
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * Range of values
 */
export interface ValueRange<T = number> {
  start: T;
  end: T;
}

/**
 * Branded types (for type safety with primitives)
 */
export type Brand<T, B> = T & { __brand: B };

/**
 * Line index (0-based)
 */
export type LineIndex = Brand<number, 'LineIndex'>;

/**
 * Column index (0-based)
 */
export type ColumnIndex = Brand<number, 'ColumnIndex'>;

/**
 * Timestamp (milliseconds since epoch)
 */
export type Timestamp = Brand<number, 'Timestamp'>;

/**
 * DOM selector string
 */
export type DOMSelector = Brand<string, 'DOMSelector'>;

/**
 * Type guard helper
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Constructor type
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Extract function parameter types
 */
export type Parameters<T extends (...args: any) => any> = T extends (
  ...args: infer P
) => any
  ? P
  : never;

/**
 * Extract function return type
 */
export type ReturnType<T extends (...args: any) => any> = T extends (
  ...args: any
) => infer R
  ? R
  : never;

/**
 * Omit keys from type
 */
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Pick only keys of certain type
 */
export type PickByType<T, ValueType> = Pick<
  T,
  { [K in keyof T]-?: T[K] extends ValueType ? K : never }[keyof T]
>;

/**
 * String literal union helper
 */
export type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;
