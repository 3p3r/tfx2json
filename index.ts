/// <reference path="./types.d.ts" />

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { Writable } from "node:stream";
import { randomFillSync } from "node:crypto";

import traverse from "traverse";
import IsoWASI from "wasi-js";
import type { WASIBindings } from "wasi-js";
import { type IFsWithVolume, Volume } from "memfs";
import memfs from "memfs";

import Parser from "tree-sitter";
import HCL from "./tree-sitter-hcl";

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

async function hcl2json(templatePath: string): Promise<ValueOrIntrinsic> {
  const parser = new Parser();
  parser.setLanguage(HCL);
  const sourceCode = await fs.promises.readFile(templatePath, "utf8");
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
  const wasmSource = await fs.promises.readFile(path.join(__dirname, "hcl2json.wasm"));
  const module = await WebAssembly.compile(wasmSource);
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

(async () => {
  const config = await hcl2json(path.join(__dirname, "sample.tf"));
  console.log(JSON.stringify(config, null, 2));
})();

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
    case "comment":
    default:
      console.log(`missing >>> ${node.type}`);
      return "";
  }
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
