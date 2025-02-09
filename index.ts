/// <reference path="./types.d.ts" />

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

import Parser from "tree-sitter";
import HCL from "./tree-sitter-hcl";

const SEP = "س";
const parser = new Parser();
parser.setLanguage(HCL);

const sourceCode = fs.readFileSync(path.join(__dirname, "sample.tf"), "utf8");
const tree = parser.parse(sourceCode);
const code = codegen(tree.rootNode);

console.log(`const config = ${code};`);

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
    case "attribute":
      return emitAttribute(node);
    case "block":
      return emitBlock(node);
    case "body":
      return emitBody(node);
    case "config_file":
      return emitConfigFile(node);
    case "collection_value":
      return emitCollectionValue(node);
    case "tuple":
      return emitTuple(node);
    case "object":
      return emitObject(node);
    case "object_elem":
      return emitObjectElem(node);
    case "variable_expr":
      return emitVariableExpr(node);
    case "function_call":
      return emitFunctionCall(node);
    case "identifier":
      return emitIdentifier(node);
    case "get_attr":
      return emitGetAttr(node);
    case "comment":
    default:
      console.log(`missing >>> ${node.type}`);
      return "";
  }
}

function emitGetAttr(node: SyntaxNode): ValueOrIntrinsic {
  return node.namedChildren.map(codegen).join(".");
}

function emitFunctionCall(node: SyntaxNode): ValueOrIntrinsic {
  const name = emitIdentifier(node.namedChildren[0]);
  const args = node.namedChildren.find((n) => n.type === "function_arguments");
  if (args) {
    return `fn_${name}(${args.namedChildren.map(codegen).join(",")})`;
  }
  return `fn_${name}()`;
}

function emitIdentifier(node: SyntaxNode): ValueOrIntrinsic {
  return `${node.text}`;
}

function emitVariableExpr(node: SyntaxNode): ValueOrIntrinsic {
  return emitIdentifier(node.namedChildren[0]);
}

function emitObjectElem(node: SyntaxNode): ValueOrIntrinsic {
  // first expression is the key, second is the value
  const key = codegen(node.namedChildren.filter((n) => n.type === "expression")[0]);
  const val = codegen(node.namedChildren.filter((n) => n.type === "expression")[1]);
  return `${key}:${val}`;
}

function emitObject(node: SyntaxNode): ValueOrIntrinsic {
  const filtered = node.namedChildren.filter((n) => n.type !== "object_start" && n.type !== "object_end");
  return `{${filtered.map(codegen).join(",")}}`;
}

function emitTuple(node: SyntaxNode): ValueOrIntrinsic {
  const filtered = node.namedChildren.filter((n) => n.type !== "tuple_start" && n.type !== "tuple_end");
  return `[${filtered.map(codegen).join(",")}]`;
}

function emitCollectionValue(node: SyntaxNode): ValueOrIntrinsic {
  return codegen(node.namedChildren[0]);
}

function emitLiteralValue(node: SyntaxNode): ValueOrIntrinsic {
  return node.text;
}

function emitExpression(node: SyntaxNode): ValueOrIntrinsic {
  const term = node.namedChildren[0];
  const rest = node.namedChildren.slice(1);
  if (rest.length) {
    return JSON.stringify({
      fn: "expressions",
      args: [
        {
          name: "term",
          value: codegen(term),
        },
        {
          name: "rest",
          value: rest.map(codegen),
        },
      ],
    } as Intrinsic);
  }
  return codegen(term);
}

function emitAttribute(node: SyntaxNode): ValueOrIntrinsic {
  const id = node.namedChildren.find((n) => n.type === "identifier");
  assert(id, `identifier not found in ${node.text}`);
  const expr = node.namedChildren.find((n) => n.type === "expression");
  assert(expr, `expression not found in ${node.text}`);
  return `${id.text}:${codegen(expr)}`;
}

function emitBlock(node: SyntaxNode): ValueOrIntrinsic {
  const name = node.namedChildren.find((n) => n.type === "identifier");
  const body = node.namedChildren.find((n) => n.type === "body");
  if (!name) {
    assert(body, `body not found in ${node.text}`);
    const b = codegen(body);
    assert(!IsParsedIntrinsic(b), `unexpected block body: ${body.text}`);
    return `...${b}`;
  }
  const rest = node.namedChildren.filter((n) => (n.type === "identifier" && n !== name) || n.type === "string_lit");
  const suffix = rest.length
    ? `${SEP}${rest
        .map((n) => {
          if (n.type === "identifier") {
            return n.text;
          }
          return JSON.parse(n.text);
        })
        .join(SEP)}`
    : "";
  const key = `${name.text}${suffix}`;
  return body ? `${key}:${codegen(body)}` : `${key}:{}`;
}

function emitBody(node: SyntaxNode): ValueOrIntrinsic {
  return `{${node.namedChildren.map(codegen).join(",")}}`;
}

function emitConfigFile(node: SyntaxNode): ValueOrIntrinsic {
  const body = node.namedChildren.find((n) => n.type === "body");
  assert(body, "body not found");
  return codegen(body);
}

export function IsParsedIntrinsic(value?: any): value is Intrinsic {
  if (value === undefined) return false;
  return typeof value === "object" && value !== null && "fn" in value && "args" in value && Array.isArray(value.args);
}
