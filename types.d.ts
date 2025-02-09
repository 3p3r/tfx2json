import type { SyntaxNode as _SyntaxNode } from "tree-sitter";
import type { ValueOrIntrinsic as _ValueOrIntrinsic, Intrinsic as _Intrinsic } from "./exports.d.ts";

declare global {
  export type SyntaxNode = _SyntaxNode;
  export type Intrinsic = _Intrinsic;
  export type ValueOrIntrinsic = _ValueOrIntrinsic;
}

declare global {
  interface Window {
    Intrinsic: _Intrinsic;
    SyntaxNode: _SyntaxNode;
    ValueOrIntrinsic: _ValueOrIntrinsic;
  }
}

export function IsParsedIntrinsic(value?: any): value is Intrinsic;
export function tfx2json(sourceCode: string): Promise<ValueOrIntrinsic>;

export default tfx2json;
