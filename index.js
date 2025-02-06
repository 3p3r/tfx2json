const Parser = require('tree-sitter');
const HCL = require('./tree-sitter-hcl');

const parser = new Parser();
parser.setLanguage(HCL);

const fs = require('node:fs');
const path = require('node:path');
const { assert } = require('node:console');

const sourceCode = fs.readFileSync(path.join(__dirname, 'sample.tf'), 'utf8');
const tree = parser.parse(sourceCode);
const code = codegen(tree.rootNode);

console.log(`const config = ${code};`);

/** @param {import('tree-sitter').SyntaxNode} node */
function codegen(node) {
  switch (node.type) {
    case 'bool_lit':
    case 'null_lit':
    case 'string_lit':
    case 'numeric_lit':
    case 'literal_value':
      return emitLiteralValue(node);
    case 'expression':
      return emitExpression(node);
    case 'attribute':
      return emitAttribute(node);
    case 'block':
      return emitBlock(node);
    case 'body':
      return emitBody(node);
    case 'config_file':
      return emitConfigFile(node);
    case 'collection_value':
      return emitCollectionValue(node);
    case 'tuple':
      return emitTuple(node);
    case 'object':
      return emitObject(node);
    case 'object_elem':
      return emitObjectElem(node);
    case 'variable_expr':
      return emitVariableExpr(node);
    case 'function_call':
      return emitFunctionCall(node);
    case 'identifier':
      return emitIdentifier(node);
    case 'get_attr':
      return emitGetAttr(node);
    case 'comment':
    default:
      console.log(`missing >>> ${node.type}`);
      return '';
  }
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitGetAttr(node) {
  return node.namedChildren.map(codegen).join('.');
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitFunctionCall(node) {
  const name = emitIdentifier(node.namedChildren[0]);
  const args = node.namedChildren.find(n => n.type === 'function_arguments');
  if (args) {
    return `fn_${name}(${args.namedChildren.map(codegen).join(',')})`;
  }
  return `fn_${name}()`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitIdentifier(node) {
  return `${node.text}`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitVariableExpr(node) {
  return emitIdentifier(node.namedChildren[0]);
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitObjectElem(node) {
  // first expression is the key, second is the value
  const key = codegen(node.namedChildren.filter(n => n.type === 'expression')[0]);
  const val = codegen(node.namedChildren.filter(n => n.type === 'expression')[1]);
  return `${key}:${val}`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitObject(node) {
  const filtered = node.namedChildren.filter(n => n.type !== 'object_start' && n.type !== 'object_end');
  return `{${filtered.map(codegen).join(',')}}`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitTuple(node) {
  const filtered = node.namedChildren.filter(n => n.type !== 'tuple_start' && n.type !== 'tuple_end');
  return `[${filtered.map(codegen).join(',')}]`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitCollectionValue(node) {
  return codegen(node.namedChildren[0]);
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitLiteralValue(node) {
  return node.text;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitExpression(node) {
  return node.namedChildren.map(codegen).join('.');
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitAttribute(node) {
  const id = node.namedChildren.find(n => n.type === 'identifier');
  const expr = node.namedChildren.find(n => n.type === 'expression');
  return `${id.text}:${codegen(expr)}`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitBlock(node) {
  const name = node.namedChildren.find(n => n.type === 'identifier');
  const body = node.namedChildren.find(n => n.type === 'body');
  if (!name) {
    return `...${codegen(body)}`;
  }
  const rest = node.namedChildren.filter((n) => (n.type === 'identifier' && n !== name) || n.type === 'string_lit');
  const suffix = rest.length ? `_${rest.map((n) => {
    if (n.type === 'identifier') {
      return n.text;
    }
    return JSON.parse(n.text);
  }).join('_')}` : '';
  const key = `${name.text}${suffix}`;
  return body ? `${key}:${codegen(body)}` : `${key}:{}`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitBody(node) {
  return `{${node.namedChildren.map(codegen).join(',')}}`;
}

/** @param {import('tree-sitter').SyntaxNode} node */
function emitConfigFile(node) {
  const body = node.namedChildren.find(n => n.type === 'body');
  assert(body, 'body not found');
  return codegen(body);
}
