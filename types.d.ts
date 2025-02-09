import type { SyntaxNode as _SyntaxNode } from "tree-sitter";
import type { ValueOrIntrinsic as _ValueOrIntrinsic, Intrinsic as _Intrinsic } from "./exports";

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
