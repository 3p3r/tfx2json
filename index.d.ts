export type ValueOrIntrinsic = ScalarValue | ArrayValue | ObjectValue | Intrinsic;
export type ScalarValue = string | number | boolean | null;
export type ObjectValue = { [key: string]: ValueOrIntrinsic };
export type ArrayValue = readonly ValueOrIntrinsic[];

export interface Intrinsic {
  readonly fn: string;
  readonly args: readonly {
    readonly name: string;
    readonly value?: ValueOrIntrinsic;
  }[];
}
