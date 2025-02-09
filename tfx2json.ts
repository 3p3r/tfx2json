/// <reference path="./types.d.ts" />

import path from "node:path";
import assert from "node:assert";
import { Writable } from "node:stream";
import { randomFillSync } from "node:crypto";

import memfs from "memfs";
import atob from "atob-lite";
import IsoWASI from "wasi-js";
import traverse from "traverse";
import memoize from "lodash/memoize";
import type Parser from "tree-sitter";
import type { WASIBindings } from "wasi-js";
import { type IFsWithVolume, Volume } from "memfs";

import * as _TreeSitter from "./tree-sitter-hcl/docs/vendor/tree-sitter.js";
// import * as _TreeSitter from "web-tree-sitter";

// @ts-expect-error - handled by webpack loader
import HCL2JSON_WASM_BASE64 from "./hcl2json.wasm";
// @ts-expect-error - handled by webpack loader
import TREE_SITTER_WASM_BASE64 from "./tree-sitter.wasm";
// @ts-expect-error - handled by webpack loader
import TREE_SITTER_HCL_WASM_BASE64 from "./tree-sitter-hcl.wasm";

function decodeWasmFromBase64String(encoded: string) {
  const binaryString = atob(encoded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

const LoadAndGetParser = memoize(async (): Promise<Parser> => {
  // const wasmBinary1 = await fs.promises.readFile(path.join(__dirname, "tree-sitter.wasm"));
  const wasmBinary1 = decodeWasmFromBase64String(TREE_SITTER_WASM_BASE64);
  await _TreeSitter.default.init({ wasmBinary: wasmBinary1 });
  // const wasmBinary2 = await fs.promises.readFile(path.join(__dirname, "tree-sitter-hcl.wasm"));
  const wasmBinary2 = decodeWasmFromBase64String(TREE_SITTER_HCL_WASM_BASE64);
  const HCL = await _TreeSitter.default.Language.load(Buffer.from(wasmBinary2));
  const parser = new _TreeSitter.default();
  parser.setLanguage(HCL);
  return parser;
});

const bindings: () => Partial<WASIBindings> = () => ({
  hrtime: process.hrtime.bigint,
  exit(code: number) {
    this.exitCode = code;
  },
  kill(signal: string) {
    this.exitCode = signal;
  },
  randomFillSync,
  isTTY: () => true,
  path,
});

export async function tfx2json(sourceCode: string): Promise<ValueOrIntrinsic> {
  const parser = await LoadAndGetParser();
  const volume = { ...memfs.fs, ...new Volume() } as IFsWithVolume;
  volume.mkdirSync("/tmp", { recursive: true });
  volume.writeFileSync("/tmp/input.tf", sourceCode);
  const output = [] as string[];
  const stdout = new Writable({
    write(chunk, encoding, callback) {
      output.push(chunk.toString());
      callback();
    },
  });
  const stderr = new Writable();
  const wasi = new IsoWASI({
    bindings: { ...bindings(), fs: volume } as WASIBindings,
    preopens: { ".": "/tmp" },
    args: ["hcl2json", "input.tf"],
    env: process.env,
    sendStdout: (buf) => stdout.write(buf),
    sendStderr: (buf) => stderr.write(buf),
    getStdin() {
      return Buffer.from("\n");
    },
  });
  const importObject = {
    wasi_snapshot_preview1: wasi.wasiImport,
    wasi_unstable: wasi.wasiImport,
    wasi: wasi.wasiImport,
  };
  // const wasmBinary = await fs.promises.readFile(path.join(__dirname, "hcl2json.wasm"));
  const wasmBinary = decodeWasmFromBase64String(HCL2JSON_WASM_BASE64);
  const module = await WebAssembly.compile(wasmBinary);
  const instance = await WebAssembly.instantiate(module, importObject);
  wasi.start(instance);
  const raw = JSON.parse(output.join("").trim());
  const remapped = traverse(raw).map(function (value) {
    if (typeof value === "string" && value.startsWith("${")) {
      const mock = value.replace("${", "mock{mock=");
      const parsed = parser.parse(mock);
      assert(parsed.rootNode.type === "config_file");
      const body = parsed.rootNode.namedChildren.find((n) => n.type === "body");
      assert(body, "body not found");
      const block = body.namedChildren.find((n) => n.type === "block");
      assert(block, "block not found");
      const innerBody = block.namedChildren.find((n) => n.type === "body");
      assert(innerBody, "inner body not found");
      const attr = innerBody.namedChildren.find((n) => n.type === "attribute");
      assert(attr, "attribute not found");
      const expr = attr.namedChildren.find((n) => n.type === "expression");
      assert(expr, "expression not found");
      const code = codegen(expr);
      this.update(code);
    }
  });
  return remapped;
}

function codegen(node: SyntaxNode): ValueOrIntrinsic {
  switch (node.type) {
    case "bool_lit":
    case "null_lit":
    case "string_lit":
    case "numeric_lit":
    case "literal_value":
      return emitLiteralValue(node);
    case "expression":
      return emitExpression(node);
    case "variable_expr":
      return emitVariableExpr(node);
    case "function_call":
      return emitFunctionCall(node);
    case "identifier":
      return emitIdentifier(node);
    case "get_attr":
      return emitGetAttr(node);
    case "conditional":
      return emitConditional(node);
    case "index":
      return emitIndex(node);
    case "splat":
      return emitSplat(node);
    case "attr_splat":
      return emitAttrSplat(node);
    case "full_splat":
      return emitFullSplat(node);
    case "operation":
      return emitOperation(node);
    case "unary_operation":
      return emitUnaryOperation(node);
    case "binary_operation":
      return emitBinaryOperation(node);
    // todo:
    // case "collection_value":
    //   return emitCollectionValue(node);
    // case "object":
    //   return emitObject(node);
    // case "tuple":
    //   return emitTuple(node);
    // case "for_expr":
    //   return emitForExpr(node);
    // case "for_tuple_expr":
    //   return emitForTupleExpr(node);
    // case "for_object_expr":
    //   return emitForObjectExpr(node);
    // v2:
    // case "template_expr":
    //   return emitTemplateExpr(node);
    case "comment":
    default:
      console.error(`missing hcl node unparse >>> ${node.type}`);
      return "";
  }
}

function opToString(op: string): string {
  switch (op) {
    case "-":
      return "sub";
    case "+":
      return "add";
    case "*":
      return "mul";
    case "/":
      return "div";
    case "%":
      return "mod";
    case "==":
      return "eq";
    case "!=":
      return "ne";
    case ">":
      return "gt";
    case "<":
      return "lt";
    case ">=":
      return "ge";
    case "<=":
      return "le";
    case "&&":
      return "and";
    case "||":
      return "or";
    default:
      return op;
  }
}

function emitBinaryOperation(node: SyntaxNode): ValueOrIntrinsic {
  assert(node.children.length === 3);
  const lhs = codegen(node.children[0]);
  const rhs = codegen(node.children[2]);
  const op = node.children[1].text;
  return {
    fn: opToString(op),
    args: [
      {
        name: "lhs",
        value: lhs,
      },
      {
        name: "rhs",
        value: rhs,
      },
    ],
  } as Intrinsic;
}

function emitUnaryOperation(node: SyntaxNode): ValueOrIntrinsic {
  assert(node.children.length === 2);
  const operator = node.children[0].text;
  const operand = node.children[1];
  if (operand.type !== "literal_value") {
    return {
      fn: operator === "-" ? "neg" : operator === "!" ? "not" : operator,
      args: [
        {
          name: "operand",
          value: codegen(operand),
        },
      ],
    } as Intrinsic;
  }
  return codegen(node.namedChildren[0]);
}

function emitOperation(node: SyntaxNode): ValueOrIntrinsic {
  return codegen(node.namedChildren[0]);
}

function emitFullSplat(node: SyntaxNode): ValueOrIntrinsic {
  return emitAttrSplat(node);
}

function emitAttrSplat(node: SyntaxNode): ValueOrIntrinsic {
  return node.children.map((n) => {
    if (n.isNamed) return codegen(n);
    return "*";
  });
}

function emitSplat(node: SyntaxNode): ValueOrIntrinsic {
  return codegen(node.namedChildren[0]);
}

function emitConditional(node: SyntaxNode): ValueOrIntrinsic {
  const cond = node.namedChildren.find((n) => n.type === "expression");
  assert(cond, `expression not found in ${node.text}`);
  const lhs = node.namedChildren.find((n) => n.type === "expression" && n !== cond);
  assert(lhs, `lhs not found in ${node.text}`);
  const rhs = node.namedChildren.find((n) => n.type === "expression" && n !== cond && n !== lhs);
  assert(rhs, `rhs not found in ${node.text}`);
  return {
    fn: "conditional",
    args: [
      {
        name: "cond",
        value: codegen(cond),
      },
      {
        name: "true",
        value: codegen(lhs),
      },
      {
        name: "false",
        value: codegen(rhs),
      },
    ],
  } as Intrinsic;
}

function emitIndex(node: SyntaxNode): ValueOrIntrinsic {
  return Number.parseInt(emitGetAttr(node) as string);
}

function emitGetAttr(node: SyntaxNode): ValueOrIntrinsic {
  assert(node.namedChildren.length === 1);
  return node.namedChildren[0].text.replace(".", "");
}

function emitFunctionCall(node: SyntaxNode): ValueOrIntrinsic {
  const name = emitIdentifier(node.namedChildren[0]);
  const args = node.namedChildren.find((n) => n.type === "function_arguments");
  return {
    fn: name,
    args: args
      ? {
          name: "args",
          value: args.namedChildren.map(codegen),
        }
      : [],
  } as Intrinsic;
}

function emitIdentifier(node: SyntaxNode): ValueOrIntrinsic {
  return {
    fn: "identifier",
    args: [
      {
        name: "name",
        value: node.text,
      },
    ],
  } as Intrinsic;
}

function emitVariableExpr(node: SyntaxNode): ValueOrIntrinsic {
  return emitIdentifier(node.namedChildren[0]);
}

function emitLiteralValue(node: SyntaxNode): ValueOrIntrinsic {
  if (node.text === "null") return null;
  if (node.text.match(/^\d+$/)) return Number.parseInt(node.text);
  if (node.text.match(/^\d+\.\d+$/)) return Number.parseFloat(node.text);
  if (node.text === "true" || node.text === "false") return node.text === "true";
  return node.text;
}

function emitExpression(node: SyntaxNode): ValueOrIntrinsic {
  const term = node.namedChildren[0];
  const rest = node.namedChildren.slice(1);
  if (rest.length) {
    return {
      fn: "expression",
      args: [
        {
          name: "term",
          value: codegen(term),
        },
        {
          name: "rest",
          value: rest.flatMap(codegen),
        },
      ],
    } as Intrinsic;
  }
  return codegen(term);
}

export function IsParsedIntrinsic(value?: any): value is Intrinsic {
  if (value === undefined) return false;
  return typeof value === "object" && value !== null && "fn" in value && "args" in value && Array.isArray(value.args);
}

export default tfx2json;
