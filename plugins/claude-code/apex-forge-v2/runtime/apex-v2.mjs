#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath: schemaPath2 }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath2}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath: schemaPath2, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath2) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath2, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath: schemaPath2 } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath2}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath: schemaPath2, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath2}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath: schemaPath2, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath2 === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath: schemaPath2,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize2) {
      if (normalize2 !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath2 = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath2}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath2 = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath2}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines: lines2 } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines: lines2, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve28.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve28(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path) {
      let input = path;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(input[i])) {
          output += input[i];
        } else {
          output += escape(input[i]);
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path && path !== "/" ? path : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize2(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve28(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const { parsed: baseParsed, malformedAuthorityOrPort: baseMalformed } = parseWithStatus(baseURI, schemelessOptions);
      const { parsed: relativeParsed, malformedAuthorityOrPort: relativeMalformed } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative8, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative8 = parse(serialize(relative8, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative8.scheme) {
        target.scheme = relative8.scheme;
        target.userinfo = relative8.userinfo;
        target.host = relative8.host;
        target.port = relative8.port;
        target.path = removeDotSegments(relative8.path || "");
        target.query = relative8.query;
      } else {
        if (relative8.userinfo !== void 0 || relative8.host !== void 0 || relative8.port !== void 0) {
          target.userinfo = relative8.userinfo;
          target.host = relative8.host;
          target.port = relative8.port;
          target.path = removeDotSegments(relative8.path || "");
          target.query = relative8.query;
        } else {
          if (!relative8.path) {
            target.path = base.path;
            if (relative8.query !== void 0) {
              target.query = relative8.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative8.path[0] === "/") {
              target.path = removeDotSegments(relative8.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative8.path;
              } else if (!base.path) {
                target.path = relative8.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative8.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative8.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative8.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escapePreservingEscapes(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = new URL("http://" + parsed.host).hostname;
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
            }
          }
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.fragment) {
            try {
              parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
            } catch {
              parsed.error = parsed.error || "URI malformed";
            }
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri === "string") {
        const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts);
        return malformedAuthorityOrPort ? void 0 : normalized;
      }
      if (typeof uri === "object") {
        return serialize(uri, opts);
      }
    }
    var fastUri = {
      SCHEMES,
      normalize: normalize2,
      resolve: resolve28,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines: lines2 } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines: lines2 });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath2 = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath2}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required: required2 }) {
            return Array.isArray(required2) && required2.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation2();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv, sch) {
        return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv20202 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv20202;
    module.exports = exports = Ajv20202;
    module.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv20202;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// src/apex-v2.mjs
import {
  cpSync as cpSync4,
  existsSync as existsSync31,
  mkdtempSync as mkdtempSync4,
  readFileSync as readFileSync24,
  readdirSync as readdirSync19,
  rmSync as rmSync11,
  symlinkSync as symlinkSync4,
  writeFileSync as writeFileSync16
} from "node:fs";
import { createHash as createHash15 } from "node:crypto";
import { basename as basename10, join as join47, resolve as resolve27 } from "node:path";
import { fileURLToPath } from "node:url";

// src/cli/args.mjs
function parseArgs(items) {
  const args = {};
  const positionals = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item == null) continue;
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = items[index + 1];
      if (next == null || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    } else positionals.push(item);
  }
  args._ = positionals;
  return args;
}

// src/cli/help.mjs
function printHelp() {
  console.log(`Apex Forge V2 \u9879\u76EE\u7EA7\u5185\u6838\u539F\u578B

\u7528\u6CD5\uFF1A
  apex-v2 init --project <dir> [--name <name>]
  apex-v2 status --project <dir>
  apex-v2 validate --project <dir>
  apex-v2 intake add|list|triage --project <dir>
  apex-v2 intake import-spec --project <dir> --format native|openspec|spec-kit|auto --path <file-or-dir>
  apex-v2 capability list|show|route|verify
  apex-v2 roadmap promote --project <dir> --intake-id <id>
  apex-v2 run create|show|plan|carry|node --project <dir>
  apex-v2 artifact submit|list --project <dir>
  apex-v2 knowledge refresh --project <dir>
  apex-v2 worker create|list|sandbox|exec-shell|exec-agent|retry|fallback|results|resume|decide|submit-patch --project <dir>
  apex-v2 worker adapters --project <dir>
  apex-v2 host actions|claim|submit|cancel --project <dir> --host-id <id>
    host submit accepts --semantic-evidence-json|--semantic-evidence-file and
    --capability-evidence-json|--capability-evidence-file
  apex-v2 decision list|show|propose --project <dir>
  apex-v2 negative-control show|record-red|record-green|restore --project <dir>
  apex-v2 merge enqueue|status|resolve|apply --project <dir>
  apex-v2 verify run --project <dir> --run-id <id>
  apex-v2 review generate --project <dir> --run-id <id>
  apex-v2 learn propose|list|approve|apply --project <dir>
  apex-v2 project tick --project <dir>
    --run-agents [--agent-limit <n>] [--agent-cycles <n>]
    --learning-worker [--learning-limit <n>]
  apex-v2 project reconcile --project <dir>
  apex-v2 project metrics|quality|audit --project <dir>
  apex-v2 project git discover|guard|claim|release|claim-status --project <dir>
  apex-v2 project heartbeat --project <dir> [--force-notifications]
  apex-v2 project heartbeat install|status|daemon-start|daemon-status|daemon-stop --project <dir>
  apex-v2 contracts validate --project <dir>
  apex-v2 contracts migrate --project <dir>
  apex-v2 approval list|decide --project <dir>
  apex-v2 risk list|add|update --project <dir>
  apex-v2 notification list --project <dir>
  apex-v2 notification dispatch|acknowledge --project <dir>
`);
}

// src/core/store.mjs
import { existsSync as existsSync9 } from "node:fs";
import { join as join11, resolve as resolve6 } from "node:path";

// src/lib/common.mjs
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
var jsonWriteValidator = null;
function registerJsonWriteValidator(validator) {
  jsonWriteValidator = validator;
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function shortId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}
function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
function writeJson(path, value) {
  if (jsonWriteValidator) jsonWriteValidator(path, value);
  atomicWriteFile(path, `${JSON.stringify(value, null, 2)}
`);
}
function writeTextIfMissing(path, content) {
  if (!existsSync(path)) {
    atomicWriteFile(path, content);
  }
}
function atomicWriteFile(path, content) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const mode = existsSync(path) ? statSync(path).mode & 511 : 420;
  const tempPath = join(
    directory,
    `.${basename(path)}.tmp-${process.pid}-${randomUUID()}`
  );
  let descriptor = null;
  try {
    descriptor = openSync(tempPath, "wx", mode);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (process.env.APEX_V2_ATOMIC_WRITE_FAILPOINT === "before_rename") {
      throw new Error("atomic write failpoint: before_rename");
    }
    renameSync(tempPath, path);
    fsyncDirectory(directory);
  } finally {
    if (descriptor != null) closeSync(descriptor);
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
}
function appendDurableFile(path, content) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const existed = existsSync(path);
  let descriptor = null;
  try {
    descriptor = openSync(path, "a", 420);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (!existed) fsyncDirectory(directory);
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}
function fsyncDirectory(directory) {
  let descriptor = null;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error.code)) throw error;
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}
function bullet(items, empty = "- \u6682\u65E0\u3002") {
  if (!items || items.length === 0) return empty;
  return items.map((item) => `- ${item}`).join("\n");
}
function assertSafeRelativePath(path) {
  if (path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    throw new Error(`\u4E0D\u5B89\u5168\u7684 patch path\uFF1A${path}`);
  }
}
function dirnameForPath(path) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || ".";
}
function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}
function tail(value, max = 4e3) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}
function splitList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}
function required(args, name) {
  const value = args[name];
  if (value == null || value === true || String(value).trim() === "") {
    throw new Error(`\u7F3A\u5C11\u53C2\u6570\uFF1A--${name}`);
  }
  return String(value);
}
function normalizeEnum(value, allowed, name) {
  const normalized = String(value);
  if (!allowed.includes(normalized)) {
    throw new Error(`\u53C2\u6570 --${name} \u53EA\u80FD\u662F\uFF1A${allowed.join(", ")}`);
  }
  return normalized;
}

// src/core/action-workspace.mjs
import {
  chmodSync,
  copyFileSync,
  existsSync as existsSync8,
  lstatSync,
  mkdirSync as mkdirSync4,
  readFileSync as readFileSync7,
  readdirSync as readdirSync5,
  rmSync as rmSync3,
  symlinkSync
} from "node:fs";
import { createHash as createHash4 } from "node:crypto";
import { dirname as dirname4, join as join10, relative as relative3, resolve as resolve5, sep } from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";

// src/core/contracts.mjs
var import__ = __toESM(require__(), 1);
import { existsSync as existsSync4, readFileSync as readFileSync4, readdirSync as readdirSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { createHash } from "node:crypto";
import { basename as basename2, join as join5, relative as relative2 } from "node:path";

// src/executors/defaults.mjs
var BUILTIN_EXECUTOR_IDS = [
  "codex",
  "claude",
  "gemini",
  "deepseek-runner"
];
var DEFAULT_EXECUTOR_FALLBACK_ORDER = [
  "codex",
  "claude",
  "gemini"
];
var DEFAULT_SMOKE_EXECUTOR_IDS = [
  "codex",
  "claude",
  "gemini"
];
function defaultAllowedExecutionAdapters() {
  return ["host", "shell", "human", ...BUILTIN_EXECUTOR_IDS];
}
function defaultRetryAttempts() {
  return {
    host: 1,
    shell: 2,
    human: 1,
    ...Object.fromEntries(BUILTIN_EXECUTOR_IDS.map((id) => [id, 3]))
  };
}

// src/core/schema-paths.mjs
import { join as join2 } from "node:path";
var DEFAULT_SCHEMA_DIR = new URL("../../schemas/", import.meta.url).pathname;
function schemaDirectory() {
  return process.env.APEX_V2_SCHEMA_DIR || DEFAULT_SCHEMA_DIR;
}
function schemaPath(name) {
  return join2(schemaDirectory(), name);
}

// src/core/project-transaction.mjs
import {
  cpSync,
  existsSync as existsSync3,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync3,
  readdirSync,
  rmSync as rmSync2
} from "node:fs";
import { dirname as dirname2, join as join4, relative, resolve as resolve2 } from "node:path";

// src/core/project-lock.mjs
import {
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  renameSync as renameSync2,
  rmSync,
  statSync as statSync2,
  writeFileSync as writeFileSync2
} from "node:fs";
import { randomUUID as randomUUID2 } from "node:crypto";
import { join as join3, resolve } from "node:path";
var SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));
var HELD_LOCKS = /* @__PURE__ */ new Map();
function withProjectLock(projectDir, action, options = {}) {
  const key = resolve(projectDir);
  const held = HELD_LOCKS.get(key);
  if (held) {
    held.depth += 1;
    try {
      return action();
    } finally {
      held.depth -= 1;
    }
  }
  const release = acquireProjectLock(key, options);
  HELD_LOCKS.set(key, { depth: 1 });
  try {
    return action();
  } finally {
    HELD_LOCKS.delete(key);
    release();
  }
}
function acquireProjectLock(projectDir, options = {}) {
  const lockPath = join3(projectDir, ".apex-v2.lock");
  const ownerPath = join3(lockPath, "owner.json");
  const token = randomUUID2();
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 3e4;
  const retryMs = options.retryMs ?? 20;
  const staleGraceMs = options.staleGraceMs ?? 1e3;
  while (true) {
    try {
      mkdirSync2(lockPath);
      writeFileSync2(ownerPath, `${JSON.stringify({
        token,
        pid: process.pid,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      })}
`);
      return () => releaseOwnedLock(lockPath, ownerPath, token);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearDeadOwner(lockPath, ownerPath, staleGraceMs);
      if (!existsSync2(lockPath)) continue;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`project lock timeout\uFF1A${lockPath}`);
      }
      Atomics.wait(SLEEP_BUFFER, 0, 0, retryMs);
    }
  }
}
function clearDeadOwner(lockPath, ownerPath, staleGraceMs) {
  let owner = null;
  try {
    owner = JSON.parse(readFileSync2(ownerPath, "utf8"));
  } catch {
    if (lockAgeMs(lockPath) >= staleGraceMs) quarantineAndRemove(lockPath, null);
    return;
  }
  if (!processAlive(owner.pid)) {
    quarantineAndRemove(lockPath, owner.token);
  }
}
function quarantineAndRemove(lockPath, expectedToken) {
  if (!existsSync2(lockPath)) return;
  const quarantine = `${lockPath}.stale-${randomUUID2()}`;
  try {
    renameSync2(lockPath, quarantine);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  if (expectedToken) {
    try {
      const owner = JSON.parse(readFileSync2(join3(quarantine, "owner.json"), "utf8"));
      if (owner.token !== expectedToken) {
        if (!existsSync2(lockPath)) renameSync2(quarantine, lockPath);
        return;
      }
    } catch {
      if (!existsSync2(lockPath)) renameSync2(quarantine, lockPath);
      return;
    }
  }
  rmSync(quarantine, { recursive: true, force: true });
}
function lockAgeMs(lockPath) {
  try {
    return Date.now() - statSync2(lockPath).mtimeMs;
  } catch {
    return 0;
  }
}
function releaseOwnedLock(lockPath, ownerPath, token) {
  try {
    const owner = JSON.parse(readFileSync2(ownerPath, "utf8"));
    if (owner.token !== token) return;
  } catch {
    return;
  }
  rmSync(lockPath, { recursive: true, force: true });
}
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// src/core/project-transaction.mjs
var BACKUP_ROOT_NAME = ".apex-v2.transaction-backups";
var ACTIVE_TRANSACTIONS = /* @__PURE__ */ new Map();
function withProjectTransaction(projectDir, options, action) {
  const resolvedProject = resolve2(projectDir);
  return withProjectLock(resolvedProject, () => {
    const active = ACTIVE_TRANSACTIONS.get(resolvedProject);
    if (active) {
      active.depth += 1;
      try {
        return { result: action(), replayed: false, nested: true };
      } finally {
        active.depth -= 1;
      }
    }
    recoverStartedTransactionsUnlocked(resolvedProject);
    const root = join4(resolvedProject, ".apex-v2");
    const transactionDir = join4(root, "transactions");
    ensureDir(transactionDir);
    const replay = findCommittedTransaction(transactionDir, options.idempotencyKey);
    if (replay) return { result: replay.result, replayed: true };
    const transactionId = shortId("transaction");
    const backupDir = join4(resolvedProject, BACKUP_ROOT_NAME, transactionId);
    const rootBackup = join4(backupDir, "apex-v2");
    for (const path of options.extraPaths || []) {
      assertContainedRelativePath(resolvedProject, path);
    }
    ensureDir(backupDir);
    cpSync(root, rootBackup, { recursive: true });
    const extraSnapshots = snapshotExtraPaths(
      resolvedProject,
      options.extraPaths || [],
      backupDir
    );
    const recordPath = join4(transactionDir, `${transactionId}.json`);
    const startedAt = now();
    const startedRecord = transactionRecord({
      transactionId,
      kind: options.kind,
      idempotencyKey: options.idempotencyKey,
      status: "started",
      startedAt,
      backupPath: relative(resolvedProject, rootBackup),
      extraSnapshots
    });
    writeJson(recordPath, startedRecord);
    ACTIVE_TRANSACTIONS.set(resolvedProject, {
      transaction_id: transactionId,
      depth: 1
    });
    try {
      const result = action();
      if (process.env.APEX_V2_TRANSACTION_FAILPOINT === options.kind) {
        throw new Error(`transaction failpoint: ${options.kind}`);
      }
      writeJson(recordPath, transactionRecord({
        ...startedRecord,
        status: "committed",
        completedAt: now(),
        result
      }));
      cleanupBackup(resolvedProject, backupDir);
      return { result, replayed: false };
    } catch (error) {
      restoreTransaction(resolvedProject, startedRecord);
      ensureDir(join4(root, "transactions"));
      writeJson(join4(root, "transactions", `${transactionId}.json`), transactionRecord({
        ...startedRecord,
        status: "failed",
        completedAt: now(),
        error: error.message
      }));
      cleanupBackup(resolvedProject, backupDir);
      throw error;
    } finally {
      ACTIVE_TRANSACTIONS.delete(resolvedProject);
    }
  });
}
function recoverProjectTransactions(projectDir) {
  const resolvedProject = resolve2(projectDir);
  return withProjectLock(
    resolvedProject,
    () => recoverStartedTransactionsUnlocked(resolvedProject)
  );
}
function recoverStartedTransactionsUnlocked(projectDir) {
  const root = join4(projectDir, ".apex-v2");
  const transactionDir = join4(root, "transactions");
  if (!existsSync3(transactionDir)) {
    cleanupOrphanBackups(projectDir, /* @__PURE__ */ new Set());
    return [];
  }
  const records = readdirSync(transactionDir).filter((name) => name.endsWith(".json")).map((name) => ({ name, record: readTransaction(join4(transactionDir, name)) })).filter(({ record }) => record?.status === "started");
  const liveBackups = new Set(records.map(
    ({ record }) => dirname2(resolveContainedPath(projectDir, record.backup_path))
  ));
  const recovered = [];
  for (const { name, record } of records) {
    restoreTransaction(projectDir, record);
    const restoredRoot = join4(projectDir, ".apex-v2");
    ensureDir(join4(restoredRoot, "transactions"));
    const completedAt = now();
    const next = transactionRecord({
      ...record,
      status: "recovered",
      completedAt,
      recoveredAt: completedAt,
      error: "recovered unfinished transaction during startup"
    });
    writeJson(join4(restoredRoot, "transactions", name), next);
    const backupDir = dirname2(resolveContainedPath(projectDir, record.backup_path));
    cleanupBackup(projectDir, backupDir);
    recovered.push(next);
  }
  cleanupOrphanBackups(projectDir, liveBackups);
  return recovered;
}
function findCommittedTransaction(transactionDir, idempotencyKey) {
  if (!idempotencyKey || !existsSync3(transactionDir)) return null;
  for (const file of readdirSync(transactionDir).filter((name) => name.endsWith(".json")).sort().reverse()) {
    const record = readTransaction(join4(transactionDir, file));
    if (record?.idempotency_key === idempotencyKey && record.status === "committed") return record;
  }
  return null;
}
function readTransaction(path) {
  try {
    return JSON.parse(readFileSync3(path, "utf8"));
  } catch {
    return null;
  }
}
function transactionRecord(input) {
  return {
    schema_version: "v0",
    transaction_id: input.transactionId || input.transaction_id,
    kind: input.kind,
    idempotency_key: input.idempotencyKey || input.idempotency_key,
    status: input.status,
    started_at: input.startedAt || input.started_at,
    completed_at: input.completedAt || input.completed_at || null,
    recovered_at: input.recoveredAt || input.recovered_at || null,
    backup_path: input.backupPath || input.backup_path,
    extra_snapshots: input.extraSnapshots || input.extra_snapshots || [],
    result: input.result ?? null,
    error: input.error || null
  };
}
function snapshotExtraPaths(projectDir, paths, backupDir) {
  return paths.map((relativePath, index) => {
    assertContainedRelativePath(projectDir, relativePath);
    const source = resolve2(projectDir, relativePath);
    const backup = join4(backupDir, "extra", String(index));
    const existed = existsSync3(source);
    if (existed) {
      mkdirSync3(dirname2(backup), { recursive: true });
      cpSync(source, backup, { recursive: true });
    }
    return {
      relative_path: relativePath,
      backup_path: relative(projectDir, backup),
      existed
    };
  });
}
function restoreTransaction(projectDir, record) {
  const root = join4(projectDir, ".apex-v2");
  const rootBackup = resolveContainedPath(projectDir, record.backup_path);
  if (!existsSync3(rootBackup)) {
    throw new Error(`transaction backup \u7F3A\u5931\uFF1A${record.backup_path}`);
  }
  rmSync2(root, { recursive: true, force: true });
  cpSync(rootBackup, root, { recursive: true });
  for (const snapshot of record.extra_snapshots || []) {
    assertContainedRelativePath(projectDir, snapshot.relative_path);
    const target = resolve2(projectDir, snapshot.relative_path);
    const backup = resolveContainedPath(projectDir, snapshot.backup_path);
    rmSync2(target, { recursive: true, force: true });
    if (!snapshot.existed) continue;
    if (!existsSync3(backup)) {
      throw new Error(`transaction extra backup \u7F3A\u5931\uFF1A${snapshot.backup_path}`);
    }
    mkdirSync3(dirname2(target), { recursive: true });
    cpSync(backup, target, { recursive: true });
  }
}
function assertContainedRelativePath(projectDir, path) {
  assertSafeRelativePath(path);
  const projectRoot2 = resolve2(projectDir);
  const target = resolve2(projectRoot2, path);
  if (target !== projectRoot2 && !target.startsWith(`${projectRoot2}/`)) {
    throw new Error(`transaction path \u8D8A\u51FA\u9879\u76EE\u6839\uFF1A${path}`);
  }
}
function resolveContainedPath(projectDir, path) {
  assertContainedRelativePath(projectDir, path);
  return resolve2(projectDir, path);
}
function cleanupBackup(projectDir, backupDir) {
  rmSync2(backupDir, { recursive: true, force: true });
  const backupRoot = join4(projectDir, BACKUP_ROOT_NAME);
  if (existsSync3(backupRoot) && readdirSync(backupRoot).length === 0) {
    rmSync2(backupRoot, { recursive: true, force: true });
  }
}
function cleanupOrphanBackups(projectDir, liveBackups) {
  const backupRoot = join4(projectDir, BACKUP_ROOT_NAME);
  if (!existsSync3(backupRoot)) return;
  for (const entry of readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join4(backupRoot, entry.name);
    if (!liveBackups.has(path)) rmSync2(path, { recursive: true, force: true });
  }
  if (readdirSync(backupRoot).length === 0) {
    rmSync2(backupRoot, { recursive: true, force: true });
  }
}

// src/core/contracts.mjs
var registry = null;
var ContractValidationError = class extends Error {
  constructor(schemaName, context, errors) {
    super(`contract validation failed: ${schemaName} (${context}): ${formatAjvErrors(errors)}`);
    this.name = "ContractValidationError";
    this.schema_name = schemaName;
    this.context = context;
    this.errors = errors || [];
  }
};
function contractRegistry() {
  if (registry) return registry;
  const schemaDir = schemaDirectory();
  const ajv = new import__.default({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false
  });
  const schemas = /* @__PURE__ */ new Map();
  for (const file of readdirSync2(schemaDir).filter((entry) => entry.endsWith(".json")).sort()) {
    const schema = JSON.parse(readFileSync4(join5(schemaDir, file), "utf8"));
    schemas.set(file, schema);
    ajv.addSchema(schema, schema.$id);
  }
  const validators = /* @__PURE__ */ new Map();
  for (const [file, schema] of schemas) {
    const validate = ajv.getSchema(schema.$id);
    if (!validate) throw new Error(`\u65E0\u6CD5\u7F16\u8BD1 schema\uFF1A${file}`);
    validators.set(file, validate);
  }
  registry = { ajv, schemas, validators };
  return registry;
}
function validateContract(schemaName, value, context = schemaName) {
  const validate = contractRegistry().validators.get(schemaName);
  if (!validate) throw new Error(`\u672A\u77E5 contract schema\uFF1A${schemaName}`);
  const valid = validate(value);
  return {
    valid: Boolean(valid),
    schema_name: schemaName,
    context,
    errors: valid ? [] : structuredErrors(validate.errors)
  };
}
function assertContract(schemaName, value, context = schemaName) {
  const result = validateContract(schemaName, value, context);
  if (!result.valid) {
    throw new ContractValidationError(schemaName, context, result.errors);
  }
  return value;
}
function validatePersistedValue(path, value) {
  const targets = contractTargets(path, value);
  for (const target of targets) {
    assertContract(target.schema_name, target.value, target.context);
  }
  return targets.length;
}
function scanProjectContracts(projectDir) {
  contractRegistry();
  const root = join5(projectDir, ".apex-v2");
  const errors = [];
  let validated = 0;
  let skipped = 0;
  const files = listJsonFiles(root);
  for (const path of files) {
    let value;
    try {
      value = JSON.parse(readFileSync4(path, "utf8"));
    } catch (error) {
      errors.push({
        path: relative2(projectDir, path),
        schema_name: null,
        errors: [{ instance_path: "", keyword: "parse", message: error.message }]
      });
      continue;
    }
    const targets = contractTargets(path, value);
    if (targets.length === 0) {
      skipped += 1;
      continue;
    }
    for (const target of targets) {
      const result = validateContract(target.schema_name, target.value, target.context);
      validated += 1;
      if (!result.valid) {
        errors.push({
          path: relative2(projectDir, path),
          schema_name: target.schema_name,
          context: target.context,
          errors: result.errors
        });
      }
    }
  }
  const eventPath = join5(root, "events.jsonl");
  if (existsSync4(eventPath)) {
    for (const [index, line] of readFileSync4(eventPath, "utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const result = validateContract("event.schema.json", event, `events.jsonl:${index + 1}`);
        validated += 1;
        if (!result.valid) {
          errors.push({
            path: ".apex-v2/events.jsonl",
            schema_name: "event.schema.json",
            context: `line ${index + 1}`,
            errors: result.errors
          });
        }
      } catch (error) {
        errors.push({
          path: ".apex-v2/events.jsonl",
          schema_name: "event.schema.json",
          context: `line ${index + 1}`,
          errors: [{ instance_path: "", keyword: "parse", message: error.message }]
        });
      }
    }
  }
  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    schema_count: contractRegistry().schemas.size,
    json_files: files.length,
    validated_contracts: validated,
    skipped_files: skipped,
    errors
  };
}
function migrateLegacyContracts(projectDir, apply = false) {
  const plan = migrateLegacyContractsInternal(projectDir, false);
  if (!apply || plan.migration_count === 0) return plan;
  const planHash = createHash("sha256").update(JSON.stringify(plan.migrations)).digest("hex");
  return withProjectTransaction(projectDir, {
    kind: "contract-migration",
    idempotencyKey: `contract-migration:${planHash}`
  }, () => migrateLegacyContractsInternal(projectDir, true)).result;
}
function migrateLegacyContractsInternal(projectDir, apply) {
  const root = join5(projectDir, ".apex-v2");
  const migrations = [];
  for (const path of listJsonFiles(root)) {
    const name = basename2(path);
    const value = JSON.parse(readFileSync4(path, "utf8"));
    const fields = [];
    if (name === "project.json" && value.format_version == null) {
      value.format_version = 1;
      fields.push("format_version");
    }
    if (name === "project.json" && value.revision == null) {
      value.revision = 0;
      fields.push("revision");
    }
    if (name === "worker.json" && !value.sandbox) {
      value.sandbox = { type: "none", path: "", status: "missing" };
      fields.push("sandbox");
    }
    if (name === "worker.json" && value.adapter == null) {
      value.adapter = "shell";
      fields.push("adapter");
    }
    if (name === "worker.json" && value.executor_id == null) {
      value.executor_id = value.adapter || "shell";
      fields.push("executor_id");
    }
    if (name === "worker.json" && value.execution_class == null) {
      value.execution_class = value.output_contract === "patch" ? "workspace_patch" : value.adapter === "human" ? "human_decision" : value.adapter === "shell" ? "deterministic_check" : "cognitive";
      fields.push("execution_class");
    }
    if (name === "worker.json" && value.preferred_mode == null) {
      value.preferred_mode = value.execution_class === "deterministic_check" ? "deterministic" : value.execution_class === "human_decision" ? "human" : "factory";
      fields.push("preferred_mode");
    }
    if (name === "worker.json" && !Array.isArray(value.required_capabilities)) {
      value.required_capabilities = [];
      fields.push("required_capabilities");
    }
    if (name === "worker.json" && value.output_contract == null) {
      value.output_contract = value.status === "patch_submitted" || value.status === "queued" || value.status === "merged" ? "patch" : "evidence";
      fields.push("output_contract");
    }
    if (name === "worker.json" && value.attempt == null) {
      value.attempt = 0;
      fields.push("attempt");
    }
    if (name === "worker.json" && !("last_adapter" in value)) {
      value.last_adapter = null;
      fields.push("last_adapter");
    }
    if (name === "worker.json" && !("claim_token" in value)) {
      value.claim_token = null;
      fields.push("claim_token");
    }
    if (name === "worker.json" && !("claim_expires_at" in value)) {
      value.claim_expires_at = null;
      fields.push("claim_expires_at");
    }
    if (name === "worker.json" && value.fencing_token == null) {
      value.fencing_token = 0;
      fields.push("fencing_token");
    }
    if (name === "worker.json" && !("route_id" in value)) {
      value.route_id = null;
      fields.push("route_id");
    }
    if (name === "execution-route.json") {
      if (!("method_pack_id" in value)) {
        value.method_pack_id = "legacy";
        fields.push("method_pack_id");
      }
      if (!("cost_budget" in value)) {
        value.cost_budget = null;
        fields.push("cost_budget");
      }
      if (!("budget_status" in value)) {
        value.budget_status = "not_configured";
        fields.push("budget_status");
      }
      if (!("usage_policy" in value)) {
        value.usage_policy = "record";
        fields.push("usage_policy");
      }
    }
    if (name === "items.json" && normalizedPathIncludes(path, "/intake/")) {
      for (const item of value) {
        if (!("method_pack_id" in item)) {
          item.method_pack_id = null;
          fields.push(`intake.${item.id}.method_pack_id`);
        }
        if (!("source_spec" in item)) {
          item.source_spec = null;
          fields.push(`intake.${item.id}.source_spec`);
        }
      }
    }
    if (name === "retry.json" && normalizedPathIncludes(path, "/policies/") && value.max_attempts?.host == null) {
      value.max_attempts.host = 1;
      fields.push("max_attempts.host");
    }
    if (name === "retry.json" && normalizedPathIncludes(path, "/policies/")) {
      for (const [executorId, attempts] of Object.entries(defaultRetryAttempts())) {
        if (value.max_attempts?.[executorId] != null) continue;
        value.max_attempts[executorId] = attempts;
        fields.push(`max_attempts.${executorId}`);
      }
    }
    if (name === "execution.json" && normalizedPathIncludes(path, "/policies/") && !value.permissions?.allowed_adapters?.includes("host")) {
      value.permissions.allowed_adapters = ["host", ...value.permissions.allowed_adapters || []];
      fields.push("permissions.allowed_adapters");
    }
    if (name === "execution.json" && normalizedPathIncludes(path, "/policies/")) {
      if (!value.interactive_workspace_patch) {
        value.interactive_workspace_patch = { enabled: true };
        fields.push("interactive_workspace_patch");
      }
      if (!value.interactive_host_claim) {
        value.interactive_host_claim = { lease_seconds: 1800 };
        fields.push("interactive_host_claim");
      }
      if (!value.execution_router) {
        value.execution_router = {
          force_factory_risks: ["critical"],
          factory_on_isolation: true,
          factory_on_resume: true,
          factory_on_background: true,
          factory_on_parallel_execution: true
        };
        fields.push("execution_router");
      }
      if (!value.cost_governor) {
        value.cost_governor = {
          enabled: true,
          unknown_usage: "record",
          default_budget: {
            max_wall_minutes: 30,
            max_agent_turns: 12,
            max_tool_calls: 80,
            max_input_tokens: 16e4,
            max_output_tokens: 3e4
          },
          method_pack_budgets: {
            quick: {
              max_wall_minutes: 12,
              max_agent_turns: 6,
              max_tool_calls: 30,
              max_input_tokens: 6e4,
              max_output_tokens: 12e3
            },
            "disciplined-tdd": {
              max_wall_minutes: 30,
              max_agent_turns: 12,
              max_tool_calls: 80,
              max_input_tokens: 16e4,
              max_output_tokens: 3e4
            },
            "phase-context": {
              max_wall_minutes: 30,
              max_agent_turns: 12,
              max_tool_calls: 80,
              max_input_tokens: 16e4,
              max_output_tokens: 3e4
            },
            governed: {
              max_wall_minutes: 60,
              max_agent_turns: 24,
              max_tool_calls: 180,
              max_input_tokens: 36e4,
              max_output_tokens: 7e4
            }
          }
        };
        fields.push("cost_governor");
      }
      const missing = defaultAllowedExecutionAdapters().filter((adapter) => !value.permissions?.allowed_adapters?.includes(adapter));
      if (missing.length > 0) {
        value.permissions.allowed_adapters = [...value.permissions.allowed_adapters || [], ...missing];
        fields.push("permissions.allowed_adapters.executors");
      }
    }
    if (name === "patch-bundle.json" && !Array.isArray(value.operations)) {
      value.operations = [];
      fields.push("operations");
    }
    if (name === "sandbox.json" && value.requested_type == null) {
      value.requested_type = value.type || "scratch";
      fields.push("requested_type");
    }
    if (name === "sandbox.json" && value.fallback_reason == null) {
      value.fallback_reason = "";
      fields.push("fallback_reason");
    }
    if (fields.length === 0) continue;
    migrations.push({
      path: relative2(projectDir, path),
      fields
    });
    if (apply) writeFileSync3(path, `${JSON.stringify(value, null, 2)}
`);
  }
  return {
    status: migrations.length === 0 ? "CURRENT" : apply ? "MIGRATED" : "NEEDS_MIGRATION",
    applied: apply,
    migration_count: migrations.length,
    migrations
  };
}
function normalizedPathIncludes(path, value) {
  return path.replaceAll("\\", "/").includes(value);
}
function contractTargets(path, value) {
  const normalized = path.replaceAll("\\", "/");
  const name = basename2(path);
  const targets = [];
  const push = (schemaName, targetValue = value, suffix = "") => {
    targets.push({
      schema_name: schemaName,
      value: targetValue,
      context: `${normalized}${suffix}`
    });
  };
  const sandboxMarker = "/sandbox/";
  if (normalized.includes("/workers/") && normalized.includes(sandboxMarker)) {
    const sandboxRelative = normalized.split(sandboxMarker).at(-1);
    if (sandboxRelative !== "sandbox.json") return targets;
  }
  if (name === "project.json") push("project-state.schema.json");
  else if (name === "graph.json" && normalized.includes("/roadmap/")) push("roadmap-graph.schema.json");
  else if (name === "manifest.json" && normalized.includes("/knowledge/")) push("project-knowledge.schema.json");
  else if (name === "run.json") push("delivery-run.schema.json");
  else if (name === "plan-graph.json") push("plan-graph.schema.json");
  else if (name === "worker.json") push("worker-run.schema.json");
  else if (name === "worker-summary.json") push("worker-summary.schema.json");
  else if (name === "patch-bundle.json") push("patch-bundle.schema.json");
  else if (name === "merge-queue.json") push("merge-queue.schema.json");
  else if (name === "decision-queue.json") push("decision-queue.schema.json");
  else if (name === "verification-report.json") push("verification-report.schema.json");
  else if (name === "review-report.json") push("review-report.schema.json");
  else if (name === "integration-report.json") push("integration-report.schema.json");
  else if (name === "learning-report.json") push("learning-report.schema.json");
  else if (name === "negative-control.json") {
    push("negative-control-record.schema.json");
  } else if (name.startsWith("receipt-") && normalized.includes("/learning/receipts/")) {
    push("learning-apply-receipt.schema.json");
  } else if (name === "retry.json" && normalized.includes("/policies/")) push("retry-policy.schema.json");
  else if (name === "execution.json" && normalized.includes("/policies/")) push("execution-policy.schema.json");
  else if (name === "method-packs.json" && normalized.includes("/policies/")) push("method-pack-registry.schema.json");
  else if (name === "git.json" && normalized.includes("/delivery/")) push("git-delivery.schema.json");
  else if (name === "quality.json" && normalized.includes("/policies/")) push("quality-policy.schema.json");
  else if (name === "notifications.json" && normalized.includes("/policies/")) push("notification-policy.schema.json");
  else if (name === "gates.json" && normalized.includes("/policies/")) push("gate-policy.schema.json");
  else if (name === "register.json" && normalized.includes("/risks/")) push("risk-register.schema.json");
  else if (name === "sandbox.json") push("sandbox-manifest.schema.json");
  else if (name === "agent-result.json") push("agent-result.schema.json");
  else if (name === "host-action.json") push("host-action.schema.json");
  else if (name === "host-result.json") push("host-result.schema.json");
  else if (name === "action-workspace.json") push("action-workspace.schema.json");
  else if (name === "cognitive-evidence.json") push("cognitive-evidence.schema.json");
  else if (name.startsWith("capability-invocation-")) push("capability-invocation.schema.json");
  else if (name.startsWith("capability-evidence-")) push("capability-evidence.schema.json");
  else if (name === "execution-route.json") push("execution-route.schema.json");
  else if (name.startsWith("candidate-") && normalized.includes("/candidates/")) push("candidate-set.schema.json");
  else if (name.startsWith("transaction-") && normalized.includes("/transactions/")) push("transaction-journal.schema.json");
  else if (name.startsWith("adapter-result-")) push("adapter-result.schema.json");
  else if (name.startsWith("artifact-") && normalized.includes("/artifacts/")) push("stored-artifact.schema.json");
  else if (name.startsWith("resolution-") && normalized.includes("/resolutions/")) push("merge-resolution.schema.json");
  else if (name.startsWith("audit-") && normalized.includes("/audits/")) push("audit-report.schema.json");
  else if (name.startsWith("reconcile-") && normalized.includes("/reconciliations/")) push("reconciliation-report.schema.json");
  else if ((name.startsWith("metrics-") || name === "latest.json") && normalized.includes("/metrics/")) push("metrics-snapshot.schema.json");
  else if (name === "capabilities.json" && normalized.includes("/adapters/")) push("adapter-capabilities.schema.json");
  else if ((name.startsWith("smoke-") || name === "latest-smoke.json" || name === "latest-live-smoke.json" || name === "latest-static-smoke.json") && normalized.includes("/adapters/")) push("adapter-smoke-report.schema.json");
  else if (name.startsWith("adapter-observation-") && normalized.includes("/adapters/history/")) push("adapter-observation.schema.json");
  else if (name === "latest-trend.json" && normalized.includes("/adapters/")) push("adapter-trend-report.schema.json");
  else if (name === "outbox.json" && normalized.includes("/notifications/")) push("notification-outbox.schema.json");
  else if (name === "daemon.json" && normalized.includes("/heartbeat/")) push("heartbeat-daemon-state.schema.json");
  else if (name === "items.json" && normalized.includes("/intake/")) {
    for (const [index, item] of value.entries()) push("intake-item.schema.json", item, `#${index}`);
  } else if (name === "proposals.json" && normalized.includes("/learning/")) {
    for (const [index, item] of value.entries()) push("learning-proposal.schema.json", item, `#${index}`);
  } else if (name === "jobs.json" && normalized.includes("/learning/")) {
    for (const [index, item] of value.entries()) push("learning-apply-job.schema.json", item, `#${index}`);
  } else if (name === "index.json" && normalized.includes("/decisions/")) {
    for (const [index, item] of value.entries()) push("decision-note.schema.json", item, `#${index}`);
  } else if (name === "items.json" && normalized.includes("/approvals/")) {
    for (const [index, item] of value.entries()) push("approval-request.schema.json", item, `#${index}`);
  }
  return targets;
}
function listJsonFiles(root) {
  const files = [];
  function walk(dir) {
    if (!existsSync4(dir)) return;
    for (const entry of readdirSync2(dir, { withFileTypes: true })) {
      const path = join5(dir, entry.name);
      if (dir === root && entry.isDirectory() && entry.name === "releases") {
        continue;
      }
      if (entry.isDirectory() && entry.name === "action-workspace" && path.replaceAll("\\", "/").includes("/workers/")) {
        continue;
      }
      if (entry.isDirectory() && entry.name === "sandbox" && path.replaceAll("\\", "/").includes("/workers/")) {
        const manifest = join5(path, "sandbox.json");
        if (existsSync4(manifest)) files.push(manifest);
      } else if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  }
  walk(root);
  return files;
}
function structuredErrors(errors) {
  return (errors || []).map((error) => ({
    instance_path: error.instancePath || "",
    schema_path: error.schemaPath || "",
    keyword: error.keyword,
    message: error.message || "",
    params: error.params
  }));
}
function formatAjvErrors(errors) {
  return errors.map((error) => `${error.instance_path || "/"} ${error.message}`).join("; ");
}

// src/core/worker.mjs
import { existsSync as existsSync7, readFileSync as readFileSync6, readdirSync as readdirSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { createHash as createHash3 } from "node:crypto";
import { join as join9, resolve as resolve4 } from "node:path";
import { spawnSync } from "node:child_process";

// src/contracts/execution-capability.mjs
var CAPABILITY_PATTERN = /^[a-z][a-z0-9_]*$/;
function normalizeExecutionCapabilities(values = []) {
  const normalized = Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).sort();
  for (const capability of normalized) {
    if (!CAPABILITY_PATTERN.test(capability)) {
      throw new Error(`\u65E0\u6548 execution capability\uFF1A${capability}`);
    }
  }
  return normalized;
}
function hasExecutionCapabilities(actual = [], required2 = []) {
  const available = new Set(normalizeExecutionCapabilities(actual));
  return normalizeExecutionCapabilities(required2).every((capability) => available.has(capability));
}

// src/core/model-routing.mjs
var AGENT_MODEL_TIERS = ["cheap", "standard", "strong"];
var MODEL_TIERS = [...AGENT_MODEL_TIERS, "deterministic"];
var IMMEDIATE_ESCALATION_FAILURES = /* @__PURE__ */ new Set([
  "agent_reported_failure",
  "no_patch"
]);
var DELAYED_ESCALATION_FAILURES = /* @__PURE__ */ new Set([
  "timeout",
  "contract_error"
]);
var ADAPTER_FALLBACK_FAILURES = /* @__PURE__ */ new Set(["execution_error"]);
var NON_ESCALATING_FAILURES = /* @__PURE__ */ new Set([
  "scope_violation",
  "unsupported_change",
  "budget_exceeded"
]);
function defaultModelRoutingPolicy() {
  return {
    tier_order: [...AGENT_MODEL_TIERS],
    default_agent_tier: "standard",
    executor_models: {
      codex: {
        cheap: "gpt-5.6-luna",
        standard: "gpt-5.6-terra",
        strong: "gpt-5.6-sol"
      }
    }
  };
}
function resolveModelSelection({
  planNode: planNode2 = {},
  executionPolicy = {},
  adapter = null,
  requestedModel = null,
  worker = null,
  route = null,
  priorResults = []
}) {
  const policy = normalizedModelRoutingPolicy(executionPolicy?.model_routing);
  const executionClass = planNode2.execution_class || worker?.execution_class || legacyExecutionClass(planNode2);
  const deterministic = ["deterministic_check", "human_decision"].includes(executionClass);
  const declaredTier = planNode2.model_tier || null;
  if (declaredTier != null && !MODEL_TIERS.includes(declaredTier)) {
    throw new Error(`model_tier \u65E0\u6548\uFF1A${declaredTier}`);
  }
  if (deterministic && declaredTier && declaredTier !== "deterministic") {
    throw new Error(`deterministic node \u4E0D\u80FD\u58F0\u660E Agent \u6A21\u578B\u6863\u4F4D\uFF1A${declaredTier}`);
  }
  if (!deterministic && declaredTier === "deterministic") {
    throw new Error("Agent node \u4E0D\u80FD\u58F0\u660E deterministic \u6A21\u578B\u6863\u4F4D");
  }
  if (deterministic) {
    if (requestedModel) {
      throw new Error("deterministic node \u4E0D\u63A5\u53D7 CLI model override");
    }
    return {
      initial_model_tier: "deterministic",
      model_tier: "deterministic",
      model_id: null,
      model_reason: [declaredTier ? "plan_node=deterministic" : "execution_class=deterministic"],
      retry_action: "initial"
    };
  }
  const initialTier = firstAgentTier([
    worker?.initial_model_tier,
    route?.initial_model_tier,
    declaredTier,
    policy.default_agent_tier
  ]);
  const startingTier = strongestTier(policy, [
    initialTier,
    worker?.model_tier,
    route?.model_tier
  ]);
  const retry = retryModelDecision(startingTier, priorResults, policy);
  let modelTier = retry.model_tier;
  let modelId = modelForTier(policy, adapter, modelTier);
  const reasons = [];
  if (declaredTier) reasons.push(`plan_node=${declaredTier}`);
  else if (worker?.initial_model_tier || route?.initial_model_tier) {
    reasons.push(`initial_tier=${initialTier}`);
  } else {
    reasons.push(`default=${initialTier}`);
  }
  if (retry.reason) reasons.push(retry.reason);
  if (requestedModel) {
    const requestedTier = tierForModel(policy, adapter, requestedModel);
    if (!requestedTier) {
      throw new Error(`\u65E0\u6CD5\u5224\u5B9A CLI model \u7684\u6A21\u578B\u6863\u4F4D\uFF1A${requestedModel}`);
    }
    if (tierRank(policy, requestedTier) < tierRank(policy, modelTier)) {
      throw new Error(
        `CLI model \u4E0D\u80FD\u964D\u4F4E\u8282\u70B9\u6700\u4F4E\u6A21\u578B\u6863\u4F4D\uFF1A${requestedModel}=${requestedTier} < ${modelTier}`
      );
    }
    modelTier = requestedTier;
    modelId = requestedModel;
    reasons.push(`cli_model=${requestedModel}`);
  }
  return {
    initial_model_tier: initialTier,
    model_tier: modelTier,
    model_id: modelId,
    model_reason: Array.from(new Set(reasons)),
    retry_action: retry.action
  };
}
function retryModelDecision(currentTier, results, policy) {
  const failures = (results || []).filter((result) => result?.status === "FAIL");
  const latest = failures.at(-1);
  if (!latest) {
    return {
      model_tier: currentTier,
      action: "initial",
      reason: null
    };
  }
  const failureKind = latest.failure_kind || "unknown";
  if (IMMEDIATE_ESCALATION_FAILURES.has(failureKind)) {
    const nextTier = raiseTier(policy, currentTier);
    return {
      model_tier: nextTier,
      action: nextTier === currentTier ? "same_tier_retry" : "escalate",
      reason: nextTier === currentTier ? `retry_at_max_tier=${failureKind}` : `escalated_after=${failureKind}`
    };
  }
  if (DELAYED_ESCALATION_FAILURES.has(failureKind)) {
    const failuresAtTier = failures.filter(
      (result) => result.model_tier === currentTier && DELAYED_ESCALATION_FAILURES.has(result.failure_kind)
    ).length;
    if (failuresAtTier >= 2) {
      const nextTier = raiseTier(policy, currentTier);
      return {
        model_tier: nextTier,
        action: nextTier === currentTier ? "same_tier_retry" : "escalate",
        reason: nextTier === currentTier ? `retry_at_max_tier=${failureKind}` : `escalated_after=repeated_${failureKind}`
      };
    }
    return {
      model_tier: currentTier,
      action: "same_tier_retry",
      reason: `same_tier_retry=${failureKind}`
    };
  }
  if (ADAPTER_FALLBACK_FAILURES.has(failureKind)) {
    return {
      model_tier: currentTier,
      action: "adapter_fallback",
      reason: `adapter_fallback=${failureKind}`
    };
  }
  if (NON_ESCALATING_FAILURES.has(failureKind)) {
    return {
      model_tier: currentTier,
      action: "blocked",
      reason: `model_escalation_blocked=${failureKind}`
    };
  }
  return {
    model_tier: currentTier,
    action: "same_tier_retry",
    reason: `same_tier_retry=${failureKind}`
  };
}
function normalizedModelRoutingPolicy(value) {
  const defaults = defaultModelRoutingPolicy();
  return {
    tier_order: Array.isArray(value?.tier_order) && value.tier_order.length > 0 ? value.tier_order.filter((tier) => AGENT_MODEL_TIERS.includes(tier)) : defaults.tier_order,
    default_agent_tier: AGENT_MODEL_TIERS.includes(value?.default_agent_tier) ? value.default_agent_tier : defaults.default_agent_tier,
    executor_models: {
      ...defaults.executor_models,
      ...value?.executor_models || {}
    }
  };
}
function strongestTier(policy, candidates) {
  const valid = candidates.filter((tier) => AGENT_MODEL_TIERS.includes(tier));
  return valid.slice(1).reduce(
    (strongest, tier) => tierRank(policy, tier) > tierRank(policy, strongest) ? tier : strongest,
    valid[0] || policy.default_agent_tier
  );
}
function firstAgentTier(candidates) {
  return candidates.find((tier) => AGENT_MODEL_TIERS.includes(tier)) || "standard";
}
function tierRank(policy, tier) {
  const index = policy.tier_order.indexOf(tier);
  return index < 0 ? policy.tier_order.indexOf(policy.default_agent_tier) : index;
}
function raiseTier(policy, tier) {
  const index = tierRank(policy, tier);
  return policy.tier_order[Math.min(index + 1, policy.tier_order.length - 1)];
}
function modelForTier(policy, adapter, tier) {
  if (!adapter || tier === "deterministic") return null;
  return policy.executor_models?.[adapter]?.[tier] || null;
}
function tierForModel(policy, adapter, model) {
  const entries = Object.entries(policy.executor_models?.[adapter] || {});
  return entries.find(([, modelId]) => modelId === model)?.[0] || null;
}
function legacyExecutionClass(planNode2) {
  if (planNode2.adapter === "human" || planNode2.output_contract === "decision") {
    return "human_decision";
  }
  if (planNode2.adapter === "shell") return "deterministic_check";
  if (planNode2.output_contract === "patch") return "workspace_patch";
  return "cognitive";
}

// src/core/execution-router.mjs
function routeExecution(planNode2, executionPolicy, options = {}) {
  const executionClass = planNode2.execution_class || legacyExecutionClass2(planNode2);
  const requestedMode = options.mode || null;
  const preferredMode = planNode2.preferred_mode || legacyPreferredMode(executionClass);
  const delegatedSubagent = planNode2.delegation?.eligible === true && planNode2.delegation?.default === true && planNode2.delegation?.main_agent_required !== true;
  const hints = {
    estimated_duration_minutes: Number(planNode2.execution_hints?.estimated_duration_minutes || 0),
    requires_isolation: Boolean(planNode2.execution_hints?.requires_isolation),
    requires_resume: Boolean(planNode2.execution_hints?.requires_resume),
    background: Boolean(planNode2.execution_hints?.background),
    requires_parallel_execution: Boolean(planNode2.execution_hints?.requires_parallel_execution)
  };
  const router = executionPolicy?.execution_router || {
    force_factory_risks: ["critical"],
    factory_on_isolation: true,
    factory_on_resume: true,
    factory_on_background: true,
    factory_on_parallel_execution: true
  };
  const reasons = [];
  let mode = delegatedSubagent ? "factory" : preferredMode;
  if (executionClass === "cognitive") {
    if (delegatedSubagent) {
      mode = "factory";
      reasons.push("delegated_subagent");
    } else {
      mode = "interactive";
      reasons.push(
        planNode2.delegation?.main_agent_required === true ? "main_agent_required" : "cognitive_host"
      );
    }
  } else if (executionClass === "deterministic_check") {
    mode = "deterministic";
    reasons.push("deterministic_check");
  } else if (executionClass === "human_decision") {
    mode = "human";
    reasons.push("human_decision");
  } else {
    if (delegatedSubagent) reasons.push("delegated_subagent");
    if (executionPolicy?.interactive_workspace_patch?.enabled !== true) {
      mode = "factory";
      reasons.push("interactive_workspace_patch_disabled");
    }
    if (router.force_factory_risks?.includes(planNode2.risk)) {
      mode = "factory";
      reasons.push(`risk=${planNode2.risk}`);
    }
    for (const [enabled, required2, reason] of [
      [router.factory_on_isolation, hints.requires_isolation, "requires_isolation"],
      [router.factory_on_resume, hints.requires_resume, "requires_resume"],
      [router.factory_on_background, hints.background, "background"],
      [router.factory_on_parallel_execution, hints.requires_parallel_execution, "parallel_execution"]
    ]) {
      if (enabled && required2) {
        mode = "factory";
        reasons.push(reason);
      }
    }
  }
  if (requestedMode) {
    if (!["interactive", "factory", "deterministic", "human"].includes(requestedMode)) {
      throw new Error(`execution mode override \u65E0\u6548\uFF1A${requestedMode}`);
    }
    if (executionClass === "cognitive" && requestedMode !== "interactive" && !(requestedMode === "factory" && planNode2.delegation?.eligible === true && planNode2.delegation?.main_agent_required !== true) || executionClass === "deterministic_check" && requestedMode !== "deterministic" || executionClass === "human_decision" && requestedMode !== "human" || executionClass === "workspace_patch" && !["interactive", "factory"].includes(requestedMode)) {
      throw new Error(`execution mode override \u4E0E execution_class \u4E0D\u517C\u5BB9\uFF1A${executionClass} -> ${requestedMode}`);
    }
    if (requestedMode === "factory" && planNode2.delegation?.main_agent_required === true) {
      throw new Error("execution mode override \u4E0D\u80FD\u7ED5\u8FC7 main_agent_required");
    }
    if (executionClass === "workspace_patch" && requestedMode === "interactive" && executionPolicy?.interactive_workspace_patch?.enabled !== true) {
      throw new Error("execution policy \u7981\u6B62 Interactive workspace_patch override");
    }
    const hardFactoryReasons = reasons.filter(
      (reason) => reason.startsWith("risk=") || ["requires_isolation", "requires_resume", "background", "parallel_execution"].includes(reason)
    );
    if (executionClass === "workspace_patch" && requestedMode === "interactive" && hardFactoryReasons.length > 0) {
      throw new Error(`execution mode override \u4E0D\u80FD\u7ED5\u8FC7\u5F3A\u5236 Factory\uFF1A${hardFactoryReasons.join(",")}`);
    }
    mode = requestedMode;
    reasons.push(`user_override=${requestedMode}`);
  }
  if (reasons.length === 0) reasons.push(`preferred_mode=${mode}`);
  const methodPackId = planNode2.method_pack_id || "legacy";
  const governor = executionPolicy?.cost_governor;
  const costBudget = governor?.enabled === false ? null : governor?.method_pack_budgets?.[methodPackId] || governor?.default_budget || null;
  const budgetStatus = costBudget ? "within_budget" : "not_configured";
  if (costBudget && !["deterministic_check", "human_decision"].includes(executionClass) && hints.estimated_duration_minutes > costBudget.max_wall_minutes && options.allowBudgetOverride !== true) {
    throw new Error(
      `Cost Governor \u62D2\u7EDD\u9884\u8BA1\u8D85\u9650 route\uFF1A${hints.estimated_duration_minutes}/${costBudget.max_wall_minutes} minutes`
    );
  }
  const modelSelection = resolveModelSelection({
    planNode: planNode2,
    executionPolicy,
    adapter: options.adapter || planNode2.adapter || null,
    requestedModel: options.model || null
  });
  return {
    mode,
    preferred_mode: preferredMode,
    user_override: requestedMode,
    reasons: Array.from(new Set(reasons)),
    hints,
    required_capabilities: normalizeExecutionCapabilities(planNode2.required_capabilities || []),
    method_pack_id: methodPackId,
    cost_budget: costBudget,
    budget_status: budgetStatus,
    usage_policy: governor?.unknown_usage || "record",
    ...modelSelection
  };
}
function evaluateRouteUsage(route, execution) {
  const budget = route?.cost_budget;
  if (!budget) return { status: "NOT_CONFIGURED", exceeded: [], unknown: [] };
  const usage = execution?.usage || {};
  const measurements = [
    ["wall_minutes", execution?.duration_ms == null ? null : execution.duration_ms / 6e4, budget.max_wall_minutes],
    ["agent_turns", usage.agent_turns, budget.max_agent_turns],
    ["tool_calls", usage.tool_calls, budget.max_tool_calls],
    ["input_tokens", usage.input_tokens, budget.max_input_tokens],
    ["output_tokens", usage.output_tokens, budget.max_output_tokens]
  ];
  const exceeded = measurements.filter(([, actual, limit]) => actual != null && actual > limit).map(([metric, actual, limit]) => ({ metric, actual, limit }));
  const unknown = measurements.filter(([, actual]) => actual == null).map(([metric]) => metric);
  return {
    status: exceeded.length > 0 ? "FAIL" : unknown.length > 0 ? "UNKNOWN" : "PASS",
    exceeded,
    unknown
  };
}
function legacyExecutionClass2(planNode2) {
  if (planNode2.adapter === "human" || planNode2.output_contract === "decision") return "human_decision";
  if (planNode2.adapter === "shell") return "deterministic_check";
  if (planNode2.output_contract === "patch") return "workspace_patch";
  return "cognitive";
}
function legacyPreferredMode(executionClass) {
  if (executionClass === "deterministic_check") return "deterministic";
  if (executionClass === "human_decision") return "human";
  if (executionClass === "cognitive") return "interactive";
  return "factory";
}

// src/core/artifacts.mjs
import { existsSync as existsSync5, readdirSync as readdirSync3 } from "node:fs";
import { join as join7 } from "node:path";

// src/core/run-state.mjs
import { join as join6 } from "node:path";
function loadRun(root, runId) {
  const path = join6(root, "runs", runId, "run.json");
  const run = readJson(path, null);
  if (!run) throw new Error(`\u627E\u4E0D\u5230 run\uFF1A${runId}`);
  return run;
}
function writeRun(root, run) {
  writeJson(join6(root, "runs", run.run_id, "run.json"), run);
}
function getRunNode(run, nodeId) {
  const node = run.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error(`\u627E\u4E0D\u5230 run node\uFF1A${nodeId}`);
  return node;
}
function createRunNode(id) {
  return {
    id,
    status: "pending",
    started_at: null,
    completed_at: null,
    gate: null,
    evidence_refs: []
  };
}
function requirePassedNode(run, nodeId) {
  const node = getRunNode(run, nodeId);
  if (!["passed", "partial_pass"].includes(node.status)) {
    throw new Error(`\u751F\u6210 plan graph \u524D\u5FC5\u987B\u5148 PASS/PARTIAL_PASS ${nodeId} \u8282\u70B9\uFF0C\u5F53\u524D\u72B6\u6001\uFF1A${node.status}`);
  }
}
function promoteHandledCarrySource(run, sourceNodeId, timestamp = now()) {
  const node = getRunNode(run, sourceNodeId);
  const carryForward = (run.carry_forward || []).filter((item) => item.source_node_id === sourceNodeId);
  if (node.status !== "partial_pass" || carryForward.length === 0 || carryForward.some((item) => item.status === "open")) {
    return null;
  }
  node.status = "passed";
  node.completed_at = timestamp;
  node.evidence_refs = Array.from(/* @__PURE__ */ new Set([
    ...node.evidence_refs || [],
    ...carryForward.flatMap((item) => item.evidence_refs || [])
  ]));
  node.gate = {
    status: "PASS",
    reason: "PARTIAL_PASS carry-forward \u5DF2\u5168\u90E8\u5904\u7406\uFF0C\u6E90\u8282\u70B9\u63D0\u5347\u4E3A PASS\u3002",
    blocking: [],
    carry_forward_ids: carryForward.map((item) => item.id)
  };
  return node;
}
function closeRunIfComplete(root, run) {
  const successful = run.nodes.every((node) => ["passed", "partial_pass"].includes(node.status));
  if (!successful) return;
  const openCarry = (run.carry_forward || []).filter((item) => item.status === "open");
  if (openCarry.length > 0) {
    run.status = "paused";
    run.gate = {
      status: "ESCALATE",
      reason: `\u6240\u6709\u8282\u70B9\u5DF2\u7ED3\u675F\uFF0C\u4F46\u4ECD\u6709 ${openCarry.length} \u6761 carry-forward \u672A\u5904\u7406\u3002`,
      blocking: openCarry.map((item) => item.id),
      carry_forward_ids: openCarry.map((item) => item.id)
    };
    return;
  }
  const partialNodes = run.nodes.filter((node) => node.status === "partial_pass");
  if (partialNodes.length > 0) {
    run.status = "paused";
    run.gate = {
      status: "PARTIAL_PASS",
      reason: "\u6240\u6709 carry-forward \u5DF2\u5904\u7406\uFF0C\u4F46\u4ECD\u6709 partial pass \u8282\u70B9\u672A\u63D0\u5347\u4E3A PASS\u3002",
      blocking: partialNodes.map((node) => node.id),
      carry_forward_ids: (run.carry_forward || []).map((item) => item.id)
    };
    return;
  }
  run.status = "done";
  run.closed_at = run.closed_at || now();
  run.closure_kind = run.closure_kind || "all_nodes_passed";
  run.gate = {
    status: "PASS",
    reason: "\u6240\u6709\u8282\u70B9\u5DF2\u901A\u8FC7\u3002",
    blocking: [],
    carry_forward_ids: (run.carry_forward || []).map((item) => item.id)
  };
  const project = readJson(join6(root, "project.json"));
  updateProject(root, {
    active_runs: project.active_runs.filter((id) => id !== run.run_id),
    updated_at: now()
  });
  const roadmapPath = join6(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (roadmapNode) {
    roadmapNode.status = "done";
    roadmapNode.updated_at = now();
    roadmap.updated_at = roadmapNode.updated_at;
    writeJson(roadmapPath, roadmap);
  }
}
function recordRunClosure(root, run, via = "apex-v2") {
  if (run.status !== "done" || run.closure_event_id) return null;
  const event = appendEvent(root, "run.closed", "apex-v2", {
    run_id: run.run_id,
    roadmap_node_id: run.roadmap_node_id,
    closure_kind: run.closure_kind || "all_nodes_passed",
    closed_at: run.closed_at || now(),
    learning_proposal_ids: run.learning_proposal_ids || [],
    learning_apply_job_ids: run.learning_apply_job_ids || [],
    via
  });
  run.closure_event_id = event.event_id;
  run.closed_at = run.closed_at || event.timestamp;
  writeRun(root, run);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return event;
}
function haltRun(root, run, timestamp = now()) {
  run.status = "halted";
  run.updated_at = timestamp;
  const project = readJson(join6(root, "project.json"));
  updateProject(root, {
    active_runs: project.active_runs.filter((id) => id !== run.run_id),
    updated_at: timestamp
  });
  const roadmapPath = join6(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (roadmapNode) {
    roadmapNode.status = "blocked";
    roadmapNode.updated_at = timestamp;
    roadmap.updated_at = timestamp;
    writeJson(roadmapPath, roadmap);
  }
}
function runHandoffTemplate(run) {
  return `# Delivery Run Handoff

run_id: ${run.run_id}
roadmap_node_id: ${run.roadmap_node_id}
status: ${run.status}

## \u5F53\u524D\u72B6\u6001

- \u5DF2\u521B\u5EFA delivery run\u3002
- \u5C1A\u672A\u542F\u52A8 mandate node\u3002

## Context Snapshot

- knowledge_version: ${run.context_snapshot.knowledge_version}
- files:
${run.context_snapshot.files.map((file) => `  - ${file}`).join("\n")}

## \u4E0B\u4E00\u6B65

1. \u8865\u5168 mandate artifact\u3002
2. \u751F\u6210 context snapshot\u3002
3. \u8FDB\u5165 plan_graph\u3002
`;
}

// src/core/artifacts.mjs
function createArtifact(root, run, nodeId, input) {
  getRunNode(run, nodeId);
  const timestamp = input.timestamp || now();
  const artifact = {
    schema_version: SCHEMA_VERSION,
    artifact_id: shortId("artifact"),
    run_id: run.run_id,
    node_id: nodeId,
    type: input.type,
    title: input.title,
    body: input.body || "",
    refs: input.refs || [],
    created_at: timestamp,
    updated_at: timestamp
  };
  const dir = join7(root, "artifacts", run.run_id);
  ensureDir(dir);
  writeJson(join7(dir, `${artifact.artifact_id}.json`), artifact);
  return artifact;
}
function assertArtifact(root, runId, artifactId, expectedNodeId) {
  const artifact = readJson(join7(root, "artifacts", runId, `${artifactId}.json`), null);
  if (!artifact) throw new Error(`\u627E\u4E0D\u5230 artifact\uFF1A${artifactId}`);
  if (artifact.run_id !== runId) throw new Error(`artifact \u4E0D\u5C5E\u4E8E\u5F53\u524D run\uFF1A${artifactId}`);
  if (artifact.node_id !== expectedNodeId) {
    throw new Error(`artifact \u4E0D\u5C5E\u4E8E\u5F53\u524D node\uFF1A${artifactId} \u5C5E\u4E8E ${artifact.node_id}`);
  }
  return artifact;
}
function readDirectoryJsonFiles(dir) {
  return readdirSync3(dir).filter((file) => file.endsWith(".json")).sort();
}
function listArtifactsForRun(root, runId) {
  const dir = join7(root, "artifacts", runId);
  ensureDir(dir);
  const files = existsSync5(dir) ? Array.from(new Set(readDirectoryJsonFiles(dir))) : [];
  return files.map((file) => readJson(join7(dir, file)));
}
function listAllArtifacts(root) {
  const artifactsDir = join7(root, "artifacts");
  if (!existsSync5(artifactsDir)) return [];
  const artifacts = [];
  for (const runEntry of readdirSync3(artifactsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    for (const file of readDirectoryJsonFiles(join7(artifactsDir, runEntry.name))) {
      artifacts.push(readJson(join7(artifactsDir, runEntry.name, file)));
    }
  }
  return artifacts;
}

// src/core/capability-registry.mjs
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "node:fs";
import { createHash as createHash2 } from "node:crypto";
import { basename as basename3, dirname as dirname3, join as join8, resolve as resolve3 } from "node:path";
var DEFAULT_CAPABILITY_DIR = new URL("../../capabilities/", import.meta.url).pathname;
var PROVIDER_REQUIRED_CAPABILITIES = /* @__PURE__ */ new Set([
  "browser-qa",
  "mobile-qa",
  "performance-validation",
  "deploy-release"
]);
function capabilityRegistry() {
  const registry2 = withEnforcementOverride(
    loadCapabilityRegistry(capabilityDirectory())
  );
  const lockPath = join8(capabilityDirectory(), "capability-lock.json");
  if (!existsSync6(lockPath)) {
    throw new Error(`Capability Lock \u4E0D\u5B58\u5728\uFF1A${lockPath}`);
  }
  validateCapabilityLock(
    JSON.parse(readFileSync5(lockPath, "utf8")),
    registry2
  );
  return registry2;
}
function withEnforcementOverride(registry2) {
  const configured = String(
    process.env.APEX_CAPABILITY_ENFORCEMENT_MODE || ""
  ).trim();
  if (!configured) return registry2;
  if (!["shadow", "enforce"].includes(configured)) {
    throw new Error(
      `APEX_CAPABILITY_ENFORCEMENT_MODE \u65E0\u6548\uFF1A${configured}\uFF0C\u4EC5\u652F\u6301 shadow|enforce`
    );
  }
  return {
    ...registry2,
    enforcement_mode: configured
  };
}
function capabilityDirectory() {
  return process.env.APEX_V2_CAPABILITY_DIR || DEFAULT_CAPABILITY_DIR;
}
function loadCapabilityRegistry(root = capabilityDirectory()) {
  const registryPath = resolveRegistryPath(root);
  if (!existsSync6(registryPath)) {
    throw new Error(`Capability Registry \u4E0D\u5B58\u5728\uFF1A${registryPath}`);
  }
  const registry2 = JSON.parse(readFileSync5(registryPath, "utf8"));
  const repoRoot = basename3(dirname3(registryPath)) === "capabilities" ? dirname3(dirname3(registryPath)) : resolve3(root);
  return validateCapabilityRegistry(registry2, { repoRoot });
}
function validateCapabilityRegistry(registry2, options = {}) {
  if (!Array.isArray(registry2?.capabilities) || registry2.capabilities.length === 0) {
    throw new Error("Capability Registry \u81F3\u5C11\u5305\u542B 1 \u9879\u80FD\u529B");
  }
  assertContract("capability-registry.schema.json", registry2, "Capability Registry");
  const repoRoot = options.repoRoot || dirname3(capabilityDirectory());
  const capabilityIds = /* @__PURE__ */ new Set();
  const bindingIds = /* @__PURE__ */ new Set();
  const capabilities = registry2.capabilities.map((definition) => {
    if (capabilityIds.has(definition.capability_id)) {
      throw new Error(`Capability ID \u91CD\u590D\uFF1A${definition.capability_id}`);
    }
    capabilityIds.add(definition.capability_id);
    assertSafeRelativePath(definition.protocol_ref);
    if (!definition.protocol_ref.startsWith("capabilities/")) {
      throw new Error(`Capability protocol_ref \u4E0D\u5B89\u5168\uFF1A${definition.protocol_ref}`);
    }
    const protocolPath = resolve3(repoRoot, definition.protocol_ref);
    if (!existsSync6(protocolPath)) {
      throw new Error(`Capability protocol \u4E0D\u5B58\u5728\uFF1A${definition.protocol_ref}`);
    }
    for (const [kind, contract] of [
      ["input", definition.input_contract],
      ["output", definition.output_contract]
    ]) {
      const schemaName = `${contract}.schema.json`;
      if (!contractRegistry().validators.has(schemaName)) {
        throw new Error(
          `Capability ${kind} contract schema \u4E0D\u5B58\u5728\uFF1A${definition.capability_id} -> ${schemaName}`
        );
      }
    }
    const forbiddenTools = definition.allowed_tools.filter(
      (tool) => definition.forbidden_actions.includes(tool)
    );
    if (forbiddenTools.length > 0) {
      throw new Error(
        `Capability tool \u540C\u65F6 allowed/forbidden\uFF1A${definition.capability_id} ` + forbiddenTools.join(",")
      );
    }
    return {
      ...definition,
      protocol_path: protocolPath
    };
  });
  for (const [capabilityId, versions] of Object.entries(
    registry2.previous_versions || {}
  )) {
    const definition = capabilities.find(
      (item) => item.capability_id === capabilityId
    );
    if (!definition) {
      throw new Error(`Capability previous_versions \u5F15\u7528\u672A\u77E5\u80FD\u529B\uFF1A${capabilityId}`);
    }
    if (versions.includes(definition.version)) {
      throw new Error(
        `Capability previous_versions \u4E0D\u80FD\u5305\u542B\u5F53\u524D\u7248\u672C\uFF1A${capabilityId}@${definition.version}`
      );
    }
  }
  for (const binding of registry2.bindings || []) {
    if (bindingIds.has(binding.binding_id)) {
      throw new Error(`Capability Binding ID \u91CD\u590D\uFF1A${binding.binding_id}`);
    }
    bindingIds.add(binding.binding_id);
    if (!capabilityIds.has(binding.capability_id)) {
      throw new Error(`Capability Binding \u5F15\u7528\u672A\u77E5\u80FD\u529B\uFF1A${binding.capability_id}`);
    }
    for (const pattern of conditionPatterns(binding.conditions)) {
      try {
        new RegExp(pattern, "i");
      } catch (error) {
        throw new Error(`Capability Binding \u6B63\u5219\u65E0\u6548\uFF1A${binding.binding_id}\uFF1A${error.message}`);
      }
    }
  }
  return {
    ...registry2,
    capabilities
  };
}
function readCapabilityProtocol(protocolRef) {
  assertSafeRelativePath(protocolRef);
  if (!protocolRef.startsWith("capabilities/")) {
    throw new Error(`Capability protocol_ref \u4E0D\u5B89\u5168\uFF1A${protocolRef}`);
  }
  const path = resolve3(dirname3(capabilityDirectory()), protocolRef);
  if (!existsSync6(path)) throw new Error(`Capability protocol \u4E0D\u5B58\u5728\uFF1A${protocolRef}`);
  return readFileSync5(path, "utf8");
}
function routeCapabilities(registry2, intake) {
  const routerMode = String(
    process.env.APEX_CAPABILITY_ROUTER_MODE || "enabled"
  ).trim();
  if (!["enabled", "disabled"].includes(routerMode)) {
    throw new Error(
      `APEX_CAPABILITY_ROUTER_MODE \u65E0\u6548\uFF1A${routerMode}\uFF0C\u4EC5\u652F\u6301 enabled|disabled`
    );
  }
  if (routerMode === "disabled") {
    return {
      registry_version: registry2.registry_version,
      enforcement_mode: registry2.enforcement_mode,
      router_mode: "disabled",
      required: [],
      optional: [],
      advisory: [],
      matched_binding_ids: []
    };
  }
  const definitions = new Map(
    registry2.capabilities.filter((definition) => definition.enabled !== false).map((definition) => [definition.capability_id, definition])
  );
  const selected = /* @__PURE__ */ new Map();
  for (const binding of (registry2.bindings || []).filter((item) => item.enabled !== false).sort(
    (left, right) => right.priority - left.priority || left.binding_id.localeCompare(right.binding_id)
  )) {
    if (!matchesConditions(binding.conditions, intake)) continue;
    const definition = definitions.get(binding.capability_id);
    if (!definition || selected.has(definition.capability_id)) continue;
    selected.set(definition.capability_id, {
      capability_id: definition.capability_id,
      capability_version: definition.version,
      category: definition.category,
      execution_class: definition.execution_class,
      required_host_capabilities: definition.required_host_capabilities,
      input_contract: definition.input_contract,
      output_contract: definition.output_contract,
      protocol_ref: definition.protocol_ref,
      protocol_path: definition.protocol_path,
      availability: definition.availability,
      certification: definition.certification,
      binding_id: binding.binding_id,
      priority: binding.priority,
      mode: binding.mode,
      target_node_id: binding.plan_insertion.target_node_id,
      required: binding.plan_insertion.required
    });
  }
  const values = [...selected.values()].sort(
    (left, right) => right.priority - left.priority || left.capability_id.localeCompare(right.capability_id)
  );
  return {
    registry_version: registry2.registry_version,
    enforcement_mode: registry2.enforcement_mode,
    router_mode: "enabled",
    required: values.filter((item) => item.mode === "required"),
    optional: values.filter((item) => item.mode === "optional"),
    advisory: values.filter((item) => item.mode === "advisory"),
    matched_binding_ids: values.map((item) => item.binding_id)
  };
}
function assertCapabilityContextBudget(bindings = [], limits = { core: 3, conditional: 2 }) {
  const counts = bindings.reduce((value, binding) => {
    const category = String(binding.category || "");
    value[category] = (value[category] || 0) + 1;
    return value;
  }, {});
  for (const [category, limit] of Object.entries(limits)) {
    if ((counts[category] || 0) > limit) {
      throw new Error(
        `Capability context budget exceeded\uFF1A${category} ${counts[category]} > ${limit}\uFF1B\u5FC5\u987B\u62C6\u5206\u6216 replan`
      );
    }
  }
  return {
    counts,
    limits: { ...limits }
  };
}
function assertCapabilityProviderAvailability(bindings = [], declaredProviders = process.env.APEX_CAPABILITY_PROVIDERS || "") {
  const available = new Set(
    Array.isArray(declaredProviders) ? declaredProviders : String(declaredProviders).split(",").map((item) => item.trim()).filter(Boolean)
  );
  const missing = bindings.filter(
    (binding) => binding.required && PROVIDER_REQUIRED_CAPABILITIES.has(binding.capability_id) && !available.has(binding.capability_id)
  ).map((binding) => binding.capability_id);
  if (missing.length > 0) {
    throw new Error(
      `Capability provider unavailable\uFF1A${missing.join(", ")}\uFF1B\u901A\u8FC7 APEX_CAPABILITY_PROVIDERS \u663E\u5F0F\u58F0\u660E\u5DF2\u8BA4\u8BC1 provider`
    );
  }
  return {
    declared: [...available].sort(),
    required: bindings.filter((binding) => PROVIDER_REQUIRED_CAPABILITIES.has(binding.capability_id)).map((binding) => binding.capability_id)
  };
}
function validateCapabilityLock(lock, registry2) {
  assertContract("capability-lock.schema.json", lock, "Capability Lock");
  if (lock.registry_version !== registry2.registry_version) {
    throw new Error(
      `Capability Lock registry version drift\uFF1A${lock.registry_version} != ${registry2.registry_version}`
    );
  }
  if (JSON.stringify(lock.previous_versions || {}) !== JSON.stringify(registry2.previous_versions || {})) {
    throw new Error("Capability Lock previous_versions drift");
  }
  const definitions = new Map(
    registry2.capabilities.map((item) => [item.capability_id, item])
  );
  const seen = /* @__PURE__ */ new Set();
  for (const item of lock.capabilities) {
    if (seen.has(item.capability_id)) {
      throw new Error(`Capability Lock ID \u91CD\u590D\uFF1A${item.capability_id}`);
    }
    seen.add(item.capability_id);
    const definition = definitions.get(item.capability_id);
    if (!definition) {
      throw new Error(`Capability Lock \u5F15\u7528\u672A\u77E5\u80FD\u529B\uFF1A${item.capability_id}`);
    }
    if (item.version !== definition.version) {
      throw new Error(
        `Capability version drift\uFF1A${item.capability_id} ${item.version} != ${definition.version}`
      );
    }
    const { protocol_path: _protocolPath, ...portableDefinition } = definition;
    const definitionSha256 = createHash2("sha256").update(JSON.stringify(portableDefinition)).digest("hex");
    if (definitionSha256 !== item.definition_sha256) {
      throw new Error(
        `Capability definition hash drift\uFF1A${item.capability_id} ${item.definition_sha256} != ${definitionSha256}`
      );
    }
    const protocolSha256 = createHash2("sha256").update(readFileSync5(definition.protocol_path)).digest("hex");
    if (protocolSha256 !== item.protocol_sha256) {
      throw new Error(
        `Capability protocol hash drift\uFF1A${item.capability_id} ${item.protocol_sha256} != ${protocolSha256}`
      );
    }
    for (const [kind, contract, expected] of [
      ["input", definition.input_contract, item.input_schema_sha256],
      ["output", definition.output_contract, item.output_schema_sha256]
    ]) {
      const actual = createHash2("sha256").update(readFileSync5(schemaPath(`${contract}.schema.json`))).digest("hex");
      if (actual !== expected) {
        throw new Error(
          `Capability ${kind} schema hash drift\uFF1A${item.capability_id} ${expected} != ${actual}`
        );
      }
    }
  }
  if (seen.size !== definitions.size) {
    const missing = [...definitions.keys()].filter((id) => !seen.has(id));
    throw new Error(`Capability Lock \u7F3A\u5C11\u80FD\u529B\uFF1A${missing.join(",")}`);
  }
  return lock;
}
function resolveRegistryPath(root) {
  const direct = join8(resolve3(root), "registry.json");
  if (existsSync6(direct)) return direct;
  return join8(resolve3(root), "capabilities", "registry.json");
}
function matchesConditions(conditions, intake) {
  const checks = [];
  if (conditions.intake_types?.length > 0) {
    checks.push(conditions.intake_types.includes(String(intake.type || "")));
  }
  if (conditions.risk_levels?.length > 0) {
    checks.push(conditions.risk_levels.includes(String(intake.risk || "")));
  }
  for (const [field, patterns] of [
    ["title", conditions.title_patterns],
    ["description", conditions.description_patterns],
    ["affected_area", conditions.affected_area_patterns]
  ]) {
    if (!patterns?.length) continue;
    const value = String(intake[field] || "");
    checks.push(patterns.some((pattern) => new RegExp(pattern, "i").test(value)));
  }
  if (checks.length === 0) return false;
  return conditions.match === "all" ? checks.every(Boolean) : checks.some(Boolean);
}
function conditionPatterns(conditions = {}) {
  return [
    ...conditions.title_patterns || [],
    ...conditions.description_patterns || [],
    ...conditions.affected_area_patterns || []
  ];
}

// src/core/capability-evidence.mjs
var REQUIRED_OUTPUT_FIELDS = {
  "engineering-spec-evidence": [
    "objective",
    "in_scope",
    "out_of_scope",
    "acceptance",
    "assumptions",
    "open_questions",
    "verification_plan"
  ],
  "source-grounding-evidence": [
    "detected_version",
    "authoritative_sources",
    "verified_claims",
    "conflicts",
    "unverified_assumptions"
  ],
  "architecture-design-evidence": [
    "problem",
    "constraints",
    "alternatives",
    "selected_design",
    "state_ownership",
    "failure_modes",
    "rollback",
    "verification"
  ],
  "root-cause-evidence": [
    "reproduction",
    "observed_failure",
    "failure_signature",
    "data_flow",
    "hypotheses",
    "experiments",
    "confirmed_root_cause",
    "affected_scope",
    "fix_constraints",
    "regression_target"
  ],
  "negative-control-evidence": [
    "test_entry",
    "fault_model",
    "red_command",
    "red_signature",
    "green_command",
    "green_result",
    "restoration_result"
  ],
  "incremental-plan-evidence": [
    "slices",
    "slice_dependencies",
    "write_scopes",
    "verification_per_slice"
  ],
  "code-review-evidence": [
    "candidate_digest",
    "findings",
    "residual_risks",
    "merge_posture"
  ],
  "security-audit-evidence": [
    "scope",
    "threat_model",
    "findings",
    "residual_risks",
    "merge_posture"
  ],
  "high-risk-evidence": [
    "safety_claim",
    "assumptions",
    "adversarial_cases",
    "blast_radius",
    "rollback",
    "residual_risks"
  ],
  "test-strategy-evidence": [
    "test_mode",
    "affected_surfaces",
    "selected_test_groups",
    "excluded_groups",
    "selection_rationale",
    "stop_conditions"
  ],
  "documentation-sync-evidence": [
    "changed_behavior",
    "affected_docs",
    "updated_docs",
    "intentionally_unchanged",
    "stale_refs",
    "verification"
  ],
  "frontend-design-evidence": [
    "brief",
    "information_architecture",
    "selected_direction",
    "design_tokens",
    "layout_spec",
    "responsive_rules",
    "interaction_states",
    "acceptance"
  ],
  "design-to-code-evidence": [
    "design_artifact_ref",
    "implementation_spec",
    "component_map",
    "changed_files",
    "acceptance_checklist",
    "fidelity_findings"
  ],
  "browser-qa-evidence": [
    "url",
    "browser_provider",
    "viewport",
    "user_flows",
    "screenshots",
    "console_errors",
    "network_errors",
    "behavior_results"
  ],
  "mobile-qa-evidence": [
    "platform",
    "device",
    "os_version",
    "app_artifact",
    "flows",
    "screenshots_or_video",
    "crashes",
    "logs",
    "cleanup"
  ],
  "performance-evidence": [
    "metric",
    "baseline",
    "candidate",
    "environment_fingerprint",
    "sample_count",
    "distribution",
    "threshold",
    "verdict"
  ],
  "migration-safety-evidence": [
    "source_version",
    "target_version",
    "preconditions",
    "dry_run",
    "backup",
    "forward_steps",
    "rollback_steps",
    "idempotency",
    "replay_or_reconcile",
    "data_diff"
  ],
  "deployment-receipt": [
    "candidate_digest",
    "environment",
    "approval",
    "deployment_id",
    "started_at",
    "completed_at",
    "health_checks",
    "canary_results",
    "rollback_token"
  ],
  "project-audit-evidence": [
    "objective",
    "commitments",
    "checks",
    "findings",
    "coverage",
    "confidence",
    "unverified_items",
    "release_posture"
  ],
  "postmortem-evidence": [
    "impact",
    "timeline",
    "detection_gap",
    "root_causes",
    "failed_controls",
    "corrective_actions",
    "control_candidates",
    "owners",
    "verification"
  ],
  "simplification-evidence": [
    "candidates",
    "consumer_evidence",
    "deletion_plan",
    "risk",
    "verification_plan",
    "estimated_savings",
    "actual_savings",
    "decision"
  ]
};
function validateCapabilityEvidenceForBindings(bindings = [], evidenceItems = [], options = {}) {
  const declared = new Map(bindings.map((binding) => [
    binding.capability_id,
    binding
  ]));
  const submitted = /* @__PURE__ */ new Map();
  for (const evidence of evidenceItems || []) {
    assertContract(
      "capability-evidence.schema.json",
      evidence,
      `capability evidence:${evidence?.capability_id || "unknown"}`
    );
    const binding = declared.get(evidence.capability_id);
    if (!binding) {
      throw new Error(`Capability Evidence \u672A\u7ED1\u5B9A\uFF1A${evidence.capability_id}`);
    }
    if (submitted.has(evidence.capability_id)) {
      throw new Error(`Capability Evidence \u91CD\u590D\uFF1A${evidence.capability_id}`);
    }
    if (evidence.capability_version !== binding.capability_version) {
      throw new Error(
        `Capability Evidence version \u4E0D\u5339\u914D\uFF1A${evidence.capability_id} ${evidence.capability_version} != ${binding.capability_version}`
      );
    }
    if (evidence.output_contract !== binding.output_contract) {
      throw new Error(
        `Capability Evidence output contract \u4E0D\u5339\u914D\uFF1A${evidence.capability_id} ${evidence.output_contract} != ${binding.output_contract}`
      );
    }
    const requiredFields = REQUIRED_OUTPUT_FIELDS[evidence.output_contract];
    if (!requiredFields) {
      throw new Error(`\u672A\u77E5 Capability Evidence output contract\uFF1A${evidence.output_contract}`);
    }
    const missingFields = requiredFields.filter(
      (field) => !Object.hasOwn(evidence.output || {}, field)
    );
    if (missingFields.length > 0) {
      throw new Error(
        `Capability Evidence \u7F3A\u5C11 output \u5B57\u6BB5\uFF1A${evidence.capability_id} ${missingFields.join(",")}`
      );
    }
    assertContract(
      `${evidence.output_contract}.schema.json`,
      evidence.output,
      `capability output:${evidence.capability_id}`
    );
    const genericIssues = genericEvidenceIssues(evidence, options);
    if (genericIssues.length > 0) {
      throw new Error(
        `Capability Evidence \u8BED\u4E49\u65E0\u6548\uFF1A${evidence.capability_id} ` + genericIssues.join("; ")
      );
    }
    const semanticIssues = capabilityEvidenceSemanticIssues(evidence);
    if (semanticIssues.length > 0) {
      throw new Error(
        `Capability Evidence \u8BED\u4E49\u65E0\u6548\uFF1A${evidence.capability_id} ` + semanticIssues.join("; ")
      );
    }
    submitted.set(evidence.capability_id, evidence);
  }
  const missing = bindings.filter((binding) => binding.required).map((binding) => binding.capability_id).filter((capabilityId) => !submitted.has(capabilityId));
  const enforceRequired = options.enforceRequired ?? options.requireAll ?? true;
  if (missing.length > 0 && enforceRequired) {
    throw new Error(`\u7F3A\u5C11 required capability evidence\uFF1A${missing.join(", ")}`);
  }
  return [...submitted.values()];
}
function genericEvidenceIssues(evidence, options) {
  const issues = [];
  const normalizedClaims = evidence.claims.map(normalizeClaim);
  if (evidence.claims.some(isGenericClaim)) {
    issues.push("generic claim \u4E0D\u80FD\u4F5C\u4E3A\u5B8C\u6210\u8BC1\u636E");
  }
  if (new Set(normalizedClaims).size !== normalizedClaims.length) {
    issues.push("copied claim \u91CD\u590D");
  }
  if (hasContradictoryClaims(normalizedClaims)) {
    issues.push("claims \u5B58\u5728 contradict \u51B2\u7A81");
  }
  if (Array.isArray(options.declaredEvidenceRefs)) {
    const declared = new Set(options.declaredEvidenceRefs);
    const undeclared = [
      ...evidence.source_refs || [],
      ...evidence.verification_refs || []
    ].filter((ref) => !declared.has(ref));
    if (undeclared.length > 0) {
      issues.push(`undeclared evidence ref \u672A\u58F0\u660E\uFF1A${[...new Set(undeclared)].join(",")}`);
    }
  }
  const candidateDigest = evidence.output?.candidate_digest;
  if (options.expectedCandidateDigest && candidateDigest && candidateDigest !== options.expectedCandidateDigest) {
    issues.push(
      `candidate digest stale/\u4E0D\u5339\u914D\uFF1A${candidateDigest} != ${options.expectedCandidateDigest}`
    );
  }
  if (options.expectedEnvironmentFingerprint && evidence.output?.environment_fingerprint && evidence.output.environment_fingerprint !== options.expectedEnvironmentFingerprint) {
    issues.push(
      `environment fingerprint drift/\u4E0D\u5339\u914D\uFF1A${evidence.output.environment_fingerprint} != ${options.expectedEnvironmentFingerprint}`
    );
  }
  return issues;
}
function isGenericClaim(claim) {
  const value = normalizeClaim(claim);
  return /^(done|complete|completed|pass|passed|ok|okay|success|successful|fixed|implemented|完成|已完成|通过|成功)$/.test(
    value
  );
}
function normalizeClaim(claim) {
  return String(claim || "").trim().toLowerCase().replace(/[.,;:!?'"`(){}[\]，。；：！？“”‘’]/g, " ").replace(/\s+/g, " ");
}
function hasContradictoryClaims(claims) {
  const values = claims.map((claim) => {
    const match = claim.match(/^(not|no|without|never|不|未|无)\s*(.+)$/);
    return match ? { negated: true, value: match[2].trim() } : { negated: false, value: claim };
  });
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (values[left].value && values[left].value === values[right].value && values[left].negated !== values[right].negated) {
        return true;
      }
    }
  }
  return false;
}
function capabilityEvidenceSemanticIssues(evidence) {
  const output = evidence?.output || {};
  const issues = [];
  if (evidence.capability_id === "engineering-spec") {
    requireNonEmptyArray(output.in_scope, "in_scope", issues);
    requireNonEmptyArray(output.acceptance, "acceptance", issues);
    rejectArrayOverlap(output.in_scope, output.out_of_scope, "scope contradiction", issues);
  }
  if (evidence.capability_id === "source-grounding") {
    requireNonEmptyArray(output.authoritative_sources, "authoritative_sources", issues);
    requireNonEmptyArray(output.verified_claims, "verified_claims", issues);
    rejectArrayOverlap(
      output.verified_claims,
      output.conflicts,
      "verified claim conflicts with source evidence",
      issues
    );
  }
  if (evidence.capability_id === "architecture-design") {
    if (!Array.isArray(output.alternatives) || output.alternatives.length < 2) {
      issues.push("architecture alternatives \u5FC5\u987B\u81F3\u5C11 2 \u4E2A");
    }
    requireNonEmptyValue(output.state_ownership, "state_ownership", issues);
    requireNonEmptyValue(output.rollback, "rollback", issues);
    if (typeof output.selected_design === "string" && Array.isArray(output.alternatives) && !output.alternatives.some(
      (item) => typeof item === "string" && normalizeSemanticValue(item) === normalizeSemanticValue(output.selected_design)
    )) {
      issues.push("selected_design \u4E0D\u5728 alternatives \u4E2D");
    }
  }
  if (evidence.capability_id === "systematic-debugging") {
    if (!Array.isArray(output.hypotheses) || output.hypotheses.length < 3) {
      issues.push("debug hypotheses \u5FC5\u987B\u81F3\u5C11 3 \u4E2A");
    }
    requireNonEmptyArray(output.experiments, "experiments", issues);
    if (typeof output.confirmed_root_cause !== "string" || output.confirmed_root_cause.trim().length < 12 || /^(unknown|unclear|not sure|未知|不确定)$/i.test(
      output.confirmed_root_cause.trim()
    )) {
      issues.push("confirmed_root_cause \u4E0D\u5177\u4F53");
    }
  }
  if (evidence.capability_id === "tdd-negative-control") {
    requireNonEmptyValue(output.red_signature, "red_signature", issues);
    requireNonEmptyValue(output.red_command, "red_command", issues);
    requireNonEmptyValue(output.green_command, "green_command", issues);
    if (typeof output.test_entry === "string" && (!String(output.red_command || "").includes(output.test_entry) || !String(output.green_command || "").includes(output.test_entry))) {
      issues.push("RED/GREEN \u5FC5\u987B\u4F7F\u7528\u540C\u4E00 test_entry");
    }
  }
  if (evidence.capability_id === "incremental-delivery") {
    requireNonEmptyArray(output.slices, "slices", issues);
    requireNonEmptyValue(output.write_scopes, "write_scopes", issues);
    requireNonEmptyValue(output.verification_per_slice, "verification_per_slice", issues);
  }
  if (evidence.capability_id === "code-review") {
    requireDigest(output.candidate_digest, "candidate_digest", issues);
    if (output.merge_posture === "approve" && hasBlockingFinding(output.findings)) {
      issues.push("blocking review finding \u4E0D\u80FD approve");
    }
  }
  if (evidence.capability_id === "security-audit") {
    if (output.merge_posture === "approve" && hasBlockingFinding(output.findings)) {
      issues.push("critical/high security finding \u4E0D\u80FD approve");
    }
  }
  if (evidence.capability_id === "high-risk-review") {
    requireNonEmptyArray(output.assumptions, "assumptions", issues);
    requireNonEmptyArray(output.adversarial_cases, "adversarial_cases", issues);
    requireNonEmptyValue(output.rollback, "rollback", issues);
  }
  if (evidence.capability_id === "test-strategy") {
    requireNonEmptyArray(output.selected_test_groups, "selected_test_groups", issues);
    requireNonEmptyValue(output.selection_rationale, "selection_rationale", issues);
    const onlySmoke = (output.selected_test_groups || []).length > 0 && output.selected_test_groups.every((item) => /\bsmoke\b/i.test(String(item)));
    const highRiskSurface = (output.affected_surfaces || []).some(
      (item) => /\b(auth(?:orization|entication)?|security|permission|migration|deploy|trading|payment|credential)\b/i.test(
        String(item)
      )
    );
    if (onlySmoke && highRiskSurface) {
      issues.push("high-risk surface \u4E0D\u80FD\u53EA\u9009\u62E9 smoke tests");
    }
  }
  if (evidence.capability_id === "documentation-sync") {
    const affected = new Set(output.affected_docs || []);
    const handled = /* @__PURE__ */ new Set([
      ...output.updated_docs || [],
      ...output.intentionally_unchanged || []
    ]);
    const missing = [...affected].filter((item) => !handled.has(item));
    if (missing.length > 0) {
      issues.push(`affected_docs \u672A\u5904\u7406\uFF1A${missing.join(",")}`);
    }
  }
  if (evidence.capability_id === "frontend-design") {
    requireNonEmptyValue(output.brief, "brief", issues);
    requireNonEmptyValue(output.information_architecture, "information_architecture", issues);
    requireNonEmptyValue(output.selected_direction, "selected_direction", issues);
    requireNonEmptyValue(output.design_tokens, "design_tokens", issues);
    requireNonEmptyArray(output.acceptance, "acceptance", issues);
  }
  if (evidence.capability_id === "design-to-code") {
    requireNonEmptyValue(output.design_artifact_ref, "design_artifact_ref", issues);
    requireNonEmptyValue(output.implementation_spec, "implementation_spec", issues);
    requireNonEmptyValue(output.component_map, "component_map", issues);
    requireNonEmptyValue(output.acceptance_checklist, "acceptance_checklist", issues);
  }
  if (evidence.capability_id === "browser-qa") {
    requireNonEmptyValue(output.url, "url", issues);
    requireNonEmptyArray(output.user_flows, "user_flows", issues);
    requireNonEmptyArray(output.screenshots, "screenshots", issues);
    requireNonEmptyValue(output.behavior_results, "behavior_results", issues);
    if (claimsAssertSuccess(evidence.claims) && (hasFailureStatus(output.behavior_results) || hasRecordedIssues(output.console_errors) || hasRecordedIssues(output.network_errors))) {
      issues.push("Browser PASS \u4E0E behavior/console/network failure \u51B2\u7A81");
    }
  }
  if (evidence.capability_id === "mobile-qa") {
    requireNonEmptyValue(output.platform, "platform", issues);
    requireNonEmptyValue(output.device, "device", issues);
    requireNonEmptyValue(output.app_artifact, "app_artifact", issues);
    requireNonEmptyArray(output.flows, "flows", issues);
    requireNonEmptyValue(output.screenshots_or_video, "screenshots_or_video", issues);
    requireNonEmptyValue(output.cleanup, "cleanup", issues);
    if (claimsAssertSuccess(evidence.claims) && hasRecordedIssues(output.crashes)) {
      issues.push("Mobile PASS \u4E0E crash evidence \u51B2\u7A81");
    }
  }
  if (evidence.capability_id === "performance-validation") {
    requireNonEmptyValue(output.environment_fingerprint, "environment_fingerprint", issues);
    if (!Number.isInteger(output.sample_count) || output.sample_count < 5) {
      issues.push("performance sample_count \u5FC5\u987B\u81F3\u5C11 5");
    }
    requireNonEmptyValue(output.distribution, "distribution", issues);
    requireNonEmptyValue(output.threshold, "threshold", issues);
  }
  if (evidence.capability_id === "migration-safety") {
    requireNonEmptyValue(output.dry_run, "dry_run", issues);
    requireNonEmptyValue(output.backup, "backup", issues);
    requireNonEmptyValue(output.rollback_steps, "rollback_steps", issues);
    requireNonEmptyValue(output.idempotency, "idempotency", issues);
    requireNonEmptyValue(output.replay_or_reconcile, "replay_or_reconcile", issues);
    if (claimsAssertSuccess(evidence.claims) && (hasFailureStatus([output.dry_run]) || hasFailureStatus([output.replay_or_reconcile]))) {
      issues.push("Migration PASS \u4E0E dry-run/reconcile failure \u51B2\u7A81");
    }
  }
  if (evidence.capability_id === "deploy-release") {
    requireDigest(output.candidate_digest, "candidate_digest", issues);
    requireNonEmptyValue(output.approval, "approval", issues);
    requireNonEmptyValue(output.health_checks, "health_checks", issues);
    requireNonEmptyValue(output.rollback_token, "rollback_token", issues);
    if (claimsAssertSuccess(evidence.claims) && (hasFailureStatus(output.health_checks) || hasFailureStatus(output.canary_results))) {
      issues.push("Deploy PASS \u4E0E health/canary failure \u51B2\u7A81");
    }
  }
  if (evidence.capability_id === "project-audit") {
    requireNonEmptyArray(output.commitments, "commitments", issues);
    requireNonEmptyArray(output.checks, "checks", issues);
    requireNonEmptyValue(output.release_posture, "release_posture", issues);
    if (["PASS", "GO"].includes(output.release_posture) && (hasFailureStatus(output.checks) || Number(output.coverage) < 1 || hasRecordedIssues(output.unverified_items))) {
      issues.push("Audit PASS \u542B\u5931\u8D25\u68C0\u67E5\u3001\u8986\u76D6\u7F3A\u53E3\u6216\u672A\u9A8C\u8BC1\u9879");
    }
  }
  if (evidence.capability_id === "postmortem") {
    requireNonEmptyValue(output.impact, "impact", issues);
    requireNonEmptyArray(output.failed_controls, "failed_controls", issues);
    requireNonEmptyArray(output.corrective_actions, "corrective_actions", issues);
    requireNonEmptyArray(output.control_candidates, "control_candidates", issues);
    requireNonEmptyValue(output.verification, "verification", issues);
  }
  if (evidence.capability_id === "simplification") {
    requireNonEmptyArray(output.candidates, "candidates", issues);
    requireNonEmptyValue(output.consumer_evidence, "consumer_evidence", issues);
    requireNonEmptyValue(output.verification_plan, "verification_plan", issues);
    if (!Object.hasOwn(output, "actual_savings")) {
      issues.push("actual_savings \u5FC5\u987B\u663E\u5F0F\u8BB0\u5F55\u6216\u4E3A null");
    }
    if (output.decision === "delete" && (output.consumer_evidence || []).some(hasActiveConsumerEvidence)) {
      issues.push("\u5B58\u5728\u771F\u5B9E consumer \u65F6\u4E0D\u80FD delete");
    }
  }
  return issues;
}
function requireNonEmptyArray(value, name, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${name} \u4E0D\u80FD\u4E3A\u7A7A`);
  }
}
function requireNonEmptyValue(value, name, issues) {
  if (value == null || typeof value === "string" && value.trim() === "" || Array.isArray(value) && value.length === 0 || typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    issues.push(`${name} \u4E0D\u80FD\u4E3A\u7A7A`);
  }
}
function requireDigest(value, name, issues) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    issues.push(`${name} \u5FC5\u987B\u662F candidate digest`);
  }
}
function rejectArrayOverlap(left, right, label, issues) {
  const rightValues = new Set((right || []).filter((item) => typeof item === "string").map(normalizeSemanticValue));
  const overlap = (left || []).filter((item) => typeof item === "string").filter((item) => rightValues.has(normalizeSemanticValue(item)));
  if (overlap.length > 0) {
    issues.push(`${label}\uFF1A${overlap.join(",")}`);
  }
}
function normalizeSemanticValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function claimsAssertSuccess(claims = []) {
  return claims.some(
    (claim) => /\b(pass|passed|success|successful|safe|approved|ready)\b|通过|成功|安全|可发布/i.test(
      String(claim)
    )
  );
}
function hasRecordedIssues(values) {
  return Array.isArray(values) && values.length > 0;
}
function hasFailureStatus(values = []) {
  return (values || []).some((value) => {
    if (typeof value === "string") {
      return /\b(fail|failed|error|blocked|inconsistent|unhealthy)\b/i.test(value);
    }
    return /\b(fail|failed|error|blocked|inconsistent|unhealthy)\b/i.test(
      String(value?.status || value?.verdict || value?.result || "")
    );
  });
}
function hasActiveConsumerEvidence(value) {
  if (typeof value === "string") {
    return /\b(exists|active|used|imported|consumer found|production import)\b/i.test(value) && !/\b(no|none|not|zero|absent|unused)\b/i.test(value);
  }
  return Boolean(
    value?.active === true || value?.exists === true || ["active", "used", "present"].includes(value?.status)
  );
}
function hasBlockingFinding(findings) {
  return (findings || []).some((finding) => {
    if (typeof finding === "string") {
      return /\b(P0|P1|critical|high|blocking)\b/i.test(finding);
    }
    return Boolean(
      finding?.blocking || ["P0", "P1", "critical", "high"].includes(finding?.severity)
    );
  });
}
function assertCapabilityEvidence(bindings = [], evidenceItems = [], options = {}) {
  const validated = validateCapabilityEvidenceForBindings(
    bindings,
    evidenceItems,
    options
  );
  const submitted = new Set(validated.map((item) => item.capability_id));
  return {
    required: bindings.filter((binding) => binding.required).map((binding) => binding.capability_id),
    submitted: [...submitted],
    missing: bindings.filter((binding) => binding.required).map((binding) => binding.capability_id).filter((capabilityId) => !submitted.has(capabilityId))
  };
}

// src/core/worker.mjs
function createWorkerForPlanNode(root, run, planNode2, options = {}) {
  const generation = getWorkers(root, run.run_id).filter((worker) => worker.plan_node_id === planNode2.id).length + 1;
  return withProjectTransaction(resolve4(root, ".."), {
    kind: "worker-create",
    idempotencyKey: `worker-create:${run.run_id}:${planNode2.id}:${generation}`
  }, () => createWorkerForPlanNodeTransaction(root, run, planNode2, options)).result;
}
function createWorkerForPlanNodeTransaction(root, run, planNode2, options) {
  const timestamp = now();
  assertCapabilityProviderAvailability(planNode2.capability_bindings || []);
  const workerId = shortId("worker");
  const namespace = `.apex-v2/runs/${run.run_id}/workers/${workerId}`;
  const executionPolicy = readJson(join9(root, "policies", "execution.json"));
  const route = routeExecution(planNode2, executionPolicy, options);
  const assignment = resolveWorkerAssignment(planNode2, executionPolicy, route);
  const modelSelection = resolveModelSelection({
    planNode: planNode2,
    executionPolicy,
    adapter: assignment.adapter
  });
  Object.assign(route, modelSelection);
  const worker = {
    schema_version: SCHEMA_VERSION,
    worker_id: workerId,
    run_id: run.run_id,
    plan_node_id: planNode2.id,
    status: "active",
    namespace,
    sandbox: {
      type: "none",
      path: "",
      status: "missing"
    },
    ...assignment,
    initial_model_tier: modelSelection.initial_model_tier,
    model_tier: modelSelection.model_tier,
    model_id: modelSelection.model_id,
    model_reason: modelSelection.model_reason,
    output_contract: planNode2.output_contract || "evidence",
    objective: planNode2.objective,
    deliverables: planNode2.deliverables,
    required_evidence: planNode2.required_evidence,
    capability_bindings: planNode2.capability_bindings || [],
    capability_enforcement: planNode2.capability_enforcement || "shadow",
    capability_invocation_refs: [],
    read_scope: planNode2.read_scope,
    write_scope: planNode2.write_scope,
    verification: planNode2.verification,
    attempt: 0,
    last_adapter: null,
    claim_token: null,
    claim_expires_at: null,
    fencing_token: 0,
    execution_claim_token: null,
    execution_claimed_at: null,
    execution_claim_expires_at: null,
    execution_fencing_token: 0,
    route_id: null,
    created_at: timestamp,
    updated_at: timestamp
  };
  const dir = workerDir(root, run.run_id, workerId);
  ensureDir(dir);
  worker.capability_invocation_refs = persistCapabilityInvocations(
    dir,
    worker,
    timestamp
  );
  const routeRecord = {
    schema_version: SCHEMA_VERSION,
    route_id: shortId("route"),
    run_id: run.run_id,
    worker_id: workerId,
    plan_node_id: planNode2.id,
    ...route,
    created_at: timestamp
  };
  worker.route_id = routeRecord.route_id;
  writeJson(join9(dir, "execution-route.json"), routeRecord);
  writeJson(join9(dir, "worker.json"), worker);
  writeTextIfMissing(join9(dir, "README.md"), workerReadme(worker, planNode2));
  const event = appendEvent(root, "worker.created", "apex-v2", {
    run_id: run.run_id,
    worker_id: workerId,
    plan_node_id: planNode2.id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return worker;
}
function persistCapabilityInvocations(dir, worker, timestamp) {
  return (worker.capability_bindings || []).map((binding) => {
    const input = {
      schema_version: SCHEMA_VERSION,
      capability_id: binding.capability_id,
      objective: worker.objective,
      context_refs: uniqueStrings(worker.read_scope),
      constraints: uniqueStrings([
        ...(worker.write_scope || []).map((scope) => `write_scope:${scope}`),
        `execution_class:${worker.execution_class}`
      ]),
      acceptance_refs: uniqueStrings(worker.required_evidence),
      verification: uniqueStrings(worker.verification),
      candidate_digest: null,
      environment: null,
      created_at: timestamp
    };
    assertContract(
      `${binding.input_contract}.schema.json`,
      input,
      `capability input:${worker.worker_id}:${binding.capability_id}`
    );
    const invocation = {
      schema_version: SCHEMA_VERSION,
      invocation_id: `capinv-${worker.worker_id}-${binding.capability_id}`,
      run_id: worker.run_id,
      plan_node_id: worker.plan_node_id,
      worker_id: worker.worker_id,
      capability_id: binding.capability_id,
      capability_version: binding.capability_version,
      input_contract: binding.input_contract,
      input_artifact_refs: uniqueStrings(worker.read_scope),
      input,
      output_contract: binding.output_contract,
      required: binding.required,
      created_at: timestamp
    };
    assertContract(
      "capability-invocation.schema.json",
      invocation,
      `capability invocation:${worker.worker_id}:${binding.capability_id}`
    );
    const name = `capability-invocation-${binding.capability_id}.json`;
    writeJson(join9(dir, name), invocation);
    return `${worker.namespace}/${name}`;
  });
}
function uniqueStrings(values = []) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}
function resolveWorkerAssignment(planNode2, executionPolicy, route = routeExecution(planNode2, executionPolicy)) {
  const executionClass = planNode2.execution_class || legacyExecutionClass3(planNode2);
  const preferredMode = route.mode;
  const requiredCapabilities = route.required_capabilities;
  let adapter = planNode2.adapter;
  if (!adapter) {
    if (executionClass === "cognitive" && preferredMode === "interactive") adapter = "host";
    else if (executionClass === "deterministic_check") adapter = "shell";
    else if (executionClass === "human_decision") adapter = "human";
    else {
      adapter = (executionPolicy?.permissions?.adapter_fallback_order || []).find((candidate) => executionPolicy.permissions.allowed_adapters.includes(candidate));
    }
  }
  if (!adapter) throw new Error(`\u65E0\u6CD5\u4E3A plan node \u9009\u62E9 WorkerExecutor\uFF1A${planNode2.id || "(unknown)"}`);
  return {
    adapter,
    executor_id: adapter,
    execution_class: executionClass,
    preferred_mode: preferredMode,
    required_capabilities: requiredCapabilities
  };
}
function legacyExecutionClass3(planNode2) {
  if (planNode2.adapter === "human" || planNode2.output_contract === "decision") return "human_decision";
  if (planNode2.adapter === "shell") return "deterministic_check";
  if (planNode2.output_contract === "patch") return "workspace_patch";
  return "cognitive";
}
function getWorkers(root, runId) {
  const dir = join9(root, "runs", runId, "workers");
  if (!existsSync7(dir)) {
    return [];
  }
  return readdirSync4(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => readJson(join9(dir, entry.name, "worker.json"), null)).filter(Boolean);
}
function claimWorkerExecution(root, workerId, leaseMs, via = "project.tick") {
  const claimToken = shortId("exec-claim");
  return withProjectLock(resolve4(root, ".."), () => {
    const worker = findWorker(root, workerId);
    const currentExpiry = Date.parse(worker.execution_claim_expires_at || "");
    if (worker.status === "running" && Number.isFinite(currentExpiry) && currentExpiry > Date.now()) {
      return {
        claimed: false,
        reason: "already-running",
        worker
      };
    }
    if (worker.status === "running") {
      worker.status = "active";
    }
    if (worker.status !== "active") {
      return {
        claimed: false,
        reason: `worker-status=${worker.status}`,
        worker
      };
    }
    const timestamp = now();
    worker.status = "running";
    worker.execution_claim_token = claimToken;
    worker.execution_claimed_at = timestamp;
    worker.execution_claim_expires_at = new Date(
      Date.now() + Math.max(1e3, Number(leaseMs || 0))
    ).toISOString();
    worker.execution_fencing_token = Number(
      worker.execution_fencing_token || 0
    ) + 1;
    worker.updated_at = timestamp;
    writeJson(join9(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
    const event = appendEvent(root, "worker.execution.claimed", "apex-v2", {
      run_id: worker.run_id,
      worker_id: worker.worker_id,
      claim_token: claimToken,
      fencing_token: worker.execution_fencing_token,
      lease_expires_at: worker.execution_claim_expires_at,
      via
    });
    updateProject(root, {
      last_event_id: event.event_id,
      updated_at: event.timestamp
    });
    return {
      claimed: true,
      claim_token: claimToken,
      worker
    };
  });
}
function recoverExpiredWorkerExecutions(root, runIds, via = "project.tick") {
  const recovered = [];
  for (const runId of runIds) {
    for (const worker of getWorkers(root, runId)) {
      if (worker.status !== "running") continue;
      const expiresAt2 = Date.parse(worker.execution_claim_expires_at || "");
      if (Number.isFinite(expiresAt2) && expiresAt2 > Date.now()) continue;
      const result = withProjectLock(resolve4(root, ".."), () => {
        const current = findWorker(root, worker.worker_id);
        const currentExpiry = Date.parse(
          current.execution_claim_expires_at || ""
        );
        if (current.status !== "running" || Number.isFinite(currentExpiry) && currentExpiry > Date.now()) {
          return null;
        }
        current.status = "active";
        current.execution_claim_token = null;
        current.execution_claimed_at = null;
        current.execution_claim_expires_at = null;
        current.updated_at = now();
        writeJson(
          join9(workerDir(root, current.run_id, current.worker_id), "worker.json"),
          current
        );
        const event = appendEvent(
          root,
          "worker.execution.recovered",
          "apex-v2",
          {
            run_id: current.run_id,
            worker_id: current.worker_id,
            fencing_token: current.execution_fencing_token || 0,
            via
          }
        );
        updateProject(root, {
          last_event_id: event.event_id,
          updated_at: event.timestamp
        });
        return {
          run_id: current.run_id,
          worker_id: current.worker_id,
          status: "RECOVERED"
        };
      });
      if (result) recovered.push(result);
    }
  }
  return recovered;
}
function workerDir(root, runId, workerId) {
  return join9(root, "runs", runId, "workers", workerId);
}
function patchBundleRef(worker, patchId) {
  assertPatchId(patchId);
  return `${worker.namespace}/patches/${patchId}/patch-bundle.json`;
}
function persistPatchBundle(root, patch) {
  return writePatchBundle(root, patch, { latest: true });
}
function updatePatchBundle(root, patch) {
  return writePatchBundle(root, patch, { latest: false });
}
function readWorkerPatchBundles(dir) {
  const patches = [];
  const seen = /* @__PURE__ */ new Set();
  const versionsDir = join9(dir, "patches");
  if (existsSync7(versionsDir)) {
    for (const entry of readdirSync4(versionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join9(versionsDir, entry.name, "patch-bundle.json");
      const patch = readJson(path, null);
      if (!patch?.patch_id || seen.has(patch.patch_id)) continue;
      patches.push({ patch, path });
      seen.add(patch.patch_id);
    }
  }
  const legacyPath = join9(dir, "patch-bundle.json");
  const legacyPatch = readJson(legacyPath, null);
  if (legacyPatch?.patch_id && !seen.has(legacyPatch.patch_id)) {
    patches.push({ patch: legacyPatch, path: legacyPath });
  }
  return patches.sort(
    (left, right) => String(left.patch.created_at || left.patch.patch_id).localeCompare(String(right.patch.created_at || right.patch.patch_id))
  );
}
function workerStatusForMergeItems(items) {
  const statuses = new Set(items.map((item) => item.status));
  if (statuses.has("blocked_conflict")) return "blocked";
  if (statuses.has("queued")) return "queued";
  if (statuses.has("merged")) return "merged";
  if (statuses.has("dropped")) return "dropped";
  return "patch_submitted";
}
function workerReadme(worker, planNode2) {
  return `# Worker Run

worker_id: ${worker.worker_id}
plan_node_id: ${worker.plan_node_id}
status: ${worker.status}

## Objective

${planNode2.objective}

## Write Scope

${bullet(worker.write_scope)}

## Required Evidence

${bullet(planNode2.required_evidence)}

## Internal Capabilities

${bullet((worker.capability_bindings || []).map(
    (item) => `${item.capability_id}@${item.capability_version}: ${item.input_contract} -> ${item.output_contract}`
  ))}

Enforcement: ${worker.capability_enforcement || "shadow"}

Invocation refs:

${bullet(worker.capability_invocation_refs || [])}

## Verification

${bullet(worker.verification)}
`;
}
function findWorker(root, workerId) {
  const runsDir = join9(root, "runs");
  for (const runEntry of readdirSync4(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    const path = join9(runsDir, runEntry.name, "workers", workerId, "worker.json");
    const worker = readJson(path, null);
    if (worker) return worker;
  }
  throw new Error(`\u627E\u4E0D\u5230 worker\uFF1A${workerId}`);
}
function findPatch(root, runId, patchId) {
  return findPatchWithPath(root, runId, patchId).patch;
}
function findPatchWithPath(root, runId, patchId) {
  assertPatchId(patchId);
  const workersDir = join9(root, "runs", runId, "workers");
  if (!existsSync7(workersDir)) throw new Error(`run \u5C1A\u65E0 workers\uFF1A${runId}`);
  for (const workerEntry of readdirSync4(workersDir, { withFileTypes: true })) {
    if (!workerEntry.isDirectory()) continue;
    const dir = join9(workersDir, workerEntry.name);
    for (const value of readWorkerPatchBundles(dir)) {
      if (value.patch.patch_id === patchId) return value;
    }
  }
  throw new Error(`\u627E\u4E0D\u5230 patch\uFF1A${patchId}`);
}
function writePatchBundle(root, patch, { latest }) {
  assertPatchId(patch?.patch_id);
  const dir = workerDir(root, patch.run_id, patch.worker_id);
  const path = join9(dir, "patches", patch.patch_id, "patch-bundle.json");
  ensureDir(dirnameForPath(path));
  const existing = readJson(path, null);
  if (existing && patchContentHash(existing) !== patchContentHash(patch)) {
    throw new Error(`patch immutable content drift\uFF1A${patch.patch_id}`);
  }
  writeJson(path, patch);
  const aliasPath = join9(dir, "patch-bundle.json");
  const alias = readJson(aliasPath, null);
  if (latest || alias?.patch_id === patch.patch_id) {
    writeJson(aliasPath, patch);
  }
  return { path, alias_path: aliasPath };
}
function patchContentHash(patch) {
  const { status: _status, updated_at: _updatedAt, ...content } = patch;
  return createHash3("sha256").update(JSON.stringify(content)).digest("hex");
}
function assertPatchId(patchId) {
  if (typeof patchId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(patchId)) {
    throw new Error(`patch_id \u4E0D\u5B89\u5168\uFF1A${patchId || "(\u7A7A)"}`);
  }
}
function isFileAllowedByScope(file, scopes) {
  return scopes.some((scope) => {
    if (scope === file) return true;
    if (scope.endsWith("/") && file.startsWith(scope)) return true;
    if (scope.endsWith("/*")) return file.startsWith(scope.slice(0, -1));
    if (scope.includes("*")) {
      const [prefix, suffix] = scope.split("*");
      return file.startsWith(prefix) && file.endsWith(suffix || "");
    }
    return false;
  });
}
function applyPatchOperations(projectDir, patch) {
  const applied = [];
  for (const operation of patch.operations || []) {
    assertSafeRelativePath(operation.path);
    const target = join9(projectDir, operation.path);
    if (operation.op === "write_text") {
      ensureDir(dirnameForPath(target));
      writeFileSync4(target, operation.content);
    } else if (operation.op === "replace_text") {
      if (!existsSync7(target)) throw new Error(`replace_text \u76EE\u6807\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${operation.path}`);
      const current = readFileSync6(target, "utf8");
      const count = countOccurrences(current, operation.old_text);
      if (count !== 1) {
        throw new Error(`replace_text \u8981\u6C42 old_text \u552F\u4E00\u5339\u914D\uFF0C${operation.path} \u5B9E\u9645\u5339\u914D ${count} \u6B21`);
      }
      writeFileSync4(
        target,
        current.replace(operation.old_text, () => operation.new_text)
      );
    } else {
      throw new Error(`\u672A\u77E5 patch operation\uFF1A${operation.op}`);
    }
    applied.push(operation.path);
  }
  return applied;
}
function ensureWorkerSandboxReady(worker) {
  if (!worker.sandbox || worker.sandbox.status !== "ready" || worker.sandbox.type === "none") {
    throw new Error(`worker sandbox \u5C1A\u672A ready\uFF1A${worker.worker_id}`);
  }
}
function findGitRoot(projectDir) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: projectDir,
    encoding: "utf8"
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}
function executeWorkerShell(root, worker, command, via, capabilityEvidence = []) {
  if (worker.execution_class && worker.execution_class !== "deterministic_check") {
    throw new Error(`shell adapter \u53EA\u5141\u8BB8 deterministic_check worker\uFF1A${worker.execution_class}`);
  }
  const projectDir = join9(root, "..");
  const timestamp = now();
  const result = spawnSync(command, {
    cwd: projectDir,
    encoding: "utf8",
    shell: true
  });
  let capabilityStatus;
  let capabilityError = "";
  try {
    capabilityStatus = assertCapabilityEvidence(
      worker.capability_bindings || [],
      capabilityEvidence,
      { requireAll: worker.capability_enforcement === "enforce" }
    );
  } catch (error) {
    capabilityError = error.message;
    capabilityStatus = {
      required: (worker.capability_bindings || []).filter((binding) => binding.required).map((binding) => binding.capability_id),
      submitted: [],
      missing: (worker.capability_bindings || []).filter((binding) => binding.required).map((binding) => binding.capability_id)
    };
  }
  const commandPassed = result.status === 0;
  const capabilityPassed = capabilityError === "";
  const adapterResult = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: "shell",
    model_tier: "deterministic",
    requested_model: null,
    reported_model: null,
    status: commandPassed && capabilityPassed ? "PASS" : "FAIL",
    failure_kind: !commandPassed ? "execution_error" : !capabilityPassed ? "contract_error" : null,
    command,
    summary: commandPassed && capabilityPassed ? "shell command passed" : !commandPassed ? "shell command failed" : "shell capability evidence invalid",
    exit_code: result.status ?? 1,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: capabilityStatus.submitted,
      missing: capabilityStatus.missing,
      error: capabilityError
    },
    refs: [],
    created_at: timestamp
  };
  const expectedWorkerUpdatedAt = worker.updated_at;
  return withProjectTransaction(resolve4(root, ".."), {
    kind: "worker-shell-commit",
    idempotencyKey: [
      "worker-shell-commit",
      worker.worker_id,
      Number(worker.attempt || 0) + 1,
      createHash3("sha256").update(command).digest("hex")
    ].join(":")
  }, () => commitWorkerShell(
    root,
    worker.worker_id,
    expectedWorkerUpdatedAt,
    adapterResult,
    timestamp,
    via,
    capabilityEvidence
  )).result;
}
function commitWorkerShell(root, workerId, expectedWorkerUpdatedAt, adapterResult, timestamp, via, capabilityEvidence) {
  const worker = findWorker(root, workerId);
  if (worker.status !== "active" || worker.updated_at !== expectedWorkerUpdatedAt) {
    throw new Error(`shell worker commit \u9047\u5230\u5E76\u53D1\u72B6\u6001\u53D8\u5316\uFF1A${worker.worker_id}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const capabilityEvidenceRefs = persistShellCapabilityEvidence(
    dir,
    worker.namespace,
    capabilityEvidence
  );
  adapterResult.refs = capabilityEvidenceRefs;
  const file = `adapter-result-${adapterResult.result_id}.json`;
  writeJson(join9(dir, file), adapterResult);
  worker.status = adapterResult.status === "PASS" ? "evidence_submitted" : "blocked";
  worker.last_adapter = "shell";
  worker.attempt = Number(worker.attempt || 0) + 1;
  worker.updated_at = timestamp;
  writeJson(join9(dir, "worker.json"), worker);
  const run = loadRun(root, worker.run_id);
  const artifact = createArtifact(root, run, "execute", {
    type: "evidence",
    title: `ShellAdapter\uFF1A${adapterResult.status}`,
    body: `worker=${worker.worker_id}
command=${adapterResult.command}
exit_code=${adapterResult.exit_code}`,
    refs: [`${worker.namespace}/${file}`, ...capabilityEvidenceRefs],
    timestamp
  });
  const event = appendEvent(root, "worker.adapter.shell", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: adapterResult.result_id,
    status: adapterResult.status,
    worker_status: worker.status,
    artifact_id: artifact.artifact_id,
    via
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { adapterResult, artifact };
}
function persistShellCapabilityEvidence(dir, namespace, evidenceItems = []) {
  return (evidenceItems || []).map((evidence) => {
    const name = `capability-evidence-${evidence.capability_id}.json`;
    writeJson(join9(dir, name), evidence);
    return `${namespace}/${name}`;
  });
}

// src/core/schema-version.mjs
var SCHEMA_VERSION = "v0";

// src/core/action-workspace.mjs
var IGNORED_ROOT_NAMES = /* @__PURE__ */ new Set([
  ".git",
  ".apex-v2",
  ".apex-v2.lock",
  ".apex-v2.transaction-backups",
  "node_modules"
]);
var IGNORED_TREE_NAMES = /* @__PURE__ */ new Set(["node_modules"]);
var SECRET_BASENAMES = /* @__PURE__ */ new Set([".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json"]);
function createActionWorkspace(root, worker, actionId) {
  const projectDir = resolve5(root, "..");
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const manifestPath = join10(dir, "action-workspace.json");
  const existing = readJson(manifestPath, null);
  if (existing?.action_id === actionId && existing.status === "active" && existingActionWorkspaceExists(projectDir, existing)) {
    return existing;
  }
  const container = join10(dir, "action-workspace");
  const baseDir = join10(container, "base");
  const workspaceDir = join10(container, "workspace");
  rmSync3(container, { recursive: true, force: true });
  mkdirSync4(baseDir, { recursive: true });
  mkdirSync4(workspaceDir, { recursive: true });
  const excluded = { ignored: 0, secret: 0, symlink: 0 };
  const included = [];
  for (const path of listProjectSourceFiles(projectDir)) {
    const source = join10(projectDir, path);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) {
      excluded.symlink += 1;
      continue;
    }
    if (!stat.isFile()) {
      excluded.ignored += 1;
      continue;
    }
    if (isSecretPath(path)) {
      excluded.secret += 1;
      continue;
    }
    copyFile(source, join10(baseDir, path), stat.mode);
    copyFile(source, join10(workspaceDir, path), stat.mode);
    included.push({ path, sha256: fileHash(source), mode: stat.mode & 511 });
  }
  linkDependencyDirectories(projectDir, workspaceDir);
  const timestamp = now();
  const manifest = {
    schema_version: SCHEMA_VERSION,
    action_id: actionId,
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    status: "active",
    workspace_path: relative3(projectDir, workspaceDir),
    base_path: relative3(projectDir, baseDir),
    base_fingerprint: hashEntries(included),
    write_scope: worker.write_scope,
    included_file_count: included.length,
    excluded,
    created_at: timestamp,
    updated_at: timestamp
  };
  assertContract("action-workspace.schema.json", manifest, manifestPath);
  writeJson(manifestPath, manifest);
  return manifest;
}
function collectActionWorkspaceChanges(projectDir, manifest) {
  const { baseDir, workspaceDir } = ownedActionWorkspacePaths(projectDir, manifest);
  if (!existsSync8(baseDir) || !existsSync8(workspaceDir)) {
    throw new Error(`ActionWorkspace \u7F3A\u5931\uFF1A${manifest.action_id}`);
  }
  const base = scanTree(baseDir);
  const workspace = scanTree(workspaceDir);
  const ignoredWorkspacePaths = gitIgnoredPaths(projectDir, [...workspace.keys()]);
  const paths = /* @__PURE__ */ new Set([...base.keys(), ...workspace.keys()]);
  const changedFiles = [];
  const outOfScopeFiles = [];
  const unsupportedFiles = [];
  const operations = [];
  for (const path of [...paths].sort()) {
    const before = base.get(path);
    const after = workspace.get(path);
    if (sameEntry(before, after)) continue;
    if (!before && ignoredWorkspacePaths.has(path) && !isFileAllowedByScope(path, manifest.write_scope)) {
      continue;
    }
    changedFiles.push(path);
    if (!isFileAllowedByScope(path, manifest.write_scope)) {
      outOfScopeFiles.push(path);
      continue;
    }
    if (isSecretPath(path)) {
      unsupportedFiles.push(`${path}:secret`);
      continue;
    }
    if (!after) {
      unsupportedFiles.push(`${path}:delete`);
      continue;
    }
    if (after.type === "symlink") {
      unsupportedFiles.push(`${path}:symlink`);
      continue;
    }
    if (after.type !== "file") {
      unsupportedFiles.push(`${path}:${after.type}`);
      continue;
    }
    const next = readFileSync7(join10(workspaceDir, path));
    if (isBinary(next)) {
      unsupportedFiles.push(`${path}:binary`);
      continue;
    }
    if (!before) {
      operations.push({ op: "write_text", path, content: next.toString("utf8") });
      continue;
    }
    if (before.type !== "file") {
      unsupportedFiles.push(`${path}:base_${before.type}`);
      continue;
    }
    const previous = readFileSync7(join10(baseDir, path));
    if (isBinary(previous)) {
      unsupportedFiles.push(`${path}:binary`);
      continue;
    }
    operations.push({
      op: "replace_text",
      path,
      old_text: previous.toString("utf8"),
      new_text: next.toString("utf8")
    });
  }
  return {
    changed_files: changedFiles,
    out_of_scope_files: outOfScopeFiles,
    unsupported_files: unsupportedFiles,
    operations
  };
}
function linkDependencyDirectories(projectDir, workspaceDir) {
  const visit = (directory) => {
    for (const entry of readdirSync5(directory, { withFileTypes: true })) {
      if ([".git", ".apex-v2"].includes(entry.name)) continue;
      const source = join10(directory, entry.name);
      if (entry.name === "node_modules") {
        const target = join10(workspaceDir, relative3(projectDir, source));
        createWritableDependencyShell(source, target);
      } else if (entry.isDirectory()) {
        visit(source);
      }
    }
  };
  visit(projectDir);
}
function createWritableDependencyShell(source, target) {
  if (existsSync8(target)) return;
  mkdirSync4(target, { recursive: true });
  for (const entry of readdirSync5(source, { withFileTypes: true })) {
    const dependency = join10(source, entry.name);
    const linked = join10(target, entry.name);
    if ([".cache", ".tmp", ".vite", ".vite-temp"].includes(entry.name)) {
      mkdirSync4(linked, { recursive: true });
      continue;
    }
    symlinkSync(dependency, linked, entry.isDirectory() ? "dir" : "file");
  }
}
function gitIgnoredPaths(projectDir, paths) {
  if (paths.length === 0 || !existsSync8(join10(projectDir, ".git"))) return /* @__PURE__ */ new Set();
  const result = spawnSync2(
    "git",
    ["check-ignore", "--stdin", "-z"],
    {
      cwd: projectDir,
      encoding: "buffer",
      input: Buffer.from(`${paths.join("\0")}\0`)
    }
  );
  if (![0, 1].includes(result.status)) return /* @__PURE__ */ new Set();
  return new Set(
    result.stdout.toString("utf8").split("\0").filter(Boolean)
  );
}
function markActionWorkspaceSubmitted(projectDir, manifest) {
  const path = actionWorkspaceManifestPath(projectDir, manifest);
  const updated = {
    ...manifest,
    status: "submitted",
    updated_at: now()
  };
  assertContract("action-workspace.schema.json", updated, path);
  writeJson(path, updated);
  return updated;
}
function discardActionWorkspace(projectDir, manifest, status2 = "cancelled") {
  const path = actionWorkspaceManifestPath(projectDir, manifest);
  const { container } = ownedActionWorkspacePaths(projectDir, manifest);
  rmSync3(container, { recursive: true, force: true });
  const updated = {
    ...manifest,
    status: status2,
    updated_at: now()
  };
  assertContract("action-workspace.schema.json", updated, path);
  writeJson(path, updated);
  return updated;
}
function recoverOrphanActionWorkspaces(root, options = {}) {
  const projectDir = resolve5(root, "..");
  const runsDir = join10(root, "runs");
  if (!existsSync8(runsDir)) return [];
  const nowMs = Date.parse(options.now || (/* @__PURE__ */ new Date()).toISOString());
  const recovered = [];
  for (const runEntry of readdirSync5(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    const workersDir = join10(runsDir, runEntry.name, "workers");
    if (!existsSync8(workersDir)) continue;
    for (const workerEntry of readdirSync5(workersDir, { withFileTypes: true })) {
      if (!workerEntry.isDirectory()) continue;
      const dir = join10(workersDir, workerEntry.name);
      const manifest = readJson(join10(dir, "action-workspace.json"), null);
      if (!manifest || manifest.status !== "active") continue;
      if (manifest.run_id !== runEntry.name || manifest.worker_id !== workerEntry.name) {
        throw new Error(
          `ActionWorkspace identity mismatch\uFF1A${runEntry.name}/${workerEntry.name}`
        );
      }
      const worker = readJson(join10(dir, "worker.json"), null);
      const reason = orphanReason(worker, nowMs);
      if (!reason) continue;
      discardActionWorkspace(projectDir, manifest, "failed");
      recovered.push({
        run_id: manifest.run_id,
        worker_id: manifest.worker_id,
        action_id: manifest.action_id,
        reason
      });
    }
  }
  return recovered;
}
function actionWorkspaceManifestPath(projectDir, manifest) {
  assertSafePathSegment(manifest.run_id, "run_id");
  assertSafePathSegment(manifest.worker_id, "worker_id");
  return join10(
    projectDir,
    ".apex-v2",
    "runs",
    manifest.run_id,
    "workers",
    manifest.worker_id,
    "action-workspace.json"
  );
}
function existingActionWorkspaceExists(projectDir, manifest) {
  const { baseDir, workspaceDir } = ownedActionWorkspacePaths(projectDir, manifest);
  return existsSync8(workspaceDir) && existsSync8(baseDir);
}
function ownedActionWorkspacePaths(projectDir, manifest) {
  assertSafePathSegment(manifest.run_id, "run_id");
  assertSafePathSegment(manifest.worker_id, "worker_id");
  const projectRoot2 = resolve5(projectDir);
  const container = resolve5(
    projectRoot2,
    ".apex-v2",
    "runs",
    manifest.run_id,
    "workers",
    manifest.worker_id,
    "action-workspace"
  );
  const workspaceDir = resolveActionWorkspacePath(
    projectRoot2,
    manifest.workspace_path,
    "workspace_path"
  );
  const baseDir = resolveActionWorkspacePath(
    projectRoot2,
    manifest.base_path,
    "base_path"
  );
  if (workspaceDir !== join10(container, "workspace") || baseDir !== join10(container, "base")) {
    throw new Error(`ActionWorkspace path \u8D8A\u51FA owned container\uFF1A${manifest.action_id}`);
  }
  return { projectRoot: projectRoot2, container, workspaceDir, baseDir };
}
function resolveActionWorkspacePath(projectRoot2, path, field) {
  const normalized = String(path || "").split("\\").join("/");
  assertSafeRelativePath(normalized);
  const target = resolve5(projectRoot2, normalized);
  if (target === projectRoot2 || !target.startsWith(`${projectRoot2}${sep}`)) {
    throw new Error(`ActionWorkspace ${field} \u8D8A\u51FA\u9879\u76EE\u6839\uFF1A${path}`);
  }
  return target;
}
function assertSafePathSegment(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`ActionWorkspace ${field} \u65E0\u6548\uFF1A${value}`);
  }
}
function orphanReason(worker, nowMs) {
  if (!worker) return "worker_missing";
  if (worker.status !== "claimed") return `worker_${worker.status}`;
  const expiresAt2 = Date.parse(worker.claim_expires_at || "");
  if (!Number.isFinite(expiresAt2) || expiresAt2 <= nowMs) return "claim_expired";
  return null;
}
function listProjectSourceFiles(projectDir) {
  const tracked = spawnSync2("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: projectDir,
    encoding: "buffer"
  });
  if (tracked.status === 0) {
    return tracked.stdout.toString("utf8").split("\0").filter(Boolean).filter((path) => !isIgnoredPath(path)).sort();
  }
  return listFilesRecursive(projectDir).filter((path) => !isIgnoredPath(path)).sort();
}
function listFilesRecursive(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync5(directory, { withFileTypes: true })) {
      if (directory === root && IGNORED_ROOT_NAMES.has(entry.name)) continue;
      if (entry.isDirectory() && IGNORED_TREE_NAMES.has(entry.name)) continue;
      const path = join10(directory, entry.name);
      const relativePath = relative3(root, path);
      if (entry.isDirectory()) visit(path);
      else files.push(relativePath);
    }
  };
  visit(root);
  return files;
}
function scanTree(root) {
  const entries = /* @__PURE__ */ new Map();
  const visit = (directory) => {
    for (const entry of readdirSync5(directory, { withFileTypes: true })) {
      if (IGNORED_TREE_NAMES.has(entry.name)) continue;
      const path = join10(directory, entry.name);
      const relativePath = relative3(root, path);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isSymbolicLink()) {
        entries.set(relativePath, { type: "symlink" });
      } else if (stat.isFile()) {
        entries.set(relativePath, {
          type: "file",
          sha256: fileHash(path),
          mode: stat.mode & 511
        });
      } else {
        entries.set(relativePath, { type: "unsupported" });
      }
    }
  };
  visit(root);
  return entries;
}
function isIgnoredPath(path) {
  const parts = path.split("/");
  return IGNORED_ROOT_NAMES.has(parts[0]) || parts.some((part) => IGNORED_TREE_NAMES.has(part));
}
function isSecretPath(path) {
  const parts = path.toLowerCase().split("/");
  return parts.some(
    (part) => part === ".env" || part.startsWith(".env.") || part.endsWith(".pem") || part.endsWith(".key") || part.startsWith("credentials") || SECRET_BASENAMES.has(part)
  );
}
function copyFile(source, target, mode) {
  mkdirSync4(dirname4(target), { recursive: true });
  copyFileSync(source, target);
  chmodSync(target, mode & 511);
}
function sameEntry(left, right) {
  if (!left || !right) return false;
  if (left.type !== right.type) return false;
  if (left.type !== "file") return true;
  return left.sha256 === right.sha256 && left.mode === right.mode;
}
function fileHash(path) {
  return createHash4("sha256").update(readFileSync7(path)).digest("hex");
}
function hashEntries(entries) {
  const hash = createHash4("sha256");
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.sha256);
    hash.update("\0");
    hash.update(String(entry.mode));
    hash.update("\n");
  }
  return hash.digest("hex");
}
function isBinary(buffer) {
  return buffer.subarray(0, 8e3).includes(0);
}

// src/core/store.mjs
var STORE_DIR = ".apex-v2";
function projectRoot(args) {
  return resolve6(String(args.project || "."));
}
function storeRoot(projectDir) {
  return join11(projectDir, STORE_DIR);
}
function requireStore(projectDir) {
  const root = storeRoot(projectDir);
  withProjectLock(projectDir, () => {
    if (existsSync9(join11(root, "transactions"))) recoverProjectTransactions(projectDir);
    if (!existsSync9(join11(root, "project.json"))) {
      throw new Error(`\u9879\u76EE\u5C1A\u672A\u521D\u59CB\u5316\uFF1A${root}`);
    }
    const recovered = recoverOrphanActionWorkspaces(root);
    for (const workspace of recovered) {
      appendEvent(root, "worker.host.workspace_recovered", "apex-v2", workspace);
    }
  });
  return root;
}
function appendEvent(root, type, actor, payload) {
  const projectDir = resolve6(root, "..");
  return withProjectLock(projectDir, () => {
    const projectPath = join11(root, "project.json");
    const project = existsSync9(projectPath) ? readJson(projectPath) : null;
    const event = {
      schema_version: SCHEMA_VERSION,
      event_id: shortId("event"),
      type,
      timestamp: nextEventTimestamp(project?.updated_at),
      actor,
      payload
    };
    assertContract("event.schema.json", event, `${root}/events.jsonl`);
    appendDurableFile(join11(root, "events.jsonl"), `${JSON.stringify(event)}
`);
    if (project) {
      writeJson(projectPath, {
        ...project,
        last_event_id: event.event_id,
        updated_at: event.timestamp,
        revision: Number(project.revision || 0) + 1
      });
    }
    return event;
  });
}
function updateProject(root, patch, options = {}) {
  const projectDir = resolve6(root, "..");
  withProjectLock(projectDir, () => {
    const path = join11(root, "project.json");
    const project = readJson(path);
    const revision = Number(project.revision || 0);
    if (options.expectedRevision != null && Number(options.expectedRevision) !== revision) {
      throw new Error(`ProjectState revision \u51B2\u7A81\uFF1Aexpected=${options.expectedRevision} actual=${revision}`);
    }
    const nextPatch = { ...patch };
    if (nextPatch.last_event_id && nextPatch.updated_at && project.updated_at && project.updated_at > nextPatch.updated_at) {
      delete nextPatch.last_event_id;
      delete nextPatch.updated_at;
    }
    writeJson(path, {
      ...project,
      ...nextPatch,
      revision: revision + 1
    });
  });
}
function nextEventTimestamp(previousTimestamp) {
  const current = now();
  const previousMs = Date.parse(previousTimestamp || "");
  const currentMs = Date.parse(current);
  if (!Number.isFinite(previousMs) || currentMs > previousMs) return current;
  return new Date(previousMs + 1).toISOString();
}

// src/core/intake-roadmap.mjs
import { join as join12 } from "node:path";
function addIntakeItem(root, args) {
  const timestamp = now();
  const item = {
    schema_version: SCHEMA_VERSION,
    id: shortId("intake"),
    source: String(args.source || "user"),
    type: normalizeEnum(args.type || "feature", ["feature", "bug", "test_failure", "review_feedback", "tech_debt", "risk", "idea", "other"], "type"),
    title: String(args.title),
    description: String(args.description || ""),
    priority: normalizeEnum(args.priority || "P2", ["P0", "P1", "P2", "P3"], "priority"),
    risk: normalizeEnum(args.risk || "medium", ["low", "medium", "high", "critical"], "risk"),
    affected_area: String(args.area || "unknown"),
    method_pack_id: args["method-pack"] ? String(args["method-pack"]) : null,
    acceptance_commands: parseAcceptanceCommands(args),
    evidence_refs: splitList(args.evidence),
    source_spec: args.source_spec || null,
    triage: {
      status: "new",
      decision: null,
      target_milestone: null,
      reason: null
    },
    created_at: timestamp,
    updated_at: timestamp
  };
  const path = join12(root, "intake", "items.json");
  const items = readJson(path, []);
  items.push(item);
  writeJson(path, items);
  const event = appendEvent(root, "intake.added", "apex-v2", { intake_id: item.id, title: item.title });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return item;
}
function parseAcceptanceCommands(args) {
  if (!args["acceptance-json"]) return [];
  let commands;
  try {
    commands = JSON.parse(String(args["acceptance-json"]));
  } catch (error) {
    throw new Error(`acceptance-json \u5FC5\u987B\u662F JSON \u6570\u7EC4\uFF1A${error.message}`);
  }
  if (!Array.isArray(commands) || commands.some((command) => typeof command !== "string" || !command.trim())) {
    throw new Error("acceptance-json \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u6570\u7EC4");
  }
  return [...new Set(commands.map((command) => command.trim()))];
}
function listIntakeItems(root, statusFilter = null) {
  const items = readJson(join12(root, "intake", "items.json"), []);
  return statusFilter ? items.filter((item) => item.triage.status === statusFilter) : items;
}
function triageIntakeItem(root, id, input) {
  const decision = normalizeEnum(input.decision || "accepted", ["accepted", "deferred", "rejected"], "decision");
  const path = join12(root, "intake", "items.json");
  const items = readJson(path, []);
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`\u627E\u4E0D\u5230 intake\uFF1A${id}`);
  item.triage = {
    status: decision,
    decision,
    target_milestone: input["target-milestone"] ? String(input["target-milestone"]) : item.triage.target_milestone,
    reason: input.reason ? String(input.reason) : null
  };
  item.updated_at = now();
  writeJson(path, items);
  const event = appendEvent(root, "intake.triaged", "apex-v2", { intake_id: id, decision });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return item;
}
function promoteRoadmapNode(root, intakeId, input = {}) {
  const intake = readJson(join12(root, "intake", "items.json"), []);
  const item = intake.find((entry) => entry.id === intakeId);
  if (!item) throw new Error(`\u627E\u4E0D\u5230 intake\uFF1A${intakeId}`);
  if (item.triage.status !== "accepted") {
    throw new Error(`intake \u5C1A\u672A accepted\uFF0C\u4E0D\u80FD\u8FDB\u5165 roadmap\uFF1A${intakeId}`);
  }
  const roadmapPath = join12(root, "roadmap", "graph.json");
  const graph = readJson(roadmapPath);
  const existing = graph.nodes.find((node2) => node2.source_intake_id === intakeId);
  if (existing) return existing;
  const timestamp = now();
  const node = createRoadmapNodeFromIntake(item, timestamp, input.title);
  graph.nodes.push(node);
  graph.updated_at = timestamp;
  if (item.triage.target_milestone && !graph.milestones.includes(item.triage.target_milestone)) {
    graph.milestones.push(item.triage.target_milestone);
  }
  writeJson(roadmapPath, graph);
  const event = appendEvent(root, "roadmap.promoted", "apex-v2", { roadmap_node_id: node.id, intake_id: intakeId });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return node;
}
function createRoadmapNodeFromIntake(item, timestamp, title = null) {
  return {
    id: shortId("roadmap"),
    title: String(title || item.title),
    source_intake_id: item.id,
    status: "ready",
    priority: item.priority,
    risk: item.risk,
    created_at: timestamp,
    updated_at: timestamp
  };
}
function compareRoadmapPriority(a, b) {
  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const riskRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || (riskRank[a.risk] ?? 9) - (riskRank[b.risk] ?? 9) || a.created_at.localeCompare(b.created_at);
}

// src/core/plan-graph.mjs
import { join as join13 } from "node:path";

// src/core/method-packs.mjs
var SUPPORTED_WORKFLOWS = /* @__PURE__ */ new Set([
  "quick",
  "disciplined",
  "phase_context",
  "governed"
]);
function defaultMethodPackRegistry(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    default_pack_id: "disciplined-tdd",
    packs: [
      methodPack(
        "quick",
        "1.0.0",
        "Low-overhead implementation and review for bounded low-risk changes.",
        "quick",
        ["focused_verification", "semantic_review"]
      ),
      methodPack(
        "disciplined-tdd",
        "1.0.0",
        "Default test-first delivery with design, implementation, independent verification, and review.",
        "disciplined",
        ["test_first", "independent_verification", "semantic_review"]
      ),
      methodPack(
        "phase-context",
        "1.0.0",
        "Phase-scoped context and delivery for explicit milestone-oriented work.",
        "phase_context",
        ["phase_context", "independent_verification", "semantic_review"]
      ),
      methodPack(
        "governed",
        "1.0.0",
        "Full evidence and separation-of-duties workflow for critical or recovery-sensitive work.",
        "governed",
        ["independent_risk", "separated_build", "independent_verification", "semantic_review"]
      )
    ]
  };
}
function resolveMethodPack(registry2, intake, inventory = { files: [] }) {
  assertRegistry(registry2);
  const enabled = registry2.packs.filter((pack) => pack.enabled !== false);
  const explicitId = String(intake.method_pack_id || "").trim();
  if (explicitId) {
    const pack = enabled.find((candidate) => candidate.id === explicitId);
    if (!pack) throw new Error(`\u627E\u4E0D\u5230 Method Pack\uFF1A${explicitId}`);
    assertSupportedWorkflow(pack);
    return { pack, reason: `explicit=${explicitId}` };
  }
  const governed = enabled.find((pack) => pack.id === "governed");
  if (requiresGovernedPack(intake)) {
    if (!governed) throw new Error("Method Pack registry \u7F3A\u5C11 governed pack");
    return { pack: governed, reason: governedReason(intake) };
  }
  const quick = enabled.find((pack) => pack.id === "quick");
  if (quick && isQuickEligible(intake, inventory)) {
    return { pack: quick, reason: "bounded_low_risk_change" };
  }
  const fallback = enabled.find((pack) => pack.id === registry2.default_pack_id);
  if (!fallback) throw new Error(`\u9ED8\u8BA4 Method Pack \u4E0D\u53EF\u7528\uFF1A${registry2.default_pack_id}`);
  assertSupportedWorkflow(fallback);
  return { pack: fallback, reason: `default=${fallback.id}` };
}
function methodPack(id, version, description, workflow, qualityGates) {
  return {
    id,
    version,
    description,
    workflow,
    enabled: true,
    quality_gates: qualityGates
  };
}
function assertRegistry(registry2) {
  if (!registry2 || !Array.isArray(registry2.packs) || !registry2.default_pack_id) {
    throw new Error("Method Pack registry \u65E0\u6548");
  }
  const ids = /* @__PURE__ */ new Set();
  for (const pack of registry2.packs) {
    if (!pack?.id || ids.has(pack.id)) throw new Error(`Method Pack id \u65E0\u6548\u6216\u91CD\u590D\uFF1A${pack?.id || "(\u7A7A)"}`);
    ids.add(pack.id);
    assertSupportedWorkflow(pack);
  }
}
function assertSupportedWorkflow(pack) {
  if (!SUPPORTED_WORKFLOWS.has(pack.workflow)) {
    throw new Error(`Method Pack workflow \u4E0D\u53D7\u652F\u6301\uFF1A${pack.id}=${pack.workflow}`);
  }
}
function requiresGovernedPack(intake) {
  if (intake.risk === "critical") return true;
  if (intake.type === "risk" && intake.risk === "high") return true;
  return /(critical|security|auth(?:entication|orization)?|credential|secret|production|destructive|migration|rollback|interrupted|resume|recovery|parallel execution|关键|安全|鉴权|凭据|生产|破坏性|迁移|回滚|中断|恢复|并行执行)/i.test(`${intake.title || ""}
${intake.description || ""}`);
}
function governedReason(intake) {
  if (intake.risk === "critical") return "risk=critical";
  return "governance_signal";
}
function isQuickEligible(intake, inventory) {
  if (!["low", "medium"].includes(intake.risk || "medium")) return false;
  if (intake.triage?.status !== "accepted") return false;
  const scopes = parseAffectedArea(intake.affected_area, inventory.files || []).filter((scope) => !scope.startsWith(".apex-v2/"));
  if (scopes.length === 0 || scopes.length > 4) return false;
  if (scopes.some((scope) => scope.endsWith("/") || scope.includes("*"))) return false;
  return !/(parallel|interrupted|resume|recovery|review[- ]defect|security defect|two independent|并行|中断|恢复|安全缺陷)/i.test(`${intake.title || ""}
${intake.description || ""}`);
}
function parseAffectedArea(value, files) {
  const raw = String(value || "").trim();
  if (!raw || ["unknown", "n/a", "none"].includes(raw.toLowerCase())) return [];
  const available = new Set(files);
  return Array.from(new Set(raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).map((item) => {
    if (item.includes("*") || item.endsWith("/")) return item;
    if (available.has(item)) return item;
    if (files.some((file) => file.startsWith(`${item}/`))) return `${item}/`;
    return item;
  })));
}

// src/core/plan-graph.mjs
function buildTaskPlanGraph(root, run, timestamp, inventory) {
  const project = readJson(join13(root, "project.json"));
  const roadmap = readJson(join13(root, "roadmap", "graph.json"));
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (!roadmapNode) throw new Error(`\u627E\u4E0D\u5230 run \u5BF9\u5E94\u7684 roadmap node\uFF1A${run.roadmap_node_id}`);
  const intakeItems = readJson(join13(root, "intake", "items.json"), []);
  const intake = intakeItems.find((item) => item.id === roadmapNode.source_intake_id);
  if (!intake) throw new Error(`\u627E\u4E0D\u5230 roadmap \u5BF9\u5E94\u7684 intake\uFF1A${roadmapNode.source_intake_id}`);
  const methodPackRegistry = readJson(
    join13(root, "policies", "method-packs.json"),
    defaultMethodPackRegistry(timestamp)
  );
  const methodPackResolution = resolveMethodPack(methodPackRegistry, intake, inventory);
  let methodPack2 = methodPackResolution.pack;
  let methodPackSelectionReason = methodPackResolution.reason;
  const routedCapabilities = routeCapabilities(capabilityRegistry(), intake);
  const planId = shortId("plan");
  const scopes = inferPlanScopes(intake, inventory);
  const verificationCommands = inferVerificationCommands(inventory);
  const declaredVerificationCommands = extractDeclaredVerificationCommands(intake);
  const taskVerificationCommands = declaredVerificationCommands.length > 0 ? declaredVerificationCommands.slice(0, 5) : verificationCommands;
  const runArtifactScope = `.apex-v2/runs/${run.run_id}/workers/`;
  const contextRefs = unique([
    `.apex-v2/intake/items.json`,
    `.apex-v2/roadmap/graph.json`,
    `.apex-v2/runs/${run.run_id}/plan-graph.json`,
    ".apex-v2/knowledge/index.md",
    ".apex-v2/knowledge/task-to-file-map.md",
    ".apex-v2/knowledge/danger-zones.md",
    ".apex-v2/knowledge/test-map.md",
    ...intake.evidence_refs,
    ...scopes.implementation,
    ...scopes.tests
  ]);
  const fullNodes = [
    planNode({
      id: "delivery-context",
      title: "\u4EFB\u52A1\u4E0A\u4E0B\u6587\u4E0E\u9A8C\u6536\u8FB9\u754C",
      lane: "analysis",
      parallelGroup: "discovery",
      objective: `\u56F4\u7ED5\u201C${roadmapNode.title}\u201D\u6838\u5BF9\u9700\u6C42\u8FB9\u754C\u3001\u53D7\u5F71\u54CD\u6A21\u5757\u3001\u5DF2\u6709\u51B3\u7B56\u548C\u53EF\u6267\u884C\u9A8C\u6536\u6807\u51C6\u3002`,
      dependencies: [],
      readScope: contextRefs,
      writeScope: [],
      deliverables: ["\u4EFB\u52A1\u4E0A\u4E0B\u6587\u6458\u8981", "\u9A8C\u6536\u6807\u51C6", "\u5DF2\u77E5\u4E0E\u672A\u77E5\u9879"],
      requiredEvidence: ["intake \u4E0E roadmap \u5F15\u7528", "\u76F8\u5173\u4EE3\u7801\u6216\u6587\u6863\u6765\u6E90", "\u53EF\u9A8C\u8BC1\u9A8C\u6536\u6807\u51C6"],
      verification: taskVerificationCommands.slice(0, 1),
      mergeStrategy: "\u53EA\u4EA7\u51FA evidence\uFF0C\u4E0D\u76F4\u63A5\u4FEE\u6539\u9879\u76EE\u4EE3\u7801\u3002",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-risk",
      title: "\u98CE\u9669\u3001\u56DE\u5F52\u9762\u4E0E\u53CD\u8BC1\u5206\u6790",
      lane: "analysis",
      parallelGroup: "discovery",
      objective: `\u72EC\u7ACB\u68C0\u67E5\u201C${roadmapNode.title}\u201D\u7684\u5931\u8D25\u6A21\u5F0F\u3001\u56DE\u5F52\u9762\u3001\u51B2\u7A81\u98CE\u9669\u548C\u9700\u8981\u5347\u7EA7\u7684\u4EBA\u7C7B gate\u3002`,
      dependencies: [],
      readScope: contextRefs,
      writeScope: [],
      deliverables: ["\u98CE\u9669\u6E05\u5355", "\u53CD\u8BC1\u4E0E\u66FF\u4EE3\u65B9\u6848", "\u56DE\u5F52\u68C0\u67E5\u8303\u56F4"],
      requiredEvidence: ["danger-zone \u5F15\u7528", "\u5931\u8D25\u8DEF\u5F84", "\u98CE\u9669\u5904\u7F6E\u5EFA\u8BAE"],
      verification: taskVerificationCommands.slice(0, 1),
      mergeStrategy: "\u4E0E context \u5206\u6790\u5E76\u884C\uFF0C\u8F93\u51FA\u72EC\u7ACB evidence card\u3002",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-design",
      title: "\u4EFB\u52A1\u7EA7\u5B9E\u65BD\u65B9\u6848\u4E0E\u5207\u7247",
      lane: "planning",
      parallelGroup: "planning",
      objective: `\u57FA\u4E8E\u4E0A\u4E0B\u6587\u548C\u98CE\u9669\u8BC1\u636E\uFF0C\u4E3A\u201C${roadmapNode.title}\u201D\u5F62\u6210\u6700\u5C0F\u53EF\u4EA4\u4ED8\u5207\u7247\u3001\u4F9D\u8D56\u987A\u5E8F\u548C\u56DE\u6EDA\u7B56\u7565\u3002`,
      dependencies: ["delivery-context", "delivery-risk"],
      readScope: contextRefs,
      writeScope: [],
      deliverables: ["\u5B9E\u65BD\u5207\u7247", "\u4F9D\u8D56\u4E0E\u5E76\u884C\u7B56\u7565", "\u56DE\u6EDA\u65B9\u6848"],
      requiredEvidence: ["\u4E0A\u4E0B\u6587 evidence", "\u98CE\u9669 evidence", "\u6BCF\u4E2A\u5207\u7247\u7684\u9A8C\u8BC1\u8DEF\u5F84"],
      verification: taskVerificationCommands.slice(0, 2),
      mergeStrategy: "\u65B9\u6848\u5148\u4E8E\u4EE3\u7801\u5199\u5165\uFF1B\u53D1\u73B0\u8303\u56F4\u51B2\u7A81\u65F6\u8FD4\u56DE planning\u3002",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    }),
    planNode({
      id: "delivery-implementation",
      title: "\u4E3B\u5B9E\u73B0\u5207\u7247",
      lane: "implementation",
      parallelGroup: "build",
      objective: `\u5728\u660E\u786E write_scope \u5185\u5B9E\u73B0\u201C${roadmapNode.title}\u201D\u7684\u6700\u5C0F\u884C\u4E3A\u53D8\u5316\uFF0C\u907F\u514D\u65E0\u5173\u91CD\u6784\u3002`,
      dependencies: ["delivery-design"],
      readScope: unique([...contextRefs, ...scopes.implementation]),
      writeScope: scopes.implementation,
      deliverables: ["\u53EF\u5BA1\u67E5 patch bundle", "\u884C\u4E3A\u53D8\u5316\u8BF4\u660E", "\u6B8B\u4F59\u98CE\u9669"],
      requiredEvidence: ["changed_files", "patch artifact", "\u5C40\u90E8\u9A8C\u8BC1\u7ED3\u679C"],
      verification: taskVerificationCommands,
      mergeStrategy: "worker \u53EA\u63D0\u4EA4 patch bundle\uFF1B\u7531 coordinator \u4E32\u884C\u5408\u5E76\u3002",
      executionClass: "workspace_patch",
      requiredCapabilities: ["structured_output", "workspace_write", "tool_use"],
      preferredMode: "interactive",
      executionHints: { estimated_duration_minutes: 20 },
      outputContract: "patch",
      risk: normalizedRisk(intake.risk, "high")
    }),
    planNode({
      id: "delivery-tests",
      title: "\u6D4B\u8BD5\u4E0E\u5931\u8D25\u8DEF\u5F84\u5207\u7247",
      lane: "quality",
      parallelGroup: "build",
      objective: `\u4E3A\u201C${roadmapNode.title}\u201D\u8865\u5145\u6210\u529F\u8DEF\u5F84\u3001\u5931\u8D25\u8DEF\u5F84\u548C\u5173\u952E\u56DE\u5F52\u6D4B\u8BD5\uFF0C\u5E76\u4FDD\u6301\u4E0E\u4E3B\u5B9E\u73B0\u5199\u5165\u8303\u56F4\u9694\u79BB\u3002`,
      dependencies: ["delivery-design"],
      readScope: unique([...contextRefs, ...scopes.implementation, ...scopes.tests]),
      writeScope: scopes.tests,
      deliverables: ["\u81EA\u52A8\u5316\u6D4B\u8BD5 patch", "\u5931\u8D25\u8DEF\u5F84\u8BC1\u660E", "\u8986\u76D6\u8303\u56F4\u8BF4\u660E"],
      requiredEvidence: ["\u65B0\u589E\u6216\u66F4\u65B0\u6D4B\u8BD5", "\u6D4B\u8BD5\u547D\u4EE4\u8F93\u51FA", "\u5931\u8D25\u8DEF\u5F84\u65AD\u8A00"],
      verification: taskVerificationCommands,
      mergeStrategy: "\u53EF\u4E0E\u4E3B\u5B9E\u73B0\u5E76\u884C\uFF1Bwrite_scope \u91CD\u53E0\u65F6\u5FC5\u987B\u62C6\u5206\u6216\u4E32\u884C\u3002",
      executionClass: "workspace_patch",
      requiredCapabilities: ["structured_output", "workspace_write", "tool_use"],
      preferredMode: "interactive",
      executionHints: { estimated_duration_minutes: 20 },
      outputContract: "patch",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-verification",
      title: "\u72EC\u7ACB\u9A8C\u8BC1\u4E0E\u8BC1\u636E\u6C47\u603B",
      lane: "verification",
      parallelGroup: "verification",
      objective: `\u6309\u9879\u76EE\u771F\u5B9E\u547D\u4EE4\u9A8C\u8BC1\u201C${roadmapNode.title}\u201D\u7684\u5B9E\u73B0\u548C\u6D4B\u8BD5\uFF0C\u8BB0\u5F55\u8986\u76D6\u8303\u56F4\u3001\u5931\u8D25\u65E5\u5FD7\u53CA\u8DF3\u8FC7\u9879\u3002`,
      dependencies: ["delivery-implementation", "delivery-tests"],
      readScope: unique([...scopes.implementation, ...scopes.tests, "package.json"]),
      writeScope: [`${runArtifactScope}verification/`],
      deliverables: ["verification report", "\u547D\u4EE4\u8F93\u51FA\u8BC1\u636E", "\u6B8B\u4F59\u98CE\u9669"],
      requiredEvidence: ["\u547D\u4EE4 exit code", "\u8F93\u51FA\u5C3E\u90E8", "\u8986\u76D6\u4E0E\u8DF3\u8FC7\u8BF4\u660E"],
      verification: taskVerificationCommands,
      mergeStrategy: "\u9A8C\u8BC1\u8282\u70B9\u53EA\u6C47\u603B\u8BC1\u636E\uFF0C\u4E0D\u66FF\u4EE3 implementation patch\u3002",
      adapter: "shell",
      executionClass: "deterministic_check",
      requiredCapabilities: [],
      preferredMode: "deterministic",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    }),
    planNode({
      id: "delivery-review",
      title: "\u4EA4\u4ED8\u5C31\u7EEA\u4E0E\u963B\u585E\u9879\u4FEE\u590D",
      lane: "review",
      parallelGroup: "readiness",
      objective: `\u590D\u6838\u201C${roadmapNode.title}\u201D\u662F\u5426\u6EE1\u8DB3\u9700\u6C42\u3001\u8BC1\u636E\u548C\u56DE\u6EDA\u8981\u6C42\uFF1B\u53EA\u5141\u8BB8\u4FEE\u590D\u660E\u786E\u7684\u963B\u585E\u9879\u3002`,
      dependencies: ["delivery-verification"],
      readScope: unique([...contextRefs, ...scopes.implementation, ...scopes.tests]),
      writeScope: scopes.implementation,
      deliverables: ["review findings", "\u963B\u585E\u9879\u4FEE\u590D patch \u6216 PASS \u51B3\u7B56", "merge posture"],
      requiredEvidence: ["\u9700\u6C42\u7B26\u5408\u6027", "blocking findings", "merge posture"],
      verification: taskVerificationCommands,
      mergeStrategy: "\u53EA\u5904\u7406 review \u963B\u585E\u9879\uFF1B\u65B0\u589E\u8303\u56F4\u5FC5\u987B\u8FD4\u56DE intake \u6216 replan\u3002",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    })
  ];
  const quickNodes = buildQuickPlanNodes({
    roadmapNode,
    intake,
    scopes,
    verificationCommands: taskVerificationCommands,
    contextRefs,
    runArtifactScope
  });
  const availableNodes = {
    quickNodes,
    fullNodes,
    roadmapNode,
    scopes
  };
  let capabilityApplication;
  try {
    capabilityApplication = bindMethodPackCapabilities(
      methodPack2,
      availableNodes,
      routedCapabilities
    );
  } catch (error) {
    if (methodPack2.workflow !== "quick" || !isCapabilityPlanEscalationError(error)) {
      throw error;
    }
    const governed = methodPackRegistry.packs.find(
      (pack) => pack.enabled !== false && pack.workflow === "governed"
    );
    if (!governed) {
      throw new Error(
        `${error.message}\uFF1BQuick \u81EA\u52A8\u5347\u7EA7\u5931\u8D25\uFF1AMethod Pack registry \u7F3A\u5C11 governed pack`
      );
    }
    methodPack2 = governed;
    methodPackSelectionReason = [
      `auto_escalated_from=${methodPackResolution.pack.id}`,
      error.message
    ].join("; ");
    capabilityApplication = bindMethodPackCapabilities(
      methodPack2,
      availableNodes,
      routedCapabilities
    );
  }
  const profile = methodPack2.workflow === "quick" ? "quick" : "full";
  const nodes = capabilityApplication.nodes.map(
    (node) => withThroughputMetadata(node, methodPack2.workflow)
  );
  const barriers = buildExecutionBarriers(methodPack2.workflow, nodes);
  const parallelLanes = buildParallelLanes(methodPack2.workflow);
  const mergeOrder = parallelLanes.map((lane) => lane.id);
  const edges = nodes.flatMap(
    (node) => node.dependencies.map((dependency) => edge(dependency, node.id, node.id === "delivery-verification" ? "verifies" : "blocks"))
  );
  return {
    schema_version: SCHEMA_VERSION,
    plan_id: planId,
    run_id: run.run_id,
    roadmap_node_id: run.roadmap_node_id,
    source_intake_id: intake.id,
    source_intake_type: intake.type,
    source_title: roadmapNode.title,
    affected_area: intake.affected_area,
    generated_at: timestamp,
    profile,
    execution_model: "barrier-v1",
    barriers,
    method_pack: {
      id: methodPack2.id,
      version: methodPack2.version,
      workflow: methodPack2.workflow,
      selection_reason: methodPackSelectionReason,
      quality_gates: methodPack2.quality_gates
    },
    capability_plan: capabilityApplication.capability_plan,
    strategy: strategyForMethodPack(methodPack2, intake, roadmapNode.title),
    planning_basis: [
      `.apex-v2/intake/items.json#${intake.id}`,
      `.apex-v2/roadmap/graph.json#${roadmapNode.id}`,
      `.apex-v2/policies/method-packs.json#${methodPack2.id}`,
      `capabilities/registry.json@${routedCapabilities.registry_version}`,
      `.apex-v2/knowledge/manifest.json@${run.context_snapshot.knowledge_version}`,
      ...intake.evidence_refs
    ],
    quality_bar: [
      "\u6BCF\u4E2A\u8282\u70B9\u53EA\u6709\u4E00\u4E2A primary objective\uFF0C\u5E76\u58F0\u660E\u8BFB\u5199\u8303\u56F4\u3001\u8BC1\u636E\u548C\u9A8C\u8BC1\u8DEF\u5F84\u3002",
      "\u540C\u4E00 parallel_group \u7684 write_scope \u5FC5\u987B\u4E92\u65A5\uFF1B\u91CD\u53E0\u65F6\u7981\u6B62\u5E76\u884C\u3002",
      "\u6240\u6709 PASS \u5FC5\u987B\u5F15\u7528\u5F53\u524D run \u7684 artifact evidence\u3002",
      "\u5B9E\u73B0\u4FDD\u6301\u6700\u5C0F\u5207\u7247\uFF0C\u7981\u6B62\u628A\u65E0\u5173\u91CD\u6784\u6DF7\u5165\u4EA4\u4ED8\u3002",
      "Method Pack \u53EF\u4EE5\u51CF\u5C11\u673A\u68B0\u8282\u70B9\uFF0C\u4F46\u4E0D\u80FD\u79FB\u9664 verification\u3001review \u6216 candidate binding\u3002",
      "Required Capability \u5FC5\u987B\u4EA7\u51FA\u5BF9\u5E94 typed evidence\uFF0C\u4E0D\u80FD\u4EE5\u666E\u901A summary \u66FF\u4EE3\u3002",
      "\u53EA\u6709\u5168\u90E8 PlanGraph \u8282\u70B9\u5B8C\u6210\u540E\uFF0Cexecute \u624D\u80FD PASS\u3002"
    ],
    nodes,
    edges,
    parallel_lanes: parallelLanes,
    merge_policy: {
      coordinator_required: true,
      worker_output: "patch_bundle_and_artifacts_only",
      direct_worker_write_to_derived: false,
      merge_order: mergeOrder
    },
    conflict_policy: {
      detect_by: ["write_scope_overlap", "same_file_patch", "same_text_patch", "schema_version_change"],
      same_parallel_group_write_overlap: "block_or_split",
      resolution: "coordinator_serial_merge_with_conflict_report",
      human_gate_when: ["schema_breaking_change", "security_sensitive_change", "unresolved_patch_conflict"]
    },
    verification_policy: {
      required_commands: taskVerificationCommands,
      schema_check: declaredVerificationCommands.length === 0 && methodPack2.workflow !== "quick" && inventory.schemaFiles.length > 0 ? "node src/apex-v2.mjs contracts validate --project ." : null,
      evidence_level: "PASS requires command evidence linked to the current run"
    },
    evidence_policy: {
      artifact_required_for_pass: true,
      accepted_artifact_types: ["plan", "evidence", "test", "review", "patch", "decision"],
      source_refs_required: true
    },
    project_knowledge_version: project.knowledge_version,
    project_name: project.project_name
  };
}
function bindMethodPackCapabilities(methodPack2, availableNodes, routedCapabilities) {
  const selectedNodes = selectMethodPackNodes(
    methodPack2.workflow,
    availableNodes
  ).map((node) => ({
    ...node,
    method_pack_id: methodPack2.id
  }));
  return applyCapabilityBindings(selectedNodes, routedCapabilities);
}
function isCapabilityPlanEscalationError(error) {
  return /Capability (?:context budget exceeded|execution class unavailable)/i.test(String(error?.message || error));
}
function applyCapabilityBindings(nodes, routedCapabilities) {
  const nextNodes = nodes.map((node) => ({
    ...node,
    required_evidence: [...node.required_evidence || []],
    capability_bindings: [],
    capability_enforcement: routedCapabilities.enforcement_mode
  }));
  const selected = [
    ...routedCapabilities.required || [],
    ...routedCapabilities.optional || [],
    ...routedCapabilities.advisory || []
  ];
  for (const capability of selected) {
    const node = selectCapabilityNode(capability, nextNodes);
    if (!node) {
      throw new Error(
        `Capability \u65E0\u53EF\u7528 PlanGraph \u8282\u70B9\uFF1A${capability.capability_id} -> ${capability.target_node_id}`
      );
    }
    node.capability_bindings.push(persistedCapabilityBinding({
      ...capability,
      target_node_id: node.id
    }));
    node.required_capabilities = unique([
      ...node.required_capabilities || [],
      ...capability.required_host_capabilities || []
    ]);
    if (capability.required) {
      node.required_evidence.push(
        `capability:${capability.capability_id}:${capability.output_contract}`
      );
    }
  }
  for (const node of nextNodes) {
    node.capability_bindings.sort(
      (left, right) => right.priority - left.priority || left.capability_id.localeCompare(right.capability_id)
    );
    assertCapabilityContextBudget(node.capability_bindings);
    node.required_evidence = unique(node.required_evidence);
  }
  return {
    nodes: nextNodes,
    capability_plan: {
      registry_version: routedCapabilities.registry_version,
      enforcement_mode: routedCapabilities.enforcement_mode,
      router_mode: routedCapabilities.router_mode || "enabled",
      required: (routedCapabilities.required || []).map(persistedCapabilityBinding),
      optional: (routedCapabilities.optional || []).map(persistedCapabilityBinding),
      advisory: (routedCapabilities.advisory || []).map(persistedCapabilityBinding)
    }
  };
}
function selectCapabilityNode(capability, nodes) {
  const targetId = resolveCapabilityTarget(
    capability.target_node_id,
    nodes
  );
  const targetIndex = nodes.findIndex((node) => node.id === targetId);
  const ordered = [
    ...nodes.slice(targetIndex),
    ...nodes.slice(0, targetIndex).reverse()
  ].filter(Boolean);
  const preferredCandidates = capability.execution_class === "deterministic_check" ? ordered.filter((node) => node.execution_class === "deterministic_check") : capability.execution_class === "workspace_patch" ? ordered.filter((node) => node.execution_class === "workspace_patch") : ordered;
  const candidates = preferredCandidates.length > 0 ? [
    ...preferredCandidates,
    ...ordered.filter((node) => !preferredCandidates.includes(node))
  ] : ordered;
  for (const node of candidates) {
    try {
      assertCapabilityContextBudget([
        ...node.capability_bindings || [],
        capability
      ]);
      return node;
    } catch {
    }
  }
  throw new Error(
    `Capability context budget exceeded\uFF1A${capability.capability_id} \u65E0\u6CD5\u5728 ${candidates.map((node) => node.id).join(",")} \u4E2D\u62C6\u5206\uFF1B\u5FC5\u987B replan`
  );
}
function persistedCapabilityBinding(capability) {
  return {
    capability_id: capability.capability_id,
    capability_version: capability.capability_version,
    category: capability.category,
    mode: capability.mode,
    required: capability.required,
    priority: capability.priority,
    target_node_id: capability.target_node_id,
    execution_class: capability.execution_class,
    required_host_capabilities: capability.required_host_capabilities,
    input_contract: capability.input_contract,
    output_contract: capability.output_contract,
    protocol_ref: capability.protocol_ref,
    availability: capability.availability,
    certification: capability.certification
  };
}
function resolveCapabilityTarget(targetNodeId, nodes) {
  if (nodes.some((node) => node.id === targetNodeId)) return targetNodeId;
  if (["delivery-context", "delivery-risk", "delivery-design", "delivery-verification"].includes(targetNodeId) && nodes.some((node) => node.id === "delivery-implementation")) {
    return "delivery-implementation";
  }
  if (nodes.some((node) => node.id === "delivery-review")) {
    return "delivery-review";
  }
  return nodes[0]?.id || null;
}
function buildExecutionBarriers(workflow, nodes) {
  const groups = workflow === "quick" ? [
    ["delivery-candidate", []],
    ["delivery-readiness", ["delivery-candidate"]]
  ] : [
    ["delivery-plan", []],
    ["delivery-candidate", ["delivery-plan"]],
    ["delivery-readiness", ["delivery-candidate"]]
  ];
  return groups.map(([id, dependencies]) => ({
    id,
    dependencies,
    node_ids: nodes.filter((node) => node.barrier_id === id).map((node) => node.id)
  })).filter((barrier) => barrier.node_ids.length > 0);
}
function withThroughputMetadata(node, workflow) {
  const barrierId = barrierForNode(node.id);
  const modelTier = modelTierForNode(node, workflow);
  const mainAgentRequired = node.id === "delivery-design" || node.id === "delivery-review" && modelTier === "strong";
  const delegatedByDefault = delegationDefaultForNode(node, workflow) && !mainAgentRequired;
  return {
    ...node,
    barrier_id: barrierId,
    dispatch_kind: node.execution_class === "deterministic_check" ? "kernel" : delegatedByDefault ? "subagent" : "coordinator",
    model_tier: modelTier,
    fallback_model_tier: fallbackModelTier(modelTier),
    delegation: {
      eligible: ["cognitive", "workspace_patch"].includes(node.execution_class),
      default: delegatedByDefault,
      parallel: delegatedByDefault && ["delivery-plan", "delivery-candidate"].includes(barrierId),
      main_agent_required: mainAgentRequired
    }
  };
}
function barrierForNode(nodeId) {
  if (["delivery-context", "delivery-risk", "delivery-design"].includes(nodeId)) {
    return "delivery-plan";
  }
  if ([
    "delivery-implementation",
    "delivery-tests",
    "delivery-verification"
  ].includes(nodeId)) {
    return "delivery-candidate";
  }
  return "delivery-readiness";
}
function modelTierForNode(node, workflow) {
  if (node.execution_class === "deterministic_check") return "deterministic";
  const strongCapabilities = /* @__PURE__ */ new Set([
    "security-audit",
    "migration-safety",
    "high-risk-review",
    "deploy-release"
  ]);
  if (node.risk === "critical" || (node.capability_bindings || []).some(
    (binding) => strongCapabilities.has(binding.capability_id)
  ) || workflow === "governed" && node.id === "delivery-review") {
    return "strong";
  }
  if (["delivery-context", "delivery-risk", "delivery-tests"].includes(node.id)) {
    return "cheap";
  }
  if (node.id === "delivery-review") return "cheap";
  return "standard";
}
function delegationDefaultForNode(node, workflow) {
  if (workflow === "quick") return false;
  return [
    "delivery-context",
    "delivery-risk",
    "delivery-implementation",
    "delivery-tests",
    "delivery-review"
  ].includes(node.id);
}
function fallbackModelTier(modelTier) {
  if (modelTier === "cheap") return "standard";
  if (modelTier === "standard") return "strong";
  return null;
}
function buildParallelLanes(workflow) {
  if (workflow === "quick") {
    return [
      { id: "build", purpose: "\u5355\u4E00 ActionWorkspace \u540C\u65F6\u5B8C\u6210\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\uFF0C\u51CF\u5C11\u7B80\u5355\u4EFB\u52A1\u5F80\u8FD4\u3002", node_ids: ["delivery-implementation"] },
      { id: "readiness", purpose: "\u590D\u6838\u9700\u6C42\u7B26\u5408\u6027\u4E0E merge posture\u3002", node_ids: ["delivery-review"] }
    ];
  }
  if (workflow === "disciplined") {
    return [
      { id: "planning", purpose: "\u5728\u4E00\u4E2A\u8BBE\u8BA1\u8282\u70B9\u5185\u6C47\u603B\u4E0A\u4E0B\u6587\u3001\u98CE\u9669\u548C\u6D4B\u8BD5\u5207\u7247\u3002", node_ids: ["delivery-design"] },
      { id: "build", purpose: "\u5355\u4E00 ActionWorkspace \u6309 TDD \u5B8C\u6210\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\u3002", node_ids: ["delivery-implementation"] },
      { id: "verification", purpose: "\u72EC\u7ACB\u6267\u884C\u771F\u5B9E\u9879\u76EE\u9A8C\u8BC1\u5E76\u56FA\u5316\u8BC1\u636E\u3002", node_ids: ["delivery-verification"] },
      { id: "readiness", purpose: "\u590D\u6838\u9700\u6C42\u7B26\u5408\u6027\u4E0E merge posture\u3002", node_ids: ["delivery-review"] }
    ];
  }
  if (workflow === "phase_context") {
    return [
      { id: "discovery", purpose: "\u4E3A\u5F53\u524D phase \u56FA\u5316\u6700\u5C0F\u4E0A\u4E0B\u6587\u548C\u9A8C\u6536\u8FB9\u754C\u3002", node_ids: ["delivery-context"] },
      { id: "planning", purpose: "\u57FA\u4E8E phase context \u5F62\u6210\u5B9E\u65BD\u4E0E\u56DE\u6EDA\u5207\u7247\u3002", node_ids: ["delivery-design"] },
      { id: "build", purpose: "\u5355\u4E00 ActionWorkspace \u6309\u8BA1\u5212\u5B8C\u6210\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\u3002", node_ids: ["delivery-implementation"] },
      { id: "verification", purpose: "\u72EC\u7ACB\u6267\u884C\u771F\u5B9E\u9879\u76EE\u9A8C\u8BC1\u5E76\u56FA\u5316\u8BC1\u636E\u3002", node_ids: ["delivery-verification"] },
      { id: "readiness", purpose: "\u590D\u6838\u9700\u6C42\u7B26\u5408\u6027\u4E0E merge posture\u3002", node_ids: ["delivery-review"] }
    ];
  }
  return [
    { id: "discovery", purpose: "\u5E76\u884C\u6838\u5BF9\u4E0A\u4E0B\u6587\u4E0E\u98CE\u9669\uFF0C\u907F\u514D\u5355\u4E00\u8DEF\u5F84\u81EA\u8BC1\u3002", node_ids: ["delivery-context", "delivery-risk"] },
    { id: "planning", purpose: "\u6C47\u603B\u8BC1\u636E\u5E76\u5F62\u6210\u4EFB\u52A1\u7EA7\u5B9E\u65BD\u5207\u7247\u3002", node_ids: ["delivery-design"] },
    { id: "build", purpose: "\u4E3B\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\u5728\u5199\u5165\u8303\u56F4\u4E92\u65A5\u65F6\u5E76\u884C\u3002", node_ids: ["delivery-implementation", "delivery-tests"] },
    { id: "verification", purpose: "\u72EC\u7ACB\u6267\u884C\u771F\u5B9E\u9879\u76EE\u9A8C\u8BC1\u5E76\u56FA\u5316\u8BC1\u636E\u3002", node_ids: ["delivery-verification"] },
    { id: "readiness", purpose: "\u590D\u6838\u9700\u6C42\u7B26\u5408\u6027\u5E76\u53EA\u4FEE\u590D\u660E\u786E\u963B\u585E\u9879\u3002", node_ids: ["delivery-review"] }
  ];
}
function selectMethodPackNodes(workflow, input) {
  if (workflow === "quick") return input.quickNodes;
  if (workflow === "governed") return input.fullNodes;
  const context = clonePlanNode(input.fullNodes, "delivery-context");
  const design = clonePlanNode(input.fullNodes, "delivery-design");
  const implementation = clonePlanNode(input.fullNodes, "delivery-implementation");
  const verification = clonePlanNode(input.fullNodes, "delivery-verification");
  const review = clonePlanNode(input.fullNodes, "delivery-review");
  design.dependencies = workflow === "phase_context" ? ["delivery-context"] : [];
  design.objective = workflow === "phase_context" ? `\u57FA\u4E8E\u5F53\u524D phase context\uFF0C\u4E3A\u201C${input.roadmapNode.title}\u201D\u5F62\u6210\u6700\u5C0F\u53EF\u4EA4\u4ED8\u5207\u7247\u3001\u6D4B\u8BD5\u7B56\u7565\u548C\u56DE\u6EDA\u65B9\u6848\u3002` : `\u5728\u5355\u4E00\u8BBE\u8BA1\u8282\u70B9\u5185\u6838\u5BF9\u201C${input.roadmapNode.title}\u201D\u7684\u4E0A\u4E0B\u6587\u3001\u98CE\u9669\u3001\u6700\u5C0F\u5207\u7247\u3001\u6D4B\u8BD5\u7B56\u7565\u548C\u56DE\u6EDA\u65B9\u6848\u3002`;
  implementation.title = "\u6D4B\u8BD5\u5148\u884C\u7684\u5B9E\u73B0\u5207\u7247";
  implementation.dependencies = ["delivery-design"];
  implementation.write_scope = unique([
    ...input.scopes.implementation,
    ...input.scopes.tests
  ]);
  implementation.deliverables = [
    "\u5B9E\u73B0\u4E0E\u6D4B\u8BD5 patch bundle",
    "\u5931\u8D25\u8DEF\u5F84\u4E0E\u516C\u5F00\u9A8C\u6536\u7ED3\u679C",
    "\u6B8B\u4F59\u98CE\u9669"
  ];
  implementation.required_evidence = [
    "changed_files",
    "patch artifact",
    "\u6D4B\u8BD5\u547D\u4EE4\u8F93\u51FA"
  ];
  implementation.objective = `\u5728\u4E00\u4E2A\u9694\u79BB ActionWorkspace \u5185\u6309\u6D4B\u8BD5\u5148\u884C\u65B9\u5F0F\u5B8C\u6210\u201C${input.roadmapNode.title}\u201D\u7684\u6700\u5C0F\u5B9E\u73B0\u4E0E\u56DE\u5F52\u6D4B\u8BD5\u3002`;
  verification.dependencies = ["delivery-implementation"];
  review.dependencies = ["delivery-verification"];
  return workflow === "phase_context" ? [context, design, implementation, verification, review] : [design, implementation, verification, review];
}
function clonePlanNode(nodes, id) {
  const node = nodes.find((candidate) => candidate.id === id);
  return {
    ...node,
    dependencies: [...node.dependencies],
    read_scope: [...node.read_scope],
    write_scope: [...node.write_scope],
    deliverables: [...node.deliverables],
    required_evidence: [...node.required_evidence],
    verification: [...node.verification],
    required_capabilities: [...node.required_capabilities],
    execution_hints: { ...node.execution_hints }
  };
}
function strategyForMethodPack(pack, intake, title) {
  if (pack.workflow === "quick") {
    return `\u9488\u5BF9\u201C${title}\u201D\u4F7F\u7528 quick Method Pack\uFF1A\u5355\u4E00\u9694\u79BB patch \u540C\u65F6\u5B8C\u6210\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\uFF0C\u518D\u505A\u72EC\u7ACB\u8BED\u4E49\u8BC4\u5BA1\u3002`;
  }
  if (pack.workflow === "disciplined") {
    return `\u9488\u5BF9\u201C${title}\u201D\u4F7F\u7528 disciplined-tdd Method Pack\uFF1A\u5408\u5E76\u91CD\u590D\u4E0A\u4E0B\u6587\u5F80\u8FD4\uFF0C\u4FDD\u7559\u8BBE\u8BA1\u3001\u6D4B\u8BD5\u5148\u884C\u5B9E\u73B0\u3001\u72EC\u7ACB\u9A8C\u8BC1\u548C\u8BC4\u5BA1\u3002`;
  }
  if (pack.workflow === "phase_context") {
    return `\u9488\u5BF9\u201C${title}\u201D\u4F7F\u7528 phase-context Method Pack\uFF1A\u53EA\u52A0\u8F7D\u5F53\u524D\u9636\u6BB5\u4E0A\u4E0B\u6587\uFF0C\u518D\u5B8C\u6210\u8BBE\u8BA1\u3001\u5B9E\u73B0\u3001\u9A8C\u8BC1\u548C\u8BC4\u5BA1\u3002`;
  }
  return strategyForIntake(intake, title);
}
function validatePlanGraph(plan) {
  const errors = [];
  const ids = /* @__PURE__ */ new Set();
  const lanes = new Map((plan.parallel_lanes || []).map((lane) => [lane.id, lane]));
  const laneMembership = /* @__PURE__ */ new Map();
  const barriers = new Map((plan.barriers || []).map((barrier) => [
    barrier.id,
    barrier
  ]));
  const barrierMembership = /* @__PURE__ */ new Map();
  const minimumNodes = {
    quick: 2,
    disciplined: 4,
    phase_context: 5,
    governed: 7
  }[plan.method_pack?.workflow] || (plan.profile === "quick" ? 2 : 5);
  if (!Array.isArray(plan.nodes) || plan.nodes.length < minimumNodes) {
    errors.push(`plan graph \u81F3\u5C11\u9700\u8981 ${minimumNodes} \u4E2A\u8282\u70B9`);
    return validationResult(plan, errors);
  }
  for (const node of plan.nodes) {
    if (ids.has(node.id)) errors.push(`plan node id \u91CD\u590D\uFF1A${node.id}`);
    ids.add(node.id);
    if (!node.objective) errors.push(`${node.id} \u7F3A\u5C11 objective`);
    if (!Array.isArray(node.write_scope) || node.execution_class !== "cognitive" && node.write_scope.length === 0) {
      errors.push(`${node.id} \u7F3A\u5C11 write_scope`);
    }
    if (!Array.isArray(node.required_evidence) || node.required_evidence.length === 0) errors.push(`${node.id} \u7F3A\u5C11 required_evidence`);
    if (!Array.isArray(node.verification) || node.verification.length === 0) errors.push(`${node.id} \u7F3A\u5C11 verification`);
    if (node.adapter != null && (typeof node.adapter !== "string" || !node.adapter)) errors.push(`${node.id} \u7684 adapter \u65E0\u6548\uFF1A${node.adapter}`);
    if (node.execution_class != null && !["cognitive", "workspace_patch", "deterministic_check", "human_decision"].includes(node.execution_class)) {
      errors.push(`${node.id} \u7684 execution_class \u65E0\u6548\uFF1A${node.execution_class}`);
    }
    if (node.preferred_mode != null && !["interactive", "factory", "deterministic", "human"].includes(node.preferred_mode)) {
      errors.push(`${node.id} \u7684 preferred_mode \u65E0\u6548\uFF1A${node.preferred_mode}`);
    }
    if (node.required_capabilities != null && !Array.isArray(node.required_capabilities)) {
      errors.push(`${node.id} \u7684 required_capabilities \u5FC5\u987B\u662F\u6570\u7EC4`);
    }
    if (plan.method_pack && node.method_pack_id !== plan.method_pack.id) {
      errors.push(`${node.id} \u7684 method_pack_id \u4E0E plan \u4E0D\u4E00\u81F4`);
    }
    if (plan.execution_model === "barrier-v1") {
      if (!node.barrier_id || !barriers.has(node.barrier_id)) {
        errors.push(`${node.id} \u7684 barrier_id \u65E0\u6548\uFF1A${node.barrier_id || "(\u7A7A)"}`);
      }
      if (!node.model_tier) errors.push(`${node.id} \u7F3A\u5C11 model_tier`);
      if (!node.delegation) errors.push(`${node.id} \u7F3A\u5C11 delegation`);
    }
    const capabilityIds = /* @__PURE__ */ new Set();
    for (const capability of node.capability_bindings || []) {
      if (capabilityIds.has(capability.capability_id)) {
        errors.push(`${node.id} \u7684 capability \u91CD\u590D\uFF1A${capability.capability_id}`);
      }
      capabilityIds.add(capability.capability_id);
      if (capability.required && !node.required_evidence.includes(
        `capability:${capability.capability_id}:${capability.output_contract}`
      )) {
        errors.push(`${node.id} \u7F3A\u5C11 required capability evidence\uFF1A${capability.capability_id}`);
      }
    }
    if (node.output_contract != null && !["evidence", "patch", "decision"].includes(node.output_contract)) errors.push(`${node.id} \u7684 output_contract \u65E0\u6548\uFF1A${node.output_contract}`);
    if (!lanes.has(node.parallel_group)) errors.push(`${node.id} \u7684 parallel_group \u672A\u5728 parallel_lanes \u4E2D\u58F0\u660E\uFF1A${node.parallel_group}`);
  }
  for (const node of plan.nodes) {
    for (const dependency of node.dependencies || []) {
      if (!ids.has(dependency)) errors.push(`${node.id} \u4F9D\u8D56\u4E0D\u5B58\u5728\uFF1A${dependency}`);
      if (dependency === node.id) errors.push(`${node.id} \u4E0D\u80FD\u4F9D\u8D56\u81EA\u8EAB`);
    }
  }
  for (const edgeItem of plan.edges || []) {
    if (!ids.has(edgeItem.from)) errors.push(`edge.from \u4E0D\u5B58\u5728\uFF1A${edgeItem.from}`);
    if (!ids.has(edgeItem.to)) errors.push(`edge.to \u4E0D\u5B58\u5728\uFF1A${edgeItem.to}`);
  }
  for (const lane of plan.parallel_lanes || []) {
    for (const nodeId of lane.node_ids) {
      if (!ids.has(nodeId)) {
        errors.push(`lane ${lane.id} \u5F15\u7528\u4E0D\u5B58\u5728\u8282\u70B9\uFF1A${nodeId}`);
        continue;
      }
      laneMembership.set(nodeId, (laneMembership.get(nodeId) || 0) + 1);
    }
    const laneNodes = plan.nodes.filter((node) => lane.node_ids.includes(node.id));
    for (let left = 0; left < laneNodes.length; left += 1) {
      for (let right = left + 1; right < laneNodes.length; right += 1) {
        for (const leftScope of laneNodes[left].write_scope) {
          for (const rightScope of laneNodes[right].write_scope) {
            if (scopesOverlap(leftScope, rightScope)) {
              errors.push(`parallel lane ${lane.id} \u5B58\u5728 write_scope \u51B2\u7A81\uFF1A${leftScope} \u4E0E ${rightScope}`);
            }
          }
        }
      }
    }
  }
  for (const node of plan.nodes) {
    const membership = laneMembership.get(node.id) || 0;
    if (membership !== 1) errors.push(`${node.id} \u5FC5\u987B\u4E14\u53EA\u80FD\u5C5E\u4E8E\u4E00\u4E2A parallel lane\uFF0C\u5F53\u524D ${membership}`);
  }
  if (plan.execution_model === "barrier-v1") {
    for (const barrier of plan.barriers || []) {
      for (const dependency of barrier.dependencies || []) {
        if (!barriers.has(dependency)) {
          errors.push(`barrier ${barrier.id} \u4F9D\u8D56\u4E0D\u5B58\u5728\uFF1A${dependency}`);
        }
        if (dependency === barrier.id) {
          errors.push(`barrier ${barrier.id} \u4E0D\u80FD\u4F9D\u8D56\u81EA\u8EAB`);
        }
      }
      for (const nodeId of barrier.node_ids || []) {
        if (!ids.has(nodeId)) {
          errors.push(`barrier ${barrier.id} \u5F15\u7528\u4E0D\u5B58\u5728\u8282\u70B9\uFF1A${nodeId}`);
          continue;
        }
        barrierMembership.set(
          nodeId,
          (barrierMembership.get(nodeId) || 0) + 1
        );
      }
    }
    for (const node of plan.nodes) {
      const membership = barrierMembership.get(node.id) || 0;
      if (membership !== 1) {
        errors.push(`${node.id} \u5FC5\u987B\u4E14\u53EA\u80FD\u5C5E\u4E8E\u4E00\u4E2A barrier\uFF0C\u5F53\u524D ${membership}`);
      }
      if (node.barrier_id && !barriers.get(node.barrier_id)?.node_ids.includes(node.id)) {
        errors.push(`${node.id} \u672A\u767B\u8BB0\u5728 barrier ${node.barrier_id}`);
      }
    }
  }
  errors.push(...findDependencyCycles(plan.nodes));
  return validationResult(plan, errors);
}
function buildQuickPlanNodes({
  roadmapNode,
  intake,
  scopes,
  verificationCommands,
  contextRefs,
  runArtifactScope
}) {
  const writeScope = unique([...scopes.implementation, ...scopes.tests]);
  return [
    planNode({
      id: "delivery-implementation",
      title: "\u5FEB\u901F\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\u5207\u7247",
      lane: "implementation",
      parallelGroup: "build",
      objective: `\u5728\u5355\u4E00 ActionWorkspace \u5185\u5B8C\u6210\u201C${roadmapNode.title}\u201D\u7684\u6700\u5C0F\u5B9E\u73B0\u3001\u805A\u7126\u6D4B\u8BD5\u548C\u516C\u5F00\u9A8C\u6536\u547D\u4EE4\u3002`,
      dependencies: [],
      readScope: unique([...contextRefs, ...writeScope]),
      writeScope,
      deliverables: ["\u5B9E\u73B0\u4E0E\u6D4B\u8BD5 patch bundle", "\u516C\u5F00\u9A8C\u6536\u7ED3\u679C", "\u6B8B\u4F59\u98CE\u9669"],
      requiredEvidence: ["changed_files", "patch artifact", "\u6D4B\u8BD5\u547D\u4EE4\u8F93\u51FA"],
      verification: verificationCommands,
      mergeStrategy: "\u7B80\u5355\u4EFB\u52A1\u53EA\u5141\u8BB8\u4E00\u4E2A\u9694\u79BB patch\uFF0C\u907F\u514D\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\u53CC worker \u5F80\u8FD4\u3002",
      executionClass: "workspace_patch",
      requiredCapabilities: ["structured_output", "workspace_write", "tool_use"],
      preferredMode: "interactive",
      executionHints: { estimated_duration_minutes: 8 },
      outputContract: "patch",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-review",
      title: "\u5FEB\u901F\u8BED\u4E49\u8BC4\u5BA1",
      lane: "review",
      parallelGroup: "readiness",
      objective: `\u590D\u6838\u201C${roadmapNode.title}\u201D\u7684\u9700\u6C42\u6620\u5C04\u3001ActionWorkspace \u9A8C\u6536\u8BC1\u636E\u4E0E merge posture\u3002`,
      dependencies: ["delivery-implementation"],
      readScope: unique([...contextRefs, ...writeScope]),
      writeScope: scopes.implementation,
      deliverables: ["review findings", "residual risks", "merge posture"],
      requiredEvidence: ["\u9700\u6C42\u7B26\u5408\u6027", "ActionWorkspace public acceptance", "merge posture"],
      verification: verificationCommands,
      mergeStrategy: "\u53EA\u5141\u8BB8\u4FEE\u590D\u660E\u786E\u963B\u585E\u9879\uFF1B\u65B0\u589E\u8303\u56F4\u8FD4\u56DE full route\u3002",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "medium")
    })
  ];
}
function extractDeclaredVerificationCommands(intake) {
  const typed = (intake.acceptance_commands || []).map((value) => String(value).trim()).filter(isVerificationCommand);
  const refs = (intake.evidence_refs || []).map((value) => String(value).trim()).filter(isVerificationCommand);
  if (typed.length > 0) return unique([...typed, ...refs]);
  const description = String(intake.description || "");
  const declared = description.match(
    /public acceptance(?: command)?s?\s*:\s*([^\n]+)/i
  )?.[1]?.split(/\s*;\s*/).map((value) => value.trim()).filter(isVerificationCommand) || [];
  return unique([...refs, ...declared]);
}
function isVerificationCommand(value) {
  return /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*(?:npm|pnpm|yarn|bun|node|npx|pytest|python\s+-m\s+pytest|cargo|go\s+test|make|test\b)/i.test(String(value || "").trim());
}
function renderPlanGraphMarkdown(plan) {
  return `# Plan Graph

plan_id: ${plan.plan_id}
run_id: ${plan.run_id}
roadmap_node_id: ${plan.roadmap_node_id}
source_intake_id: ${plan.source_intake_id || "unknown"}
source_title: ${plan.source_title || "unknown"}
method_pack: ${plan.method_pack?.id || "legacy"}
generated_at: ${plan.generated_at}

## \u7B56\u7565

${plan.strategy}

## Planning Basis

${bullet(plan.planning_basis || [])}

## Quality Bar

${bullet(plan.quality_bar)}

## \u5E76\u884C Lane

${plan.parallel_lanes.map((lane) => `### ${lane.id}

${lane.purpose}

\u8282\u70B9\uFF1A${lane.node_ids.join(", ")}
`).join("\n")}

## \u8282\u70B9

${plan.nodes.map((node) => `### ${node.id}\uFF1A${node.title}

- lane: ${node.lane}
- parallel_group: ${node.parallel_group}
- objective: ${node.objective}
- dependencies: ${node.dependencies.join(", ") || "\u65E0"}
- read_scope: ${node.read_scope.join(", ")}
- write_scope: ${node.write_scope.join(", ")}
- required_evidence: ${node.required_evidence.join(", ")}
- verification: ${node.verification.join(" && ")}
- adapter: ${node.adapter || "policy-selected"}
- method_pack_id: ${node.method_pack_id || "legacy"}
- capability_bindings: ${(node.capability_bindings || []).map((item) => `${item.capability_id}@${item.capability_version}`).join(", ") || "\u65E0"}
- execution_class: ${node.execution_class || "legacy"}
- preferred_mode: ${node.preferred_mode || "legacy"}
- execution_hints: ${JSON.stringify(node.execution_hints || {})}
- required_capabilities: ${(node.required_capabilities || []).join(", ") || "\u65E0"}
- output_contract: ${node.output_contract}
- risk: ${node.risk}
- merge_strategy: ${node.merge_strategy}
`).join("\n")}

## Merge Policy

\`\`\`json
${JSON.stringify(plan.merge_policy, null, 2)}
\`\`\`

## Conflict Policy

\`\`\`json
${JSON.stringify(plan.conflict_policy, null, 2)}
\`\`\`
`;
}
function inferPlanScopes(intake, inventory) {
  const explicit = parseAffectedArea2(intake.affected_area, inventory.files);
  const explicitTests = explicit.filter(isTestScope);
  const explicitImplementation = explicit.filter((scope) => !isTestScope(scope) && !scope.startsWith(".apex-v2/"));
  const sourceRoots = unique(inventory.sourceFiles.map(scopeRoot));
  const fallbackImplementation = unique([
    ...sourceRoots,
    ...inventory.schemaFiles.map(scopeRoot),
    ...inventory.packageJson ? ["package.json"] : []
  ]);
  const fallbackTests = unique(inventory.testFiles.length > 0 ? inventory.testFiles.map(scopeRoot) : ["tests/"]);
  return {
    implementation: explicitImplementation.length > 0 ? explicitImplementation : fallbackImplementation,
    tests: explicitTests.length > 0 ? explicitTests : fallbackTests
  };
}
function parseAffectedArea2(value, files) {
  const raw = String(value || "").trim();
  if (!raw || ["unknown", "n/a", "none"].includes(raw.toLowerCase())) return [];
  const available = new Set(files);
  return unique(raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).map((item) => {
    if (item.includes("*") || item.endsWith("/")) return item;
    if (available.has(item)) return item;
    if (files.some((file) => file.startsWith(`${item}/`))) return `${item}/`;
    return item;
  }));
}
function inferVerificationCommands(inventory) {
  const commands = [];
  const scripts = inventory.scripts || {};
  if (scripts.test) commands.push("npm test");
  for (const name of ["typecheck", "lint", "build", "validate"]) {
    if (scripts[name]) commands.push(`npm run ${name}`);
  }
  const jsEntry = inventory.sourceFiles.find((file) => /\.(mjs|cjs|js)$/.test(file));
  if (jsEntry) commands.push(`node --check ${jsEntry}`);
  if (commands.length === 0) commands.push("test -d .");
  return unique(commands).slice(0, 5);
}
function strategyForIntake(intake, title) {
  if (["bug", "test_failure"].includes(intake.type)) {
    return `\u9488\u5BF9\u201C${title}\u201D\u5148\u590D\u73B0\u5931\u8D25\u5E76\u9501\u5B9A\u6839\u56E0\uFF0C\u518D\u5E76\u884C\u5B9E\u73B0\u6700\u5C0F\u4FEE\u590D\u4E0E\u56DE\u5F52\u6D4B\u8BD5\uFF0C\u6700\u540E\u72EC\u7ACB\u9A8C\u8BC1\u3002`;
  }
  if (["risk", "review_feedback", "tech_debt"].includes(intake.type)) {
    return `\u9488\u5BF9\u201C${title}\u201D\u5148\u505A\u5F71\u54CD\u9762\u4E0E\u53CD\u8BC1\u5206\u6790\uFF0C\u518D\u4EE5\u6700\u5C0F\u5207\u7247\u964D\u4F4E\u98CE\u9669\uFF0C\u7981\u6B62\u7528\u65E0\u5173\u91CD\u6784\u63A9\u76D6\u95EE\u9898\u3002`;
  }
  return `\u9488\u5BF9\u201C${title}\u201D\u5148\u660E\u786E\u9A8C\u6536\u8FB9\u754C\u548C\u98CE\u9669\uFF0C\u518D\u5E76\u884C\u63A8\u8FDB\u6700\u5C0F\u5B9E\u73B0\u4E0E\u6D4B\u8BD5\uFF0C\u6700\u540E\u4EE5\u72EC\u7ACB\u8BC1\u636E\u51B3\u5B9A\u662F\u5426\u53EF\u4EA4\u4ED8\u3002`;
}
function planNode(input) {
  return {
    id: input.id,
    title: input.title,
    lane: input.lane,
    objective: input.objective,
    parallel_group: input.parallelGroup,
    dependencies: input.dependencies,
    read_scope: unique(input.readScope),
    write_scope: unique(input.writeScope),
    deliverables: input.deliverables,
    required_evidence: input.requiredEvidence,
    verification: unique(input.verification),
    merge_strategy: input.mergeStrategy,
    adapter: input.adapter,
    execution_class: input.executionClass,
    required_capabilities: unique(input.requiredCapabilities || []),
    preferred_mode: input.preferredMode,
    execution_hints: {
      estimated_duration_minutes: Number(input.executionHints?.estimated_duration_minutes || 10),
      requires_isolation: Boolean(input.executionHints?.requires_isolation),
      requires_resume: Boolean(input.executionHints?.requires_resume),
      background: Boolean(input.executionHints?.background),
      requires_parallel_execution: Boolean(input.executionHints?.requires_parallel_execution)
    },
    output_contract: input.outputContract,
    risk: input.risk
  };
}
function edge(from, to, type) {
  return { from, to, type };
}
function normalizedRisk(value, fallback) {
  return ["low", "medium", "high", "critical"].includes(value) ? value : fallback;
}
function isTestScope(scope) {
  return scope.startsWith("test/") || scope.startsWith("tests/") || scope.includes(".test.") || scope.includes(".spec.");
}
function scopeRoot(file) {
  const separator = file.indexOf("/");
  return separator === -1 ? file : `${file.slice(0, separator)}/`;
}
function scopesOverlap(left, right) {
  if (left === right) return true;
  const leftPrefix = directoryPrefix(left);
  const rightPrefix = directoryPrefix(right);
  if (leftPrefix && right.startsWith(leftPrefix)) return true;
  if (rightPrefix && left.startsWith(rightPrefix)) return true;
  return false;
}
function directoryPrefix(scope) {
  if (scope.endsWith("/*")) return scope.slice(0, -1);
  if (scope.endsWith("/")) return scope;
  return null;
}
function findDependencyCycles(nodes) {
  const byId2 = new Map(nodes.map((node) => [node.id, node]));
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const errors = [];
  function visit(id, path) {
    if (visiting.has(id)) {
      errors.push(`plan graph \u5B58\u5728 dependency cycle\uFF1A${[...path, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id) || !byId2.has(id)) return;
    visiting.add(id);
    for (const dependency of byId2.get(id).dependencies || []) {
      visit(dependency, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const node of nodes) visit(node.id, []);
  return unique(errors);
}
function validationResult(plan, errors) {
  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    errors,
    node_count: Array.isArray(plan.nodes) ? plan.nodes.length : 0,
    edge_count: Array.isArray(plan.edges) ? plan.edges.length : 0,
    lane_count: Array.isArray(plan.parallel_lanes) ? plan.parallel_lanes.length : 0
  };
}
function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

// src/core/worker-execution.mjs
import {
  existsSync as existsSync15,
  readFileSync as readFileSync12,
  readdirSync as readdirSync7,
  rmSync as rmSync5,
  statSync as statSync3,
  writeFileSync as writeFileSync10
} from "node:fs";
import { createHash as createHash7 } from "node:crypto";
import { join as join21, relative as relative5, resolve as resolve12 } from "node:path";

// src/contracts/worker-executor.mjs
function assertWorkerExecutor(executor) {
  if (!executor || typeof executor !== "object") {
    throw new Error("WorkerExecutor \u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  if (!executor.id || typeof executor.id !== "string") {
    throw new Error("WorkerExecutor \u5FC5\u987B\u58F0\u660E id");
  }
  for (const method of ["inspect", "execute", "resume", "cancel", "collectUsage"]) {
    if (typeof executor[method] !== "function") {
      throw new Error(`WorkerExecutor ${executor.id} \u7F3A\u5C11\u65B9\u6CD5\uFF1A${method}`);
    }
  }
  return executor;
}
function normalizeExecutorInspection(executorId, inspection = {}) {
  return {
    ...inspection,
    executor_id: executorId,
    adapter: inspection.adapter || executorId,
    available: Boolean(inspection.available),
    version: String(inspection.version || ""),
    capabilities: normalizeExecutionCapabilities(inspection.capabilities || []),
    error: String(inspection.error || "")
  };
}

// src/executors/claude-code-cli.mjs
import { spawnSync as spawnSync5 } from "node:child_process";
import { existsSync as existsSync11, readFileSync as readFileSync9, writeFileSync as writeFileSync6 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join15 } from "node:path";

// src/core/capability-sandbox.mjs
import {
  existsSync as existsSync10,
  mkdtempSync,
  readFileSync as readFileSync8,
  realpathSync as realpathSync2,
  rmSync as rmSync4,
  writeFileSync as writeFileSync5
} from "node:fs";
import { randomUUID as randomUUID3 } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename as basename4, dirname as dirname5, join as join14, resolve as resolve7 } from "node:path";
import { spawnSync as spawnSync4 } from "node:child_process";

// src/core/process-guard.mjs
import { realpathSync, statfsSync } from "node:fs";
import { spawnSync as spawnSync3 } from "node:child_process";
function snapshotProcessIds() {
  return new Set(listProcesses().map((entry) => entry.pid));
}
function terminateNewWorkspaceProcesses(workspaceDir, baselinePids, {
  termWaitMs = 250,
  guardToken = null
} = {}) {
  const workspace = realpathSync(workspaceDir);
  const initial = listProcesses({ includeEnvironment: Boolean(guardToken) });
  const targets = new Set(initial.filter(
    (entry) => !baselinePids.has(entry.pid) && entry.pid !== process.pid && (commandReferencesWorkspace(entry.command, workspace) || guardToken && entry.command.includes(guardToken))
  ).map((entry) => entry.pid));
  expandDescendants(targets, initial);
  return terminateTargets(targets, initial, termWaitMs);
}
function terminateTargets(targets, initial, termWaitMs) {
  signalTargets(targets, initial, "SIGTERM");
  if (targets.size > 0) sleep(termWaitMs);
  const remaining = listProcesses();
  const alive = new Set(remaining.filter((entry) => targets.has(entry.pid)).map((entry) => entry.pid));
  signalTargets(alive, remaining, "SIGKILL");
  if (alive.size > 0) waitForProcessExit(alive, 2e3);
  const survivors = new Set(listProcesses().filter((entry) => alive.has(entry.pid) && !entry.stat.startsWith("Z")).map((entry) => entry.pid));
  return {
    terminated_pids: [...targets].sort((left, right) => left - right),
    force_killed_pids: [...alive].sort((left, right) => left - right),
    surviving_pids: [...survivors].sort((left, right) => left - right)
  };
}
function listProcesses({ includeEnvironment = false } = {}) {
  const args = includeEnvironment ? ["eww", "-Ao", "pid=,ppid=,pgid=,stat=,command="] : ["-Ao", "pid=,ppid=,pgid=,stat=,command="];
  const result = spawnSync3("ps", args, {
    encoding: "utf8",
    maxBuffer: includeEnvironment ? 64 * 1024 * 1024 : 16 * 1024 * 1024
  });
  if (result.status !== 0) return [];
  return String(result.stdout || "").split("\n").map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean).map((match) => ({
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    stat: match[4],
    command: match[5]
  }));
}
function commandReferencesWorkspace(command, workspace) {
  return command.includes(workspace) || command.includes(workspace.replace(/^\/private/, ""));
}
function expandDescendants(targets, processes) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of processes) {
      if (!targets.has(entry.pid) && targets.has(entry.ppid)) {
        targets.add(entry.pid);
        changed = true;
      }
    }
  }
}
function signalTargets(targets, processes, signal) {
  const current = processes.find((entry) => entry.pid === process.pid);
  const currentPgid = current?.pgid || null;
  const groups = new Set(processes.filter((entry) => targets.has(entry.pid)).map((entry) => entry.pgid).filter((pgid) => pgid > 1 && pgid !== currentPgid));
  for (const pgid of groups) {
    try {
      process.kill(-pgid, signal);
    } catch (error) {
      if (!["ESRCH", "EPERM"].includes(error.code)) throw error;
    }
  }
  for (const pid of targets) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (!["ESRCH", "EPERM"].includes(error.code)) throw error;
    }
  }
}
function sleep(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, ms);
}
function waitForProcessExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = listProcesses().some((entry) => pids.has(entry.pid));
    if (!remaining) return;
    sleep(50);
  }
}

// src/core/capability-sandbox.mjs
var SANDBOX_EXEC = "/usr/bin/sandbox-exec";
var CAPABILITY_RUNNER = new URL("./capability-runner.mjs", import.meta.url).pathname;
var SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|COOKIE|AUTH)/i;
var INTERNAL_ENV_NAMES = /* @__PURE__ */ new Set(["APEX_PARALLEL_GUARD_TOKEN"]);
function spawnCapabilityProcess(executable, args, options = {}) {
  const workspaceDir = realpathSync2(options.workspaceDir);
  const writablePaths = Array.from(/* @__PURE__ */ new Set([
    workspaceDir,
    ...(options.writablePaths || []).map(existingRealPath)
  ]));
  const env = sanitizeEnvironment({
    ...options.env || process.env,
    APEX_CAPABILITY_SANDBOX_ACTIVE: "1"
  }, options.allowedSecretNames || []);
  const sandbox = (options.env || process.env).APEX_CAPABILITY_SANDBOX_ACTIVE === "1" ? {
    available: true,
    type: "inherited-macos-seatbelt",
    executable,
    args
  } : capabilitySandboxCommand(executable, args, {
    workspaceDir,
    writablePaths,
    network: Boolean(options.network),
    deniedReadPaths: options.deniedReadPaths || []
  });
  if (!sandbox.available) {
    return {
      status: 1,
      signal: null,
      stdout: "",
      stderr: sandbox.error,
      error: new Error(sandbox.error),
      duration_ms: 0,
      sandbox
    };
  }
  return runManagedProcess(sandbox, {
    cwd: workspaceDir,
    input: options.input,
    timeoutMs: options.timeoutMs,
    env,
    minFreeBytes: options.minFreeBytes,
    diskPath: options.diskPath || workspaceDir,
    maxDiskGrowthBytes: options.maxDiskGrowthBytes,
    maxWorkspaceGrowthBytes: options.maxWorkspaceGrowthBytes,
    workspaceCheckIntervalMs: options.workspaceCheckIntervalMs,
    maxOutputBytes: options.maxOutputBytes
  });
}
function spawnManagedProcess(executable, args, options = {}) {
  const workspaceDir = realpathSync2(options.workspaceDir);
  return runManagedProcess({
    available: true,
    type: "managed-process",
    executable,
    args
  }, {
    cwd: workspaceDir,
    input: options.input,
    timeoutMs: options.timeoutMs,
    env: options.env || process.env,
    minFreeBytes: options.minFreeBytes,
    diskPath: options.diskPath || workspaceDir,
    maxDiskGrowthBytes: options.maxDiskGrowthBytes,
    maxWorkspaceGrowthBytes: options.maxWorkspaceGrowthBytes,
    workspaceCheckIntervalMs: options.workspaceCheckIntervalMs,
    maxOutputBytes: options.maxOutputBytes
  });
}
function capabilitySandboxCommand(executable, args, options) {
  if (process.platform !== "darwin" || !existsSync10(SANDBOX_EXEC)) {
    return {
      available: false,
      error: "OS capability sandbox unavailable; refusing unsandboxed agent execution",
      executable,
      args
    };
  }
  const profile = buildMacSandboxProfile(options);
  return {
    available: true,
    type: "macos-seatbelt",
    profile,
    executable: SANDBOX_EXEC,
    args: ["-p", profile, executable, ...args]
  };
}
function sanitizeEnvironment(environment, allowedSecretNames = []) {
  const allowed = new Set(allowedSecretNames);
  return Object.fromEntries(Object.entries(environment).filter(
    ([name]) => !SECRET_NAME.test(name) || allowed.has(name) || INTERNAL_ENV_NAMES.has(name)
  ));
}
function buildMacSandboxProfile(options) {
  const writableRules = options.writablePaths.map((path) => `(subpath ${quote(path)})`).join(" ");
  const deniedSecretPaths = [...defaultSecretPaths(), ...options.deniedReadPaths || []].map(policyPath).map((path) => `(deny file-read* (subpath ${quote(path)}))`).join(" ");
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${writableRules} (subpath "/private/tmp") (literal "/dev/null") (literal "/dev/tty"))`,
    options.network ? "" : "(deny network*)",
    deniedSecretPaths
  ].filter(Boolean).join(" ");
}
function defaultSecretPaths() {
  const home = realpathSync2(homedir());
  return [
    resolve7(home, ".ssh"),
    resolve7(home, ".aws"),
    resolve7(home, ".kube"),
    resolve7(home, ".config", "gcloud")
  ];
}
function existingRealPath(path) {
  const resolved = resolve7(path);
  if (existsSync10(resolved)) return realpathSync2(resolved);
  return realpathSync2(dirname5(resolved));
}
function policyPath(path) {
  const resolved = resolve7(path);
  if (existsSync10(resolved)) return realpathSync2(resolved);
  return join14(realpathSync2(dirname5(resolved)), basename4(resolved));
}
function quote(value) {
  return JSON.stringify(value);
}
function runManagedProcess(sandbox, options) {
  const baselinePids = snapshotProcessIds();
  const guardToken = randomUUID3();
  const guardedEnvironment = {
    ...options.env,
    APEX_PROCESS_GUARD_TOKEN: guardToken
  };
  const exchangeDir = mkdtempSync(join14(capabilityExchangeRoot(), "apex-capability-runner-"));
  const configPath = join14(exchangeDir, "config.json");
  const resultPath = join14(exchangeDir, "result.json");
  let execution;
  let processCleanup = {
    terminated_pids: [],
    force_killed_pids: [],
    surviving_pids: []
  };
  writeFileSync5(configPath, `${JSON.stringify({
    executable: sandbox.executable,
    args: sandbox.args,
    cwd: options.cwd,
    input: options.input ?? null,
    timeoutMs: options.timeoutMs || 30 * 60 * 1e3,
    env: guardedEnvironment,
    parentPid: process.pid,
    minFreeBytes: options.minFreeBytes || 0,
    diskPath: options.diskPath || options.cwd,
    maxDiskGrowthBytes: options.maxDiskGrowthBytes || 0,
    maxWorkspaceGrowthBytes: options.maxWorkspaceGrowthBytes || 0,
    workspaceCheckIntervalMs: options.workspaceCheckIntervalMs || 2e3,
    maxOutputBytes: options.maxOutputBytes || 16 * 1024 * 1024
  })}
`);
  try {
    const runner = spawnSync4(process.execPath, [CAPABILITY_RUNNER, configPath, resultPath], {
      cwd: options.cwd,
      encoding: "utf8",
      timeout: (options.timeoutMs || 30 * 60 * 1e3) + 1e4,
      env: guardedEnvironment
    });
    if (!existsSync10(resultPath)) {
      const message = runner.stderr || runner.error?.message || "capability runner produced no result";
      execution = {
        status: 1,
        signal: runner.signal || null,
        stdout: runner.stdout || "",
        stderr: message,
        error: Object.assign(new Error(message), {
          code: runner.error?.code || "ERUNNER"
        }),
        duration_ms: 0,
        sandbox
      };
    } else {
      const result = JSON.parse(readFileSync8(resultPath, "utf8"));
      const error = result.error ? Object.assign(new Error(result.error), { code: result.timed_out ? "ETIMEDOUT" : "EEXECUTION" }) : null;
      execution = {
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        error,
        timed_out: result.timed_out,
        termination_reason: result.termination_reason,
        duration_ms: result.duration_ms,
        sandbox
      };
    }
  } finally {
    processCleanup = terminateNewWorkspaceProcesses(options.cwd, baselinePids, { guardToken });
    rmSync4(exchangeDir, { recursive: true, force: true });
  }
  execution.process_cleanup = processCleanup;
  if (processCleanup.terminated_pids.length > 0) {
    const message = processCleanup.surviving_pids.length > 0 ? `orphan workspace processes survived cleanup: ${processCleanup.surviving_pids.join(",")}` : `orphan workspace processes reaped: ${processCleanup.terminated_pids.join(",")}`;
    execution.status = 1;
    execution.termination_reason = "orphan-process";
    execution.stderr = [execution.stderr, message].filter(Boolean).join("\n");
    execution.error = Object.assign(new Error(message), { code: "EORPHANPROCESS" });
  }
  return execution;
}
function capabilityExchangeRoot() {
  if (process.platform === "darwin" && existsSync10("/private/tmp")) {
    return realpathSync2("/private/tmp");
  }
  return tmpdir();
}

// src/executors/secret-boundaries.mjs
import { homedir as homedir2 } from "node:os";
import { resolve as resolve8 } from "node:path";
function providerSecretPaths() {
  const home = homedir2();
  return [
    resolve8(home, ".codex"),
    resolve8(home, ".claude"),
    resolve8(home, ".gemini")
  ];
}

// src/executors/lifecycle.mjs
function resumeWithExecute(executorId, execute, input = {}) {
  if (!input.sessionId) {
    throw new Error(`WorkerExecutor ${executorId} resume \u8981\u6C42 sessionId`);
  }
  return execute(input);
}
function unsupportedResume(executorId) {
  return () => {
    throw new Error(`WorkerExecutor ${executorId} \u4E0D\u652F\u6301 session resume`);
  };
}
function cancelProcessTree(executorId, input = {}) {
  if (typeof input.cancel === "function") {
    input.cancel();
    return { executor_id: executorId, cancelled: true, method: "callback" };
  }
  const processGroupId = Number(input.processGroupId || input.process_group_id || input.pid);
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) {
    return { executor_id: executorId, cancelled: false, method: "not_running" };
  }
  const signal = input.signal || "SIGTERM";
  signalProcessGroup(processGroupId, signal);
  let forceKilled = false;
  if (signal !== "SIGKILL") {
    sleep2(Number(input.graceMs || input.grace_ms || 250));
    if (processGroupAlive(processGroupId)) {
      signalProcessGroup(processGroupId, "SIGKILL");
      forceKilled = true;
    }
  }
  return {
    executor_id: executorId,
    cancelled: true,
    method: "process_group",
    signal,
    force_killed: forceKilled
  };
}
function collectExecutionUsage(execution = {}) {
  return {
    input_tokens: nullableInteger(execution.usage?.input_tokens),
    output_tokens: nullableInteger(execution.usage?.output_tokens),
    tool_calls: nullableInteger(execution.usage?.tool_calls),
    duration_ms: nullableInteger(execution.duration_ms)
  };
}
function nullableInteger(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error.code === "ESRCH") return;
    try {
      process.kill(processGroupId, signal);
    } catch (fallbackError) {
      if (fallbackError.code !== "ESRCH") throw fallbackError;
    }
  }
}
function processGroupAlive(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    try {
      process.kill(processGroupId, 0);
      return true;
    } catch {
      return false;
    }
  }
}
function sleep2(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, ms);
}

// src/executors/claude-code-cli.mjs
function inspectClaudeAdapter(executable = "claude") {
  const result = spawnSync5(executable, ["--version"], { encoding: "utf8", timeout: 5e3 });
  return { adapter: "claude", executable, available: result.status === 0, version: result.status === 0 ? result.stdout.trim() : "", capabilities: ["structured_output", "session_resume", "workspace_write", "tool_use", "budget_limit", "process_tree_cancel"], error: result.status === 0 ? "" : tail(result.stderr) };
}
function executeClaudeAdapter(options) {
  const args = buildClaudeArgs(options);
  const startedAt = Date.now();
  const result = spawnCapabilityProcess(options.executable || "claude", args, {
    workspaceDir: options.workspaceDir,
    timeoutMs: options.timeoutMs,
    adapter: "claude",
    network: true,
    deniedReadPaths: providerSecretPaths(),
    allowedSecretNames: [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_MODEL",
      "ANTHROPIC_SMALL_FAST_MODEL"
    ],
    env: {
      ...process.env,
      ...loadClaudeProviderEnvironment()
    }
  });
  let envelope = null;
  if (result.status === 0) {
    envelope = parseEnvelope(result.stdout);
    if (envelope.structured) writeFileSync6(options.outputPath, `${JSON.stringify(envelope.structured)}
`);
  }
  const failedEnvelope = Boolean(envelope?.is_error);
  return {
    ...executionResult(options.executable || "claude", args, result, startedAt, failedEnvelope),
    session_id: envelope?.session_id || options.sessionId || null,
    usage: normalizeClaudeUsage(envelope?.usage)
  };
}
function buildClaudeArgs(options) {
  const schema = readFileSync9(options.outputSchemaPath, "utf8");
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    schema,
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Read,Edit,Write,Glob,Grep,Bash(npm test),Bash(node --test *),Bash(node --check *)",
    "--append-system-prompt",
    "Your final response MUST use the provided structured output schema. Do not return a prose-only final answer."
  ];
  if (options.sessionId) args.push("--resume", options.sessionId);
  if (options.model) args.push("--model", options.model);
  args.push(options.prompt);
  return args;
}
function parseEnvelope(stdout) {
  try {
    const value = JSON.parse(stdout);
    if (value.structured_output) return {
      structured: value.structured_output,
      session_id: value.session_id,
      usage: value.usage,
      is_error: Boolean(value.is_error)
    };
    if (typeof value.result === "string") {
      try {
        return {
          structured: JSON.parse(value.result),
          session_id: value.session_id,
          usage: value.usage,
          is_error: Boolean(value.is_error)
        };
      } catch {
        return {
          structured: null,
          session_id: value.session_id,
          usage: value.usage,
          is_error: Boolean(value.is_error)
        };
      }
    }
    if (value.verdict) return {
      structured: value,
      session_id: value.session_id,
      usage: value.usage,
      is_error: Boolean(value.is_error)
    };
    return {
      structured: null,
      session_id: value.session_id,
      usage: value.usage,
      is_error: Boolean(value.is_error)
    };
  } catch {
  }
  return { structured: null, session_id: null, usage: null, is_error: false };
}
function executionResult(executable, args, result, startedAt, failedEnvelope) {
  return { executable, args, command: [result.sandbox.executable, ...result.sandbox.args.slice(0, -1), "<prompt>"].join(" "), exit_code: failedEnvelope ? 1 : result.status ?? 1, signal: result.signal || "", timed_out: result.error?.code === "ETIMEDOUT", duration_ms: result.duration_ms ?? Date.now() - startedAt, stdout_tail: tail(result.stdout), stderr_tail: tail(result.stderr || result.error?.message || "") };
}
function loadClaudeProviderEnvironment() {
  const path = join15(homedir3(), ".claude", "settings.json");
  if (!existsSync11(path)) return {};
  try {
    const value = JSON.parse(readFileSync9(path, "utf8"));
    const allowed = [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_MODEL",
      "ANTHROPIC_SMALL_FAST_MODEL",
      "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
      "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"
    ];
    return Object.fromEntries(allowed.filter((name) => value.env?.[name] != null).map((name) => [name, String(value.env[name])]));
  } catch {
    return {};
  }
}
function normalizeClaudeUsage(usage = {}) {
  return {
    input_tokens: integerOrNull(usage.input_tokens),
    output_tokens: integerOrNull(usage.output_tokens),
    tool_calls: integerOrNull(usage.server_tool_use?.web_search_requests)
  };
}
function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
var claudeCodeCliExecutor = {
  id: "claude",
  inspect: inspectClaudeAdapter,
  execute: executeClaudeAdapter,
  resume: (input) => resumeWithExecute("claude", executeClaudeAdapter, input),
  cancel: (input) => cancelProcessTree("claude", input),
  collectUsage: collectExecutionUsage
};

// src/executors/codex-cli.mjs
import { spawnSync as spawnSync6 } from "node:child_process";
import {
  chmodSync as chmodSync2,
  copyFileSync as copyFileSync2,
  existsSync as existsSync12,
  mkdirSync as mkdirSync5,
  readFileSync as readFileSync10,
  realpathSync as realpathSync3,
  writeFileSync as writeFileSync7
} from "node:fs";
import { homedir as homedir4 } from "node:os";
import { basename as basename5, dirname as dirname6, join as join16, resolve as resolve9, sep as sep2 } from "node:path";
function inspectCodexAdapter(executable = "codex") {
  const resolvedExecutable = resolveCodexExecutable(executable);
  const result = spawnSync6(resolvedExecutable, ["--version"], {
    encoding: "utf8",
    timeout: 5e3
  });
  return {
    adapter: "codex",
    executable: resolvedExecutable,
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : "",
    capabilities: ["structured_output", "workspace_write", "tool_use", "ephemeral", "process_tree_cancel"],
    error: result.status === 0 ? "" : tail(result.stderr || result.stdout)
  };
}
function executeCodexAdapter(options) {
  const {
    executable = "codex",
    workspaceDir,
    prompt,
    outputSchemaPath,
    outputPath,
    model,
    profile,
    timeoutMs = 30 * 60 * 1e3
  } = options;
  const resolvedExecutable = resolveCodexExecutable(executable);
  const args = buildCodexArgs({
    workspaceDir,
    outputSchemaPath,
    outputPath,
    model,
    profile,
    smoke: options.smoke
  });
  const codexHome = prepareIsolatedCodexHome(workspaceDir, profile);
  const result = spawnCapabilityProcess(resolvedExecutable, args, {
    workspaceDir,
    input: prompt,
    timeoutMs,
    adapter: "codex",
    network: true,
    writablePaths: [dirname6(outputPath)],
    deniedReadPaths: providerSecretPaths(),
    allowedSecretNames: ["OPENAI_API_KEY", "FUTU_LLM_PROXY_API_KEY"],
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      APEX_V2_ADAPTER: "codex"
    }
  });
  if (result.status === 0 && !existsSync12(outputPath)) {
    const recovered = extractCodexStructuredOutput(result.stdout);
    if (recovered) {
      writeFileSync7(outputPath, `${JSON.stringify(recovered)}
`);
    }
  }
  return {
    executable: resolvedExecutable,
    executable_name: basename5(resolvedExecutable),
    args,
    command: [result.sandbox.executable, ...result.sandbox.args].join(" "),
    exit_code: result.status ?? 1,
    signal: result.signal || "",
    timed_out: result.error?.code === "ETIMEDOUT",
    duration_ms: result.duration_ms,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr || result.error?.message || "")
  };
}
function extractCodexStructuredOutput(output) {
  const text = String(output || "").trim();
  try {
    const direct = JSON.parse(text);
    if (direct && typeof direct === "object" && !Array.isArray(direct) && typeof direct.verdict === "string") {
      return direct;
    }
  } catch {
  }
  let recovered = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type !== "item.completed" || event.item?.type !== "agent_message" || typeof event.item.text !== "string") {
        continue;
      }
      const candidate = JSON.parse(event.item.text);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        recovered = candidate;
      }
    } catch {
    }
  }
  return recovered;
}
function resolveCodexExecutable(executable = "codex", environment = process.env, deniedRoots = providerSecretPaths()) {
  if (String(executable).includes("/")) return resolve9(String(executable));
  const result = spawnSync6("/usr/bin/which", ["-a", executable], {
    encoding: "utf8",
    env: environment
  });
  if (result.status !== 0) return executable;
  const denied = [...deniedRoots, join16(homedir4(), ".local", "bin")].map(
    (path) => existsSync12(path) ? realpathSync3(path) : resolve9(path)
  );
  const candidates = result.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const resolvedCandidate = existsSync12(candidate) ? realpathSync3(candidate) : resolve9(candidate);
    if (!denied.some(
      (root) => resolvedCandidate === root || resolvedCandidate.startsWith(`${root}${sep2}`)
    ) && !isModeSwitchWrapper(candidate)) {
      return candidate;
    }
  }
  return executable;
}
function isModeSwitchWrapper(path) {
  try {
    const content = readFileSync10(path, "utf8").slice(0, 16 * 1024);
    return content.includes("codex_mode.py") || content.includes("CODEX_WRAPPER_PATH");
  } catch {
    return false;
  }
}
function prepareIsolatedCodexHome(workspaceDir, profile) {
  const sourceHome = process.env.CODEX_HOME || join16(homedir4(), ".codex");
  const targetHome = join16(workspaceDir, ".apex-agent", "codex-home");
  mkdirSync5(targetHome, { recursive: true });
  const sourceProviderModes = join16(sourceHome, "provider-modes");
  const targetProviderModes = join16(targetHome, "provider-modes");
  mkdirSync5(targetProviderModes, { recursive: true });
  const files = ["config.toml", "auth.json"];
  if (profile) files.push(`${profile}.config.toml`);
  for (const file of files) {
    const source = join16(sourceHome, file);
    if (!existsSync12(source)) continue;
    const target = join16(targetHome, file);
    if (file.endsWith(".toml")) {
      const content = readFileSync10(source, "utf8").replaceAll(sourceProviderModes, targetProviderModes);
      writeFileSync7(target, content);
    } else {
      copyFileSync2(source, target);
    }
    chmodSync2(target, 384);
  }
  for (const file of ["state.json", "azure-models.json", "llm-proxy-models.json"]) {
    const source = join16(sourceProviderModes, file);
    if (!existsSync12(source)) continue;
    const target = join16(targetProviderModes, file);
    copyFileSync2(source, target);
    chmodSync2(target, 384);
  }
  return targetHome;
}
function buildCodexArgs(options) {
  const args = [
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "-C",
    options.workspaceDir,
    "--output-schema",
    options.outputSchemaPath,
    "-o",
    options.outputPath
  ];
  if (options.smoke) {
    args.splice(1, 0, "--disable", "plugins", "-c", 'model_reasoning_effort="low"');
  }
  if (options.model) args.push("-m", options.model);
  if (options.profile) args.push("-p", options.profile);
  args.push("-");
  return args;
}
var codexCliExecutor = {
  id: "codex",
  inspect: inspectCodexAdapter,
  execute: executeCodexAdapter,
  resume: unsupportedResume("codex"),
  cancel: (input) => cancelProcessTree("codex", input),
  collectUsage: collectExecutionUsage
};

// src/executors/gemini-cli.mjs
import { spawnSync as spawnSync7 } from "node:child_process";
import {
  chmodSync as chmodSync3,
  copyFileSync as copyFileSync3,
  existsSync as existsSync13,
  mkdirSync as mkdirSync6,
  writeFileSync as writeFileSync8
} from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join17 } from "node:path";
function inspectGeminiAdapter(executable = "gemini") {
  const result = spawnSync7(executable, ["--version"], { encoding: "utf8", timeout: 5e3 });
  return { adapter: "gemini", executable, available: result.status === 0, version: result.status === 0 ? result.stdout.trim() : "", capabilities: ["structured_output", "session_resume", "workspace_write", "tool_use", "sandbox", "process_tree_cancel"], error: result.status === 0 ? "" : tail(result.stderr) };
}
function executeGeminiAdapter(options) {
  const args = buildGeminiArgs(options);
  if (options.sessionId) args.push("--resume", options.sessionId);
  if (options.model) args.push("--model", options.model);
  const isolatedHome = prepareIsolatedGeminiHome(options.workspaceDir);
  const result = spawnCapabilityProcess(options.executable || "gemini", args, {
    workspaceDir: options.workspaceDir,
    timeoutMs: options.timeoutMs,
    adapter: "gemini",
    network: true,
    deniedReadPaths: providerSecretPaths(),
    allowedSecretNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "FUTU_LLM_PROXY_API_KEY"],
    env: {
      ...process.env,
      HOME: isolatedHome
    }
  });
  let envelope = null;
  if (result.status === 0) {
    envelope = parseEnvelope2(result.stdout);
    if (envelope.structured) writeFileSync8(options.outputPath, `${JSON.stringify(envelope.structured)}
`);
  }
  return { executable: options.executable || "gemini", args, command: `${result.sandbox.executable} ${result.sandbox.args[0]} <profile> ${options.executable || "gemini"} --prompt <prompt> --output-format json`, exit_code: result.status ?? 1, signal: result.signal || "", timed_out: result.error?.code === "ETIMEDOUT", duration_ms: result.duration_ms, stdout_tail: tail(result.stdout), stderr_tail: tail(result.stderr || result.error?.message || ""), session_id: envelope?.session_id || options.sessionId || null };
}
function buildGeminiArgs(options) {
  return [
    "--prompt",
    options.prompt,
    "--output-format",
    "json",
    "--approval-mode",
    "auto_edit",
    "--skip-trust"
  ];
}
function prepareIsolatedGeminiHome(workspaceDir) {
  const sourceRoot = join17(homedir5(), ".gemini");
  const isolatedHome = join17(workspaceDir, ".apex-agent", "gemini-home");
  const targetRoot = join17(isolatedHome, ".gemini");
  mkdirSync6(targetRoot, { recursive: true });
  for (const file of [
    "settings.json",
    "google_accounts.json",
    "installation_id",
    "state.json",
    "projects.json",
    "trustedFolders.json",
    ".env"
  ]) {
    const source = join17(sourceRoot, file);
    if (!existsSync13(source)) continue;
    const target = join17(targetRoot, file);
    copyFileSync3(source, target);
    chmodSync3(target, 384);
  }
  return isolatedHome;
}
function parseEnvelope2(stdout) {
  try {
    const value = JSON.parse(stdout);
    const text = value.response || value.result || value.output;
    if (typeof text === "object") return { structured: text, session_id: value.session_id };
    if (typeof text === "string") {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return { structured: JSON.parse(match[0]), session_id: value.session_id };
    }
    if (value.verdict) return { structured: value, session_id: value.session_id };
  } catch {
  }
  return { structured: null, session_id: null };
}
var geminiCliExecutor = {
  id: "gemini",
  inspect: inspectGeminiAdapter,
  execute: executeGeminiAdapter,
  resume: (input) => resumeWithExecute("gemini", executeGeminiAdapter, input),
  cancel: (input) => cancelProcessTree("gemini", input),
  collectUsage: collectExecutionUsage
};

// src/executors/generic-agent-runner.mjs
import { writeFileSync as writeFileSync9 } from "node:fs";
function createGenericAgentRunner(options) {
  const { id, provider } = options;
  return {
    id,
    inspect() {
      const providerInfo = provider.inspect();
      return {
        adapter: id,
        executor_id: id,
        available: providerInfo.available,
        version: `${providerInfo.provider_id}:${providerInfo.model}`,
        capabilities: ["structured_output", "process_tree_cancel", "usage_reporting"],
        error: providerInfo.available ? "" : `${providerInfo.provider_id} provider unavailable`
      };
    },
    execute(input) {
      const startedAt = Date.now();
      try {
        const response = provider.complete({
          model: input.model,
          messages: [
            {
              role: "system",
              content: "Return only a JSON object satisfying the requested Apex Forge worker result contract."
            },
            { role: "user", content: input.prompt }
          ],
          responseFormat: { type: "json_object" },
          timeoutMs: input.timeoutMs
        });
        const content = response?.choices?.[0]?.message?.content;
        const structured = typeof content === "string" ? JSON.parse(content) : content;
        if (!structured || typeof structured !== "object") {
          throw new Error("ModelProvider returned no structured result");
        }
        writeFileSync9(input.outputPath, `${JSON.stringify(structured)}
`);
        return {
          executable: id,
          executable_name: id,
          args: [],
          command: `${id} <structured-prompt>`,
          exit_code: 0,
          signal: "",
          timed_out: false,
          duration_ms: Date.now() - startedAt,
          stdout_tail: "",
          stderr_tail: "",
          session_id: null,
          reported_model: response.model || input.model || provider.inspect().model || null,
          usage: {
            input_tokens: response.usage?.prompt_tokens ?? null,
            output_tokens: response.usage?.completion_tokens ?? null,
            tool_calls: null
          }
        };
      } catch (error) {
        return {
          executable: id,
          executable_name: id,
          args: [],
          command: `${id} <structured-prompt>`,
          exit_code: 1,
          signal: "",
          timed_out: error.name === "AbortError",
          duration_ms: Date.now() - startedAt,
          stdout_tail: "",
          stderr_tail: error.message,
          session_id: null,
          reported_model: null,
          usage: {
            input_tokens: null,
            output_tokens: null,
            tool_calls: null
          }
        };
      }
    },
    resume: unsupportedResume(id),
    cancel: (input) => cancelProcessTree(id, input),
    collectUsage: collectExecutionUsage
  };
}

// src/providers/openai-compatible.mjs
import { spawnSync as spawnSync8 } from "node:child_process";
function createOpenAICompatibleProvider(options) {
  const {
    id,
    baseUrl,
    apiKey,
    model,
    transport = defaultTransport
  } = options;
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  return {
    id,
    inspect() {
      return {
        provider_id: id,
        available: Boolean(apiKey && normalizedBaseUrl && model),
        base_url: normalizedBaseUrl,
        model,
        protocol: "openai-compatible"
      };
    },
    complete(input) {
      if (!apiKey) throw new Error(`ModelProvider ${id} \u7F3A\u5C11 API key`);
      return transport({
        url: `${normalizedBaseUrl}/chat/completions`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: {
          model: input.model || model,
          messages: input.messages,
          ...input.responseFormat ? { response_format: input.responseFormat } : {},
          ...input.tools ? { tools: input.tools } : {},
          ...input.toolChoice ? { tool_choice: input.toolChoice } : {}
        },
        timeoutMs: input.timeoutMs || 12e4
      });
    }
  };
}
function defaultTransport(request) {
  const source = `
    import { readFileSync } from "node:fs";
    const request = JSON.parse(readFileSync(0, "utf8"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        console.error(JSON.stringify({ status: response.status, body }));
        process.exit(2);
      }
      process.stdout.write(body);
    } finally {
      clearTimeout(timer);
    }
  `;
  const result = spawnSync8(process.execPath, ["--input-type=module", "-e", source], {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: request.timeoutMs + 5e3
  });
  if (result.status !== 0) {
    throw new Error(`OpenAI-compatible request failed: ${result.stderr || result.error?.message || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

// src/providers/deepseek.mjs
function createDeepSeekProvider(options = {}) {
  return createOpenAICompatibleProvider({
    id: "deepseek",
    baseUrl: options.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY || "",
    model: options.model || process.env.DEEPSEEK_MODEL || "deepseek-chat",
    transport: options.transport
  });
}

// src/executors/registry.mjs
var deepSeekRunner = createGenericAgentRunner({
  id: "deepseek-runner",
  provider: createDeepSeekProvider()
});
var BUILTIN_EXECUTORS = [
  codexCliExecutor,
  claudeCodeCliExecutor,
  geminiCliExecutor,
  deepSeekRunner
];
function createWorkerExecutorRegistry(initialExecutors = []) {
  const executors = /* @__PURE__ */ new Map();
  function register(executor) {
    const value = assertWorkerExecutor(executor);
    if (executors.has(value.id)) {
      throw new Error(`WorkerExecutor \u5DF2\u6CE8\u518C\uFF1A${value.id}`);
    }
    executors.set(value.id, value);
    return value;
  }
  function get(id) {
    const executor = executors.get(id);
    if (!executor) throw new Error(`\u672A\u77E5 WorkerExecutor\uFF1A${id}`);
    return executor;
  }
  function inspect(id, executable = id) {
    const executor = get(id);
    return normalizeExecutorInspection(id, executor.inspect(executable));
  }
  function inspectAll() {
    return [...executors.keys()].map((id) => inspect(id));
  }
  function resolve28(options = {}) {
    const {
      preferred,
      fallbackOrder = [],
      allowed = [...executors.keys()],
      requiredCapabilities = []
    } = options;
    const candidates = Array.from(/* @__PURE__ */ new Set([preferred, ...fallbackOrder])).filter(Boolean).filter((id) => allowed.includes(id));
    for (const id of candidates) {
      if (!executors.has(id)) continue;
      const info = inspect(id);
      if (!info.available) continue;
      if (!hasExecutionCapabilities(info.capabilities, requiredCapabilities)) continue;
      return {
        id,
        name: id,
        executor: get(id),
        adapter: get(id),
        info,
        fallback: id !== preferred
      };
    }
    throw new Error(`\u6CA1\u6709\u53EF\u7528 WorkerExecutor\uFF1A${candidates.join(",")}`);
  }
  for (const executor of initialExecutors) register(executor);
  return {
    get,
    inspect,
    inspectAll,
    register,
    resolve: resolve28
  };
}
var DEFAULT_REGISTRY = createWorkerExecutorRegistry(BUILTIN_EXECUTORS);
function inspectWorkerExecutors() {
  return DEFAULT_REGISTRY.inspectAll();
}
function inspectWorkerExecutor(id, executable = id) {
  return DEFAULT_REGISTRY.inspect(id, executable);
}
function getWorkerExecutor(id) {
  return DEFAULT_REGISTRY.get(id);
}
function resolveWorkerExecutor(preferred, fallbackOrder = [], allowed = [], requiredCapabilities = []) {
  return DEFAULT_REGISTRY.resolve({
    preferred,
    fallbackOrder,
    allowed,
    requiredCapabilities
  });
}

// src/core/governance.mjs
import { createHash as createHash5 } from "node:crypto";
import { join as join18 } from "node:path";
function loadExecutionPolicy(root) {
  return readJson(join18(root, "policies", "execution.json"));
}
function assertPatchWithinBudget(root, patch) {
  const policy = loadExecutionPolicy(root);
  const changedFiles = patch.changed_files || [];
  if (changedFiles.length > policy.budgets.max_changed_files_per_patch) {
    throw new Error(`patch \u8D85\u51FA\u6587\u4EF6\u9884\u7B97\uFF1A${changedFiles.length}/${policy.budgets.max_changed_files_per_patch}`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(patch.operations || []));
  if (bytes > policy.budgets.max_patch_bytes) {
    throw new Error(`patch \u8D85\u51FA\u5B57\u8282\u9884\u7B97\uFF1A${bytes}/${policy.budgets.max_patch_bytes}`);
  }
  return { changed_files: changedFiles.length, patch_bytes: bytes };
}
function effectiveAgentTimeout(root, requestedMs, routeBudget2 = null) {
  const policy = loadExecutionPolicy(root);
  const routeLimit = routeBudget2?.max_wall_minutes ? routeBudget2.max_wall_minutes * 6e4 : Number.POSITIVE_INFINITY;
  return Math.min(requestedMs, policy.budgets.max_agent_duration_ms, routeLimit);
}
function effectiveAgentLimit(root, requested) {
  const policy = loadExecutionPolicy(root);
  return Math.min(requested, policy.budgets.max_agent_runs_per_tick);
}
function assertAdapterAllowed(root, adapter) {
  const policy = loadExecutionPolicy(root);
  if (!policy.permissions.allowed_adapters.includes(adapter)) {
    throw new Error(`execution policy \u7981\u6B62 adapter\uFF1A${adapter}`);
  }
}
function evaluateMergeApproval(root, run, queue, candidateDigest = null) {
  const policy = loadExecutionPolicy(root);
  const roadmap = readJson(join18(root, "roadmap", "graph.json"));
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  const changedFiles = Array.from(new Set(queue.items.filter((item) => item.status !== "dropped").flatMap((item) => item.changed_files))).sort();
  const reasons = [];
  if (policy.permissions.merge_approval_risks.includes(roadmapNode?.risk)) {
    reasons.push(`risk=${roadmapNode.risk}`);
  }
  const sensitive = changedFiles.filter(
    (file) => policy.permissions.sensitive_paths.some((scope) => matchesScope(file, scope))
  );
  if (sensitive.length > 0) reasons.push(`sensitive_paths=${sensitive.join(",")}`);
  const capability = policy.approval.required_capabilities.merge;
  const policyRevision = stableHash(policy);
  const artifactHash = mergeArtifactHash(root, run.run_id, queue);
  const actionHash = stableHash({
    capability,
    run_id: run.run_id,
    candidate_digest: candidateDigest,
    changed_files: changedFiles,
    artifact_hash: artifactHash,
    policy_revision: policyRevision
  });
  const approvals = readJson(join18(root, "approvals", "items.json"), []);
  const existing = approvals.find(
    (item) => item.kind === "merge" && item.run_id === run.run_id && item.action_hash === actionHash && !approvalExpired(item)
  );
  return {
    required: reasons.length > 0,
    reasons,
    changed_files: changedFiles,
    capability,
    fingerprint: actionHash,
    action_hash: actionHash,
    artifact_hash: artifactHash,
    policy_revision: policyRevision,
    candidate_digest: candidateDigest,
    approval: existing || null
  };
}
function ensureMergeApproval(root, run, queue, candidateDigest = null) {
  const evaluation = evaluateMergeApproval(root, run, queue, candidateDigest);
  if (!evaluation.required) return { ...evaluation, allowed: true, created: false };
  if (approvalAllows(evaluation.approval, evaluation)) {
    return { ...evaluation, allowed: true, created: false };
  }
  if (evaluation.approval) {
    return { ...evaluation, allowed: false, created: false };
  }
  const timestamp = now();
  const approval = {
    schema_version: "v0",
    contract_version: "v1",
    revision: 1,
    id: shortId("approval"),
    kind: "merge",
    run_id: run.run_id,
    candidate_digest: evaluation.candidate_digest,
    capability: evaluation.capability,
    fingerprint: evaluation.fingerprint,
    action_hash: evaluation.action_hash,
    artifact_hash: evaluation.artifact_hash,
    policy_revision: evaluation.policy_revision,
    status: "pending",
    decision: null,
    reasons: evaluation.reasons,
    changed_files: evaluation.changed_files,
    requested_by: "apex-v2",
    requested_at: timestamp,
    expires_at: expiresAt(timestamp, loadExecutionPolicy(root).approval.ttl_minutes),
    decided_at: null,
    decided_by: null,
    decision_capabilities: [],
    decision_reason: ""
  };
  const path = join18(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  approvals.push(approval);
  writeJson(path, approvals);
  return { ...evaluation, approval, allowed: false, created: true };
}
function decideApproval(root, id, decision, reason, options = {}) {
  const path = join18(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  const approval = approvals.find((item) => item.id === id);
  if (!approval) throw new Error(`\u627E\u4E0D\u5230 approval\uFF1A${id}`);
  if (approval.status !== "pending") throw new Error(`approval \u5DF2\u5904\u7406\uFF1A${id}=${approval.status}`);
  if (approvalExpired(approval)) throw new Error(`approval \u5DF2\u8FC7\u671F\uFF1A${id}`);
  const actor = options.actor || "unknown";
  const capabilities = Array.from(new Set(options.capabilities || []));
  if (!capabilities.includes(approval.capability)) {
    throw new Error(`\u7F3A\u5C11 approval capability\uFF1A${approval.capability}`);
  }
  approval.status = "decided";
  approval.decision = decision;
  approval.decided_at = now();
  approval.decided_by = actor;
  approval.decision_capabilities = capabilities;
  approval.decision_reason = reason;
  writeJson(path, approvals);
  return approval;
}
function ensureAdapterBaselineApproval(root, drift) {
  if (!drift.baseline_generated_at || drift.changes.length === 0) {
    return { required: false, allowed: true, created: false, approval: null };
  }
  const policy = loadExecutionPolicy(root);
  const capability = policy.approval.required_capabilities.adapter_baseline;
  const policyRevision = stableHash(policy);
  const artifactHash = stableHash(drift.changes);
  const fingerprint = stableHash({
    capability,
    artifact_hash: artifactHash,
    policy_revision: policyRevision
  });
  const path = join18(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  const existing = approvals.find(
    (item) => item.kind === "adapter_baseline" && item.action_hash === fingerprint && !approvalExpired(item)
  );
  const evaluation = {
    capability,
    action_hash: fingerprint,
    artifact_hash: artifactHash,
    policy_revision: policyRevision
  };
  if (approvalAllows(existing, evaluation)) return { required: true, allowed: true, created: false, approval: existing };
  if (existing) return { required: true, allowed: false, created: false, approval: existing };
  const timestamp = now();
  const approval = {
    schema_version: "v0",
    contract_version: "v1",
    revision: 1,
    id: shortId("approval"),
    kind: "adapter_baseline",
    run_id: "project",
    candidate_digest: null,
    capability,
    fingerprint,
    action_hash: fingerprint,
    artifact_hash: artifactHash,
    policy_revision: policyRevision,
    status: "pending",
    decision: null,
    reasons: drift.changes.map((change) => `${change.adapter}:${change.kind}`),
    changed_files: drift.changes.map((change) => change.adapter),
    requested_by: "apex-v2",
    requested_at: timestamp,
    expires_at: expiresAt(timestamp, policy.approval.ttl_minutes),
    decided_at: null,
    decided_by: null,
    decision_capabilities: [],
    decision_reason: ""
  };
  approvals.push(approval);
  writeJson(path, approvals);
  return { required: true, allowed: false, created: true, approval };
}
function migrateApprovalRecords(root) {
  const path = join18(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  let changed = false;
  for (const item of approvals) {
    if (item.contract_version === "v1") continue;
    const capability = item.kind === "merge" ? "merge_apply" : "adapter_baseline_update";
    item.contract_version = "v1";
    item.revision = 1;
    item.capability = capability;
    item.action_hash = item.fingerprint;
    item.artifact_hash = item.fingerprint;
    item.policy_revision = "legacy";
    item.candidate_digest = null;
    item.requested_by = "apex-v2-legacy";
    item.expires_at = item.decided_at || item.requested_at;
    item.decision_capabilities = [];
    changed = true;
  }
  if (changed) writeJson(path, approvals);
  return { changed, approvals };
}
function approvalAllows(approval, evaluation) {
  return Boolean(
    approval && approval.decision === "approved" && !approvalExpired(approval) && approval.capability === evaluation.capability && approval.action_hash === evaluation.action_hash && approval.artifact_hash === evaluation.artifact_hash && approval.policy_revision === evaluation.policy_revision && approval.candidate_digest === (evaluation.candidate_digest ?? null) && approval.decision_capabilities.includes(evaluation.capability)
  );
}
function approvalExpired(approval) {
  return !approval?.expires_at || Date.parse(approval.expires_at) <= Date.now();
}
function expiresAt(timestamp, ttlMinutes) {
  return new Date(Date.parse(timestamp) + ttlMinutes * 6e4).toISOString();
}
function mergeArtifactHash(root, runId, queue) {
  const patches = queue.items.filter((item) => item.status !== "dropped").map((item) => ({
    patch_id: item.patch_id,
    hash: stableHash(findPatch(root, runId, item.patch_id))
  })).sort((left, right) => left.patch_id.localeCompare(right.patch_id));
  return stableHash(patches);
}
function stableHash(value) {
  return createHash5("sha256").update(JSON.stringify(value)).digest("hex");
}
function matchesScope(file, scope) {
  if (scope.endsWith("/")) return file.startsWith(scope);
  if (scope.includes("*")) {
    const [prefix, suffix] = scope.split("*");
    return file.startsWith(prefix) && file.endsWith(suffix || "");
  }
  return file === scope;
}

// src/core/semantic-evidence.mjs
import { join as join20, resolve as resolve11 } from "node:path";

// src/core/candidate.mjs
import {
  existsSync as existsSync14,
  lstatSync as lstatSync2,
  readFileSync as readFileSync11,
  readdirSync as readdirSync6
} from "node:fs";
import { createHash as createHash6 } from "node:crypto";
import { join as join19, relative as relative4, resolve as resolve10 } from "node:path";
import { spawnSync as spawnSync9 } from "node:child_process";
var IGNORED_ROOT_NAMES2 = /* @__PURE__ */ new Set([
  ".git",
  ".apex-v2",
  ".apex-v2.lock",
  ".apex-v2.transaction-backups",
  "node_modules"
]);
var IGNORED_TREE_NAMES2 = /* @__PURE__ */ new Set(["node_modules"]);
var SECRET_BASENAMES2 = /* @__PURE__ */ new Set([".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json"]);
function buildCandidateSet(root, run, queue, projectDir = resolve10(root, "..")) {
  const plan = readJson(join19(root, "runs", run.run_id, "plan-graph.json"), null);
  if (!plan) throw new Error(`candidate \u7F3A\u5C11 plan graph\uFF1A${run.run_id}`);
  const patches = queue.items.filter((item) => item.status !== "dropped" && item.status !== "merged").map((item) => {
    const patch = findPatch(root, run.run_id, item.patch_id);
    return {
      patch_id: item.patch_id,
      worker_id: item.worker_id,
      plan_node_id: item.plan_node_id,
      content_hash: stableHash2(patch)
    };
  });
  const resolutions = (queue.resolutions || []).map((resolution) => ({
    resolution_id: resolution.resolution_id,
    content_hash: stableHash2(resolution)
  }));
  const sourceFingerprint = projectSourceFingerprint(projectDir);
  const value = {
    schema_version: SCHEMA_VERSION,
    run_id: run.run_id,
    project_revision: sourceFingerprint,
    base_source_fingerprint: sourceFingerprint,
    patches,
    resolutions,
    plan_graph_hash: stableHash2(plan),
    verification_policy_hash: stableHash2(plan.verification_policy || {}),
    contract_version: SCHEMA_VERSION
  };
  return {
    ...value,
    candidate_digest: stableHash2(value)
  };
}
function persistCandidateSet(root, candidate) {
  const dir = join19(root, "runs", candidate.run_id, "candidates");
  const path = join19(dir, `candidate-${candidate.candidate_digest}.json`);
  assertContract("candidate-set.schema.json", candidate, path);
  ensureDir(dir);
  if (!existsSync14(path)) writeJson(path, candidate);
  return {
    candidate,
    ref: `.apex-v2/runs/${candidate.run_id}/candidates/candidate-${candidate.candidate_digest}.json`
  };
}
function projectSourceFingerprint(projectDir) {
  const entries = [];
  for (const path of listProjectSourceFiles2(projectDir)) {
    if (isSecretPath2(path)) continue;
    const target = join19(projectDir, path);
    const stat = lstatSync2(target);
    if (!stat.isFile()) continue;
    entries.push({
      path,
      mode: stat.mode & 511,
      sha256: createHash6("sha256").update(readFileSync11(target)).digest("hex")
    });
  }
  return stableHash2(entries);
}
function stableHash2(value) {
  return createHash6("sha256").update(canonicalStringify(value)).digest("hex");
}
function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
function listProjectSourceFiles2(projectDir) {
  const tracked = spawnSync9("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: projectDir,
    encoding: "buffer"
  });
  if (tracked.status === 0) {
    return tracked.stdout.toString("utf8").split("\0").filter(Boolean).filter((path) => !isIgnoredPath2(path)).sort();
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync6(directory, { withFileTypes: true })) {
      if (directory === projectDir && IGNORED_ROOT_NAMES2.has(entry.name)) continue;
      if (entry.isDirectory() && IGNORED_TREE_NAMES2.has(entry.name)) continue;
      const target = join19(directory, entry.name);
      const path = relative4(projectDir, target);
      if (entry.isDirectory()) visit(target);
      else files.push(path);
    }
  };
  visit(projectDir);
  return files.filter((path) => !isIgnoredPath2(path)).sort();
}
function isIgnoredPath2(path) {
  const parts = path.split("/");
  return IGNORED_ROOT_NAMES2.has(parts[0]) || parts.some((part) => IGNORED_TREE_NAMES2.has(part));
}
function isSecretPath2(path) {
  return path.toLowerCase().split("/").some(
    (part) => part === ".env" || part.startsWith(".env.") || part.endsWith(".pem") || part.endsWith(".key") || part.startsWith("credentials") || SECRET_BASENAMES2.has(part)
  );
}

// src/core/cognitive-evidence.mjs
var GENERIC_CLAIMS = /* @__PURE__ */ new Set([
  "done",
  "completed",
  "complete",
  "looks good",
  "ok",
  "pass",
  "implemented",
  "\u5DF2\u5B8C\u6210",
  "\u5B8C\u6210",
  "\u901A\u8FC7",
  "\u6CA1\u95EE\u9898"
]);
var NEGATIVE_PREFIX = /^(?:not|no|never|cannot|can't|不|未|无)\s*/i;
var BLOCKING_FINDING = /^(?:\[?P[01]\]?|blocking|blocker|critical)\s*[:：-]/i;
function cognitiveEvidenceSemanticIssues(evidence) {
  const issues = [];
  const objective = normalize(evidence.objective);
  const claims = (evidence.claims || []).map((claim) => ({
    original: claim,
    normalized: normalize(claim)
  }));
  const seenClaims = /* @__PURE__ */ new Set();
  const polarity = /* @__PURE__ */ new Map();
  for (const claim of claims) {
    if (claim.normalized === objective) {
      issues.push("claim copied the objective verbatim");
    }
    if (GENERIC_CLAIMS.has(claim.normalized)) {
      issues.push(`generic claim is not evidence: ${claim.original}`);
    }
    if (seenClaims.has(claim.normalized)) {
      issues.push(`duplicate claim: ${claim.original}`);
    }
    seenClaims.add(claim.normalized);
    const negative = NEGATIVE_PREFIX.test(claim.normalized);
    const key = claim.normalized.replace(NEGATIVE_PREFIX, "");
    if (!key) continue;
    if (!polarity.has(key)) polarity.set(key, /* @__PURE__ */ new Set());
    polarity.get(key).add(negative ? "negative" : "positive");
  }
  for (const [key, values] of polarity) {
    if (values.size > 1) issues.push(`contradictory claims: ${key}`);
  }
  const sourceRefs = new Set(evidence.source_refs || []);
  const criterionStatuses = /* @__PURE__ */ new Map();
  for (const mapping of evidence.acceptance_mapping || []) {
    if (!sourceRefs.has(mapping.evidence_ref)) {
      issues.push(
        `acceptance mapping references undeclared source: ${mapping.evidence_ref}`
      );
    }
    const criterion = normalize(mapping.criterion);
    if (!criterionStatuses.has(criterion)) criterionStatuses.set(criterion, /* @__PURE__ */ new Set());
    criterionStatuses.get(criterion).add(mapping.status);
  }
  for (const [criterion, statuses] of criterionStatuses) {
    if (statuses.size > 1) {
      issues.push(`conflicting acceptance statuses: ${criterion}`);
    }
  }
  if (evidence.evidence_type === "review" && evidence.merge_posture === "approve" && [...evidence.findings || [], ...evidence.residual_risks || []].some((finding) => BLOCKING_FINDING.test(String(finding).trim()))) {
    issues.push("review cannot approve with a blocking finding or residual risk");
  }
  return [...new Set(issues)];
}
function assertCognitiveEvidenceSemantics(evidence) {
  const issues = cognitiveEvidenceSemanticIssues(evidence);
  if (issues.length > 0) {
    throw new Error(`cognitive evidence semantic conflict: ${issues.join("; ")}`);
  }
  return evidence;
}
function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[。！？!?.,;；:：]+$/g, "").replace(/\s+/g, " ");
}

// src/core/semantic-evidence.mjs
function validateWorkerSemanticEvidence(root, worker, evidence) {
  if (!evidence) {
    throw new Error(
      `cognitive action \u5FC5\u987B\u63D0\u4EA4 typed semantic evidence\uFF1A${worker.plan_node_id}`
    );
  }
  const expectedType = cognitiveEvidenceType(worker.plan_node_id);
  if (evidence.evidence_type !== expectedType) {
    throw new Error(
      `cognitive evidence \u7C7B\u578B\u4E0D\u5339\u914D\uFF1A${evidence.evidence_type} != ${expectedType}`
    );
  }
  if (evidence.objective !== worker.objective) {
    throw new Error(
      `cognitive evidence objective \u5FC5\u987B\u4E0E Worker objective \u9010\u5B57\u4E00\u81F4\uFF1Aexpected=${JSON.stringify(worker.objective)}`
    );
  }
  if (expectedType === "review") {
    const expectedDigest = cognitiveEvidenceCandidateDigest(root, worker);
    if (evidence.candidate_digest !== expectedDigest) {
      throw new Error(
        `review evidence \u672A\u7ED1\u5B9A\u5F53\u524D candidate_digest\uFF1Aexpected=${expectedDigest}`
      );
    }
  }
  const validation = validateContract(
    "cognitive-evidence.schema.json",
    evidence,
    `${worker.namespace}/cognitive-evidence.json`
  );
  if (!validation.valid) {
    throw new Error(
      `cognitive evidence contract \u65E0\u6548\uFF1A${JSON.stringify(validation.errors)}`
    );
  }
  assertCognitiveEvidenceSemantics(evidence);
  return evidence;
}
function cognitiveEvidenceCandidateDigest(root, worker) {
  if (cognitiveEvidenceType(worker.plan_node_id) !== "review") return null;
  const run = loadRun(root, worker.run_id);
  const queue = readJson(join20(root, "runs", worker.run_id, "merge-queue.json"), {
    schema_version: "v0",
    run_id: worker.run_id,
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    items: [],
    conflicts: [],
    resolutions: []
  });
  return buildCandidateSet(root, run, queue, resolve11(root, "..")).candidate_digest;
}
function cognitiveEvidenceType(planNodeId) {
  if (planNodeId.endsWith("context")) return "context";
  if (planNodeId.endsWith("risk")) return "risk";
  if (planNodeId.endsWith("design")) return "design";
  if (planNodeId.endsWith("review")) return "review";
  throw new Error(`\u672A\u77E5 cognitive evidence \u7C7B\u578B\uFF1A${planNodeId}`);
}

// src/core/worker-execution.mjs
var AGENT_RESULT_SCHEMA = schemaPath("agent-result.schema.json");
var PROVIDER_AGENT_RESULT_SCHEMA = schemaPath("agent-result-provider.schema.json");
var IGNORED_WORKSPACE_NAMES = /* @__PURE__ */ new Set([
  ".git",
  ".apex-agent",
  ".apex-host-home",
  `.${["co", "dex"].join("")}`,
  `.${["cl", "aude"].join("")}`,
  `.${["ge", "mini"].join("")}`,
  ".apex-v2",
  ".apex-v2.lock",
  ".apex-v2.scheduler-lock",
  ".apex-v2.transaction-backups",
  "node_modules",
  "sandbox.json"
]);
var ALLOWED_CONTEXT_ROOTS = /* @__PURE__ */ new Set([
  "project.json",
  "events.jsonl",
  "intake",
  "roadmap",
  "knowledge",
  "risks",
  "policies",
  "learning"
]);
function executeWorkerExecutor(root, worker, planNode2, options = {}) {
  if (!worker.sandbox || worker.sandbox.status !== "ready") {
    throw new Error(`coding-agent adapter \u8981\u6C42 ready sandbox\uFF1A${worker.worker_id}`);
  }
  const executionClaimToken = options.executionClaimToken || null;
  const expectedStatus = executionClaimToken ? "running" : "active";
  if (worker.status !== expectedStatus || executionClaimToken && worker.execution_claim_token !== executionClaimToken) {
    throw new Error(`worker \u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u6267\u884C coding-agent adapter\uFF1A${worker.status}`);
  }
  const projectDir = resolve12(root, "..");
  const workspaceDir = resolve12(projectDir, worker.sandbox.path);
  if (!existsSync15(workspaceDir)) {
    throw new Error(`worker sandbox \u4E0D\u5B58\u5728\uFF1A${workspaceDir}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const promptPath = join21(dir, "agent-prompt.md");
  const outputPath = join21(workspaceDir, ".apex-agent", `result-${worker.worker_id}.json`);
  const prompt = buildWorkerAgentPrompt(worker, planNode2, {
    semanticEvidenceType: worker.execution_class === "cognitive" ? cognitiveEvidenceType(worker.plan_node_id) : null,
    candidateDigest: worker.execution_class === "cognitive" ? cognitiveEvidenceCandidateDigest(root, worker) : null
  });
  writeFileSync10(promptPath, prompt);
  rmSync5(outputPath, { force: true });
  const protectedBefore = snapshotProtectedWorkspace(workspaceDir);
  const policy = loadExecutionPolicy(root);
  const preferred = options.adapter || worker.executor_id || worker.adapter || policy.permissions.adapter_fallback_order[0];
  const requiredCapabilities = options.requiredCapabilities || worker.required_capabilities || [];
  const resolved = options.command ? customExecutorResolution(preferred, options.command) : resolveWorkerExecutor(
    preferred,
    policy.permissions.adapter_fallback_order || [],
    policy.permissions.allowed_adapters,
    requiredCapabilities
  );
  const adapterInfo = resolved.info;
  const priorResults = readPriorAdapterResults(dir);
  const route = readJson(join21(dir, "execution-route.json"), null);
  const modelSelection = resolveModelSelection({
    planNode: planNode2,
    executionPolicy: policy,
    adapter: resolved.name,
    requestedModel: options.model || null,
    worker,
    route,
    priorResults
  });
  const modelChanged = worker.model_tier !== modelSelection.model_tier || worker.model_id !== modelSelection.model_id;
  const sessionId = modelChanged ? void 0 : options.sessionId;
  const execution = resolved.executor.execute({
    executable: options.command || resolved.name,
    workspaceDir,
    prompt,
    outputSchemaPath: PROVIDER_AGENT_RESULT_SCHEMA,
    outputPath,
    model: modelSelection.model_id,
    profile: options.profile,
    timeoutMs: options.timeoutMs,
    sessionId
  });
  const structured = readAgentResult(outputPath);
  const rawAgentOutput = existsSync15(outputPath) ? readFileSync12(outputPath, "utf8") : "";
  rmSync5(outputPath, { force: true });
  const changes = collectWorkspaceChanges(projectDir, workspaceDir, worker.write_scope);
  const protectedChanges = diffProtectedWorkspace(protectedBefore, snapshotProtectedWorkspace(workspaceDir));
  changes.changed_files = Array.from(/* @__PURE__ */ new Set([...changes.changed_files, ...protectedChanges])).sort();
  changes.out_of_scope_files = Array.from(/* @__PURE__ */ new Set([...changes.out_of_scope_files, ...protectedChanges])).sort();
  const capabilityEvidence = structured.valid ? structured.value.capability_evidence || [] : [];
  let semanticEvidence = null;
  let semanticEvidenceError = "";
  if (structured.valid && worker.execution_class === "cognitive") {
    try {
      semanticEvidence = validateWorkerSemanticEvidence(
        root,
        worker,
        structured.value.semantic_evidence
      );
    } catch (error) {
      semanticEvidenceError = error.message;
    }
  }
  let capabilityEvidenceValidation = {
    valid: true,
    required: [],
    submitted: [],
    missing: [],
    error: ""
  };
  if (structured.valid) {
    try {
      capabilityEvidenceValidation = {
        valid: true,
        ...assertCapabilityEvidence(
          worker.capability_bindings || [],
          capabilityEvidence,
          { requireAll: worker.capability_enforcement === "enforce" }
        ),
        error: ""
      };
    } catch (error) {
      capabilityEvidenceValidation = {
        valid: false,
        required: [],
        submitted: [],
        missing: [],
        error: error.message
      };
    }
  }
  const costEvaluation = evaluateRouteUsage(route, execution);
  const budgetFailed = costEvaluation.status === "FAIL" || costEvaluation.status === "UNKNOWN" && route?.usage_policy === "fail";
  const success = execution.exit_code === 0 && structured.valid && structured.value.verdict === "pass" && changes.out_of_scope_files.length === 0 && changes.unsupported_files.length === 0 && !budgetFailed && capabilityEvidenceValidation.valid && semanticEvidenceError === "" && (worker.output_contract !== "patch" || changes.operations.length > 0);
  const failureKind = success ? null : budgetFailed ? "budget_exceeded" : !capabilityEvidenceValidation.valid ? "contract_error" : semanticEvidenceError ? "contract_error" : classifyFailure(execution, structured, changes, worker);
  const timestamp = now();
  const adapterResult = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: resolved.name,
    executor_id: resolved.id,
    adapter_version: adapterInfo.version,
    model_tier: modelSelection.model_tier,
    requested_model: modelSelection.model_id,
    reported_model: execution.reported_model || null,
    session_id: execution.session_id || null,
    executable: execution.executable,
    status: success ? "PASS" : "FAIL",
    failure_kind: failureKind,
    command: execution.command,
    summary: structured.value?.summary || (success ? "worker executor completed" : "worker executor failed"),
    exit_code: execution.exit_code,
    duration_ms: execution.duration_ms,
    stdout_tail: execution.stdout_tail,
    stderr_tail: execution.stderr_tail,
    changed_files: changes.changed_files,
    out_of_scope_files: changes.out_of_scope_files,
    unsupported_files: changes.unsupported_files,
    usage: execution.usage || {
      input_tokens: null,
      output_tokens: null,
      tool_calls: null
    },
    cost_evaluation: costEvaluation,
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: capabilityEvidenceValidation.submitted,
      missing: capabilityEvidenceValidation.missing,
      error: capabilityEvidenceValidation.error
    },
    semantic_evidence_status: {
      required: worker.execution_class === "cognitive",
      valid: semanticEvidenceError === "",
      error: semanticEvidenceError
    },
    refs: [
      `${worker.namespace}/agent-prompt.md`,
      structured.valid ? `${worker.namespace}/agent-result.json` : `${worker.namespace}/agent-output-invalid.txt`
    ],
    created_at: timestamp
  };
  let patch = null;
  if (success && changes.operations.length > 0) {
    patch = {
      schema_version: SCHEMA_VERSION,
      patch_id: shortId("patch"),
      worker_id: worker.worker_id,
      run_id: worker.run_id,
      plan_node_id: worker.plan_node_id,
      summary: structured.value.summary,
      changed_files: changes.changed_files,
      operations: changes.operations,
      evidence_refs: splitList(structured.value.evidence_refs),
      status: "submitted",
      created_at: timestamp,
      updated_at: timestamp
    };
    assertPatchWithinBudget(root, patch);
  }
  const expectedWorkerUpdatedAt = worker.updated_at;
  return withProjectTransaction(projectDir, {
    kind: "worker-execution-commit",
    idempotencyKey: [
      "worker-execution-commit",
      worker.worker_id,
      Number(worker.attempt || 0) + 1,
      resolved.id
    ].join(":")
  }, () => commitWorkerExecution(root, {
    workerId: worker.worker_id,
    executionClaimToken,
    expectedWorkerStatus: expectedStatus,
    expectedWorkerUpdatedAt,
    adapterResult,
    patch,
    success,
    structured,
    changes,
    execution,
    resolved,
    modelSelection,
    modelChanged,
    semanticEvidence,
    rawAgentOutput,
    capabilityEvidence,
    timestamp
  })).result;
}
function commitWorkerExecution(root, input) {
  const worker = findWorker(root, input.workerId);
  if (worker.status !== input.expectedWorkerStatus || worker.updated_at !== input.expectedWorkerUpdatedAt || input.executionClaimToken && worker.execution_claim_token !== input.executionClaimToken) {
    throw new Error(`worker execution commit \u9047\u5230\u5E76\u53D1\u72B6\u6001\u53D8\u5316\uFF1A${worker.worker_id}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const capabilityEvidenceRefs = persistCapabilityEvidence(
    dir,
    worker.namespace,
    input.capabilityEvidence
  );
  let semanticEvidenceRef = null;
  if (input.semanticEvidence) {
    semanticEvidenceRef = `${worker.namespace}/cognitive-evidence.json`;
    writeJson(join21(dir, "cognitive-evidence.json"), input.semanticEvidence);
  }
  input.adapterResult.refs = Array.from(/* @__PURE__ */ new Set([
    ...input.adapterResult.refs,
    ...capabilityEvidenceRefs,
    ...semanticEvidenceRef ? [semanticEvidenceRef] : []
  ]));
  if (input.structured.valid) {
    writeFileSync10(
      join21(dir, "agent-result.json"),
      input.rawAgentOutput || `${JSON.stringify(input.structured.value)}
`
    );
    rmSync5(join21(dir, "agent-output-invalid.txt"), { force: true });
  } else {
    rmSync5(join21(dir, "agent-result.json"), { force: true });
    writeFileSync10(
      join21(dir, "agent-output-invalid.txt"),
      input.rawAgentOutput || input.adapterResult.stderr_tail || "missing structured output"
    );
  }
  writeJson(join21(dir, `adapter-result-${input.adapterResult.result_id}.json`), input.adapterResult);
  const run = loadRun(root, worker.run_id);
  let artifact;
  if (input.patch) {
    persistPatchBundle(root, input.patch);
    worker.status = "patch_submitted";
    artifact = createArtifact(root, run, "execute", {
      type: "patch",
      title: `${input.resolved.name}Patch\uFF1A${worker.plan_node_id}`,
      body: input.structured.value.summary,
      refs: [
        patchBundleRef(worker, input.patch.patch_id),
        `${worker.namespace}/agent-result.json`,
        ...capabilityEvidenceRefs,
        ...input.changes.changed_files
      ],
      timestamp: input.timestamp
    });
  } else {
    worker.status = input.success ? "evidence_submitted" : "blocked";
    artifact = createArtifact(root, run, "execute", {
      type: "evidence",
      title: `${input.resolved.name}Adapter\uFF1A${input.adapterResult.status}`,
      body: [
        input.adapterResult.summary,
        `exit_code=${input.adapterResult.exit_code}`,
        `out_of_scope=${input.changes.out_of_scope_files.join(",") || "none"}`,
        `unsupported=${input.changes.unsupported_files.join(",") || "none"}`
      ].join("\n"),
      refs: input.adapterResult.refs,
      timestamp: input.timestamp
    });
  }
  worker.last_adapter = input.resolved.name;
  worker.initial_model_tier = input.modelSelection.initial_model_tier;
  worker.model_tier = input.modelSelection.model_tier;
  worker.model_id = input.modelSelection.model_id;
  worker.model_reason = input.modelSelection.model_reason;
  if (input.modelChanged) {
    worker.session_id = null;
    worker.session_adapter = null;
  }
  if (input.execution.session_id) {
    worker.session_id = input.execution.session_id;
    worker.session_adapter = input.resolved.name;
  }
  worker.attempt = Number(worker.attempt || 0) + 1;
  worker.execution_claim_token = null;
  worker.execution_claimed_at = null;
  worker.execution_claim_expires_at = null;
  worker.updated_at = input.timestamp;
  const routePath = join21(dir, "execution-route.json");
  const route = readJson(routePath, null);
  if (route) {
    route.initial_model_tier = input.modelSelection.initial_model_tier;
    route.model_tier = input.modelSelection.model_tier;
    route.model_id = input.modelSelection.model_id;
    route.model_reason = input.modelSelection.model_reason;
    route.retry_action = input.modelSelection.retry_action;
    writeJson(routePath, route);
  }
  writeJson(join21(dir, "worker.json"), worker);
  const event = appendEvent(root, `worker.adapter.${input.resolved.name}`, "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: input.adapterResult.result_id,
    status: input.adapterResult.status,
    worker_status: worker.status,
    patch_id: input.patch?.patch_id || null,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { adapterResult: input.adapterResult, patch: input.patch, artifact };
}
function persistCapabilityEvidence(dir, namespace, evidenceItems = []) {
  return evidenceItems.map((evidence) => {
    const name = `capability-evidence-${evidence.capability_id}.json`;
    writeJson(join21(dir, name), evidence);
    return `${namespace}/${name}`;
  });
}
function readPriorAdapterResults(dir) {
  if (!existsSync15(dir)) return [];
  return readdirSync7(dir).filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json")).map((file) => readJson(join21(dir, file), null)).filter(Boolean).sort(
    (left, right) => String(left.created_at || "").localeCompare(String(right.created_at || ""))
  );
}
function customExecutorResolution(executorId, executable) {
  const executor = getWorkerExecutor(executorId);
  return {
    id: executorId,
    name: executorId,
    executor,
    adapter: executor,
    info: normalizeExecutorInspection(executorId, executor.inspect(executable)),
    fallback: false
  };
}
function snapshotProtectedWorkspace(workspaceDir) {
  const values = /* @__PURE__ */ new Map();
  for (const relativePath of [".apex-v2", ".apex-agent", "sandbox.json"]) {
    const target = join21(workspaceDir, relativePath);
    if (!existsSync15(target)) continue;
    if (statSync3(target).isFile()) {
      values.set(relativePath, fileHash2(target));
      continue;
    }
    for (const file of listFilesRecursive2(target)) {
      const relativeFile = relative5(workspaceDir, file);
      if (/^\.apex-agent\/[^/]+-home\//.test(relativeFile)) continue;
      values.set(relativeFile, fileHash2(file));
    }
  }
  return values;
}
function diffProtectedWorkspace(before, after) {
  const paths = /* @__PURE__ */ new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}
function listFilesRecursive2(root) {
  const files = [];
  for (const entry of readdirSync7(root, { withFileTypes: true })) {
    const path = join21(root, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursive2(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
function fileHash2(path) {
  return createHash7("sha256").update(readFileSync12(path)).digest("hex");
}
function buildWorkerAgentPrompt(worker, planNode2, options = {}) {
  const allowedEvidenceRefs = options.allowedEvidenceRefs || worker.read_scope || [];
  const semanticEvidence = options.semanticEvidenceType ? `## Required Semantic Evidence

Return a \`semantic_evidence\` object with:
- evidence_type: ${options.semanticEvidenceType}
- objective: copy the Objective exactly, character for character
- source_refs, claims, uncertainties, and acceptance_mapping
${options.candidateDigest ? `- candidate_digest: copy exactly ${options.candidateDigest}` : ""}
- acceptance_mapping[].evidence_ref must match one source_refs value exactly.
- do not rewrite, normalize, shorten, or guess any evidence ref.
- allowed evidence refs include:
${lines(allowedEvidenceRefs)}
` : "";
  return `You are an isolated coding worker in Apex Forge V2.

## Objective

${planNode2.objective}

## Deliverables

${lines(planNode2.deliverables)}

## Read Scope

${lines(worker.read_scope)}

## Write Scope

${lines(worker.write_scope)}

## Required Evidence

${lines(planNode2.required_evidence)}

## Internal Capability Protocols

${capabilityProtocols(planNode2.capability_bindings || [])}

## Capability Invocation Refs

${lines(worker.capability_invocation_refs || [])}

${semanticEvidence}
${options.semanticEvidenceType ? `## Cognitive Verdict Semantics

- Set top-level verdict to "pass" when the requested analysis and typed evidence are complete, even when the analysis discovers defects or recommends blocking a merge.
- Put product risks and defects in claims, findings, residual_risks, and merge_posture.
- Set top-level verdict to "fail" only when you cannot complete the requested analysis or cannot produce valid evidence.
` : ""}
## Verification

${lines(worker.verification)}

## Hard Rules

1. Work only inside the current workspace.
2. Modify only files covered by Write Scope.
3. Do not edit .apex-v2, sandbox.json, agent metadata, or git configuration.
4. Do not commit, merge, push, or create branches.
5. Keep the implementation minimal and do not perform unrelated refactors.
6. Run the relevant verification commands before finishing.
7. If blocked, return verdict "fail" and explain the exact blocker.
8. Your final response must satisfy the provided JSON output schema.
`;
}
function capabilityProtocols(bindings) {
  if (bindings.length === 0) return "None";
  assertCapabilityContextBudget(bindings);
  return bindings.map((binding) => `### ${binding.capability_id}@${binding.capability_version}

Required output: ${binding.output_contract}
Typed input: ${binding.input_contract}

${readCapabilityProtocol(binding.protocol_ref).trim()}
`).join("\n");
}
function collectWorkspaceChanges(projectDir, workspaceDir, writeScope) {
  const projectFiles = listWorkspaceFiles(projectDir);
  const sandboxFiles = listWorkspaceFiles(workspaceDir);
  const allFiles = /* @__PURE__ */ new Set([...projectFiles, ...sandboxFiles]);
  const changedFiles = [];
  const outOfScopeFiles = [];
  const unsupportedFiles = [];
  const operations = [];
  for (const file of Array.from(allFiles).sort()) {
    const projectPath = join21(projectDir, file);
    const sandboxPath = join21(workspaceDir, file);
    const projectExists = existsSync15(projectPath);
    const sandboxExists = existsSync15(sandboxPath);
    if (projectExists && sandboxExists && buffersEqual(projectPath, sandboxPath)) continue;
    if (!projectExists && !sandboxExists) continue;
    changedFiles.push(file);
    if (!isFileAllowedByScope(file, writeScope)) {
      outOfScopeFiles.push(file);
      continue;
    }
    if (!sandboxExists) {
      unsupportedFiles.push(`${file}:delete`);
      continue;
    }
    const next = readFileSync12(sandboxPath);
    if (isBinary2(next)) {
      unsupportedFiles.push(`${file}:binary`);
      continue;
    }
    if (!projectExists) {
      operations.push({ op: "write_text", path: file, content: next.toString("utf8") });
      continue;
    }
    const previous = readFileSync12(projectPath);
    if (isBinary2(previous)) {
      unsupportedFiles.push(`${file}:binary`);
      continue;
    }
    operations.push({
      op: "replace_text",
      path: file,
      old_text: previous.toString("utf8"),
      new_text: next.toString("utf8")
    });
  }
  return {
    changed_files: changedFiles,
    out_of_scope_files: outOfScopeFiles,
    unsupported_files: unsupportedFiles,
    operations
  };
}
function readAgentResult(path) {
  if (!existsSync15(path)) {
    return { valid: false, value: null, error: "agent-result.json missing" };
  }
  try {
    const value = normalizeProviderAgentResult(readJson(path));
    const result = validateContract("agent-result.schema.json", value, path);
    return {
      valid: result.valid,
      value,
      error: result.valid ? "" : result.errors.map((item) => `${item.instance_path || "/"} ${item.message}`).join("; ")
    };
  } catch (error) {
    return { valid: false, value: null, error: error.message };
  }
}
function normalizeProviderAgentResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = structuredClone(value);
  if (normalized.semantic_evidence === null) {
    delete normalized.semantic_evidence;
    return normalized;
  }
  const evidence = normalized.semantic_evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return normalized;
  }
  const common = [
    "schema_version",
    "evidence_type",
    "objective",
    "source_refs",
    "claims",
    "uncertainties",
    "acceptance_mapping",
    "created_at"
  ];
  const specific = {
    context: ["affected_files", "constraints", "unknowns"],
    risk: ["failure_paths", "blast_radius", "mitigations", "rollback"],
    design: ["slices", "dependencies", "verification", "rollback"],
    review: ["candidate_digest", "findings", "residual_risks", "merge_posture"]
  }[evidence.evidence_type] || [];
  const allowed = /* @__PURE__ */ new Set([...common, ...specific]);
  for (const key of Object.keys(evidence)) {
    if (!allowed.has(key)) delete evidence[key];
  }
  return normalized;
}
function classifyFailure(execution, structured, changes, worker) {
  if (execution.timed_out) return "timeout";
  if (changes.out_of_scope_files.length > 0) return "scope_violation";
  if (changes.unsupported_files.length > 0) return "unsupported_change";
  if (execution.exit_code !== 0) return "execution_error";
  if (!structured.valid) return "contract_error";
  if (structured.value?.verdict === "fail") return "agent_reported_failure";
  if (worker.output_contract === "patch" && changes.operations.length === 0) return "no_patch";
  return "unknown";
}
function listWorkspaceFiles(root) {
  const files = [];
  function walk(dir) {
    if (!existsSync15(dir)) return;
    for (const entry of readdirSync7(dir, { withFileTypes: true })) {
      if (IGNORED_WORKSPACE_NAMES.has(entry.name)) continue;
      const path = join21(dir, entry.name);
      const relativePath = relative5(root, path);
      if (relativePath.startsWith(".apex-v2/")) {
        const contextRoot = relativePath.split("/")[1];
        if (!ALLOWED_CONTEXT_ROOTS.has(contextRoot)) continue;
      }
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  walk(root);
  return files;
}
function buffersEqual(leftPath, rightPath) {
  const leftStat = statSync3(leftPath);
  const rightStat = statSync3(rightPath);
  if (leftStat.size !== rightStat.size) return false;
  return readFileSync12(leftPath).equals(readFileSync12(rightPath));
}
function isBinary2(buffer) {
  return buffer.subarray(0, 8e3).includes(0);
}
function lines(items) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

// src/core/reconcile.mjs
import { existsSync as existsSync17, readFileSync as readFileSync14, readdirSync as readdirSync9 } from "node:fs";
import { join as join23 } from "node:path";

// src/core/operational-state.mjs
import { createHash as createHash8 } from "node:crypto";
import { existsSync as existsSync16, readFileSync as readFileSync13, readdirSync as readdirSync8 } from "node:fs";
import { join as join22 } from "node:path";
function inspectOperationalIntegrity(root) {
  const state = buildOperationalState(root);
  const issues = [];
  const warnings = [];
  const candidateDigests = /* @__PURE__ */ new Set();
  for (const run of state.runs) {
    for (const candidate of run.candidates) {
      const { candidate_digest: declared, ...content } = candidate;
      const actual = stableHash2(content);
      if (declared !== actual) {
        issues.push(issue(
          "candidate-digest-mismatch",
          `.apex-v2/runs/${run.run_id}/candidates/candidate-${declared}.json`,
          `${declared} != ${actual}`
        ));
      } else {
        candidateDigests.add(declared);
      }
    }
    const verification = run.verification;
    const review = run.review;
    const integration = run.integration;
    const reports = [verification, review, integration].filter(Boolean);
    const legacyUnbound = run.run_status === "done" && reports.length > 0 && reports.every((report) => !report.candidate_digest);
    if (legacyUnbound) {
      warnings.push({
        kind: "legacy-unbound-completed-run",
        path: `.apex-v2/runs/${run.run_id}`,
        detail: "\u5386\u53F2\u5B8C\u6210 run \u7684 report \u6CA1\u6709 candidate_digest\uFF0C\u4FDD\u6301\u53EA\u8BFB\u4E0D\u53EF\u91CD\u5F00 merge"
      });
    } else {
      if (review?.status === "PASS") {
        if (!verification || verification.status !== "PASS") {
          issues.push(issue(
            "review-without-verification",
            `.apex-v2/runs/${run.run_id}/review-report.json`,
            "PASS review \u7F3A\u5C11 PASS verification"
          ));
        } else if (!review.candidate_digest || review.candidate_digest !== verification.candidate_digest) {
          issues.push(issue(
            "review-candidate-mismatch",
            `.apex-v2/runs/${run.run_id}/review-report.json`,
            `${review.candidate_digest || "missing"} != ${verification.candidate_digest || "missing"}`
          ));
        }
      }
      if (integration && ["MERGED", "NOOP"].includes(integration.status)) {
        if (!review || review.status !== "PASS") {
          issues.push(issue(
            "integration-without-review",
            `.apex-v2/runs/${run.run_id}/integration-report.json`,
            `${integration.status} integration \u7F3A\u5C11 PASS review`
          ));
        } else if (!integration.candidate_digest || integration.candidate_digest !== review.candidate_digest) {
          issues.push(issue(
            "integration-candidate-mismatch",
            `.apex-v2/runs/${run.run_id}/integration-report.json`,
            `${integration.candidate_digest || "missing"} != ${review.candidate_digest || "missing"}`
          ));
        }
      }
    }
    const patchById = new Map(run.patches.map((patch) => [patch.patch_id, patch]));
    const workerById = new Map(run.workers.map((worker) => [worker.worker_id, worker]));
    for (const worker of run.workers) {
      if (!worker.patch_alias_drift) continue;
      issues.push(issue(
        "patch-alias-drift",
        `.apex-v2/runs/${run.run_id}/workers/${worker.worker_id}/patch-bundle.json`,
        worker.patch_alias_drift
      ));
    }
    for (const item of run.merge_queue?.items || []) {
      const patch = patchById.get(item.patch_id);
      if (!patch) {
        issues.push(issue(
          "merge-item-missing-patch",
          `.apex-v2/runs/${run.run_id}/merge-queue.json`,
          item.patch_id
        ));
        continue;
      }
      if (stableHash2([...patch.changed_files].sort()) !== stableHash2([...item.changed_files].sort())) {
        issues.push(issue(
          "merge-item-files-mismatch",
          `.apex-v2/runs/${run.run_id}/merge-queue.json`,
          item.patch_id
        ));
      }
      const worker = workerById.get(item.worker_id);
      if (!worker) {
        issues.push(issue(
          "merge-item-missing-worker",
          `.apex-v2/runs/${run.run_id}/merge-queue.json`,
          item.worker_id
        ));
        continue;
      }
    }
    const itemsByWorker = /* @__PURE__ */ new Map();
    for (const item of run.merge_queue?.items || []) {
      if (!itemsByWorker.has(item.worker_id)) itemsByWorker.set(item.worker_id, []);
      itemsByWorker.get(item.worker_id).push(item);
    }
    for (const [workerId, items] of itemsByWorker) {
      const worker = workerById.get(workerId);
      if (!worker) continue;
      const expectedStatus = workerStatusForMergeItems(items);
      const expectedStatuses = expectedStatus === "queued" ? ["queued", "patch_submitted"] : [expectedStatus];
      if (!expectedStatuses.includes(worker.status)) {
        issues.push(issue(
          "worker-merge-status-mismatch",
          `.apex-v2/runs/${run.run_id}/workers/${worker.worker_id}/worker.json`,
          `${worker.status} not in ${expectedStatuses.join(",")} for ${items.map((item) => item.status).join(",")}`
        ));
      }
    }
    for (const workspace of run.action_workspaces) {
      const worker = workerById.get(workspace.worker_id);
      if (workspace.status === "active" && (!worker || worker.status !== "claimed")) {
        issues.push(issue(
          "orphan-active-action-workspace",
          `.apex-v2/runs/${run.run_id}/workers/${workspace.worker_id}/action-workspace.json`,
          `worker=${worker?.status || "missing"}`
        ));
      }
    }
    if (run.run_status !== "done") {
      for (const report of [verification, review, integration].filter(Boolean)) {
        if (report.candidate_digest && !candidateDigests.has(report.candidate_digest)) {
          issues.push(issue(
            "report-missing-candidate",
            `.apex-v2/runs/${run.run_id}`,
            report.candidate_digest
          ));
        }
      }
    }
  }
  for (const approval of state.approvals) {
    if (approval.kind === "merge" && approval.candidate_digest && !candidateDigests.has(approval.candidate_digest)) {
      issues.push(issue(
        "approval-missing-candidate",
        ".apex-v2/approvals/items.json",
        `${approval.id}:${approval.candidate_digest}`
      ));
    }
  }
  for (const transaction of state.transactions) {
    if (transaction.status === "started") {
      issues.push(issue(
        "unfinished-transaction",
        `.apex-v2/transactions/${transaction.transaction_id}.json`,
        transaction.kind
      ));
    }
  }
  for (const run of state.runs) {
    const record = run.negative_control;
    if (!record) continue;
    if (record.run_id !== run.run_id) {
      issues.push(issue(
        "negative-control-run-mismatch",
        `.apex-v2/runs/${run.run_id}/negative-control.json`,
        `${record.run_id} != ${run.run_id}`
      ));
    }
    if (record.status === "restored" && (record.red_evidence_refs.length === 0 || record.green_evidence_refs.length === 0 || record.restoration_evidence_refs.length === 0)) {
      issues.push(issue(
        "negative-control-incomplete-restoration",
        `.apex-v2/runs/${run.run_id}/negative-control.json`,
        record.record_id
      ));
    }
  }
  for (const decision of state.decisions) {
    const artifactPath = join22(
      root,
      "artifacts",
      decision.run_id,
      `${decision.artifact_id}.json`
    );
    const artifact = readJson(artifactPath, null);
    if (!artifact) {
      issues.push(issue(
        "decision-artifact-missing",
        ".apex-v2/decisions/index.json",
        decision.decision_id
      ));
      continue;
    }
    const actualHash = createHash8("sha256").update(JSON.stringify(artifact)).digest("hex");
    if (actualHash !== decision.artifact_sha256) {
      issues.push(issue(
        "decision-artifact-hash-mismatch",
        ".apex-v2/decisions/index.json",
        decision.decision_id
      ));
    }
  }
  const receiptsById = new Map(
    state.learning.receipts.map((receipt) => [receipt.receipt_id, receipt])
  );
  const jobsById = new Map(
    state.learning.jobs.map((job) => [job.job_id, job])
  );
  for (const proposal of state.learning.proposals) {
    if (proposal.status !== "applied") continue;
    if (!proposal.apply_job_id && !proposal.apply_receipt_id) {
      warnings.push({
        kind: "legacy-applied-learning-without-receipt",
        path: ".apex-v2/learning/proposals.json",
        detail: proposal.id
      });
      continue;
    }
    const receipt = receiptsById.get(proposal.apply_receipt_id);
    if (!receipt) {
      issues.push(issue(
        "applied-learning-missing-receipt",
        ".apex-v2/learning/proposals.json",
        proposal.id
      ));
      continue;
    }
    const job = jobsById.get(proposal.apply_job_id);
    if (!job || job.status !== "applied" || job.receipt_id !== receipt.receipt_id) {
      issues.push(issue(
        "learning-job-receipt-mismatch",
        ".apex-v2/learning/jobs.json",
        proposal.id
      ));
    }
    const target = join22(root, proposal.target_file);
    const content = existsSync16(target) ? readFileSync13(target, "utf8") : "";
    const actualHash = createHash8("sha256").update(receipt.applied_content || "").digest("hex");
    if (!content.includes(receipt.applied_content || "") || actualHash !== receipt.content_sha256) {
      issues.push(issue(
        "learning-receipt-content-mismatch",
        `.apex-v2/learning/receipts/receipt-${receipt.receipt_id}.json`,
        `${receipt.content_sha256} != ${actualHash || "missing"}`
      ));
    }
  }
  return {
    state,
    state_hash: stableHash2(state),
    issues,
    warnings
  };
}
function buildOperationalState(root) {
  return {
    schema_version: "v0",
    runs: readRuns(root),
    approvals: readJson(join22(root, "approvals", "items.json"), []).map((approval) => ({
      id: approval.id,
      kind: approval.kind,
      run_id: approval.run_id,
      status: approval.status,
      decision: approval.decision,
      candidate_digest: approval.candidate_digest ?? null,
      action_hash: approval.action_hash
    })).sort(byId),
    decisions: readJson(join22(root, "decisions", "index.json"), []).map((decision) => ({
      decision_id: decision.decision_id,
      run_id: decision.run_id,
      status: decision.status,
      mode: decision.mode,
      revision: decision.revision,
      artifact_id: decision.artifact_id,
      artifact_sha256: decision.artifact_sha256,
      candidate_digest: decision.candidate_digest || null
    })).sort(
      (left, right) => left.decision_id.localeCompare(right.decision_id)
    ),
    learning: {
      proposals: readJson(join22(root, "learning", "proposals.json"), []).map((proposal) => ({
        id: proposal.id,
        source_run_id: proposal.source_run_id,
        target_file: proposal.target_file,
        status: proposal.status,
        apply_job_id: proposal.apply_job_id || null,
        apply_receipt_id: proposal.apply_receipt_id || null
      })).sort(byId),
      jobs: readJson(join22(root, "learning", "jobs.json"), []).map((job) => ({
        job_id: job.job_id,
        run_id: job.run_id,
        proposal_id: job.proposal_id,
        status: job.status,
        attempt: job.attempt,
        receipt_id: job.receipt_id || null
      })).sort((left, right) => left.job_id.localeCompare(right.job_id)),
      receipts: readJsonFiles(join22(root, "learning", "receipts")).map((receipt) => ({
        receipt_id: receipt.receipt_id,
        job_id: receipt.job_id,
        proposal_id: receipt.proposal_id,
        target_file: receipt.target_file,
        applied_content: receipt.applied_content,
        content_sha256: receipt.content_sha256,
        knowledge_version_after: receipt.knowledge_version_after
      })).sort(
        (left, right) => left.receipt_id.localeCompare(right.receipt_id)
      )
    },
    transactions: readJsonFiles(join22(root, "transactions")).map((transaction) => ({
      transaction_id: transaction.transaction_id,
      kind: transaction.kind,
      status: transaction.status,
      idempotency_key: transaction.idempotency_key
    })).sort((left, right) => left.transaction_id.localeCompare(right.transaction_id))
  };
}
function readRuns(root) {
  const runsDir = join22(root, "runs");
  if (!existsSync16(runsDir)) return [];
  return readdirSync8(runsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const runDir = join22(runsDir, entry.name);
    const run = readJson(join22(runDir, "run.json"), {});
    const workers = readWorkers(runDir);
    return {
      run_id: entry.name,
      run_status: run.status || "missing",
      workers: workers.map(({ worker, patchAliasDrift }) => ({
        ...worker,
        patch_alias_drift: patchAliasDrift
      })).sort((left, right) => left.worker_id.localeCompare(right.worker_id)),
      patches: workers.flatMap(({ patches }) => patches.map(patchSummary)).sort((left, right) => left.patch_id.localeCompare(right.patch_id)),
      action_workspaces: workers.map(({ actionWorkspace }) => actionWorkspace).filter(Boolean).sort((left, right) => left.worker_id.localeCompare(right.worker_id)),
      merge_queue: readJson(join22(runDir, "merge-queue.json"), null),
      verification: reportSummary(readJson(join22(runDir, "verification-report.json"), null)),
      review: reportSummary(readJson(join22(runDir, "review-report.json"), null)),
      integration: reportSummary(readJson(join22(runDir, "integration-report.json"), null)),
      negative_control: negativeControlSummary(
        readJson(join22(runDir, "negative-control.json"), null)
      ),
      candidates: readJsonFiles(join22(runDir, "candidates")).sort(
        (left, right) => left.candidate_digest.localeCompare(right.candidate_digest)
      )
    };
  }).sort((left, right) => left.run_id.localeCompare(right.run_id));
}
function negativeControlSummary(record) {
  if (!record) return null;
  return {
    record_id: record.record_id,
    run_id: record.run_id,
    mode: record.mode,
    status: record.status,
    revision: record.revision,
    red_evidence_refs: record.red_evidence_refs || [],
    green_evidence_refs: record.green_evidence_refs || [],
    restoration_evidence_refs: record.restoration_evidence_refs || [],
    waiver: record.waiver || null
  };
}
function readWorkers(runDir) {
  const workersDir = join22(runDir, "workers");
  if (!existsSync16(workersDir)) return [];
  return readdirSync8(workersDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const dir = join22(workersDir, entry.name);
    const worker = readJson(join22(dir, "worker.json"), {});
    const patches = readWorkerPatchBundles(dir).map(({ patch }) => patch);
    const alias = readJson(join22(dir, "patch-bundle.json"), null);
    const immutableAlias = alias?.patch_id ? readJson(join22(dir, "patches", alias.patch_id, "patch-bundle.json"), null) : null;
    return {
      worker: {
        worker_id: entry.name,
        plan_node_id: worker.plan_node_id,
        status: worker.status || "missing",
        adapter: worker.adapter || null,
        fencing_token: Number(worker.fencing_token || 0),
        claim_expires_at: worker.claim_expires_at || null
      },
      patches,
      patchAliasDrift: immutableAlias && stableHash2(alias) !== stableHash2(immutableAlias) ? alias.patch_id : null,
      actionWorkspace: readJson(join22(dir, "action-workspace.json"), null)
    };
  });
}
function reportSummary(report) {
  if (!report) return null;
  return {
    report_id: report.report_id,
    status: report.status,
    candidate_digest: report.candidate_digest || null
  };
}
function patchSummary(patch) {
  if (!patch) return null;
  return {
    patch_id: patch.patch_id,
    worker_id: patch.worker_id,
    plan_node_id: patch.plan_node_id,
    status: patch.status,
    changed_files: patch.changed_files || [],
    content_hash: stableHash2(patch)
  };
}
function readJsonFiles(directory) {
  if (!existsSync16(directory)) return [];
  return readdirSync8(directory).filter((name) => name.endsWith(".json")).map((name) => readJson(join22(directory, name), null)).filter(Boolean);
}
function issue(kind, path, detail) {
  return { kind, path, detail };
}
function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

// src/core/reconcile.mjs
function inspectProjectConsistency(root) {
  const project = readJson(join23(root, "project.json"));
  const roadmap = readJson(join23(root, "roadmap", "graph.json"));
  const manifest = readJson(join23(root, "knowledge", "manifest.json"));
  const runStates = readRuns2(root).map((run) => ({
    actual: run,
    normalized: normalizeRunForReconciliation(run)
  }));
  const runs = runStates.map((entry) => entry.normalized);
  const eventLog = inspectEventLog(join23(root, "events.jsonl"));
  const replay = replayProjectStateFromEvents(eventLog.events);
  const operational = inspectOperationalIntegrity(root);
  const changes = [];
  const issues = [...eventLog.issues, ...operational.issues];
  const activeRuns = runs.filter((run) => !["done", "halted"].includes(expectedRunStatus(run))).sort((left, right) => left.created_at.localeCompare(right.created_at)).map((run) => run.run_id);
  const lastEvent = eventLog.events.at(-1) || null;
  compare(changes, "project.json", "active_runs", project.active_runs, activeRuns);
  compare(changes, "project.json", "knowledge_version", project.knowledge_version, manifest.version);
  compare(changes, "project.json", "last_event_id", project.last_event_id, lastEvent?.event_id || null);
  compare(changes, "events.jsonl", "replay.active_runs", replay.active_runs, activeRuns);
  compare(changes, "events.jsonl", "replay.knowledge_version", replay.knowledge_version, manifest.version);
  compare(changes, "events.jsonl", "replay.last_event_id", replay.last_event_id, lastEvent?.event_id || null);
  if (replay.operational_snapshot_event_id && replay.operational_snapshot_event_id === lastEvent?.event_id) {
    compare(
      changes,
      "events.jsonl",
      "replay.operational_state_hash",
      replay.operational_state_hash,
      operational.state_hash
    );
  } else if (replay.operational_snapshot_event_id) {
    operational.warnings.push({
      kind: "operational-snapshot-stale",
      path: ".apex-v2/events.jsonl",
      detail: `${replay.operational_snapshot_event_id} != ${lastEvent?.event_id || "none"}`
    });
  }
  const roadmapById = new Map(roadmap.nodes.map((node) => [node.id, node]));
  const runsByRoadmap = /* @__PURE__ */ new Map();
  for (const entry of runStates) {
    const { actual, normalized: run } = entry;
    if (!roadmapById.has(run.roadmap_node_id)) {
      issues.push({
        kind: "orphan-run",
        path: `.apex-v2/runs/${run.run_id}/run.json`,
        detail: `roadmap node \u4E0D\u5B58\u5728\uFF1A${run.roadmap_node_id}`
      });
      continue;
    }
    const siblings = runsByRoadmap.get(run.roadmap_node_id) || [];
    siblings.push(run);
    runsByRoadmap.set(run.roadmap_node_id, siblings);
    recordRunNormalizationChanges(changes, actual, run);
    const expected = expectedRunStatus(run);
    if (actual.status !== expected) {
      changes.push({
        path: `.apex-v2/runs/${run.run_id}/run.json`,
        field: "status",
        actual: actual.status,
        expected
      });
    }
  }
  for (const [roadmapId, roadmapRuns] of runsByRoadmap) {
    if (roadmapRuns.length > 1) {
      issues.push({
        kind: "duplicate-roadmap-runs",
        path: ".apex-v2/roadmap/graph.json",
        detail: `${roadmapId} \u5BF9\u5E94\u591A\u4E2A run\uFF1A${roadmapRuns.map((run2) => run2.run_id).join(",")}`
      });
      continue;
    }
    const run = roadmapRuns[0];
    const runStatus = expectedRunStatus(run);
    const expected = runStatus === "done" ? "done" : runStatus === "halted" ? "blocked" : "active";
    const node = roadmapById.get(roadmapId);
    if (node.status !== expected) {
      changes.push({
        path: ".apex-v2/roadmap/graph.json",
        field: `nodes.${roadmapId}.status`,
        actual: node.status,
        expected
      });
    }
  }
  return {
    status: issues.length > 0 ? "INVALID" : changes.length > 0 ? "DRIFT" : "CONSISTENT",
    event_log: {
      event_count: eventLog.events.length,
      last_event_id: lastEvent?.event_id || null,
      last_timestamp: lastEvent?.timestamp || null,
      duplicate_event_ids: eventLog.duplicate_event_ids
    },
    derived: {
      active_runs: activeRuns,
      knowledge_version: manifest.version,
      last_event_id: lastEvent?.event_id || null
    },
    event_replay: replay,
    operational_state: {
      state_hash: operational.state_hash,
      warnings: operational.warnings
    },
    changes,
    issues
  };
}
function replayProjectStateFromEvents(events) {
  const activeRuns = /* @__PURE__ */ new Set();
  const partialRuns = /* @__PURE__ */ new Set();
  const openCarryIdsByRun = /* @__PURE__ */ new Map();
  const learnedRuns = /* @__PURE__ */ new Set();
  let knowledgeVersion = 0;
  let lastEventId = null;
  let operationalState = null;
  let operationalStateHash = null;
  let operationalSnapshotEventId = null;
  for (const event of events) {
    lastEventId = event.event_id;
    if (event.type === "run.created" && event.payload?.run_id) {
      activeRuns.add(event.payload.run_id);
    }
    if (event.type === "run.halted" && event.payload?.run_id) {
      activeRuns.delete(event.payload.run_id);
      partialRuns.delete(event.payload.run_id);
      openCarryIdsByRun.delete(event.payload.run_id);
      learnedRuns.delete(event.payload.run_id);
    }
    if (event.type === "run.closed" && event.payload?.run_id) {
      activeRuns.delete(event.payload.run_id);
      learnedRuns.add(event.payload.run_id);
    }
    if (event.type === "run.node.completed" && event.payload?.run_id) {
      if (event.payload.gate === "PARTIAL_PASS") {
        partialRuns.add(event.payload.run_id);
        const carryIds = Array.isArray(event.payload.carry_forward_ids) ? event.payload.carry_forward_ids : [];
        if (carryIds.length > 0) {
          const openCarryIds = openCarryIdsByRun.get(event.payload.run_id) || /* @__PURE__ */ new Set();
          for (const carryId of carryIds) openCarryIds.add(carryId);
          openCarryIdsByRun.set(event.payload.run_id, openCarryIds);
        } else {
          openCarryIdsByRun.set(event.payload.run_id, null);
        }
      }
      if (event.payload.node_id === "learn" && ["PASS", "PARTIAL_PASS"].includes(event.payload.gate)) {
        learnedRuns.add(event.payload.run_id);
        if (!partialRuns.has(event.payload.run_id)) activeRuns.delete(event.payload.run_id);
      }
    }
    if (event.type === "run.carry.updated" && event.payload?.run_id && event.payload.status !== "open") {
      const openCarryIds = openCarryIdsByRun.get(event.payload.run_id);
      if (openCarryIds instanceof Set && event.payload.carry_id) {
        openCarryIds.delete(event.payload.carry_id);
        if (openCarryIds.size === 0) {
          openCarryIdsByRun.delete(event.payload.run_id);
          partialRuns.delete(event.payload.run_id);
        }
      } else {
        openCarryIdsByRun.delete(event.payload.run_id);
        partialRuns.delete(event.payload.run_id);
      }
      if (!partialRuns.has(event.payload.run_id) && learnedRuns.has(event.payload.run_id)) {
        activeRuns.delete(event.payload.run_id);
      }
    }
    if (event.type === "knowledge.refreshed" && Number.isInteger(event.payload?.knowledge_version)) {
      knowledgeVersion = event.payload.knowledge_version;
    }
    if (event.type === "learning.applied") {
      knowledgeVersion = Number.isInteger(event.payload?.knowledge_version) ? event.payload.knowledge_version : knowledgeVersion + 1;
    }
    if (event.type === "project.reconciled") {
      if (Array.isArray(event.payload?.active_runs)) {
        activeRuns.clear();
        for (const runId of event.payload.active_runs) activeRuns.add(runId);
        partialRuns.clear();
        learnedRuns.clear();
      }
      if (Number.isInteger(event.payload?.knowledge_version)) {
        knowledgeVersion = event.payload.knowledge_version;
      }
      if (event.payload?.operational_state && event.payload?.operational_state_hash) {
        operationalState = event.payload.operational_state;
        operationalStateHash = event.payload.operational_state_hash;
        operationalSnapshotEventId = event.event_id;
      }
    }
  }
  const replay = {
    active_runs: [...activeRuns],
    knowledge_version: knowledgeVersion,
    last_event_id: lastEventId,
    event_count: events.length
  };
  if (operationalSnapshotEventId) {
    replay.operational_state = operationalState;
    replay.operational_state_hash = operationalStateHash;
    replay.operational_snapshot_event_id = operationalSnapshotEventId;
  }
  return replay;
}
function applyProjectReconciliation(root, inspection) {
  if (inspection.issues.length > 0) {
    throw new Error(`event/state integrity \u65E0\u6548\uFF0C\u62D2\u7EDD reconcile\uFF1A${inspection.issues.length} \u4E2A\u95EE\u9898`);
  }
  updateProject(root, {
    active_runs: inspection.derived.active_runs,
    knowledge_version: inspection.derived.knowledge_version,
    last_event_id: inspection.derived.last_event_id
  });
  const roadmapPath = join23(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const runs = readRuns2(root).map(normalizeRunForReconciliation);
  for (const run of runs) {
    run.status = expectedRunStatus(run);
    writeJson(join23(root, "runs", run.run_id, "run.json"), run);
  }
  const runsByRoadmap = new Map(runs.map((run) => [run.roadmap_node_id, run]));
  for (const node of roadmap.nodes) {
    const run = runsByRoadmap.get(node.id);
    if (!run) continue;
    const runStatus = expectedRunStatus(run);
    node.status = runStatus === "done" ? "done" : runStatus === "halted" ? "blocked" : "active";
  }
  writeJson(roadmapPath, roadmap);
}
function inspectEventLog(path) {
  const issues = [];
  const events = [];
  const ids = /* @__PURE__ */ new Set();
  const duplicateIds = [];
  if (!existsSync17(path)) {
    return {
      events,
      duplicate_event_ids: duplicateIds,
      issues: [{ kind: "missing-event-log", path, detail: "events.jsonl \u4E0D\u5B58\u5728" }]
    };
  }
  const lines2 = readFileSync14(path, "utf8").split("\n");
  let previousTimestamp = null;
  for (let index = 0; index < lines2.length; index += 1) {
    const line = lines2[index].trim();
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      issues.push({
        kind: "invalid-event-json",
        path,
        detail: `line ${index + 1}: ${error.message}`
      });
      continue;
    }
    for (const field of ["schema_version", "event_id", "type", "timestamp", "actor", "payload"]) {
      if (!(field in event)) {
        issues.push({
          kind: "invalid-event-contract",
          path,
          detail: `line ${index + 1}: \u7F3A\u5C11 ${field}`
        });
      }
    }
    if (ids.has(event.event_id)) {
      duplicateIds.push(event.event_id);
      issues.push({
        kind: "duplicate-event-id",
        path,
        detail: `line ${index + 1}: ${event.event_id}`
      });
    }
    ids.add(event.event_id);
    if (Number.isNaN(Date.parse(event.timestamp))) {
      issues.push({
        kind: "invalid-event-timestamp",
        path,
        detail: `line ${index + 1}: ${event.timestamp}`
      });
    } else if (previousTimestamp && event.timestamp < previousTimestamp) {
      issues.push({
        kind: "non-monotonic-event-time",
        path,
        detail: `line ${index + 1}: ${event.timestamp} < ${previousTimestamp}`
      });
    }
    previousTimestamp = event.timestamp;
    events.push(event);
  }
  return { events, duplicate_event_ids: duplicateIds, issues };
}
function readRuns2(root) {
  const runsDir = join23(root, "runs");
  if (!existsSync17(runsDir)) return [];
  return readdirSync9(runsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => readJson(join23(runsDir, entry.name, "run.json"), null)).filter(Boolean);
}
function expectedRunStatus(run) {
  if (run.nodes.some((node) => node.status === "halted")) return "halted";
  if (run.nodes.every((node) => node.status === "passed")) {
    return "done";
  }
  const terminal = run.nodes.every((node) => ["passed", "partial_pass"].includes(node.status));
  if (terminal) {
    const openCarry = (run.carry_forward || []).some((item) => item.status === "open");
    return openCarry || run.nodes.some((node) => node.status === "partial_pass") ? "paused" : "done";
  }
  const started = run.nodes.some(
    (node) => node.status !== "pending" || node.started_at || node.completed_at
  );
  return started ? "active" : "planned";
}
function normalizeRunForReconciliation(run) {
  const normalized = JSON.parse(JSON.stringify(run));
  let latestPromotionTimestamp = null;
  for (const node of normalized.nodes) {
    if (node.status !== "partial_pass") continue;
    const carryForward = (normalized.carry_forward || []).filter((item) => item.source_node_id === node.id);
    const timestamp = carryForward.map((item) => item.updated_at).filter(Boolean).sort().at(-1) || node.completed_at || normalized.updated_at || normalized.created_at;
    const promoted = timestamp ? promoteHandledCarrySource(normalized, node.id, timestamp) : promoteHandledCarrySource(normalized, node.id);
    if (promoted && (!latestPromotionTimestamp || timestamp > latestPromotionTimestamp)) {
      latestPromotionTimestamp = timestamp;
    }
  }
  if (latestPromotionTimestamp && normalized.nodes.every((node) => node.status === "passed")) {
    normalized.status = "done";
    normalized.gate = {
      status: "PASS",
      reason: "\u6240\u6709\u8282\u70B9\u5DF2\u901A\u8FC7\u3002",
      blocking: [],
      carry_forward_ids: (normalized.carry_forward || []).map((item) => item.id)
    };
    normalized.updated_at = [normalized.updated_at, latestPromotionTimestamp].filter(Boolean).sort().at(-1);
  }
  return normalized;
}
function recordRunNormalizationChanges(changes, actual, normalized) {
  const path = `runs/${actual.run_id}/run.json`;
  const actualNodes = new Map(actual.nodes.map((node) => [node.id, node]));
  for (const node of normalized.nodes) {
    const previous = actualNodes.get(node.id);
    if (!previous) continue;
    for (const field of ["status", "completed_at", "gate", "evidence_refs"]) {
      compare(changes, path, `nodes.${node.id}.${field}`, previous[field], node[field]);
    }
  }
  compare(changes, path, "gate", actual.gate, normalized.gate);
  compare(changes, path, "updated_at", actual.updated_at, normalized.updated_at);
}
function compare(changes, path, field, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  changes.push({ path: `.apex-v2/${path}`, field, actual, expected });
}

// src/core/risks.mjs
import { join as join24 } from "node:path";
function listRisks(root, status2 = null) {
  const risks = readJson(join24(root, "risks", "register.json"), []);
  return status2 ? risks.filter((risk) => risk.status === status2) : risks;
}
function addRisk(root, input) {
  const risks = listRisks(root);
  const existing = input.dedupe_key ? risks.find((risk2) => risk2.dedupe_key === input.dedupe_key) : null;
  if (existing) return existing;
  const timestamp = now();
  const risk = {
    schema_version: "v0",
    id: shortId("risk"),
    dedupe_key: input.dedupe_key || "",
    source: input.source,
    title: input.title,
    description: input.description || "",
    severity: input.severity || "medium",
    status: "open",
    run_id: input.run_id || null,
    carry_id: input.carry_id || null,
    conflict_key: input.conflict_key || null,
    owner: input.owner || "project-kernel",
    evidence_refs: input.evidence_refs || [],
    resolution: "",
    created_at: timestamp,
    updated_at: timestamp
  };
  risks.push(risk);
  writeJson(join24(root, "risks", "register.json"), risks);
  return risk;
}
function updateRisk(root, id, status2, resolution) {
  const path = join24(root, "risks", "register.json");
  const risks = readJson(path, []);
  const risk = risks.find((item) => item.id === id);
  if (!risk) throw new Error(`\u627E\u4E0D\u5230 risk\uFF1A${id}`);
  risk.status = status2;
  risk.resolution = resolution || "";
  risk.updated_at = now();
  writeJson(path, risks);
  return risk;
}
function syncCarryRisk(root, runId, carry) {
  const risk = addRisk(root, {
    dedupe_key: `carry:${runId}:${carry.id}`,
    source: "carry_forward",
    title: carry.description,
    description: `source_node=${carry.source_node_id}; target_node=${carry.target_node_id || "none"}`,
    severity: carry.severity,
    run_id: runId,
    carry_id: carry.id,
    evidence_refs: carry.evidence_refs
  });
  if (carry.status === "resolved") return updateRisk(root, risk.id, "mitigated", carry.resolution);
  if (carry.status === "accepted") return updateRisk(root, risk.id, "accepted", carry.resolution);
  return risk;
}
function syncConflictRisks(root, runId, conflicts) {
  return conflicts.map((conflict) => addRisk(root, {
    dedupe_key: `conflict:${runId}:${conflict.kind}:${conflict.file}:${[...conflict.patch_ids].sort().join(",")}`,
    source: "merge_conflict",
    title: `Merge conflict\uFF1A${conflict.file}`,
    description: `${conflict.kind}; patches=${conflict.patch_ids.join(",")}`,
    severity: "high",
    run_id: runId,
    conflict_key: `${conflict.kind}:${conflict.file}`,
    evidence_refs: [`.apex-v2/runs/${runId}/merge-queue.json`]
  }));
}
function resolveConflictRisks(root, runId, conflicts, resolution) {
  const risks = listRisks(root);
  const keys = new Set(conflicts.map((conflict) => `${conflict.kind}:${conflict.file}`));
  const updated = [];
  for (const risk of risks) {
    if (risk.run_id !== runId || risk.source !== "merge_conflict" || !keys.has(risk.conflict_key)) continue;
    updated.push(updateRisk(root, risk.id, "mitigated", resolution));
  }
  return updated;
}
function syncVerificationRisk(root, runId, report) {
  const existing = listRisks(root).find((risk2) => risk2.dedupe_key === `verification:${runId}`);
  if (report.status === "PASS") {
    return existing?.status === "open" ? updateRisk(root, existing.id, "mitigated", "subsequent verification passed") : null;
  }
  const risk = addRisk(root, {
    dedupe_key: `verification:${runId}`,
    source: "verification",
    title: `Verification failed\uFF1A${runId}`,
    description: report.checks.filter((check2) => check2.status === "FAIL").map((check2) => `${check2.id}:${check2.command}`).join("; "),
    severity: "high",
    run_id: runId,
    evidence_refs: [`.apex-v2/runs/${runId}/verification-report.json`]
  });
  return risk;
}
function syncReviewRisk(root, runId, report) {
  const existing = listRisks(root).find((risk2) => risk2.dedupe_key === `review:${runId}`);
  if (report.status === "PASS") {
    return existing?.status === "open" ? updateRisk(root, existing.id, "mitigated", "subsequent review passed") : null;
  }
  const risk = addRisk(root, {
    dedupe_key: `review:${runId}`,
    source: "review",
    title: `Review blocked\uFF1A${runId}`,
    description: report.blocking_findings.join("; "),
    severity: "high",
    run_id: runId,
    evidence_refs: [`.apex-v2/runs/${runId}/review-report.json`]
  });
  return risk;
}
function syncAdapterSmokeRisk(root, report) {
  if (report.mode !== "live") return null;
  const existing = listRisks(root).find((risk) => risk.dedupe_key === "adapter-smoke");
  if (report.status === "PASS") {
    return existing?.status === "open" ? updateRisk(root, existing.id, "mitigated", "subsequent adapter smoke passed") : null;
  }
  if (existing && existing.status !== "open") {
    return updateRisk(root, existing.id, "open", "reopened after adapter smoke failure");
  }
  return addRisk(root, {
    dedupe_key: "adapter-smoke",
    source: "verification",
    title: "Adapter smoke failed",
    description: report.results.filter((item) => item.status === "FAIL").map((item) => `${item.adapter}:${item.errors.join(",")}`).join("; "),
    severity: "critical",
    evidence_refs: [`.apex-v2/adapters/${report.mode === "live" ? "latest-live-smoke.json" : "latest-static-smoke.json"}`]
  });
}

// src/core/metrics.mjs
import { existsSync as existsSync18, readFileSync as readFileSync15, readdirSync as readdirSync10 } from "node:fs";
import { join as join25 } from "node:path";
function buildProjectMetrics(root) {
  const runs = readRunFiles(root);
  const workers = findJson(root, (name) => name === "worker.json");
  const adapterResults = findJson(root, (name) => name.startsWith("adapter-result-"));
  const verification = findJson(root, (name) => name === "verification-report.json");
  const integration = findJson(root, (name) => name === "integration-report.json");
  const events = readFileSync15(join25(root, "events.jsonl"), "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const risks = readJson(join25(root, "risks", "register.json"), []);
  const durations = runs.filter((run) => run.status === "done").map((run) => Date.parse(run.updated_at) - Date.parse(run.created_at));
  const previous = readJson(join25(root, "metrics", "latest.json"), null);
  const policy = readJson(join25(root, "policies", "quality.json"), null);
  const rollingWindowDays = policy?.rolling_window_days || 7;
  const rollingRunCount = policy?.rolling_run_count || 20;
  const windowSince = Date.now() - rollingWindowDays * 864e5;
  const windowRuns = runs.filter((run) => Date.parse(run.updated_at || run.created_at) >= windowSince).sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at)).slice(-rollingRunCount);
  const windowRunIds = new Set(windowRuns.map((run) => run.run_id));
  const windowAdapterResults = adapterResults.filter(
    (item) => windowRunIds.has(item.run_id) && Date.parse(item.created_at) >= windowSince
  );
  const windowVerification = verification.filter(
    (item) => windowRunIds.has(item.run_id) && Date.parse(item.created_at) >= windowSince
  );
  const windowIntegration = integration.filter(
    (item) => windowRunIds.has(item.run_id) && Date.parse(item.created_at) >= windowSince
  );
  const windowDurations = windowRuns.filter((run) => run.status === "done").map((run) => Date.parse(run.updated_at) - Date.parse(run.created_at));
  const windowAdapterTotal = windowAdapterResults.length;
  const snapshot = {
    schema_version: "v0",
    snapshot_id: shortId("metrics"),
    generated_at: now(),
    delivery: {
      runs_total: runs.length,
      runs_done: runs.filter((run) => run.status === "done").length,
      runs_active: runs.filter((run) => ["planned", "active", "paused"].includes(run.status)).length,
      average_cycle_ms: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0
    },
    execution: {
      workers_total: workers.length,
      adapter_pass: adapterResults.filter((item) => item.status === "PASS").length,
      adapter_fail: adapterResults.filter((item) => item.status === "FAIL").length,
      retry_events: events.filter((event) => event.type === "worker.retry.requested").length
    },
    quality: {
      verification_pass: verification.filter((item) => item.status === "PASS").length,
      verification_fail: verification.filter((item) => item.status === "FAIL").length,
      integrations_merged: integration.filter((item) => item.status === "MERGED").length,
      integrations_noop: integration.filter((item) => item.status === "NOOP").length
    },
    risk: {
      total: risks.length,
      open: risks.filter((item) => item.status === "open").length,
      mitigated: risks.filter((item) => item.status === "mitigated").length,
      accepted: risks.filter((item) => item.status === "accepted").length
    },
    window: {
      days: rollingWindowDays,
      max_runs: rollingRunCount,
      since: new Date(windowSince).toISOString(),
      run_ids: [...windowRunIds],
      delivery: {
        runs_total: windowRuns.length,
        runs_done: windowRuns.filter((run) => run.status === "done").length,
        average_cycle_ms: windowDurations.length ? Math.round(windowDurations.reduce((sum, value) => sum + value, 0) / windowDurations.length) : 0
      },
      execution: {
        adapter_pass: windowAdapterResults.filter((item) => item.status === "PASS").length,
        adapter_fail: windowAdapterResults.filter((item) => item.status === "FAIL").length,
        adapter_failure_rate: windowAdapterTotal ? windowAdapterResults.filter((item) => item.status === "FAIL").length / windowAdapterTotal : 0
      },
      quality: {
        verification_pass: windowVerification.filter((item) => item.status === "PASS").length,
        verification_fail: windowVerification.filter((item) => item.status === "FAIL").length,
        integrations_merged: windowIntegration.filter((item) => item.status === "MERGED").length,
        integrations_noop: windowIntegration.filter((item) => item.status === "NOOP").length
      }
    }
  };
  snapshot.baseline = previous ? {
    snapshot_id: previous.snapshot_id,
    average_cycle_ms: previous.window?.delivery?.average_cycle_ms ?? previous.delivery.average_cycle_ms
  } : null;
  snapshot.evaluation = evaluateMetrics(snapshot, previous, policy);
  return snapshot;
}
function evaluateMetrics(snapshot, previous, policy) {
  if (!policy) return { status: "PASS", failures: [], checks: [] };
  const adapterFailureRate = snapshot.window.execution.adapter_failure_rate;
  const previousCycle = previous?.window?.delivery?.average_cycle_ms ?? previous?.delivery?.average_cycle_ms;
  const currentCycle = snapshot.window.delivery.average_cycle_ms;
  const cycleRegression = previousCycle > 0 && currentCycle > 0 ? (currentCycle - previousCycle) / previousCycle * 100 : 0;
  const checks = [
    check("open-risks", snapshot.risk.open <= policy.thresholds.max_open_risks, snapshot.risk.open, policy.thresholds.max_open_risks),
    check("verification-failures", snapshot.window.quality.verification_fail <= policy.thresholds.max_verification_failures, snapshot.window.quality.verification_fail, policy.thresholds.max_verification_failures),
    check("adapter-failure-rate", adapterFailureRate <= policy.thresholds.max_adapter_failure_rate, adapterFailureRate, policy.thresholds.max_adapter_failure_rate),
    check("cycle-regression-percent", cycleRegression <= policy.thresholds.max_cycle_regression_percent, cycleRegression, policy.thresholds.max_cycle_regression_percent)
  ];
  return {
    status: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    failures: checks.filter((item) => item.status === "FAIL").map((item) => item.id),
    checks
  };
}
function check(id, pass, actual, limit) {
  return { id, status: pass ? "PASS" : "FAIL", actual, limit };
}
function readRunFiles(root) {
  const dir = join25(root, "runs");
  if (!existsSync18(dir)) return [];
  return readdirSync10(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => readJson(join25(dir, entry.name, "run.json"), null)).filter(Boolean);
}
function findJson(root, predicate) {
  const values = [];
  function walk(dir) {
    if (!existsSync18(dir)) return;
    for (const entry of readdirSync10(dir, { withFileTypes: true })) {
      const path = join25(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json") && predicate(entry.name)) values.push(readJson(path));
    }
  }
  walk(join25(root, "runs"));
  return values;
}

// src/core/heartbeat.mjs
import { existsSync as existsSync21, readdirSync as readdirSync12 } from "node:fs";
import { join as join29 } from "node:path";

// src/core/adapter-observability.mjs
import { existsSync as existsSync20, readdirSync as readdirSync11 } from "node:fs";
import { join as join28 } from "node:path";

// src/core/adapter-smoke.mjs
import { existsSync as existsSync19, mkdtempSync as mkdtempSync2, readFileSync as readFileSync16, rmSync as rmSync6 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join26 } from "node:path";
var RESULT_SCHEMA = schemaPath("agent-result.schema.json");
var PROVIDER_RESULT_SCHEMA = schemaPath("agent-result-provider.schema.json");
function runAdapterSmoke(options = {}) {
  const names = options.adapters || DEFAULT_SMOKE_EXECUTOR_IDS;
  const inspections = new Map(inspectWorkerExecutors().map((item) => [item.adapter, item]));
  const results = [];
  for (const name of names) {
    const info = inspections.get(name);
    if (!info?.available) {
      results.push({ adapter: name, status: "FAIL", mode: options.live ? "live" : "static", version: info?.version || "", session_id: null, duration_ms: 0, errors: [info?.error || "unavailable"] });
      continue;
    }
    if (!options.live) {
      results.push({ adapter: name, status: "PASS", mode: "static", version: info.version, session_id: null, duration_ms: 0, errors: [] });
      continue;
    }
    results.push(runLiveProbe(name, info, options.timeoutMs || 18e4));
  }
  return {
    schema_version: "v0",
    smoke_id: shortId("adapter-smoke"),
    generated_at: now(),
    mode: options.live ? "live" : "static",
    status: results.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    results
  };
}
function runLiveProbe(name, info, timeoutMs) {
  const workspace = mkdtempSync2(join26(tmpdir2(), `apex-adapter-smoke-${name}-`));
  const outputPath = join26(workspace, "result.json");
  const prompt = 'Do not use tools or modify files. Return verdict "pass", summary "adapter smoke", tests [], risks [], evidence_refs [], semantic_evidence null, and capability_evidence [] using the required structured output.';
  try {
    const executor = getWorkerExecutor(name);
    const execution = executor.execute({
      executable: name,
      workspaceDir: workspace,
      prompt,
      outputSchemaPath: name === "codex" ? PROVIDER_RESULT_SCHEMA : RESULT_SCHEMA,
      outputPath,
      timeoutMs,
      smoke: true
    });
    if (execution.exit_code !== 0 || !existsSync19(outputPath)) {
      return { adapter: name, status: "FAIL", mode: "live", version: info.version, session_id: execution.session_id || null, duration_ms: execution.duration_ms, errors: [execution.stderr_tail || "missing structured output"] };
    }
    const value = JSON.parse(readFileSync16(outputPath, "utf8"));
    if (value.semantic_evidence === null) delete value.semantic_evidence;
    const contract = validateContract("agent-result.schema.json", value, `${name} smoke`);
    return {
      adapter: name,
      status: contract.valid && value.verdict === "pass" ? "PASS" : "FAIL",
      mode: "live",
      version: info.version,
      session_id: execution.session_id || null,
      duration_ms: execution.duration_ms,
      errors: contract.errors.map((item) => `${item.instance_path} ${item.message}`)
    };
  } catch (error) {
    return { adapter: name, status: "FAIL", mode: "live", version: info.version, session_id: null, duration_ms: 0, errors: [error.message] };
  } finally {
    rmSync6(workspace, { recursive: true, force: true });
  }
}

// src/core/notifications.mjs
import { appendFileSync } from "node:fs";
import { dirname as dirname7, join as join27, resolve as resolve13 } from "node:path";
var SEVERITY = {
  info: 0,
  medium: 1,
  high: 2,
  critical: 3
};
function defaultNotificationPolicy(timestamp = now()) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    enabled: true,
    minimum_severity: "high",
    dedupe_window_minutes: 60,
    notify_on: [
      "adapter.smoke.failed",
      "adapter.smoke.refresh_failed"
    ],
    delivery: {
      mode: "file",
      sink_path: "notifications/delivered.jsonl",
      max_attempts: 3,
      retry_backoff_seconds: 60
    }
  };
}
function listNotifications(root, status2 = null) {
  const notifications = readJson(join27(root, "notifications", "outbox.json"), []);
  return status2 ? notifications.filter((item) => item.status === status2) : notifications;
}
function enqueueNotification(root, input) {
  const policy = readJson(join27(root, "policies", "notifications.json"), defaultNotificationPolicy());
  if (!policy.enabled) return { queued: false, reason: "policy-disabled", notification: null };
  if (!policy.notify_on.includes(input.event_type)) return { queued: false, reason: "event-disabled", notification: null };
  if (SEVERITY[input.severity] < SEVERITY[policy.minimum_severity]) {
    return { queued: false, reason: "below-minimum-severity", notification: null };
  }
  const path = join27(root, "notifications", "outbox.json");
  const notifications = readJson(path, []);
  const dedupeAfter = Date.now() - policy.dedupe_window_minutes * 6e4;
  const existing = notifications.find(
    (item) => item.dedupe_key === input.dedupe_key && Date.parse(item.created_at) >= dedupeAfter
  );
  if (existing) return { queued: false, reason: "deduplicated", notification: existing };
  const timestamp = now();
  const notification = {
    schema_version: "v0",
    id: shortId("notification"),
    event_type: input.event_type,
    severity: input.severity,
    status: "queued",
    dedupe_key: input.dedupe_key,
    title: input.title,
    body: input.body,
    evidence_refs: input.evidence_refs || [],
    payload: input.payload || {},
    attempts: 0,
    next_attempt_at: timestamp,
    last_error: "",
    delivered_at: null,
    delivery_receipt: "",
    created_at: timestamp,
    updated_at: timestamp,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgement_reason: ""
  };
  notifications.push(notification);
  writeJson(path, notifications);
  const event = appendEvent(root, "notification.queued", "apex-v2", {
    notification_id: notification.id,
    event_type: notification.event_type,
    severity: notification.severity,
    dedupe_key: notification.dedupe_key
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { queued: true, reason: "queued", notification };
}
function acknowledgeNotification(root, id, reason) {
  const path = join27(root, "notifications", "outbox.json");
  const notifications = readJson(path, []);
  const notification = notifications.find((item) => item.id === id);
  if (!notification) throw new Error(`\u627E\u4E0D\u5230 notification\uFF1A${id}`);
  if (notification.status === "acknowledged") throw new Error(`notification \u5DF2\u5904\u7406\uFF1A${id}=${notification.status}`);
  const timestamp = now();
  notification.status = "acknowledged";
  notification.updated_at = timestamp;
  notification.acknowledged_at = timestamp;
  notification.acknowledged_by = "human";
  notification.acknowledgement_reason = reason || "";
  writeJson(path, notifications);
  const event = appendEvent(root, "notification.acknowledged", "human", {
    notification_id: notification.id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return notification;
}
function dispatchNotifications(root, options = {}) {
  const policy = readJson(join27(root, "policies", "notifications.json"), defaultNotificationPolicy());
  const path = join27(root, "notifications", "outbox.json");
  const notifications = readJson(path, []);
  const delivered = [];
  const failed = [];
  const deadLetter = [];
  const currentTime = options.now || now();
  const deliverer = options.deliverer || ((notification) => deliverToFile(root, policy, notification, currentTime));
  for (const notification of notifications) {
    if (!["queued", "failed"].includes(notification.status)) continue;
    if (!options.force && notification.next_attempt_at && notification.next_attempt_at > currentTime) continue;
    notification.status = "delivering";
    notification.attempts += 1;
    notification.updated_at = currentTime;
    writeJson(path, notifications);
    try {
      const receipt = deliverer(notification);
      notification.status = "delivered";
      notification.delivered_at = currentTime;
      notification.delivery_receipt = typeof receipt === "string" ? receipt : JSON.stringify(receipt);
      notification.last_error = "";
      notification.next_attempt_at = null;
      delivered.push(notification.id);
      appendNotificationEvent(root, "notification.delivered", notification);
    } catch (error) {
      notification.last_error = error.message;
      notification.status = notification.attempts >= policy.delivery.max_attempts ? "dead_letter" : "failed";
      notification.next_attempt_at = notification.status === "failed" ? new Date(Date.parse(currentTime) + retryDelayMs(policy, notification.attempts)).toISOString() : null;
      if (notification.status === "dead_letter") {
        deadLetter.push(notification.id);
        appendNotificationEvent(root, "notification.dead_letter", notification);
      } else {
        failed.push(notification.id);
        appendNotificationEvent(root, "notification.delivery_failed", notification);
      }
    }
    notification.updated_at = currentTime;
    writeJson(path, notifications);
  }
  return { delivered, failed, dead_letter: deadLetter };
}
function migrateNotificationState(root, timestamp = now()) {
  const policyPath2 = join27(root, "policies", "notifications.json");
  const policy = readJson(policyPath2, defaultNotificationPolicy(timestamp));
  if (policy.delivery?.mode === "outbox" || !policy.delivery?.max_attempts) {
    policy.delivery = {
      mode: "file",
      sink_path: "notifications/delivered.jsonl",
      max_attempts: 3,
      retry_backoff_seconds: 60
    };
    policy.updated_at = timestamp;
    writeJson(policyPath2, policy);
  }
  const outboxPath = join27(root, "notifications", "outbox.json");
  const notifications = readJson(outboxPath, []);
  let changed = false;
  for (const notification of notifications) {
    if (notification.attempts != null) continue;
    notification.attempts = 0;
    notification.next_attempt_at = notification.created_at;
    notification.last_error = "";
    notification.delivered_at = null;
    notification.delivery_receipt = "";
    changed = true;
  }
  if (changed) writeJson(outboxPath, notifications);
  return { policy, notifications, changed };
}
function deliverToFile(root, policy, notification, deliveredAt) {
  if (policy.delivery.mode !== "file") {
    throw new Error(`unsupported notification delivery mode\uFF1A${policy.delivery.mode}`);
  }
  const target = resolve13(root, policy.delivery.sink_path);
  if (!target.startsWith(`${resolve13(root)}/`)) {
    throw new Error(`notification sink \u8D85\u51FA\u9879\u76EE\u72B6\u6001\u76EE\u5F55\uFF1A${policy.delivery.sink_path}`);
  }
  ensureDir(dirname7(target));
  appendFileSync(target, `${JSON.stringify({
    notification_id: notification.id,
    event_type: notification.event_type,
    severity: notification.severity,
    delivered_at: deliveredAt,
    payload: notification.payload,
    evidence_refs: notification.evidence_refs
  })}
`);
  return `file:${policy.delivery.sink_path}#${notification.id}`;
}
function retryDelayMs(policy, attempts) {
  return policy.delivery.retry_backoff_seconds * 1e3 * 2 ** Math.max(0, attempts - 1);
}
function appendNotificationEvent(root, type, notification) {
  const event = appendEvent(root, type, "apex-v2", {
    notification_id: notification.id,
    attempts: notification.attempts,
    status: notification.status,
    last_error: notification.last_error
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
}

// src/core/adapter-observability.mjs
function recordAdapterSmokeReport(root, report, options = {}) {
  ensureDir(join28(root, "adapters"));
  const reportPath = join28(root, "adapters", `smoke-${report.smoke_id}.json`);
  const latestPath = join28(root, "adapters", report.mode === "live" ? "latest-live-smoke.json" : "latest-static-smoke.json");
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  syncAdapterSmokeRisk(root, report);
  const event = appendEvent(root, "adapter.smoke.completed", "apex-v2", {
    smoke_id: report.smoke_id,
    mode: report.mode,
    status: report.status,
    trigger: options.trigger || "manual",
    failed_adapters: report.results.filter((item) => item.status === "FAIL").map((item) => item.adapter)
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  const inspections = options.inspections || inspectWorkerExecutors();
  const observation = recordAdapterObservation(root, inspections, {
    source: "smoke",
    smokeReport: report
  });
  let notification = null;
  if (report.mode === "live" && report.status === "FAIL") {
    const failed = report.results.filter((item) => item.status === "FAIL");
    notification = enqueueNotification(root, {
      event_type: "adapter.smoke.failed",
      severity: "critical",
      dedupe_key: `adapter-smoke:${failed.map((item) => item.adapter).sort().join(",")}`,
      title: "Adapter live smoke failed",
      body: failed.map((item) => `${item.adapter}: ${item.errors.join(", ")}`).join("; "),
      evidence_refs: [`.apex-v2/adapters/smoke-${report.smoke_id}.json`],
      payload: {
        smoke_id: report.smoke_id,
        failed_adapters: failed.map((item) => item.adapter)
      }
    });
  }
  return { report, observation, notification };
}
function refreshStaleAdapterSmoke(root, policy, options = {}) {
  const latest = readJson(join28(root, "adapters", "latest-live-smoke.json"), null);
  if (!latest && !options.refreshMissing) {
    return { attempted: false, reason: "missing-live-smoke", status: null, smoke_id: null };
  }
  const ageMs = latest ? Date.now() - Date.parse(latest.generated_at) : Infinity;
  const maxAgeMs = policy.adapter_smoke_max_age_hours * 36e5;
  if (latest && Number.isFinite(ageMs) && ageMs <= maxAgeMs) {
    return { attempted: false, reason: "fresh", status: latest.status, smoke_id: latest.smoke_id };
  }
  if (!policy.adapter_smoke_auto_refresh) {
    return { attempted: false, reason: "policy-disabled", status: latest.status, smoke_id: latest.smoke_id };
  }
  const started = appendEvent(root, "adapter.smoke.refresh.started", "apex-v2", {
    trigger: options.trigger || "project.tick",
    previous_smoke_id: latest?.smoke_id || null,
    previous_age_hours: Number.isFinite(ageMs) ? ageMs / 36e5 : null
  });
  updateProject(root, { last_event_id: started.event_id, updated_at: started.timestamp });
  try {
    const runner = options.runner || runAdapterSmoke;
    const report = runner({
      live: true,
      timeoutMs: policy.adapter_smoke_refresh_timeout_ms
    });
    recordAdapterSmokeReport(root, report, {
      trigger: options.trigger || "project.tick",
      inspections: options.inspections
    });
    return {
      attempted: true,
      reason: latest ? "stale" : "missing",
      status: report.status,
      smoke_id: report.smoke_id
    };
  } catch (error) {
    const failed = appendEvent(root, "adapter.smoke.refresh.failed", "apex-v2", {
      trigger: options.trigger || "project.tick",
      error: error.message
    });
    updateProject(root, { last_event_id: failed.event_id, updated_at: failed.timestamp });
    enqueueNotification(root, {
      event_type: "adapter.smoke.refresh_failed",
      severity: "critical",
      dedupe_key: "adapter-smoke-refresh",
      title: "Adapter smoke refresh failed",
      body: error.message,
      evidence_refs: [".apex-v2/events.jsonl"],
      payload: {
        trigger: options.trigger || "project.tick"
      }
    });
    throw error;
  }
}
function recordAdapterObservation(root, adapters, options = {}) {
  const smokeResults = new Map((options.smokeReport?.results || []).map((item) => [item.adapter, item]));
  const snapshot = {
    schema_version: "v0",
    snapshot_id: shortId("adapter-observation"),
    generated_at: options.generatedAt || now(),
    source: options.source || "manual",
    smoke_id: options.smokeReport?.smoke_id || null,
    adapters: adapters.map((item) => {
      const smoke = smokeResults.get(item.adapter);
      return {
        adapter: item.adapter,
        available: Boolean(item.available),
        version: smoke?.version || item.version || "",
        capabilities: Array.from(new Set(item.capabilities || [])).sort(),
        smoke_status: smoke?.status || null,
        smoke_duration_ms: smoke?.duration_ms ?? null
      };
    })
  };
  const historyDir = join28(root, "adapters", "history");
  ensureDir(historyDir);
  writeJson(join28(historyDir, `${snapshot.snapshot_id}.json`), snapshot);
  const trend = buildAdapterTrend(root);
  writeJson(join28(root, "adapters", "latest-trend.json"), trend);
  if (options.recordEvent !== false) {
    const event = appendEvent(root, "adapter.observation.recorded", "apex-v2", {
      snapshot_id: snapshot.snapshot_id,
      source: snapshot.source,
      smoke_id: snapshot.smoke_id
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  return snapshot;
}
function backfillAdapterObservations(root, options = {}) {
  const historyDir = join28(root, "adapters", "history");
  ensureDir(historyDir);
  const existing = readdirSync11(historyDir).filter((name) => name.startsWith("adapter-observation-") && name.endsWith(".json")).map((name) => readJson(join28(historyDir, name)));
  const smokeIds = new Set(existing.map((item) => item.smoke_id).filter(Boolean));
  const hasBaseline = existing.some((item) => item.source === "baseline" && item.smoke_id == null);
  const inspections = options.inspections || inspectWorkerExecutors();
  let created = 0;
  const baseline = readJson(join28(root, "adapters", "capabilities.json"), null);
  if (baseline && !hasBaseline) {
    recordAdapterObservation(root, baseline.adapters || inspections, {
      source: "baseline",
      generatedAt: baseline.generated_at,
      recordEvent: false
    });
    created += 1;
  }
  const smokeFiles = readdirSync11(join28(root, "adapters")).filter((name) => name.startsWith("smoke-") && name.endsWith(".json")).sort();
  for (const name of smokeFiles) {
    const report = readJson(join28(root, "adapters", name));
    if (!report?.smoke_id || smokeIds.has(report.smoke_id)) continue;
    recordAdapterObservation(root, inspections, {
      source: "smoke",
      smokeReport: report,
      generatedAt: report.generated_at,
      recordEvent: false
    });
    smokeIds.add(report.smoke_id);
    created += 1;
  }
  const trend = buildAdapterTrend(root);
  writeJson(join28(root, "adapters", "latest-trend.json"), trend);
  if (created > 0 && existsSync20(join28(root, "events.jsonl"))) {
    const event = appendEvent(root, "adapter.observation.backfilled", "apex-v2", {
      created,
      snapshot_count: trend.snapshot_count
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  return { created, snapshot_count: trend.snapshot_count };
}
function buildAdapterTrend(root) {
  const historyDir = join28(root, "adapters", "history");
  const snapshots = existsSync20(historyDir) ? readdirSync11(historyDir).filter((name) => name.startsWith("adapter-observation-") && name.endsWith(".json")).map((name) => readJson(join28(historyDir, name))).sort(
    (left, right) => left.generated_at.localeCompare(right.generated_at) || left.snapshot_id.localeCompare(right.snapshot_id)
  ) : [];
  const names = Array.from(new Set(snapshots.flatMap((snapshot) => snapshot.adapters.map((item) => item.adapter)))).sort();
  return {
    schema_version: "v0",
    generated_at: now(),
    snapshot_count: snapshots.length,
    adapters: names.map((name) => summarizeAdapter(name, snapshots))
  };
}
function summarizeAdapter(name, snapshots) {
  const observations = snapshots.map((snapshot) => {
    const adapter = snapshot.adapters.find((item) => item.adapter === name);
    return adapter ? { ...adapter, observed_at: snapshot.generated_at } : null;
  }).filter(Boolean);
  const versionChanges = [];
  const capabilityChanges = [];
  const availabilityChanges = [];
  for (let index = 1; index < observations.length; index += 1) {
    const before = observations[index - 1];
    const current = observations[index];
    if (before.version !== current.version) {
      versionChanges.push({ from: before.version, to: current.version, observed_at: current.observed_at });
    }
    const added = current.capabilities.filter((item) => !before.capabilities.includes(item));
    const removed = before.capabilities.filter((item) => !current.capabilities.includes(item));
    if (added.length > 0 || removed.length > 0) {
      capabilityChanges.push({ added, removed, observed_at: current.observed_at });
    }
    if (before.available !== current.available) {
      availabilityChanges.push({ from: before.available, to: current.available, observed_at: current.observed_at });
    }
  }
  const latest = observations.at(-1) || {
    adapter: name,
    available: false,
    version: "",
    capabilities: [],
    smoke_status: null,
    smoke_duration_ms: null,
    observed_at: null
  };
  return {
    adapter: name,
    observations: observations.length,
    latest,
    version_changes: versionChanges,
    capability_changes: capabilityChanges,
    availability_changes: availabilityChanges,
    smoke: {
      pass: observations.filter((item) => item.smoke_status === "PASS").length,
      fail: observations.filter((item) => item.smoke_status === "FAIL").length
    }
  };
}

// src/core/heartbeat.mjs
function runProjectHeartbeat(root, options = {}) {
  const policy = readJson(join29(root, "policies", "quality.json"));
  const inspections = options.inspections || inspectWorkerExecutors();
  const backfill = backfillAdapterObservations(root, { inspections });
  const smoke = refreshStaleAdapterSmoke(root, policy, {
    trigger: "project.heartbeat",
    refreshMissing: true,
    runner: options.smokeRunner,
    inspections
  });
  let observation = null;
  if (!smoke.attempted && observationDue(root, policy.adapter_observation_interval_hours)) {
    observation = recordAdapterObservation(root, inspections, {
      source: "manual"
    });
  }
  const metrics = buildProjectMetrics(root);
  ensureDir(join29(root, "metrics"));
  writeJson(join29(root, "metrics", `${metrics.snapshot_id}.json`), metrics);
  writeJson(join29(root, "metrics", "latest.json"), metrics);
  const notifications = dispatchNotifications(root, {
    force: Boolean(options.forceNotifications),
    deliverer: options.deliverer
  });
  const heartbeat = {
    heartbeat_id: shortId("heartbeat"),
    generated_at: now(),
    backfill,
    smoke,
    observation_id: observation?.snapshot_id || null,
    metrics_snapshot_id: metrics.snapshot_id,
    metrics_status: metrics.evaluation.status,
    notifications
  };
  const event = appendEvent(root, "project.heartbeat.completed", "apex-v2", heartbeat);
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return heartbeat;
}
function observationDue(root, intervalHours) {
  const historyDir = join29(root, "adapters", "history");
  if (!existsSync21(historyDir)) return true;
  const latest = readdirSync12(historyDir).filter((name) => name.startsWith("adapter-observation-") && name.endsWith(".json")).map((name) => readJson(join29(historyDir, name))).sort((left, right) => right.generated_at.localeCompare(left.generated_at))[0];
  if (!latest) return true;
  return Date.now() - Date.parse(latest.generated_at) >= intervalHours * 36e5;
}

// src/core/knowledge-constants.mjs
var KNOWLEDGE_FILES = [
  ["index.md", "\u9879\u76EE\u77E5\u8BC6\u5165\u53E3\uFF0C\u4FDD\u6301\u77ED\u5C0F\uFF0C\u53EA\u653E\u80FD\u9632\u6B62\u540E\u7EED agent \u72AF\u9519\u7684\u7D22\u5F15\u4FE1\u606F\u3002"],
  ["module-map.md", "\u6A21\u5757\u8FB9\u754C\u3001\u4F9D\u8D56\u65B9\u5411\u3001\u5173\u952E\u5165\u53E3\u548C\u4EFB\u52A1\u5230\u6A21\u5757\u7684\u8DEF\u7531\u7EBF\u7D22\u3002"],
  ["task-to-file-map.md", "\u5E38\u89C1\u4EFB\u52A1\u7C7B\u578B\u5230\u76F8\u5173\u6587\u4EF6\u3001\u6D4B\u8BD5\u3001\u547D\u4EE4\u7684\u6620\u5C04\u3002"],
  ["danger-zones.md", "\u9AD8\u98CE\u9669\u533A\u57DF\u3001\u5F71\u54CD\u8303\u56F4\u3001\u68C0\u67E5\u547D\u4EE4\u548C\u5386\u53F2\u4E8B\u6545\u3002"],
  ["conventions.md", "\u4EE3\u7801\u3001\u67B6\u6784\u3001\u547D\u540D\u3001\u63D0\u4EA4\u3001\u6D4B\u8BD5\u548C\u53D1\u5E03\u7EA6\u5B9A\u3002"],
  ["test-map.md", "\u6D4B\u8BD5\u7EC4\u3001\u8FD0\u884C\u6761\u4EF6\u3001\u8986\u76D6\u8303\u56F4\u3001\u73AF\u5883\u4F9D\u8D56\u548C\u63A8\u8350\u7B56\u7565\u3002"],
  ["known-issues.md", "\u5DF2\u77E5\u95EE\u9898\u3001flaky\u3001wontfix\u3001\u5EF6\u671F\u9879\u53CA\u5176\u6765\u6E90\u3002"],
  ["decisions.md", "\u957F\u671F\u6709\u6548\u7684\u4EA7\u54C1\u3001\u67B6\u6784\u3001\u6280\u672F\u548C\u6D41\u7A0B\u51B3\u7B56\u3002"],
  ["environment.md", "\u672C\u5730\u3001CI\u3001\u90E8\u7F72\u3001\u8D26\u53F7\u3001\u6743\u9650\u3001\u5916\u90E8\u670D\u52A1\u7B49\u73AF\u5883\u4E8B\u5B9E\u3002"],
  ["glossary.md", "\u9879\u76EE\u672F\u8BED\u8868\uFF0C\u907F\u514D\u591A agent \u5BF9\u540C\u4E00\u6982\u5FF5\u7406\u89E3\u4E0D\u4E00\u81F4\u3002"]
];

// src/commands/knowledge.mjs
import { existsSync as existsSync22, readdirSync as readdirSync13 } from "node:fs";
import { join as join30 } from "node:path";

// src/core/knowledge-renderers.mjs
function renderKnowledgeIndex(inventory, version, timestamp) {
  return `# \u9879\u76EE\u77E5\u8BC6\u5165\u53E3

\u7248\u672C\uFF1A${version}
\u66F4\u65B0\u65F6\u95F4\uFF1A${timestamp}

## \u5DF2\u9A8C\u8BC1\u4E8B\u5B9E

- \u6E90\u7801\u5165\u53E3\uFF1A\`src/apex-v2.mjs\`
- \u6D4B\u8BD5\u5165\u53E3\uFF1A\`npm test\`
- \u6D4B\u8BD5\u6587\u4EF6\uFF1A${inline(inventory.testFiles)}
- Schema \u6570\u91CF\uFF1A${inventory.schemaFiles.length}

## \u5FEB\u901F\u5165\u53E3

- \`node src/apex-v2.mjs --help\`
- \`node src/apex-v2.mjs validate --project . --strict-knowledge\`

## \u5173\u952E\u6765\u6E90

${list(inventory.sourceRefs.slice(0, 40))}
`;
}
function renderModuleMap(inventory) {
  return `# \u6A21\u5757\u5730\u56FE

## \u8FD0\u884C\u5185\u6838

${list(inventory.sourceFiles.map((file) => `\`${file}\``))}

## \u673A\u5668\u5951\u7EA6

${list(inventory.schemaFiles.map((file) => `\`${file}\``))}

## \u6D4B\u8BD5

${list(inventory.testFiles.map((file) => `\`${file}\``))}

## \u6587\u6863

${list([...inventory.planningDocs, ...inventory.contractDocs, ...inventory.researchDocs].map((file) => `\`${file}\``))}
`;
}
function renderTaskToFileMap(inventory) {
  return `# \u4EFB\u52A1\u5230\u6587\u4EF6\u6620\u5C04

| \u4EFB\u52A1 | \u4E3B\u8981\u6587\u4EF6 | \u9A8C\u8BC1 |
|---|---|---|
| CLI/Project state | \`src/apex-v2.mjs\`, \`src/core/store.mjs\` | \`npm test\` |
| PlanGraph | \`src/core/plan-graph.mjs\` | plan graph tests |
| Worker/Agent | \`src/core/worker.mjs\`, \`src/core/agent-execution.mjs\`, \`src/adapters/\` | agent and concurrent worker tests |
| Contract | \`src/core/contracts.mjs\`, \`schemas/\` | \`contracts validate\` |
| Observability | \`src/core/metrics.mjs\`, \`src/core/heartbeat.mjs\`, \`src/core/notifications.mjs\` | heartbeat/rolling tests |

\u6D4B\u8BD5\u6587\u4EF6\uFF1A${inline(inventory.testFiles)}
`;
}
function renderDangerZones(inventory) {
  return `# Danger Zones

- \`.apex-v2/\`\uFF1A\u9879\u76EE\u4E8B\u5B9E\u6765\u6E90\uFF0C\u53EA\u80FD\u901A\u8FC7 kernel-owned \u5199\u8DEF\u5F84\u66F4\u65B0\u3002
- \`src/core/store.mjs\`\uFF1A\u539F\u5B50\u5199\u5165\u3001event ordering \u548C project lock\u3002
- \`src/core/governance.mjs\`\uFF1AApproval V1\u3001\u9884\u7B97\u4E0E capability\u3002
- \`src/core/agent-execution.mjs\`\uFF1Asandbox \u548C write-scope \u8FB9\u754C\u3002
- \`schemas/\`\uFF1A\u6301\u4E45\u5316\u517C\u5BB9\u6027\u8FB9\u754C\u3002

## \u68C0\u67E5\u547D\u4EE4

- \`npm test\`
- \`node src/apex-v2.mjs contracts validate --project .\`
- \`node src/apex-v2.mjs project reconcile --project .\`

## \u6765\u6E90

${list(["src/apex-v2.mjs", ...inventory.sourceFiles, ...inventory.schemaFiles].slice(0, 60))}
`;
}
function renderConventions(inventory) {
  return `# \u9879\u76EE\u7EA6\u5B9A

- Node.js ESM\uFF0CCLI \u8F93\u51FA\u673A\u5668\u53EF\u8BFB JSON\uFF0C\u9519\u8BEF\u8D70 stderr\u3002
- \u72B6\u6001\u5199\u5165\u5FC5\u987B\u4F7F\u7528 atomic helpers \u548C project lock\u3002
- \u65B0\u547D\u4EE4\u5FC5\u987B\u8986\u76D6\u6210\u529F\u3001\u5931\u8D25\u548C\u5E76\u53D1/\u6062\u590D\u8DEF\u5F84\u3002
- Agent \u53EA\u80FD\u5728 capability sandbox \u548C write scope \u5185\u6267\u884C\u3002
- PASS \u5FC5\u987B\u5F15\u7528 artifact evidence\u3002

## Package scripts

${list(Object.entries(inventory.scripts).map(([name, command]) => `\`${name}\`: \`${command}\``))}
`;
}
function renderTestMap(inventory) {
  return `# \u6D4B\u8BD5\u5730\u56FE

- \`npm test\`\uFF1A\u5B8C\u6574\u56DE\u5F52\u3002
- \`node --check src/apex-v2.mjs\`\uFF1ACLI \u8BED\u6CD5\u3002
- \`node src/apex-v2.mjs contracts validate --project .\`\uFF1A\u6743\u5A01 contract\u3002
- \`node src/apex-v2.mjs validate --project . --strict-knowledge\`\uFF1A\u9879\u76EE\u4E0E Context Fabric\u3002

## \u6D4B\u8BD5\u6587\u4EF6

${list(inventory.testFiles.map((file) => `\`${file}\``))}
`;
}
function renderKnownIssues() {
  return `# \u5DF2\u77E5\u95EE\u9898

## \u5DF2\u9A8C\u8BC1

- \u6743\u5A01 JSON \u5DF2\u7531 Contract Registry \u8986\u76D6\uFF0Carchived sandbox \u526F\u672C\u4E0D\u53C2\u4E0E\u5F53\u524D contract\u3002
- Context Fabric \u63D0\u4F9B\u6587\u4EF6\u7D22\u5F15\u3001\u4EFB\u52A1\u8DEF\u7531\u3001freshness metadata \u548C stale marker\u3002
- Agent adapter \u652F\u6301 fallback\u3001resume\u3001capability sandbox \u548C\u8FDB\u7A0B\u6811 timeout\u3002
- Event replay \u4E0E materialized ProjectState \u4F1A\u4EA4\u53C9\u6821\u9A8C\u3002
- Rolling metrics\u3001heartbeat\u3001notification delivery \u548C Approval V1 \u5DF2\u542F\u7528\u3002

## \u672A\u9A8C\u8BC1\u7EBF\u7D22

- CLI command domains \u4ECD\u5728\u6301\u7EED\u62C6\u5206\uFF0C\u5165\u53E3\u6587\u4EF6\u5C1A\u672A\u8FBE\u5230\u6700\u7EC8\u884C\u6570\u9884\u7B97\u3002
`;
}
function renderDecisions() {
  return `# \u51B3\u7B56\u8BB0\u5F55

- \u9879\u76EE\u7EA7 Project Kernel \u662F\u771F\u76F8 owner\u3002
- Stage \u901A\u8FC7 typed artifacts \u548C finite gates \u534F\u4F5C\u3002
- \u6743\u5A01\u72B6\u6001\u5199\u5165\u5FC5\u987B\u539F\u5B50\u5316\u5E76\u53EF\u7531 events \u91CD\u653E\u6821\u9A8C\u3002
- Coding agents \u5FC5\u987B\u4F7F\u7528 OS capability sandbox\u3002
- \u5BA1\u8BA1\u5FC5\u987B\u6267\u884C\u5F53\u524D\u6D4B\u8BD5\uFF0C\u4E0D\u63A5\u53D7 manifest \u81EA\u8BA4\u8BC1\u3002
`;
}
function renderEnvironment(inventory) {
  const dependencies = Object.entries(inventory.packageJson?.dependencies || {}).map(([name, version]) => `\`${name}@${version}\``);
  return `# \u73AF\u5883\u4E8B\u5B9E

- Runtime\uFF1ANode.js ESM
- Package\uFF1A\`${inventory.packageJson?.name || "unknown"}@${inventory.packageJson?.version || "unknown"}\`
- \u751F\u4EA7\u4F9D\u8D56\uFF1A${dependencies.join(", ") || "\u65E0"}
- \u72B6\u6001\u76EE\u5F55\uFF1A\`.apex-v2/\`
- Scheduler\uFF1Aheartbeat daemon / launchd installer
`;
}
function renderGlossary() {
  return `# \u672F\u8BED\u8868

- Project Kernel\uFF1A\u9879\u76EE\u7EA7\u8C03\u5EA6\u4E0E\u72B6\u6001\u5185\u6838\u3002
- Context Fabric\uFF1A\u6709\u6765\u6E90\u548C freshness \u7684\u9879\u76EE\u77E5\u8BC6\u3002
- DeliveryRun\uFF1Aroadmap \u6D3E\u751F\u7684\u77ED\u751F\u547D\u5468\u671F\u4EA4\u4ED8\u56FE\u3002
- Artifact Evidence\uFF1Agate \u7684\u53EF\u5BA1\u8BA1\u8BC1\u636E\u3002
- Capability Sandbox\uFF1A\u9650\u5236\u6587\u4EF6\u3001secret\u3001network \u548C\u8FDB\u7A0B\u751F\u547D\u5468\u671F\u7684\u6267\u884C\u8FB9\u754C\u3002
- Derived View\uFF1A\u53EF\u4ECE events/artifacts \u91CD\u5EFA\u7684\u975E\u6743\u5A01\u89C6\u56FE\u3002
`;
}
function withKnowledgeMetadata(content, generatedAt, staleAfter, sourceRefs) {
  return `<!-- apex-knowledge-metadata
generated_at: ${generatedAt}
stale_after: ${staleAfter}
confidence: 0.9
freshness: current-until-stale_after
source_refs:
${sourceRefs.slice(0, 40).map((ref) => `  - ${ref}`).join("\n")}
-->

${content}`;
}
function list(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- \u6682\u65E0\u3002";
}
function inline(items) {
  return items.length ? items.map((item) => `\`${item}\``).join(", ") : "\u6682\u65E0";
}

// src/commands/knowledge.mjs
function handleKnowledgeCommand(subcommand, args, deps) {
  if (subcommand === "refresh") {
    refreshKnowledge(args, deps);
    return;
  }
  throw new Error(`\u672A\u77E5 knowledge \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function refreshKnowledge(args, deps) {
  const { appendAppliedLearning: appendAppliedLearning2 } = deps;
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const timestamp = now();
  const inventory = buildProjectInventory(projectDir);
  const manifestPath = join30(root, "knowledge", "manifest.json");
  const existingManifest = readJson(manifestPath, { version: 0 });
  const nextVersion = Number(existingManifest.version || 0) + 1;
  const knowledgeDir = join30(root, "knowledge");
  const rendered = /* @__PURE__ */ new Map([
    ["index.md", renderKnowledgeIndex(inventory, nextVersion, timestamp)],
    ["module-map.md", renderModuleMap(inventory)],
    ["task-to-file-map.md", renderTaskToFileMap(inventory)],
    ["danger-zones.md", renderDangerZones(inventory)],
    ["conventions.md", renderConventions(inventory)],
    ["test-map.md", renderTestMap(inventory)],
    ["known-issues.md", renderKnownIssues(inventory)],
    ["decisions.md", renderDecisions(inventory)],
    ["environment.md", renderEnvironment(inventory)],
    ["glossary.md", renderGlossary()]
  ]);
  const staleAfter = new Date(Date.parse(timestamp) + 7 * 864e5).toISOString();
  for (const [name, content] of rendered) {
    atomicWriteFile(join30(knowledgeDir, name), withKnowledgeMetadata(
      content,
      timestamp,
      staleAfter,
      inventory.sourceRefs
    ));
  }
  appendAppliedLearning2(root);
  writeJson(manifestPath, {
    schema_version: SCHEMA_VERSION,
    version: nextVersion,
    updated_at: timestamp,
    files: KNOWLEDGE_FILES.map(([name, purpose]) => ({
      path: `knowledge/${name}`,
      purpose,
      owner: "project-kernel",
      derived: false,
      generated_at: timestamp,
      stale_after: staleAfter,
      confidence: 0.9,
      source_refs: inventory.sourceRefs
    })),
    source_refs: inventory.sourceRefs
  });
  updateProject(root, {
    knowledge_version: nextVersion,
    updated_at: timestamp
  });
  const updatedRuns = refreshActiveRunContextSnapshots(root, nextVersion);
  const event = appendEvent(root, "knowledge.refreshed", "apex-v2", {
    knowledge_version: nextVersion,
    source_refs: inventory.sourceRefs,
    updated_runs: updatedRuns
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({
    knowledge_version: nextVersion,
    files: KNOWLEDGE_FILES.map(([name]) => `knowledge/${name}`),
    source_refs: inventory.sourceRefs,
    updated_runs: updatedRuns
  }, null, 2));
}
function buildProjectInventory(projectDir) {
  const files = walkProjectFiles(projectDir);
  const packageJson = readJson(join30(projectDir, "package.json"), null);
  const scripts = packageJson?.scripts || {};
  const sourceFiles = files.filter((file) => file.startsWith("src/"));
  const testFiles = files.filter((file) => file.startsWith("tests/") || file.includes(".test."));
  const schemaFiles = files.filter((file) => file.startsWith("schemas/") && file.endsWith(".json"));
  const planningDocs = files.filter((file) => file.startsWith("planning/") && file.endsWith(".md"));
  const contractDocs = files.filter((file) => file.startsWith("contracts/") && file.endsWith(".md"));
  const researchDocs = files.filter((file) => file.startsWith("research/") && file.endsWith(".md"));
  const adapterDirs = directoryChildren(projectDir, "adapters");
  const disciplineDirs = directoryChildren(projectDir, "disciplines");
  return {
    projectDir,
    files,
    packageJson,
    scripts,
    sourceFiles,
    testFiles,
    schemaFiles,
    planningDocs,
    contractDocs,
    researchDocs,
    adapterDirs,
    disciplineDirs,
    sourceRefs: [
      "package.json",
      ...sourceFiles,
      ...testFiles,
      ...schemaFiles,
      ...planningDocs,
      ...contractDocs,
      ...researchDocs
    ].slice(0, 80)
  };
}
function walkProjectFiles(projectDir) {
  const ignored = /* @__PURE__ */ new Set([".git", "node_modules", ".apex-v2", ".DS_Store"]);
  const out = [];
  function walk(relativeDir) {
    const absoluteDir = join30(projectDir, relativeDir);
    if (!existsSync22(absoluteDir)) return;
    for (const entry of readdirSync13(absoluteDir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile()) {
        out.push(relativePath);
      }
    }
  }
  walk("");
  return out.sort();
}
function directoryChildren(projectDir, relativeDir) {
  const dir = join30(projectDir, relativeDir);
  if (!existsSync22(dir)) return [];
  return readdirSync13(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}
function refreshActiveRunContextSnapshots(root, knowledgeVersion) {
  const project = readJson(join30(root, "project.json"));
  const updated = [];
  for (const runId of project.active_runs) {
    const run = loadRun(root, runId);
    const contextNode = run.nodes.find((node) => node.id === "context");
    if (contextNode && ["passed", "partial_pass"].includes(contextNode.status)) {
      continue;
    }
    run.context_snapshot = {
      knowledge_version: knowledgeVersion,
      files: KNOWLEDGE_FILES.map(([name]) => `knowledge/${name}`)
    };
    run.updated_at = now();
    writeRun(root, run);
    updated.push(runId);
  }
  return updated;
}

// src/commands/run.mjs
import { writeFileSync as writeFileSync11 } from "node:fs";
import { join as join33, resolve as resolve16 } from "node:path";

// src/core/negative-control.mjs
import { join as join31, resolve as resolve14 } from "node:path";

// src/core/lifecycle.mjs
function initializeLifecycleRecord(record, timestamp = now()) {
  return {
    ...record,
    revision: 1,
    last_event_id: null,
    created_at: timestamp,
    updated_at: timestamp
  };
}
function transitionLifecycleRecord(record, nextStatus, transitions, timestamp = now()) {
  const allowed = transitions[record.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `\u975E\u6CD5 lifecycle transition\uFF1A${record.status} -> ${nextStatus}`
    );
  }
  record.status = nextStatus;
  record.revision = Number(record.revision || 0) + 1;
  record.updated_at = timestamp;
  return record;
}
function bindLifecycleEvent(record, event) {
  record.last_event_id = event.event_id;
  record.updated_at = event.timestamp;
  return record;
}

// src/core/negative-control.mjs
var TRANSITIONS = {
  required: ["red_verified", "waived"],
  red_verified: ["green_verified", "waived"],
  green_verified: ["restored", "waived"],
  restored: [],
  waived: []
};
function ensureNegativeControlRecord(root, run, plan) {
  const policy = negativeControlPolicy(root);
  if (policy.mode === "off" || !policy.intake_types.includes(plan.source_intake_type)) {
    return null;
  }
  return withProjectLock(resolve14(root, ".."), () => {
    const existing = readNegativeControlRecord(root, run.run_id);
    if (existing) return existing;
    const timestamp = now();
    const record = initializeLifecycleRecord({
      schema_version: SCHEMA_VERSION,
      record_id: shortId("negative-control"),
      run_id: run.run_id,
      source_intake_id: plan.source_intake_id,
      mode: policy.mode,
      status: "required",
      fault_model: "",
      red_command: null,
      expected_failure_signature: null,
      observed_failure_signature: null,
      red_evidence_refs: [],
      green_command: null,
      green_evidence_refs: [],
      restoration_evidence_refs: [],
      waiver: null
    }, timestamp);
    const event = appendEvent(root, "negative-control.required", "apex-v2", {
      run_id: run.run_id,
      record_id: record.record_id,
      source_intake_id: plan.source_intake_id,
      mode: record.mode
    });
    bindLifecycleEvent(record, event);
    writeNegativeControlRecord(root, record);
    updateProject(root, {
      last_event_id: event.event_id,
      updated_at: event.timestamp
    });
    return record;
  });
}
function readNegativeControlRecord(root, runId) {
  return readJson(
    join31(root, "runs", runId, "negative-control.json"),
    null
  );
}
function recordNegativeControlRed(root, run, input) {
  const record = requireNegativeControlRecord(root, run.run_id);
  if (!input.faultModel) {
    throw new Error("Negative Control RED \u5FC5\u987B\u58F0\u660E fault model");
  }
  if (!input.expectedFailureSignature) {
    throw new Error("Negative Control RED \u5FC5\u987B\u58F0\u660E expected failure signature");
  }
  if (!input.observedFailureSignature.includes(input.expectedFailureSignature)) {
    throw new Error(
      `Negative Control failure signature \u4E0D\u5339\u914D\uFF1A${input.observedFailureSignature} !~ ${input.expectedFailureSignature}`
    );
  }
  const evidenceRefs = assertRunEvidence(
    root,
    run.run_id,
    input.evidenceRefs
  );
  transitionLifecycleRecord(record, "red_verified", TRANSITIONS);
  record.fault_model = input.faultModel;
  record.red_command = input.command;
  record.expected_failure_signature = input.expectedFailureSignature;
  record.observed_failure_signature = input.observedFailureSignature;
  record.red_evidence_refs = evidenceRefs;
  return persistNegativeControlTransition(
    root,
    record,
    "negative-control.red-verified",
    {
      command: input.command,
      expected_failure_signature: input.expectedFailureSignature,
      observed_failure_signature: input.observedFailureSignature,
      evidence_refs: evidenceRefs
    }
  );
}
function recordNegativeControlGreen(root, run, input) {
  const record = requireNegativeControlRecord(root, run.run_id);
  if (input.command !== record.red_command) {
    throw new Error(
      `Negative Control GREEN \u5FC5\u987B\u590D\u7528 RED command\uFF1A${input.command} != ${record.red_command}`
    );
  }
  const evidenceRefs = assertRunEvidence(
    root,
    run.run_id,
    input.evidenceRefs
  );
  transitionLifecycleRecord(record, "green_verified", TRANSITIONS);
  record.green_command = input.command;
  record.green_evidence_refs = evidenceRefs;
  return persistNegativeControlTransition(
    root,
    record,
    "negative-control.green-verified",
    { command: input.command, evidence_refs: evidenceRefs }
  );
}
function restoreNegativeControl(root, run, input) {
  const record = requireNegativeControlRecord(root, run.run_id);
  const evidenceRefs = assertRunEvidence(
    root,
    run.run_id,
    input.evidenceRefs
  );
  transitionLifecycleRecord(record, "restored", TRANSITIONS);
  record.restoration_evidence_refs = evidenceRefs;
  return persistNegativeControlTransition(
    root,
    record,
    "negative-control.restored",
    { evidence_refs: evidenceRefs }
  );
}
function inspectNegativeControlGate(root, runId) {
  const policy = negativeControlPolicy(root);
  const record = readNegativeControlRecord(root, runId);
  if (policy.mode === "off") {
    return {
      required: false,
      mode: "off",
      status: "not_required",
      ready: true,
      fingerprint: "off",
      message: ""
    };
  }
  if (!record) {
    return {
      required: true,
      mode: policy.mode,
      status: "missing",
      ready: false,
      fingerprint: `missing:${policy.mode}`,
      message: "Negative Control record \u7F3A\u5931"
    };
  }
  const ready = record.status === "restored" || record.status === "waived" && record.waiver && Date.parse(record.waiver.expires_at) > Date.now();
  return {
    required: true,
    mode: policy.mode,
    status: record.status,
    ready,
    revision: record.revision,
    fingerprint: [
      record.record_id,
      record.revision,
      policy.mode,
      record.status
    ].join(":"),
    message: ready ? "" : `Negative Control \u672A\u95ED\u5408\uFF1Astatus=${record.status}`
  };
}
function negativeControlPolicy(root) {
  const gates = readJson(join31(root, "policies", "gates.json"), {});
  return {
    mode: gates.dsh_lifecycle?.negative_control?.mode || "shadow",
    intake_types: gates.dsh_lifecycle?.negative_control?.intake_types || ["bug", "test_failure"]
  };
}
function requireNegativeControlRecord(root, runId) {
  const record = readNegativeControlRecord(root, runId);
  if (!record) {
    throw new Error(`run \u672A\u8981\u6C42 Negative Control\uFF1A${runId}`);
  }
  return record;
}
function assertRunEvidence(root, runId, evidenceRefs = []) {
  const refs = Array.from(new Set(evidenceRefs.filter(Boolean)));
  if (refs.length === 0) {
    throw new Error("Negative Control transition \u5FC5\u987B\u63D0\u4F9B evidence");
  }
  const artifacts = new Set(
    listArtifactsForRun(root, runId).map((artifact) => artifact.artifact_id)
  );
  for (const ref of refs) {
    if (!artifacts.has(ref)) {
      throw new Error(`Negative Control evidence \u4E0D\u5C5E\u4E8E\u5F53\u524D run\uFF1A${ref}`);
    }
  }
  return refs;
}
function persistNegativeControlTransition(root, record, eventType, payload) {
  const event = appendEvent(root, eventType, "apex-v2", {
    run_id: record.run_id,
    record_id: record.record_id,
    revision: record.revision,
    status: record.status,
    ...payload
  });
  bindLifecycleEvent(record, event);
  writeNegativeControlRecord(root, record);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return record;
}
function writeNegativeControlRecord(root, record) {
  writeJson(
    join31(root, "runs", record.run_id, "negative-control.json"),
    record
  );
}

// src/core/decision-notes.mjs
import { createHash as createHash9 } from "node:crypto";
import { join as join32, resolve as resolve15 } from "node:path";
function listDecisionNotes(root, filters = {}) {
  return readJson(join32(root, "decisions", "index.json"), []).filter((note) => !filters.runId || note.run_id === filters.runId).filter((note) => !filters.status || note.status === filters.status).sort(
    (left, right) => String(left.created_at).localeCompare(String(right.created_at))
  );
}
function getDecisionNote(root, decisionId) {
  const note = listDecisionNotes(root).find(
    (item) => item.decision_id === decisionId
  );
  if (!note) throw new Error(`\u627E\u4E0D\u5230 Decision Note\uFF1A${decisionId}`);
  return note;
}
function ensureDecisionNoteProposal(root, run, plan) {
  const policy = decisionNotePolicy(root);
  if (policy.mode === "off" || policy.auto_propose !== true || !policy.workflows.includes(plan.method_pack?.workflow) || !policy.risk_levels.includes(maxPlanRisk(plan))) {
    return null;
  }
  return withProjectLock(resolve15(root, ".."), () => {
    const existing = listDecisionNotes(root, { runId: run.run_id }).find((note) => note.trigger === "high_risk_plan");
    if (existing) return existing;
    return proposeDecisionNote(root, run, {
      mode: policy.mode,
      trigger: "high_risk_plan",
      sourceIntakeId: plan.source_intake_id,
      title: `Decision\uFF1A${plan.source_title}`,
      scope: plan.affected_area || "project",
      rationale: plan.strategy,
      options: [
        {
          option_id: "generated-plan",
          summary: "\u6309\u5F53\u524D PlanGraph \u548C Method Pack \u5B9E\u65BD\u3002",
          tradeoffs: ["\u4FDD\u7559\u5F53\u524D evidence\u3001verification \u548C rollback \u8FB9\u754C\u3002"]
        },
        {
          option_id: "replan",
          summary: "\u6682\u505C\u6267\u884C\u5E76\u91CD\u65B0\u89C4\u5212\u3002",
          tradeoffs: ["\u589E\u52A0\u4E00\u6B21\u89C4\u5212\u5F80\u8FD4\uFF0C\u4F46\u907F\u514D\u9AD8\u98CE\u9669\u65B9\u6848\u76F4\u63A5\u8FDB\u5165\u5B9E\u73B0\u3002"]
        }
      ],
      proposedOption: "generated-plan",
      refs: [
        `.apex-v2/runs/${run.run_id}/plan-graph.json`,
        `.apex-v2/intake/items.json#${plan.source_intake_id}`
      ]
    });
  });
}
function proposeDecisionNote(root, run, input) {
  const timestamp = now();
  const artifact = createArtifact(root, run, "plan_graph", {
    type: "decision",
    title: input.title,
    body: renderDecisionBody(input),
    refs: input.refs || [],
    timestamp
  });
  const note = initializeLifecycleRecord({
    schema_version: SCHEMA_VERSION,
    decision_id: shortId("decision"),
    run_id: run.run_id,
    source_intake_id: input.sourceIntakeId || null,
    mode: (input.mode || decisionNotePolicy(root).mode) === "enforce" ? "enforce" : "shadow",
    trigger: input.trigger || "manual",
    status: "proposed",
    title: input.title,
    scope: input.scope,
    rationale: input.rationale,
    options: input.options,
    proposed_option: input.proposedOption,
    artifact_id: artifact.artifact_id,
    artifact_sha256: createHash9("sha256").update(JSON.stringify(artifact)).digest("hex"),
    accepted_by: null,
    accepted_at: null,
    approval_id: null,
    supersedes: null,
    superseded_by: null,
    implementation_refs: [],
    candidate_digest: null,
    verification_refs: [],
    archived_at: null
  }, timestamp);
  const event = appendEvent(root, "decision.proposed", "apex-v2", {
    decision_id: note.decision_id,
    run_id: note.run_id,
    artifact_id: note.artifact_id,
    mode: note.mode,
    trigger: note.trigger
  });
  bindLifecycleEvent(note, event);
  const path = join32(root, "decisions", "index.json");
  ensureDir(join32(root, "decisions"));
  const notes = readJson(path, []);
  notes.push(note);
  writeJson(path, notes);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return note;
}
function decisionNotePolicy(root) {
  const gates = readJson(join32(root, "policies", "gates.json"), {});
  return {
    mode: gates.dsh_lifecycle?.decision_note?.mode || "shadow",
    auto_propose: gates.dsh_lifecycle?.decision_note?.auto_propose !== false,
    risk_levels: gates.dsh_lifecycle?.decision_note?.risk_levels || ["high", "critical"],
    workflows: gates.dsh_lifecycle?.decision_note?.workflows || ["governed"]
  };
}
function maxPlanRisk(plan) {
  const order = ["low", "medium", "high", "critical"];
  return (plan.nodes || []).reduce(
    (highest, node) => order.indexOf(node.risk) > order.indexOf(highest) ? node.risk : highest,
    "low"
  );
}
function renderDecisionBody(input) {
  return [
    input.rationale,
    "",
    "## Options",
    ...input.options.flatMap((option) => [
      `### ${option.option_id}: ${option.summary}`,
      ...option.tradeoffs.map((item) => `- ${item}`)
    ]),
    "",
    `Proposed option: ${input.proposedOption}`
  ].join("\n");
}

// src/commands/run.mjs
function handleRunCommand(subcommand, args) {
  if (subcommand === "create") {
    createRun(args);
    return;
  }
  if (subcommand === "show") {
    showRun(args);
    return;
  }
  if (subcommand === "node") {
    handleRunNode(args);
    return;
  }
  if (subcommand === "plan") {
    handleRunPlan(args);
    return;
  }
  if (subcommand === "carry") {
    handleRunCarry(args);
    return;
  }
  throw new Error(`\u672A\u77E5 run \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function handleRunPlan(args) {
  const action = args._[0];
  if (action === "generate") {
    generateRunPlan(args);
    return;
  }
  if (action === "show") {
    showRunPlan(args);
    return;
  }
  if (action === "validate") {
    validateRunPlanCommand(args);
    return;
  }
  throw new Error(`\u672A\u77E5 run plan \u52A8\u4F5C\uFF1A${action || "(\u7A7A)"}`);
}
function generateRunPlan(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const generated = generateRunPlanInternal(root, run);
  console.log(JSON.stringify(generated, null, 2));
}
function generateRunPlanInternal(root, run) {
  requirePassedNode(run, "mandate");
  requirePassedNode(run, "context");
  const timestamp = now();
  const projectDir = resolve16(root, "..");
  const inventory = buildProjectInventory(projectDir);
  const plan = buildTaskPlanGraph(root, run, timestamp, inventory);
  const validation = validatePlanGraph(plan);
  if (validation.errors.length > 0) {
    throw new Error(`\u751F\u6210\u7684 plan graph \u65E0\u6548\uFF1A${validation.errors.join("; ")}`);
  }
  const runDir = join33(root, "runs", run.run_id);
  writeJson(join33(runDir, "plan-graph.json"), plan);
  writeFileSync11(join33(runDir, "PLAN_GRAPH.md"), renderPlanGraphMarkdown(plan));
  const artifact = createArtifact(root, run, "plan_graph", {
    type: "plan",
    title: `PlanGraph\uFF1A${plan.source_title}`,
    body: `\u5DF2\u6839\u636E intake ${plan.source_intake_id} \u751F\u6210 ${plan.nodes.length} \u4E2A\u4EFB\u52A1\u8282\u70B9\u3001${plan.parallel_lanes.length} \u6761\u5E76\u884C lane\u3001${plan.edges.length} \u6761\u4F9D\u8D56\u8FB9\u3002`,
    refs: [
      `.apex-v2/runs/${run.run_id}/plan-graph.json`,
      `.apex-v2/runs/${run.run_id}/PLAN_GRAPH.md`,
      ".apex-v2/knowledge/index.md",
      ".apex-v2/knowledge/task-to-file-map.md",
      ".apex-v2/knowledge/danger-zones.md"
    ],
    timestamp
  });
  const negativeControl = ensureNegativeControlRecord(root, run, plan);
  const decisionNote = ensureDecisionNoteProposal(root, run, plan);
  const event = appendEvent(root, "run.plan.generated", "apex-v2", {
    run_id: run.run_id,
    plan_id: plan.plan_id,
    artifact_id: artifact.artifact_id,
    node_count: plan.nodes.length,
    negative_control_record_id: negativeControl?.record_id || null,
    decision_id: decisionNote?.decision_id || null
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    plan,
    artifact_id: artifact.artifact_id,
    validation,
    negative_control: negativeControl,
    decision_note: decisionNote
  };
}
function showRunPlan(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  const plan = readJson(join33(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`\u627E\u4E0D\u5230 plan graph\uFF1A${runId}`);
  console.log(JSON.stringify(plan, null, 2));
}
function validateRunPlanCommand(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  const plan = readJson(join33(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`\u627E\u4E0D\u5230 plan graph\uFF1A${runId}`);
  const validation = validatePlanGraph(plan);
  if (validation.errors.length > 0) {
    for (const error of validation.errors) console.error(`- ${error}`);
    throw new Error(`plan graph \u6821\u9A8C\u5931\u8D25\uFF0C\u5171 ${validation.errors.length} \u4E2A\u95EE\u9898`);
  }
  console.log(JSON.stringify(validation, null, 2));
}
function createRun(args) {
  const root = requireStore(projectRoot(args));
  const roadmapId = required(args, "roadmap-id");
  const run = createRunForRoadmapNode(root, roadmapId, now());
  console.log(JSON.stringify(run, null, 2));
}
function createRunForRoadmapNode(root, roadmapId, timestamp) {
  return withProjectTransaction(resolve16(root, ".."), {
    kind: "run-create",
    idempotencyKey: `run-create:${roadmapId}`
  }, () => createRunForRoadmapNodeTransaction(root, roadmapId, timestamp)).result;
}
function createRunForRoadmapNodeTransaction(root, roadmapId, timestamp) {
  const roadmapPath = join33(root, "roadmap", "graph.json");
  const graph = readJson(roadmapPath);
  const node = graph.nodes.find((entry) => entry.id === roadmapId);
  if (!node) throw new Error(`\u627E\u4E0D\u5230 roadmap node\uFF1A${roadmapId}`);
  if (!["ready", "active"].includes(node.status)) {
    throw new Error(`roadmap node \u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u521B\u5EFA run\uFF1A${node.status}`);
  }
  const projectPath = join33(root, "project.json");
  const project = readJson(projectPath);
  if (project.active_runs.length >= project.wip_limits.active_runs) {
    throw new Error(`active run \u6570\u91CF\u5DF2\u8FBE\u5230 WIP \u9650\u5236\uFF1A${project.wip_limits.active_runs}`);
  }
  const runId = shortId("run");
  const runDir = join33(root, "runs", runId);
  ensureDir(runDir);
  ensureDir(join33(root, "artifacts", runId));
  const run = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    roadmap_node_id: roadmapId,
    status: "planned",
    context_snapshot: {
      knowledge_version: project.knowledge_version,
      files: KNOWLEDGE_FILES.map(([name]) => `knowledge/${name}`)
    },
    nodes: [
      createRunNode("mandate"),
      createRunNode("context"),
      createRunNode("plan_graph"),
      createRunNode("execute"),
      createRunNode("verify"),
      createRunNode("review"),
      createRunNode("integrate"),
      createRunNode("learn")
    ],
    carry_forward: [],
    gate: {
      status: "PARTIAL_PASS",
      reason: "run \u5DF2\u521B\u5EFA\uFF0C\u7B49\u5F85 mandate node \u542F\u52A8\u3002",
      blocking: []
    },
    created_at: timestamp,
    updated_at: timestamp
  };
  writeJson(join33(runDir, "run.json"), run);
  writeTextIfMissing(join33(runDir, "HANDOFF.md"), runHandoffTemplate(run));
  node.status = "active";
  node.updated_at = timestamp;
  graph.updated_at = timestamp;
  writeJson(roadmapPath, graph);
  updateProject(root, {
    active_runs: [...project.active_runs, runId],
    updated_at: timestamp
  }, { expectedRevision: project.revision });
  const event = appendEvent(root, "run.created", "apex-v2", { run_id: runId, roadmap_node_id: roadmapId });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return run;
}
function showRun(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  console.log(JSON.stringify(run, null, 2));
}
function handleRunNode(args) {
  const action = args._[0];
  if (action === "start") {
    startRunNode(args);
    return;
  }
  if (action === "complete") {
    completeRunNode(args);
    return;
  }
  if (action === "fail") {
    failRunNode(args);
    return;
  }
  if (action === "escalate") {
    escalateRunNode(args);
    return;
  }
  throw new Error(`\u672A\u77E5 run node \u52A8\u4F5C\uFF1A${action || "(\u7A7A)"}`);
}
function startRunNode(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const node = getRunNode(run, required(args, "node-id"));
  if (!["pending", "failed_rework", "failed_replan", "escalated"].includes(node.status)) {
    throw new Error(`\u8282\u70B9\u5F53\u524D\u72B6\u6001\u4E0D\u53EF start\uFF1A${node.id}=${node.status}`);
  }
  const timestamp = now();
  node.status = "active";
  node.started_at = node.started_at || timestamp;
  node.completed_at = null;
  node.gate = null;
  run.status = "active";
  run.updated_at = timestamp;
  writeRun(root, run);
  const event = appendEvent(root, "run.node.started", "apex-v2", { run_id: run.run_id, node_id: node.id });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify(run, null, 2));
}
function completeRunNode(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const node = getRunNode(run, required(args, "node-id"));
  const gateStatus = normalizeEnum(args.gate || "PASS", ["PASS", "PARTIAL_PASS", "FAIL_REWORK", "FAIL_REPLAN", "ESCALATE", "HALT"], "gate");
  const evidenceRefs = splitList(args.evidence);
  const reason = String(args.reason || "");
  const carryDescriptions = splitList(args["carry-forward"]);
  if (!["active", "pending", "failed_rework", "failed_replan", "escalated"].includes(node.status)) {
    throw new Error(`\u8282\u70B9\u5F53\u524D\u72B6\u6001\u4E0D\u53EF complete\uFF1A${node.id}=${node.status}`);
  }
  if (["PASS", "PARTIAL_PASS"].includes(gateStatus) && evidenceRefs.length === 0) {
    throw new Error(`${gateStatus} gate \u5FC5\u987B\u63D0\u4F9B --evidence\uFF0C\u4E14 evidence \u5FC5\u987B\u5F15\u7528\u5DF2\u63D0\u4EA4 artifact`);
  }
  if (gateStatus === "PARTIAL_PASS" && carryDescriptions.length === 0) {
    throw new Error("PARTIAL_PASS \u5FC5\u987B\u63D0\u4F9B --carry-forward");
  }
  for (const artifactId of evidenceRefs) {
    assertArtifact(root, run.run_id, artifactId, node.id);
  }
  const timestamp = now();
  node.status = gateToNodeStatus(gateStatus);
  node.completed_at = timestamp;
  node.evidence_refs = evidenceRefs;
  const carryForward = gateStatus === "PARTIAL_PASS" ? carryDescriptions.map((description) => ({
    id: shortId("carry"),
    source_node_id: node.id,
    description,
    severity: normalizeEnum(args["carry-severity"] || "medium", ["low", "medium", "high", "critical"], "carry-severity"),
    target_node_id: args["carry-target"] ? String(args["carry-target"]) : nextRunNodeId(run, node.id),
    status: "open",
    resolution: "",
    resolved_by: null,
    evidence_refs: evidenceRefs,
    created_at: timestamp,
    updated_at: timestamp
  })) : [];
  run.carry_forward = [...run.carry_forward || [], ...carryForward];
  for (const carry of carryForward) syncCarryRisk(root, run.run_id, carry);
  node.gate = {
    status: gateStatus,
    reason,
    blocking: splitList(args.blocking),
    carry_forward_ids: carryForward.map((item) => item.id)
  };
  run.updated_at = timestamp;
  run.gate = node.gate;
  if (gateStatus === "HALT") haltRun(root, run, timestamp);
  else closeRunIfComplete(root, run);
  writeRun(root, run);
  const nodeEvent = appendEvent(root, "run.node.completed", "apex-v2", {
    run_id: run.run_id,
    node_id: node.id,
    gate: gateStatus,
    evidence_refs: evidenceRefs,
    carry_forward_ids: carryForward.map((item) => item.id)
  });
  const event = gateStatus === "HALT" ? appendEvent(root, "run.halted", "apex-v2", {
    run_id: run.run_id,
    roadmap_node_id: run.roadmap_node_id,
    node_id: node.id,
    reason
  }) : nodeEvent;
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  if (gateStatus !== "HALT") recordRunClosure(root, run, "run.node.complete");
  console.log(JSON.stringify(run, null, 2));
}
function nextRunNodeId(run, nodeId) {
  const index = run.nodes.findIndex((node) => node.id === nodeId);
  return index >= 0 && index < run.nodes.length - 1 ? run.nodes[index + 1].id : null;
}
function handleRunCarry(args) {
  const action = args._[0];
  if (action === "list") {
    const root = requireStore(projectRoot(args));
    const run = loadRun(root, required(args, "run-id"));
    console.log(JSON.stringify(run.carry_forward || [], null, 2));
    return;
  }
  if (action === "resolve" || action === "accept") {
    updateRunCarry(args, action);
    return;
  }
  throw new Error(`\u672A\u77E5 run carry \u52A8\u4F5C\uFF1A${action || "(\u7A7A)"}`);
}
function updateRunCarry(args, action) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const carryId = required(args, "id");
  const carry = (run.carry_forward || []).find((item) => item.id === carryId);
  if (!carry) throw new Error(`\u627E\u4E0D\u5230 carry-forward\uFF1A${carryId}`);
  if (carry.status !== "open") throw new Error(`carry-forward \u5DF2\u5904\u7406\uFF1A${carryId}=${carry.status}`);
  const evidenceRefs = splitList(args.evidence);
  if (action === "resolve" && evidenceRefs.length === 0) {
    throw new Error("resolve carry-forward \u5FC5\u987B\u63D0\u4F9B --evidence");
  }
  const artifacts = listArtifactsForRun(root, run.run_id);
  for (const artifactId of evidenceRefs) {
    if (!artifacts.some((artifact) => artifact.artifact_id === artifactId)) {
      throw new Error(`carry-forward evidence \u4E0D\u5C5E\u4E8E\u5F53\u524D run\uFF1A${artifactId}`);
    }
  }
  carry.status = action === "resolve" ? "resolved" : "accepted";
  carry.resolution = String(args.reason || (action === "resolve" ? "evidence resolved" : "human accepted residual risk"));
  carry.resolved_by = action === "resolve" ? "evidence" : "human";
  carry.evidence_refs = Array.from(/* @__PURE__ */ new Set([...carry.evidence_refs, ...evidenceRefs]));
  carry.updated_at = now();
  syncCarryRisk(root, run.run_id, carry);
  const promotedNode = promoteHandledCarrySource(run, carry.source_node_id, carry.updated_at);
  const remainingOpenCarryIds = (run.carry_forward || []).filter((item) => item.status === "open").map((item) => item.id);
  run.updated_at = carry.updated_at;
  closeRunIfComplete(root, run);
  writeRun(root, run);
  const carryEvent = appendEvent(root, "run.carry.updated", "apex-v2", {
    run_id: run.run_id,
    carry_id: carry.id,
    status: carry.status,
    evidence_refs: evidenceRefs,
    source_node_id: carry.source_node_id,
    source_node_promoted: Boolean(promotedNode),
    remaining_open_carry_ids: remainingOpenCarryIds
  });
  const event = promotedNode ? appendEvent(root, "run.node.completed", "apex-v2", {
    run_id: run.run_id,
    node_id: promotedNode.id,
    gate: "PASS",
    evidence_refs: promotedNode.evidence_refs,
    carry_forward_ids: promotedNode.gate.carry_forward_ids,
    via: "carry-forward"
  }) : carryEvent;
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  recordRunClosure(root, run, "run.carry");
  console.log(JSON.stringify({ run, carry }, null, 2));
}
function failRunNode(args) {
  const mode = normalizeEnum(args.mode || "rework", ["rework", "replan"], "mode");
  const gate = mode === "replan" ? "FAIL_REPLAN" : "FAIL_REWORK";
  completeRunNode({
    ...args,
    gate,
    reason: args.reason || `\u8282\u70B9\u5931\u8D25\uFF0C\u9700\u8981 ${mode}\u3002`
  });
}
function escalateRunNode(args) {
  completeRunNode({
    ...args,
    gate: "ESCALATE",
    reason: args.reason || "\u8282\u70B9\u9700\u8981\u4EBA\u5DE5\u51B3\u7B56\u3002"
  });
}
function gateToNodeStatus(gateStatus) {
  return {
    PASS: "passed",
    PARTIAL_PASS: "partial_pass",
    FAIL_REWORK: "failed_rework",
    FAIL_REPLAN: "failed_replan",
    ESCALATE: "escalated",
    HALT: "halted"
  }[gateStatus];
}

// src/commands/artifact.mjs
function handleArtifactCommand(subcommand, args) {
  if (subcommand === "submit") {
    submitArtifact(args);
    return;
  }
  if (subcommand === "list") {
    listArtifacts(args);
    return;
  }
  throw new Error(`\u672A\u77E5 artifact \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function submitArtifact(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const nodeId = required(args, "node-id");
  getRunNode(run, nodeId);
  const timestamp = now();
  const artifact = createArtifact(root, run, nodeId, {
    type: normalizeEnum(args.type || "evidence", ["evidence", "patch", "plan", "review", "test", "decision", "note"], "type"),
    title: required(args, "title"),
    body: String(args.body || ""),
    refs: splitList(args.refs),
    timestamp
  });
  const event = appendEvent(root, "artifact.submitted", "apex-v2", {
    run_id: run.run_id,
    node_id: nodeId,
    artifact_id: artifact.artifact_id,
    type: artifact.type
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify(artifact, null, 2));
}
function listArtifacts(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  const run = loadRun(root, runId);
  console.log(JSON.stringify(listArtifactsForRun(root, run.run_id), null, 2));
}

// src/commands/governance.mjs
import { join as join34, resolve as resolve17 } from "node:path";
function handleContractsCommand(subcommand, args) {
  const projectDir = projectRoot(args);
  requireStore(projectDir);
  if (subcommand === "validate") {
    const report = scanProjectContracts(projectDir);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
    return;
  }
  if (subcommand === "migrate") {
    const report = migrateLegacyContracts(projectDir, Boolean(args.apply));
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 contracts \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function handleApprovalCommand(subcommand, args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  if (subcommand === "list") {
    console.log(JSON.stringify(readJson(join34(root, "approvals", "items.json"), []), null, 2));
    return;
  }
  if (subcommand === "decide") {
    const decision = normalizeEnum(required(args, "decision"), ["approved", "rejected"], "decision");
    const approvalId = required(args, "id");
    const approvalItem = readJson(join34(root, "approvals", "items.json"), []).find((item) => item.id === approvalId);
    if (!approvalItem) throw new Error(`\u627E\u4E0D\u5230 approval\uFF1A${approvalId}`);
    const approval = withProjectTransaction(resolve17(projectDir), {
      kind: "approval-decide",
      idempotencyKey: `approval-decide:${approvalId}:${decision}:${approvalItem.revision || 1}`
    }, () => {
      const decided = decideApproval(root, approvalId, decision, String(args.reason || ""), {
        actor: String(args.actor || "human"),
        capabilities: args.capabilities ? splitList(args.capabilities) : [approvalItem.capability]
      });
      const event = appendEvent(root, "approval.decided", "human", {
        approval_id: decided.id,
        decision,
        capability: decided.capability,
        candidate_digest: decided.candidate_digest,
        decided_by: decided.decided_by
      });
      updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
      return decided;
    }).result;
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 approval \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function handleRiskCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  if (subcommand === "list") {
    console.log(JSON.stringify(listRisks(root, args.status ? String(args.status) : null), null, 2));
    return;
  }
  if (subcommand === "add") {
    const risk = addRisk(root, {
      source: "manual",
      title: required(args, "title"),
      description: String(args.description || ""),
      severity: normalizeEnum(args.severity || "medium", ["low", "medium", "high", "critical"], "severity"),
      owner: String(args.owner || "human"),
      evidence_refs: splitList(args.evidence)
    });
    console.log(JSON.stringify(risk, null, 2));
    return;
  }
  if (subcommand === "update") {
    const risk = updateRisk(
      root,
      required(args, "id"),
      normalizeEnum(required(args, "status"), ["open", "mitigated", "accepted", "closed"], "status"),
      String(args.reason || "")
    );
    console.log(JSON.stringify(risk, null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 risk \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function handleNotificationCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  if (subcommand === "list") {
    console.log(JSON.stringify(listNotifications(root, args.status ? String(args.status) : null), null, 2));
    return;
  }
  if (subcommand === "acknowledge") {
    const notification = acknowledgeNotification(root, required(args, "id"), String(args.reason || ""));
    console.log(JSON.stringify(notification, null, 2));
    return;
  }
  if (subcommand === "dispatch") {
    console.log(JSON.stringify(dispatchNotifications(root, {
      force: Boolean(args.force)
    }), null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 notification \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}

// src/core/spec-adapter.mjs
import {
  existsSync as existsSync23,
  readFileSync as readFileSync17,
  readdirSync as readdirSync14,
  realpathSync as realpathSync4,
  statSync as statSync4
} from "node:fs";
import { createHash as createHash10 } from "node:crypto";
import {
  basename as basename6,
  dirname as dirname8,
  extname,
  isAbsolute,
  join as join35,
  relative as relative6,
  resolve as resolve18,
  sep as sep3
} from "node:path";
var SUPPORTED_FORMATS = /* @__PURE__ */ new Set(["native", "openspec", "spec-kit"]);
var MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown"]);
var IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([".git", ".apex-v2", "node_modules"]);
var DESCRIPTION_HEADINGS = /* @__PURE__ */ new Set([
  "description",
  "overview",
  "summary",
  "problem",
  "proposal",
  "specification",
  "\u63CF\u8FF0",
  "\u6982\u8FF0",
  "\u6458\u8981",
  "\u80CC\u666F",
  "\u65B9\u6848"
]);
var COMMAND_HEADINGS = /* @__PURE__ */ new Set([
  "acceptance",
  "acceptance commands",
  "verification",
  "verification commands",
  "validation",
  "validation commands",
  "test commands",
  "\u9A8C\u6536",
  "\u9A8C\u6536\u547D\u4EE4",
  "\u9A8C\u8BC1",
  "\u9A8C\u8BC1\u547D\u4EE4",
  "\u6D4B\u8BD5\u547D\u4EE4"
]);
var EVIDENCE_HEADINGS = /* @__PURE__ */ new Set([
  "evidence",
  "evidence refs",
  "evidence references",
  "references",
  "artifacts",
  "supporting files",
  "\u8BC1\u636E",
  "\u8BC1\u636E\u5F15\u7528",
  "\u53C2\u8003",
  "\u4EA7\u7269"
]);
var AFFECTED_AREA_HEADINGS = /* @__PURE__ */ new Set([
  "affected area",
  "affected areas",
  "affected component",
  "affected components",
  "scope",
  "\u5F71\u54CD\u8303\u56F4",
  "\u5F71\u54CD\u533A\u57DF",
  "\u5F71\u54CD\u7EC4\u4EF6"
]);
function normalizeSpecSource(projectDir, input = {}) {
  const projectRoot2 = resolveExistingProjectRoot(projectDir);
  const requestedPath = String(input.path || "").trim();
  if (!requestedPath) throw new Error("Spec path \u4E0D\u80FD\u4E3A\u7A7A");
  const requestedFormat = normalizeFormat(input.format || "auto");
  const sourcePath = resolveSourcePath(projectRoot2, requestedPath);
  const sourceStat = statSync4(sourcePath);
  const kind = sourceStat.isDirectory() ? "directory" : sourceStat.isFile() ? "file" : null;
  if (!kind) throw new Error(`Spec source \u4E0D\u662F\u666E\u901A\u6587\u4EF6\u6216\u76EE\u5F55\uFF1A${requestedPath}`);
  const files = kind === "file" ? collectSingleMarkdownFile(projectRoot2, sourcePath) : collectMarkdownDirectory(projectRoot2, sourcePath);
  const format = requestedFormat === "auto" ? detectFormat(projectRoot2, sourcePath, files) : requestedFormat;
  assertFormatShape(format, projectRoot2, sourcePath, files);
  const documents = files.map((path) => parseDocument(projectRoot2, path));
  const primary = selectPrimaryDocument(format, documents);
  const sourceFiles = files.map((path) => projectRelative(projectRoot2, path)).sort();
  const acceptanceCommands = unique2(documents.flatMap(extractAcceptanceCommands));
  const explicitEvidence = documents.flatMap((document) => extractEvidenceRefs(
    projectRoot2,
    document
  ));
  const affectedAreas = unique2(documents.flatMap(extractAffectedAreas));
  return {
    source: `spec:${format}`,
    type: "feature",
    title: extractTitle(primary),
    description: extractDescription(primary),
    priority: "P2",
    risk: "medium",
    affected_area: affectedAreas.length > 0 ? affectedAreas.join(", ") : "unknown",
    acceptance_commands: acceptanceCommands,
    evidence_refs: unique2([...sourceFiles, ...explicitEvidence]),
    source_spec: {
      schema_version: "v0",
      format,
      path: projectRelative(projectRoot2, sourcePath) || ".",
      kind,
      files: sourceFiles,
      checksum: checksumFiles(projectRoot2, files)
    }
  };
}
function resolveExistingProjectRoot(projectDir) {
  const path = resolve18(String(projectDir || "."));
  if (!existsSync23(path)) throw new Error(`\u9879\u76EE\u6839\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${path}`);
  const real = realpathSync4(path);
  if (!statSync4(real).isDirectory()) throw new Error(`\u9879\u76EE\u6839\u76EE\u5F55\u4E0D\u662F\u76EE\u5F55\uFF1A${path}`);
  return real;
}
function normalizeFormat(value) {
  const normalized = String(value).trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "auto") return normalized;
  if (normalized === "speckit" || normalized === "spec kit") return "spec-kit";
  if (!SUPPORTED_FORMATS.has(normalized)) {
    throw new Error(`\u4E0D\u652F\u6301\u7684 Spec \u683C\u5F0F\uFF1A${value}`);
  }
  return normalized;
}
function resolveSourcePath(projectRoot2, requestedPath) {
  const lexicalPath = isAbsolute(requestedPath) ? resolve18(requestedPath) : resolve18(projectRoot2, requestedPath);
  assertInsideProject(projectRoot2, lexicalPath);
  if (!existsSync23(lexicalPath)) throw new Error(`Spec source \u4E0D\u5B58\u5728\uFF1A${requestedPath}`);
  const realPath = realpathSync4(lexicalPath);
  assertInsideProject(projectRoot2, realPath);
  return realPath;
}
function collectSingleMarkdownFile(projectRoot2, path) {
  assertMarkdownFile(path);
  assertInsideProject(projectRoot2, realpathSync4(path));
  return [realpathSync4(path)];
}
function collectMarkdownDirectory(projectRoot2, sourcePath) {
  const files = [];
  const visited = /* @__PURE__ */ new Set();
  walk(sourcePath);
  if (files.length === 0) {
    throw new Error(`Spec \u76EE\u5F55\u6CA1\u6709 Markdown \u6587\u4EF6\uFF1A${projectRelative(projectRoot2, sourcePath)}`);
  }
  return [...new Set(files)].sort((left, right) => projectRelative(projectRoot2, left).localeCompare(projectRelative(projectRoot2, right)));
  function walk(directory) {
    const realDirectory = realpathSync4(directory);
    assertInsideProject(projectRoot2, realDirectory);
    if (visited.has(realDirectory)) return;
    visited.add(realDirectory);
    for (const entry of readdirSync14(realDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const entryPath = join35(realDirectory, entry.name);
      const realEntry = realpathSync4(entryPath);
      assertInsideProject(projectRoot2, realEntry);
      const stats = statSync4(realEntry);
      if (stats.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(realEntry);
      } else if (stats.isFile() && MARKDOWN_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(realEntry);
      }
    }
  }
}
function assertMarkdownFile(path) {
  if (!MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error(`Spec Adapter \u53EA\u652F\u6301 Markdown \u6587\u4EF6\uFF1A${path}`);
  }
}
function assertInsideProject(projectRoot2, target) {
  const pathFromRoot = relative6(projectRoot2, target);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep3}`) || isAbsolute(pathFromRoot)) {
    throw new Error(`Spec source \u4F4D\u4E8E\u9879\u76EE\u6839\u76EE\u5F55\u4E4B\u5916\uFF1A${target}`);
  }
}
function detectFormat(projectRoot2, sourcePath, files) {
  const sourceRelative = projectRelative(projectRoot2, sourcePath).toLowerCase();
  const relativeFiles = files.map((path) => projectRelative(projectRoot2, path).toLowerCase());
  const basenames = new Set(relativeFiles.map((path) => basename6(path)));
  if (sourceRelative.split("/").some((part) => part === "openspec" || part === ".openspec") || relativeFiles.some((path) => path.split("/").some((part) => part === "openspec" || part === ".openspec")) || basenames.has("proposal.md")) {
    return "openspec";
  }
  if (basenames.has("spec.md") && (basenames.has("plan.md") || basenames.has("tasks.md"))) {
    return "spec-kit";
  }
  return "native";
}
function assertFormatShape(format, projectRoot2, sourcePath, files) {
  if (format === "native") return;
  const sourceRelative = projectRelative(projectRoot2, sourcePath).toLowerCase();
  const relativeFiles = files.map((path) => projectRelative(projectRoot2, path).toLowerCase());
  const basenames = new Set(relativeFiles.map((path) => basename6(path)));
  if (format === "openspec") {
    const recognized = sourceRelative.split("/").some((part) => part === "openspec" || part === ".openspec") || ["proposal.md", "design.md", "tasks.md", "spec.md"].some((name) => basenames.has(name));
    if (!recognized) {
      throw new Error("OpenSpec source \u7F3A\u5C11 proposal.md\u3001design.md\u3001tasks.md \u6216 spec.md");
    }
  }
  if (format === "spec-kit") {
    const recognized = ["spec.md", "plan.md", "tasks.md", "research.md", "quickstart.md"].some((name) => basenames.has(name));
    if (!recognized) {
      throw new Error("Spec Kit source \u7F3A\u5C11 spec.md\u3001plan.md\u3001tasks.md \u7B49\u7EA6\u5B9A\u6587\u4EF6");
    }
  }
}
function parseDocument(projectRoot2, path) {
  const buffer = readFileSync17(path);
  if (buffer.includes(0)) throw new Error(`Markdown \u6587\u4EF6\u5305\u542B\u4E8C\u8FDB\u5236\u5185\u5BB9\uFF1A${path}`);
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const { attributes, body } = parseFrontmatter(text);
  return {
    path,
    relativePath: projectRelative(projectRoot2, path),
    attributes,
    body,
    sections: parseSections(body)
  };
}
function parseFrontmatter(text) {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return { attributes: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return { attributes: {}, body: normalized };
  const attributes = {};
  const lines2 = normalized.slice(4, end).split("\n");
  let currentKey = null;
  let blockStyle = null;
  let blockLines = [];
  const flushBlock = () => {
    if (!currentKey || !blockStyle) return;
    attributes[currentKey] = blockStyle === ">" ? blockLines.map((line) => line.trim()).join(" ").trim() : blockLines.join("\n").trim();
    blockStyle = null;
    blockLines = [];
  };
  for (const line of lines2) {
    const property = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (property) {
      flushBlock();
      currentKey = property[1].toLowerCase().replaceAll("-", "_");
      const rawValue = (property[2] || "").trim();
      if (rawValue === "|" || rawValue === ">") {
        blockStyle = rawValue;
        blockLines = [];
      } else if (!rawValue) {
        attributes[currentKey] = [];
      } else {
        attributes[currentKey] = parseFrontmatterValue(rawValue);
      }
      continue;
    }
    if (blockStyle && /^\s+/.test(line)) {
      blockLines.push(line.replace(/^\s{1,4}/, ""));
      continue;
    }
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (currentKey && listItem) {
      if (!Array.isArray(attributes[currentKey])) attributes[currentKey] = [];
      attributes[currentKey].push(unquote(listItem[1].trim()));
    }
  }
  flushBlock();
  return {
    attributes,
    body: normalized.slice(end + 5)
  };
}
function parseFrontmatterValue(rawValue) {
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) return parsed.map((value) => String(value));
    } catch {
      return rawValue.slice(1, -1).split(",").map((value) => unquote(value.trim()));
    }
  }
  return unquote(rawValue);
}
function parseSections(body) {
  const lines2 = body.replaceAll("\r\n", "\n").split("\n");
  const sections = [];
  let current = { heading: "", level: 0, lines: [] };
  for (const line of lines2) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      sections.push({
        heading: normalizeHeading(current.heading),
        rawHeading: current.heading,
        level: current.level,
        body: current.lines.join("\n").trim()
      });
      current = {
        heading: cleanInline(heading[2]),
        level: heading[1].length,
        lines: []
      };
    } else {
      current.lines.push(line);
    }
  }
  sections.push({
    heading: normalizeHeading(current.heading),
    rawHeading: current.heading,
    level: current.level,
    body: current.lines.join("\n").trim()
  });
  return sections;
}
function selectPrimaryDocument(format, documents) {
  const priorities = format === "openspec" ? ["proposal.md", "spec.md", "design.md", "tasks.md"] : format === "spec-kit" ? ["spec.md", "plan.md", "tasks.md", "research.md", "quickstart.md"] : ["readme.md", "spec.md"];
  return [...documents].sort((left, right) => {
    const leftRank = documentRank(left, priorities);
    const rightRank = documentRank(right, priorities);
    return leftRank - rightRank || left.relativePath.localeCompare(right.relativePath);
  })[0];
}
function documentRank(document, priorities) {
  const index = priorities.indexOf(basename6(document.path).toLowerCase());
  return index === -1 ? priorities.length : index;
}
function extractTitle(document) {
  const explicit = firstString(document.attributes.title);
  if (explicit) return cleanInline(explicit);
  const heading = document.sections.find((section) => section.level === 1)?.rawHeading;
  if (heading) return cleanInline(heading);
  const stem = basename6(document.path, extname(document.path)).replace(/^\d+[-_]?/, "").replaceAll(/[-_]+/g, " ").trim();
  return stem ? stem[0].toUpperCase() + stem.slice(1) : "Untitled spec";
}
function extractDescription(document) {
  const explicit = firstString(document.attributes.description);
  if (explicit) return cleanMarkdownText(explicit);
  const section = document.sections.find((entry) => DESCRIPTION_HEADINGS.has(entry.heading) && cleanMarkdownText(entry.body));
  if (section) return cleanMarkdownText(section.body);
  const preamble = document.sections.find((entry) => entry.level === 0);
  const fallback = firstParagraph(preamble?.body || "");
  if (fallback) return cleanMarkdownText(fallback);
  const firstContent = document.sections.find((entry) => entry.level > 0 && !COMMAND_HEADINGS.has(entry.heading) && cleanMarkdownText(entry.body));
  return firstContent ? cleanMarkdownText(firstParagraph(firstContent.body)) : "";
}
function extractAcceptanceCommands(document) {
  const frontmatter = [
    ...asList(document.attributes.acceptance_commands),
    ...asList(document.attributes.verification_commands),
    ...asList(document.attributes.test_commands)
  ];
  const sections = document.sections.filter((section) => COMMAND_HEADINGS.has(section.heading)).flatMap((section) => commandsFromSection(section.body));
  return unique2([...frontmatter, ...sections].map(cleanCommand).filter(Boolean));
}
function commandsFromSection(body) {
  const commands = [];
  const fenced = /```(?:bash|sh|shell|zsh|console)?\s*\n([\s\S]*?)```/gi;
  let match;
  while ((match = fenced.exec(body)) !== null) {
    commands.push(...match[1].split("\n"));
  }
  const withoutFences = body.replace(fenced, "");
  for (const line of withoutFences.split("\n")) {
    const listItem = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
    const prompt = line.match(/^\s*\$\s+(.+)$/);
    if (!listItem && !prompt) continue;
    const value = listItem?.[1] || prompt?.[1] || "";
    const inlineCode = [...value.matchAll(/`([^`]+)`/g)].map((entry) => entry[1]);
    commands.push(...inlineCode.length > 0 ? inlineCode : [value]);
  }
  return commands;
}
function cleanCommand(value) {
  const command = cleanInline(String(value)).replace(/^\$\s+/, "").trim();
  if (!command || command.startsWith("#")) return "";
  return command;
}
function extractEvidenceRefs(projectRoot2, document) {
  const refs = [
    ...asList(document.attributes.evidence_refs),
    ...asList(document.attributes.evidence)
  ];
  for (const section of document.sections.filter((entry) => EVIDENCE_HEADINGS.has(entry.heading))) {
    refs.push(...valuesFromSection(section.body, true));
  }
  return unique2(refs.map((ref) => normalizeEvidenceRef(
    projectRoot2,
    dirname8(document.path),
    ref
  )).filter(Boolean));
}
function normalizeEvidenceRef(projectRoot2, documentDir, value) {
  let ref = cleanInline(String(value)).trim();
  const markdownLink = ref.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  if (markdownLink) ref = markdownLink[1].trim();
  if (!ref || ref.startsWith("#")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return ref;
  const candidate = isAbsolute(ref) ? resolve18(ref) : ref.startsWith(".") ? resolve18(documentDir, ref) : resolve18(projectRoot2, ref);
  assertInsideProject(projectRoot2, candidate);
  return projectRelative(projectRoot2, candidate);
}
function extractAffectedAreas(document) {
  const values = [
    ...asList(document.attributes.affected_area),
    ...asList(document.attributes.affected_areas),
    ...asList(document.attributes.affected_components)
  ];
  for (const section of document.sections.filter((entry) => AFFECTED_AREA_HEADINGS.has(entry.heading))) {
    values.push(...valuesFromSection(section.body));
  }
  return unique2(values.flatMap(splitCommaSeparated).map(cleanInline).filter(Boolean));
}
function valuesFromSection(body, preserveMarkdownLinks = false) {
  const values = [];
  for (const line of body.split("\n")) {
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (!item) continue;
    let value = item[1].trim();
    if (!preserveMarkdownLinks) value = value.replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1");
    values.push(value);
  }
  return values;
}
function checksumFiles(projectRoot2, files) {
  const hash = createHash10("sha256");
  for (const path of [...files].sort((left, right) => projectRelative(projectRoot2, left).localeCompare(projectRelative(projectRoot2, right)))) {
    const contents = readFileSync17(path);
    hash.update(projectRelative(projectRoot2, path));
    hash.update("\0");
    hash.update(String(contents.byteLength));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return splitCommaSeparated(String(value));
}
function splitCommaSeparated(value) {
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}
function firstString(value) {
  return asList(value)[0] || "";
}
function firstParagraph(value) {
  return String(value).split(/\n\s*\n/).find((part) => cleanMarkdownText(part)) || "";
}
function normalizeHeading(value) {
  return cleanInline(value).toLowerCase().replace(/[:：]+$/, "").trim();
}
function cleanInline(value) {
  let text = unquote(String(value)).trim();
  for (const marker of ["`", "**", "__", "~~"]) {
    if (text.length > marker.length * 2 && text.startsWith(marker) && text.endsWith(marker)) {
      text = text.slice(marker.length, -marker.length).trim();
      break;
    }
  }
  return text;
}
function cleanMarkdownText(value) {
  return String(value).replace(/```[\s\S]*?```/g, " ").replace(/^#{1,6}\s+/gm, "").replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/~~([^~]+)~~/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}
function unquote(value) {
  const text = String(value).trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function unique2(values) {
  return [...new Set(values)];
}
function projectRelative(projectRoot2, path) {
  return relative6(projectRoot2, path).split(sep3).join("/");
}

// src/commands/intake-roadmap.mjs
function handleIntakeCommand(subcommand, args) {
  if (subcommand === "add") {
    addIntake(args);
    return;
  }
  if (subcommand === "list") {
    listIntake(args);
    return;
  }
  if (subcommand === "triage") {
    triageIntake(args);
    return;
  }
  if (subcommand === "import-spec") {
    importSpec(args);
    return;
  }
  throw new Error(`\u672A\u77E5 intake \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function importSpec(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const normalized = normalizeSpecSource(projectDir, {
    format: args.format || "auto",
    path: required(args, "path")
  });
  const item = addIntakeItem(root, {
    source: normalized.source,
    type: args.type || normalized.type,
    title: args.title || normalized.title,
    description: normalized.description,
    priority: args.priority || normalized.priority,
    risk: args.risk || normalized.risk,
    area: normalized.affected_area,
    "method-pack": args["method-pack"],
    "acceptance-json": JSON.stringify(normalized.acceptance_commands),
    evidence: normalized.evidence_refs.join(","),
    source_spec: normalized.source_spec
  });
  console.log(JSON.stringify(item, null, 2));
}
function addIntake(args) {
  required(args, "title");
  const root = requireStore(projectRoot(args));
  const item = addIntakeItem(root, args);
  console.log(JSON.stringify(item, null, 2));
}
function listIntake(args) {
  const root = requireStore(projectRoot(args));
  const statusFilter = args.status ? String(args.status) : null;
  console.log(JSON.stringify(listIntakeItems(root, statusFilter), null, 2));
}
function triageIntake(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const item = triageIntakeItem(root, id, args);
  console.log(JSON.stringify(item, null, 2));
}
function handleRoadmapCommand(subcommand, args) {
  if (subcommand === "promote") {
    promoteRoadmap(args);
    return;
  }
  throw new Error(`\u672A\u77E5 roadmap \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function promoteRoadmap(args) {
  const root = requireStore(projectRoot(args));
  const intakeId = required(args, "intake-id");
  const node = promoteRoadmapNode(root, intakeId, args);
  console.log(JSON.stringify(node, null, 2));
}

// src/commands/capability.mjs
function handleCapabilityCommand(subcommand, args) {
  const registry2 = capabilityRegistry();
  if (subcommand === "list") {
    console.log(JSON.stringify(
      registry2.capabilities.map(publicDefinition),
      null,
      2
    ));
    return;
  }
  if (subcommand === "show") {
    const id = required(args, "id");
    const definition = registry2.capabilities.find(
      (item) => item.capability_id === id
    );
    if (!definition) throw new Error(`\u627E\u4E0D\u5230 Capability\uFF1A${id}`);
    console.log(JSON.stringify({
      ...publicDefinition(definition),
      protocol: readCapabilityProtocol(definition.protocol_ref)
    }, null, 2));
    return;
  }
  if (subcommand === "route") {
    const intake = {
      type: normalizeEnum(
        args.type || "feature",
        [
          "feature",
          "bug",
          "test_failure",
          "review_feedback",
          "tech_debt",
          "risk",
          "idea",
          "other"
        ],
        "type"
      ),
      risk: normalizeEnum(
        args.risk || "medium",
        ["low", "medium", "high", "critical"],
        "risk"
      ),
      title: String(args.title || ""),
      description: String(args.description || ""),
      affected_area: String(args.area || "unknown")
    };
    console.log(JSON.stringify(routeCapabilities(registry2, intake), null, 2));
    return;
  }
  if (subcommand === "verify") {
    console.log(JSON.stringify({
      status: "PASS",
      registry_version: registry2.registry_version,
      enforcement_mode: registry2.enforcement_mode,
      public_skill_id: registry2.public_skill_id,
      capability_count: registry2.capabilities.length,
      binding_count: registry2.bindings.length
    }, null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 capability \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function publicDefinition(definition) {
  const { protocol_path: _protocolPath, ...publicValue } = definition;
  return publicValue;
}

// src/commands/host.mjs
import { readFileSync as readFileSync19 } from "node:fs";
import { join as join37, resolve as resolve20 } from "node:path";

// src/commands/integration.mjs
import {
  cpSync as cpSync2,
  existsSync as existsSync24,
  mkdtempSync as mkdtempSync3,
  realpathSync as realpathSync5,
  readFileSync as readFileSync18,
  readdirSync as readdirSync15,
  rmSync as rmSync7,
  symlinkSync as symlinkSync2,
  writeFileSync as writeFileSync12
} from "node:fs";
import { createHash as createHash11 } from "node:crypto";
import { tmpdir as tmpdir3 } from "node:os";
import { basename as basename7, join as join36, relative as relative7, resolve as resolve19, sep as sep4 } from "node:path";
import { spawnSync as spawnSync10 } from "node:child_process";
function handleMergeCommand(subcommand, args) {
  if (subcommand === "enqueue") {
    enqueueMerge(args);
    return;
  }
  if (subcommand === "status") {
    mergeStatus(args);
    return;
  }
  if (subcommand === "apply") {
    applyMerge(args);
    return;
  }
  if (subcommand === "resolve") {
    resolveMerge(args);
    return;
  }
  throw new Error(`\u672A\u77E5 merge \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function enqueueMerge(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const patchId = required(args, "patch-id");
  const patch = findPatch(root, run.run_id, patchId);
  const queue = enqueuePatchInternal(root, run, patch);
  console.log(JSON.stringify(queue, null, 2));
}
function enqueuePatchInternal(root, run, patch) {
  return withProjectTransaction(resolve19(root, ".."), {
    kind: "merge-enqueue",
    idempotencyKey: `merge-enqueue:${run.run_id}:${patch.patch_id}`
  }, () => enqueuePatchTransaction(root, run, patch)).result;
}
function enqueuePatchTransaction(root, run, patch) {
  const queue = readMergeQueue(root, run.run_id);
  if (!queue.items.some((item) => item.patch_id === patch.patch_id)) {
    queue.items.push({
      patch_id: patch.patch_id,
      worker_id: patch.worker_id,
      plan_node_id: patch.plan_node_id,
      status: "queued",
      changed_files: patch.changed_files
    });
  }
  recomputeMergeConflicts(root, queue);
  syncConflictRisks(root, run.run_id, queue.conflicts);
  writeMergeQueue(root, queue);
  syncWorkerStatusesFromMergeQueue(root, queue);
  const event = appendEvent(root, "merge.enqueued", "apex-v2", {
    run_id: run.run_id,
    patch_id: patch.patch_id,
    conflicts: queue.conflicts.length
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return queue;
}
function mergeStatus(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  console.log(JSON.stringify(queue, null, 2));
}
function resolveMerge(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const keepPatchId = required(args, "keep-patch-id");
  const reason = String(args.reason || "coordinator selected one patch to resolve conflict");
  const result = withProjectTransaction(resolve19(root, ".."), {
    kind: "merge-resolve",
    idempotencyKey: `merge-resolve:${run.run_id}:${keepPatchId}:${stableTransitionHash(reason)}`
  }, () => resolveMergeTransaction(root, run, keepPatchId, reason)).result;
  console.log(JSON.stringify(result, null, 2));
}
function resolveMergeTransaction(root, run, keepPatchId, reason) {
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  const relatedConflicts = queue.conflicts.filter((conflict) => conflict.patch_ids.includes(keepPatchId));
  if (relatedConflicts.length === 0) {
    throw new Error(`\u6CA1\u6709\u627E\u5230\u5305\u542B keep patch \u7684\u51B2\u7A81\uFF1A${keepPatchId}`);
  }
  const droppedPatchIds = Array.from(new Set(relatedConflicts.flatMap((conflict) => conflict.patch_ids).filter((id) => id !== keepPatchId)));
  const keepItem = queue.items.find((item) => item.patch_id === keepPatchId);
  if (!keepItem) throw new Error(`keep patch \u4E0D\u5728 merge queue\uFF1A${keepPatchId}`);
  keepItem.status = "queued";
  for (const patchId of droppedPatchIds) {
    const item = queue.items.find((entry) => entry.patch_id === patchId);
    if (!item || item.status === "merged") continue;
    item.status = "dropped";
    const patchInfo = findPatchWithPath(root, run.run_id, patchId);
    patchInfo.patch.status = "dropped";
    patchInfo.patch.updated_at = now();
    updatePatchBundle(root, patchInfo.patch);
    const worker = findWorker(root, item.worker_id);
    worker.status = "dropped";
    worker.updated_at = now();
    writeJson(join36(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
  const resolution = {
    schema_version: SCHEMA_VERSION,
    resolution_id: shortId("resolution"),
    run_id: run.run_id,
    created_at: now(),
    kept_patch_id: keepPatchId,
    dropped_patch_ids: droppedPatchIds,
    reason
  };
  ensureDir(join36(root, "runs", run.run_id, "resolutions"));
  writeJson(join36(root, "runs", run.run_id, "resolutions", `${resolution.resolution_id}.json`), resolution);
  queue.resolutions = [...queue.resolutions || [], {
    resolution_id: resolution.resolution_id,
    kept_patch_id: keepPatchId,
    dropped_patch_ids: droppedPatchIds,
    reason
  }];
  resolveConflictRisks(root, run.run_id, relatedConflicts, reason);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  syncWorkerStatusesFromMergeQueue(root, queue);
  const artifact = createArtifact(root, run, "integrate", {
    type: "decision",
    title: "MergeResolution\uFF1Aconflict resolved",
    body: `kept=${keepPatchId}
dropped=${droppedPatchIds.join(",")}
reason=${reason}`,
    refs: [
      `.apex-v2/runs/${run.run_id}/merge-queue.json`,
      `.apex-v2/runs/${run.run_id}/resolutions/${resolution.resolution_id}.json`
    ],
    timestamp: resolution.created_at
  });
  const event = appendEvent(root, "merge.resolved", "apex-v2", {
    run_id: run.run_id,
    resolution_id: resolution.resolution_id,
    kept_patch_id: keepPatchId,
    dropped_patch_ids: droppedPatchIds,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { queue, resolution, artifact_id: artifact.artifact_id };
}
function applyMerge(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const run = loadRun(root, required(args, "run-id"));
  const result = applyMergeInternal(root, run);
  console.log(JSON.stringify(result, null, 2));
}
function applyMergeInternal(root, run) {
  const reviewNode = getRunNode(run, "review");
  if (reviewNode.status !== "passed") {
    throw new Error(`merge apply \u524D\u5FC5\u987B\u5148 PASS review \u8282\u70B9\uFF0C\u5F53\u524D\u72B6\u6001\uFF1A${reviewNode.status}`);
  }
  const negativeControl = inspectNegativeControlGate(root, run.run_id);
  if (negativeControl.required && negativeControl.mode === "enforce" && !negativeControl.ready) {
    throw new Error(
      `merge apply \u88AB Negative Control Gate \u963B\u65AD\uFF1A${negativeControl.message}`
    );
  }
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  const currentCandidate = persistCandidateSet(
    root,
    buildCandidateSet(root, run, queue, resolve19(root, ".."))
  );
  const verification = readJson(join36(root, "runs", run.run_id, "verification-report.json"), null);
  const review = readJson(join36(root, "runs", run.run_id, "review-report.json"), null);
  if (!verification || verification.status !== "PASS" || verification.candidate_digest !== currentCandidate.candidate.candidate_digest) {
    throw new Error("merge apply \u62D2\u7EDD\u672A\u7ED1\u5B9A\u5F53\u524D candidate \u7684 verification PASS");
  }
  if (!review || review.status !== "PASS" || review.candidate_digest !== currentCandidate.candidate.candidate_digest) {
    throw new Error("merge apply \u62D2\u7EDD\u672A\u7ED1\u5B9A\u5F53\u524D candidate \u7684 review PASS");
  }
  if (queue.conflicts.length > 0) {
    const report = writeIntegrationReport(
      root,
      run,
      "BLOCKED",
      [],
      queue.conflicts,
      [],
      currentCandidate.candidate.candidate_digest
    );
    throw new Error(`merge queue \u5B58\u5728\u51B2\u7A81\uFF0C\u5DF2\u751F\u6210 integration report\uFF1A${report.report_id}`);
  }
  if (queue.items.length === 0 && isNoopIntegrationRun(root, run.run_id)) {
    const report = writeIntegrationReport(
      root,
      run,
      "NOOP",
      [],
      [],
      [],
      currentCandidate.candidate.candidate_digest
    );
    const artifact = createArtifact(root, run, "integrate", {
      type: "decision",
      title: "Integration\uFF1Ano-op",
      body: "\u672C run \u6CA1\u6709 patch bundle\uFF0C\u4EC5\u96C6\u6210 evidence/decision artifacts\u3002",
      refs: [
        `.apex-v2/runs/${run.run_id}/decision-queue.json`,
        `.apex-v2/runs/${run.run_id}/integration-report.json`
      ],
      timestamp: report.created_at
    });
    const event = appendEvent(root, "merge.applied", "apex-v2", {
      run_id: run.run_id,
      merged_patches: [],
      artifact_id: artifact.artifact_id,
      mode: "noop"
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    return { report, artifact_id: artifact.artifact_id };
  }
  if (queue.items.length === 0) {
    const report = writeIntegrationReport(
      root,
      run,
      "BLOCKED",
      [],
      [],
      [],
      currentCandidate.candidate.candidate_digest
    );
    throw new Error(`merge queue \u4E3A\u7A7A\u4E14\u4E0D\u6EE1\u8DB3 no-op integration \u6761\u4EF6\uFF1A${report.report_id}`);
  }
  const approval = ensureMergeApproval(root, run, queue, currentCandidate.candidate.candidate_digest);
  if (!approval.allowed) {
    if (approval.created) {
      const event = appendEvent(root, "approval.requested", "apex-v2", {
        approval_id: approval.approval.id,
        run_id: run.run_id,
        kind: "merge",
        fingerprint: approval.fingerprint,
        reasons: approval.reasons
      });
      updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    }
    throw new Error(`merge approval required\uFF1A${approval.approval.id}=${approval.approval.decision || "pending"}`);
  }
  const mergeItems = queue.items.filter((item) => item.status !== "dropped");
  const changedFiles = Array.from(new Set(mergeItems.flatMap((item) => item.changed_files))).sort();
  return withProjectTransaction(resolve19(root, ".."), {
    kind: "merge-apply",
    idempotencyKey: `merge-apply:${run.run_id}:${currentCandidate.candidate.candidate_digest}`,
    extraPaths: changedFiles
  }, () => applyMergeTransaction(
    root,
    run,
    queue,
    currentCandidate.candidate.candidate_digest
  )).result;
}
function applyMergeTransaction(root, run, queue, candidateDigest) {
  const mergedPatches = [];
  const appliedFiles = [];
  for (const item of queue.items) {
    if (item.status === "dropped") continue;
    item.status = "merged";
    mergedPatches.push(item.patch_id);
    const patchInfo = findPatchWithPath(root, run.run_id, item.patch_id);
    appliedFiles.push(...applyPatchOperations(resolve19(root, ".."), patchInfo.patch));
    patchInfo.patch.status = "merged";
    patchInfo.patch.updated_at = now();
    updatePatchBundle(root, patchInfo.patch);
    const worker = findWorker(root, item.worker_id);
    worker.status = "merged";
    worker.updated_at = now();
    writeJson(join36(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
  writeMergeQueue(root, queue);
  const report = writeIntegrationReport(
    root,
    run,
    "MERGED",
    mergedPatches,
    [],
    Array.from(new Set(appliedFiles)),
    candidateDigest
  );
  const artifact = createArtifact(root, run, "integrate", {
    type: "decision",
    title: "Integration\uFF1Amerge queue \u5DF2\u5E94\u7528",
    body: `\u5DF2\u5408\u5E76 ${mergedPatches.length} \u4E2A patch bundle\uFF0C\u51B2\u7A81\u6570 0\u3002`,
    refs: [
      `.apex-v2/runs/${run.run_id}/merge-queue.json`,
      `.apex-v2/runs/${run.run_id}/integration-report.json`
    ],
    timestamp: report.created_at
  });
  const event = appendEvent(root, "merge.applied", "apex-v2", {
    run_id: run.run_id,
    merged_patches: mergedPatches,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}
function handleVerifyCommand(subcommand, args) {
  if (subcommand === "run") {
    runVerification(args);
    return;
  }
  throw new Error(`\u672A\u77E5 verify \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function runVerification(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const run = loadRun(root, required(args, "run-id"));
  const result = runVerificationInternal(root, run, projectDir);
  console.log(JSON.stringify(result, null, 2));
}
function runVerificationInternal(root, run, projectDir) {
  requirePassedNode(run, "execute");
  if (existsSync24(join36(root, "runs", run.run_id, "integration-report.json"))) {
    throw new Error("integration \u540E verification \u5DF2\u51BB\u7ED3\uFF0C\u4E0D\u80FD\u8986\u76D6 candidate chain");
  }
  const timestamp = now();
  const plan = loadPlanGraph(root, run.run_id);
  const staged = prepareVerificationWorkspace(root, run, projectDir);
  const candidate = buildCandidateSet(
    root,
    run,
    readMergeQueue(root, run.run_id),
    projectDir
  );
  const checks = [staged.materializationCheck];
  try {
    for (const [index, command] of plan.verification_policy.required_commands.entries()) {
      checks.push(runShellCommandCheck(
        `plan-command-${index + 1}`,
        command,
        staged.workspace_dir,
        staged.environment
      ));
    }
    if (plan.verification_policy.schema_check) {
      checks.push(runShellCommandCheck(
        "schema-check",
        plan.verification_policy.schema_check,
        staged.workspace_dir,
        staged.environment
      ));
    }
  } finally {
    staged.cleanup();
    staged.metadata.cleaned = true;
  }
  const candidateAfterChecks = buildCandidateSet(
    root,
    run,
    readMergeQueue(root, run.run_id),
    projectDir
  );
  if (candidateAfterChecks.candidate_digest !== candidate.candidate_digest) {
    checks.push(verificationCheck(
      "candidate-stability",
      "FAIL",
      "candidate digest unchanged during verification",
      1,
      candidate.candidate_digest,
      candidateAfterChecks.candidate_digest
    ));
  }
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("verification"),
    run_id: run.run_id,
    candidate_digest: candidate.candidate_digest,
    candidate_ref: `.apex-v2/runs/${run.run_id}/candidates/candidate-${candidate.candidate_digest}.json`,
    status: checks.every((check2) => check2.status === "PASS") ? "PASS" : "FAIL",
    created_at: timestamp,
    workspace: staged.metadata,
    checks
  };
  return withProjectTransaction(projectDir, {
    kind: "verification-commit",
    idempotencyKey: `verification-commit:${run.run_id}:${candidate.candidate_digest}`
  }, () => commitVerification(root, run, report, candidate, timestamp)).result;
}
function commitVerification(root, run, report, candidate, timestamp) {
  persistCandidateSet(root, candidate);
  writeJson(join36(root, "runs", run.run_id, "verification-report.json"), report);
  syncVerificationRisk(root, run.run_id, report);
  const artifact = createArtifact(root, run, "verify", {
    type: "test",
    title: `Verification\uFF1A${report.status}`,
    body: `\u5728 ${report.workspace.mode} \u4E2D\u6267\u884C ${report.checks.length} \u4E2A\u9A8C\u8BC1\u68C0\u67E5\uFF0Cstaged patches=${report.workspace.patch_ids.length}\uFF0C\u72B6\u6001 ${report.status}\u3002`,
    refs: [`.apex-v2/runs/${run.run_id}/verification-report.json`],
    timestamp
  });
  const event = appendEvent(root, "verification.completed", "apex-v2", {
    run_id: run.run_id,
    report_id: report.report_id,
    status: report.status,
    workspace_mode: report.workspace.mode,
    patch_ids: report.workspace.patch_ids,
    candidate_digest: report.candidate_digest,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}
function prepareVerificationWorkspace(root, run, projectDir) {
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  const patchItems = queue.items.filter((item) => item.status !== "dropped" && item.status !== "merged");
  const metadata = {
    mode: patchItems.length > 0 ? "staged-copy" : "project-root",
    source_project: projectDir,
    patch_ids: patchItems.map((item) => item.patch_id),
    applied_files: [],
    unmaterialized_patch_ids: [],
    conflicts: queue.conflicts,
    preparation_error: "",
    cleaned: false
  };
  if (patchItems.length === 0) {
    return {
      workspace_dir: projectDir,
      environment: {},
      metadata,
      materializationCheck: verificationCheck(
        "patch-materialization",
        "PASS",
        "materialize merge queue patches",
        0,
        "no queued patches; verification uses project root",
        ""
      ),
      cleanup() {
      }
    };
  }
  const tempRoot = mkdtempSync3(join36(
    verificationTempBase(projectDir),
    `apex-v2-verify-${run.run_id}-`
  ));
  const workspaceDir = join36(tempRoot, "project");
  const verificationHome = join36(tempRoot, "home");
  const verificationTmp = join36(tempRoot, "tmp");
  ensureDir(verificationHome);
  ensureDir(verificationTmp);
  try {
    cpSync2(projectDir, workspaceDir, {
      recursive: true,
      filter(source) {
        if (source === projectDir) return true;
        const name = basename7(source);
        return ![
          ".git",
          ".apex-v2",
          ".apex-v2.lock",
          ".apex-v2.transaction-backups",
          "node_modules"
        ].includes(name);
      }
    });
    initializeVerificationRepository(workspaceDir);
    linkVerificationDependencies(projectDir, workspaceDir);
    if (queue.conflicts.length > 0) {
      throw new Error(`merge queue \u5B58\u5728 ${queue.conflicts.length} \u4E2A\u672A\u89E3\u51B3\u51B2\u7A81`);
    }
    for (const item of patchItems) {
      if (item.status !== "queued") {
        throw new Error(`patch \u5C1A\u672A\u5904\u4E8E queued \u72B6\u6001\uFF1A${item.patch_id}=${item.status}`);
      }
      const patch = findPatch(root, run.run_id, item.patch_id);
      if (!Array.isArray(patch.operations) || patch.operations.length === 0) {
        metadata.unmaterialized_patch_ids.push(item.patch_id);
        continue;
      }
      const operationPaths = new Set(patch.operations.map((operation) => operation.path));
      const missingOperations = patch.changed_files.filter((file) => !operationPaths.has(file));
      if (missingOperations.length > 0) {
        metadata.unmaterialized_patch_ids.push(item.patch_id);
        metadata.preparation_error = `patch ${item.patch_id} \u7F3A\u5C11 operations\uFF1A${missingOperations.join(",")}`;
        continue;
      }
      metadata.applied_files.push(...applyPatchOperations(workspaceDir, patch));
    }
  } catch (error) {
    metadata.preparation_error = error.message;
  }
  const materialized = metadata.preparation_error === "" && metadata.unmaterialized_patch_ids.length === 0;
  return {
    workspace_dir: workspaceDir,
    environment: {
      HOME: verificationHome,
      TMPDIR: verificationTmp,
      XDG_CACHE_HOME: join36(verificationHome, ".cache"),
      XDG_CONFIG_HOME: join36(verificationHome, ".config")
    },
    metadata,
    materializationCheck: verificationCheck(
      "patch-materialization",
      materialized ? "PASS" : "FAIL",
      "materialize merge queue patches",
      materialized ? 0 : 1,
      materialized ? `applied_files=${Array.from(new Set(metadata.applied_files)).join(",")}` : "",
      metadata.preparation_error || `patches without operations: ${metadata.unmaterialized_patch_ids.join(",")}`
    ),
    cleanup() {
      rmSync7(tempRoot, { recursive: true, force: true });
    }
  };
}
function verificationTempBase(projectDir) {
  const projectReal = realpathSync5(projectDir);
  const candidates = [
    process.env.APEX_V2_VERIFY_TMPDIR,
    tmpdir3(),
    "/private/tmp",
    "/tmp"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync24(candidate)) continue;
    const candidateReal = realpathSync5(candidate);
    if (candidateReal !== projectReal && !candidateReal.startsWith(`${projectReal}${sep4}`)) {
      return candidateReal;
    }
  }
  throw new Error("\u627E\u4E0D\u5230\u9879\u76EE\u76EE\u5F55\u5916\u7684 staged verification temp root");
}
function initializeVerificationRepository(workspaceDir) {
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Apex Forge Verification"],
    ["config", "user.email", "verification@apex-forge.local"]
  ]) {
    const result = spawnSync10("git", args, { cwd: workspaceDir, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`staged git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
  }
  writeFileSync12(
    join36(workspaceDir, ".git", "info", "exclude"),
    "node_modules\nnode_modules/\n**/node_modules\n**/node_modules/\n.apex-v2/\n"
  );
  for (const args of [
    ["add", "-A"],
    ["commit", "-q", "-m", "Apex Forge staged verification baseline"]
  ]) {
    const result = spawnSync10("git", args, {
      cwd: workspaceDir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
      }
    });
    if (result.status !== 0) {
      throw new Error(`staged git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
  }
}
function linkVerificationDependencies(projectDir, workspaceDir) {
  const visit = (directory) => {
    for (const entry of readdirSync15(directory, { withFileTypes: true })) {
      if ([".git", ".apex-v2"].includes(entry.name)) continue;
      const source = join36(directory, entry.name);
      if (entry.name === "node_modules") {
        const target = join36(workspaceDir, relative7(projectDir, source));
        createWritableVerificationDependencyShell(source, target);
      } else if (entry.isDirectory()) {
        visit(source);
      }
    }
  };
  visit(projectDir);
}
function createWritableVerificationDependencyShell(source, target) {
  if (existsSync24(target)) return;
  ensureDir(target);
  for (const entry of readdirSync15(source, { withFileTypes: true })) {
    const dependency = join36(source, entry.name);
    const linked = join36(target, entry.name);
    if ([".cache", ".tmp", ".vite", ".vite-temp"].includes(entry.name)) {
      ensureDir(linked);
      continue;
    }
    symlinkSync2(dependency, linked, entry.isDirectory() ? "dir" : "file");
  }
}
function runShellCommandCheck(id, command, cwd, environment = {}) {
  const result = spawnManagedProcess("/bin/zsh", ["-lc", command], {
    workspaceDir: cwd,
    timeoutMs: positiveInteger(
      process.env.APEX_V2_VERIFY_COMMAND_TIMEOUT_MS,
      30 * 60 * 1e3
    ),
    minFreeBytes: positiveInteger(
      process.env.APEX_V2_MIN_FREE_BYTES,
      20 * 1024 * 1024 * 1024
    ),
    maxDiskGrowthBytes: positiveInteger(
      process.env.APEX_V2_MAX_DISK_GROWTH_BYTES,
      5 * 1024 * 1024 * 1024
    ),
    maxWorkspaceGrowthBytes: positiveInteger(
      process.env.APEX_V2_MAX_WORKSPACE_GROWTH_BYTES,
      5 * 1024 * 1024 * 1024
    ),
    maxOutputBytes: positiveInteger(
      process.env.APEX_V2_MAX_COMMAND_OUTPUT_BYTES,
      16 * 1024 * 1024
    ),
    env: {
      ...process.env,
      ...environment
    }
  });
  return verificationCheck(
    id,
    result.status === 0 ? "PASS" : "FAIL",
    command,
    result.status ?? 1,
    tail(result.stdout),
    tail(result.stderr)
  );
}
function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function verificationCheck(id, status2, command, exitCode, stdout, stderr) {
  return {
    id,
    status: status2,
    command,
    exit_code: exitCode,
    stdout_tail: stdout,
    stderr_tail: stderr
  };
}
function handleReviewCommand(subcommand, args) {
  if (subcommand === "generate") {
    generateReview(args);
    return;
  }
  throw new Error(`\u672A\u77E5 review \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function generateReview(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const result = generateReviewInternal(root, run);
  console.log(JSON.stringify(result, null, 2));
}
function generateReviewInternal(root, run) {
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  const candidate = buildCandidateSet(root, run, queue, resolve19(root, ".."));
  const verification = readJson(join36(root, "runs", run.run_id, "verification-report.json"), null);
  const verifyStatus = getRunNode(run, "verify").status;
  const negativeControl = inspectNegativeControlGate(root, run.run_id);
  return withProjectTransaction(resolve19(root, ".."), {
    kind: "review-generate",
    idempotencyKey: [
      "review-generate",
      run.run_id,
      verifyStatus,
      verification?.report_id || "none",
      candidate.candidate_digest,
      negativeControl.fingerprint
    ].join(":")
  }, () => generateReviewTransaction(root, run)).result;
}
function generateReviewTransaction(root, run) {
  const timestamp = now();
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  const candidate = persistCandidateSet(
    root,
    buildCandidateSet(root, run, queue, resolve19(root, ".."))
  );
  const verification = readJson(join36(root, "runs", run.run_id, "verification-report.json"), null);
  const blocking = [];
  const nonBlocking = [];
  const negativeControl = inspectNegativeControlGate(root, run.run_id);
  if (getRunNode(run, "verify").status !== "passed") {
    blocking.push("verify \u8282\u70B9\u5C1A\u672A PASS\u3002");
  }
  if (!verification || verification.status !== "PASS") {
    blocking.push("verification-report \u7F3A\u5931\u6216\u672A\u901A\u8FC7\u3002");
  } else if (verification.candidate_digest !== candidate.candidate.candidate_digest) {
    blocking.push("verification-report \u672A\u7ED1\u5B9A\u5F53\u524D candidate\u3002");
  }
  if (queue.conflicts.length > 0) {
    blocking.push(`merge queue \u5B58\u5728 ${queue.conflicts.length} \u4E2A\u51B2\u7A81\u3002`);
  }
  if (queue.items.length === 0) {
    if (isNoopIntegrationRun(root, run.run_id)) {
      nonBlocking.push("merge queue \u4E3A\u7A7A\uFF0C\u4F46 run \u4EC5\u5305\u542B evidence/decision\uFF0C\u53EF\u8D70 no-op integration\u3002");
    } else {
      blocking.push("merge queue \u4E3A\u7A7A\uFF0C\u7F3A\u5C11\u5F85\u96C6\u6210 patch\u3002");
    }
  }
  if (queue.items.some((item) => item.status !== "queued")) {
    nonBlocking.push("merge queue \u4E2D\u5B58\u5728\u975E queued \u72B6\u6001 item\uFF0C\u9700\u8981 coordinator \u7559\u610F\u3002");
  }
  if (negativeControl.required && !negativeControl.ready) {
    if (negativeControl.mode === "enforce") {
      blocking.push(negativeControl.message);
    } else if (negativeControl.mode === "shadow") {
      nonBlocking.push(
        `Negative Control shadow gap\uFF1A${negativeControl.message}`
      );
    }
  }
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("review"),
    run_id: run.run_id,
    candidate_digest: candidate.candidate.candidate_digest,
    verification_report_id: verification?.report_id || null,
    status: blocking.length === 0 ? "PASS" : "BLOCKED",
    created_at: timestamp,
    blocking_findings: blocking,
    non_blocking_findings: nonBlocking
  };
  writeJson(join36(root, "runs", run.run_id, "review-report.json"), report);
  syncReviewRisk(root, run.run_id, report);
  const artifact = createArtifact(root, run, "review", {
    type: "review",
    title: `Review\uFF1A${report.status}`,
    body: `blocking=${blocking.length}\uFF0Cnon_blocking=${nonBlocking.length}`,
    refs: [
      `.apex-v2/runs/${run.run_id}/review-report.json`,
      `.apex-v2/runs/${run.run_id}/verification-report.json`,
      `.apex-v2/runs/${run.run_id}/merge-queue.json`
    ],
    timestamp
  });
  const event = appendEvent(root, "review.generated", "apex-v2", {
    run_id: run.run_id,
    report_id: report.report_id,
    status: report.status,
    candidate_digest: report.candidate_digest,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}
function isNoopIntegrationRun(root, runId) {
  const workersDir = join36(root, "runs", runId, "workers");
  if (existsSync24(workersDir)) {
    for (const workerEntry of readdirSync15(workersDir, { withFileTypes: true })) {
      if (!workerEntry.isDirectory()) continue;
      if (existsSync24(join36(workersDir, workerEntry.name, "patch-bundle.json"))) return false;
    }
  }
  const run = loadRun(root, runId);
  const executeNode = getRunNode(run, "execute");
  if (executeNode.status !== "passed" || executeNode.evidence_refs.length === 0) return false;
  const queue = readDecisionQueue(root, runId);
  return queue.items.length > 0 || executeNode.evidence_refs.some((artifactId) => {
    const artifact = readJson(join36(root, "artifacts", runId, `${artifactId}.json`), null);
    return artifact && ["evidence", "decision"].includes(artifact.type);
  });
}
function readMergeQueue(root, runId) {
  const path = join36(root, "runs", runId, "merge-queue.json");
  return readJson(path, {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    updated_at: now(),
    items: [],
    conflicts: [],
    resolutions: []
  });
}
function writeMergeQueue(root, queue) {
  queue.updated_at = now();
  writeJson(join36(root, "runs", queue.run_id, "merge-queue.json"), queue);
}
function recomputeMergeConflicts(root, queue) {
  const owners = /* @__PURE__ */ new Map();
  const conflicts = [];
  for (const item of queue.items) {
    if (item.status === "dropped") continue;
    if (item.status === "merged") {
      for (const key of mergeConflictKeysForItem(root, queue.run_id, item)) {
        if (!owners.has(key.key)) owners.set(key.key, { patch_id: item.patch_id, file: key.file });
      }
      continue;
    }
    item.status = "queued";
    for (const key of mergeConflictKeysForItem(root, queue.run_id, item)) {
      if (!owners.has(key.key)) {
        owners.set(key.key, { patch_id: item.patch_id, file: key.file });
        continue;
      }
      const first = owners.get(key.key);
      item.status = "blocked_conflict";
      const firstItem = queue.items.find((entry) => entry.patch_id === first.patch_id);
      if (firstItem && firstItem.status !== "merged") firstItem.status = "blocked_conflict";
      conflicts.push({
        kind: key.kind,
        file: key.file,
        patch_ids: Array.from(/* @__PURE__ */ new Set([first.patch_id, item.patch_id])),
        resolution: "coordinator_serial_merge_required"
      });
    }
  }
  queue.conflicts = conflicts;
}
function mergeConflictKeysForItem(root, runId, item) {
  const patch = tryFindPatchForQueueItem(root, runId, item.patch_id);
  if (!patch || !Array.isArray(patch.operations) || patch.operations.length === 0) {
    return item.changed_files.map((file) => ({ key: `file:${file}`, file, kind: "same_file_patch" }));
  }
  return patch.operations.map((operation) => {
    if (operation.op === "replace_text") {
      return {
        key: `replace_text:${operation.path}:${operation.old_text}`,
        file: operation.path,
        kind: "same_text_patch"
      };
    }
    return {
      key: `file:${operation.path}`,
      file: operation.path,
      kind: "same_file_patch"
    };
  });
}
function tryFindPatchForQueueItem(root, runId, patchId) {
  try {
    return findPatch(root, runId, patchId);
  } catch {
    return null;
  }
}
function syncWorkerStatusesFromMergeQueue(root, queue) {
  const itemsByWorker = /* @__PURE__ */ new Map();
  for (const item of queue.items) {
    if (!itemsByWorker.has(item.worker_id)) itemsByWorker.set(item.worker_id, []);
    itemsByWorker.get(item.worker_id).push(item);
  }
  for (const [workerId, items] of itemsByWorker) {
    const worker = findWorker(root, workerId);
    worker.status = workerStatusForMergeItems(items);
    worker.updated_at = queue.updated_at;
    writeJson(join36(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
}
function writeIntegrationReport(root, run, status2, mergedPatches, conflicts, appliedFiles = [], candidateDigest = null) {
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("integration"),
    run_id: run.run_id,
    candidate_digest: candidateDigest,
    status: status2,
    created_at: now(),
    merged_patches: mergedPatches,
    applied_files: appliedFiles,
    conflicts
  };
  writeJson(join36(root, "runs", run.run_id, "integration-report.json"), report);
  return report;
}
function stableTransitionHash(value) {
  return createHash11("sha256").update(String(value)).digest("hex");
}
function readDecisionQueue(root, runId) {
  return readJson(join36(root, "runs", runId, "decision-queue.json"), { schema_version: SCHEMA_VERSION, run_id: runId, updated_at: now(), items: [] });
}
function loadPlanGraph(root, runId) {
  const plan = readJson(join36(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`\u627E\u4E0D\u5230 plan graph\uFF1A${runId}`);
  return plan;
}

// src/commands/host.mjs
function handleHostCommand(subcommand, args) {
  if (subcommand === "actions") {
    console.log(JSON.stringify(listHostActions(requireStore(projectRoot(args))), null, 2));
    return;
  }
  if (subcommand === "claim") {
    console.log(JSON.stringify(claimHostAction(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id")
    ), null, 2));
    return;
  }
  if (subcommand === "submit") {
    console.log(JSON.stringify(submitHostResult(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id"),
      {
        summary: required(args, "summary"),
        refs: splitList(args.refs),
        claimToken: required(args, "claim-token"),
        semanticEvidence: parseSemanticEvidence(args),
        capabilityEvidence: parseCapabilityEvidence(args)
      }
    ), null, 2));
    return;
  }
  if (subcommand === "cancel") {
    console.log(JSON.stringify(cancelHostAction(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id"),
      required(args, "claim-token"),
      String(args.reason || "host cancelled action")
    ), null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 host \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function listHostActions(root) {
  const project = readJson(join37(root, "project.json"));
  const workspacePatchEnabled = interactiveWorkspacePatchEnabled(root);
  return project.active_runs.flatMap(
    (runId) => getWorkers(root, runId).filter(
      (worker) => worker.preferred_mode === "interactive" && ["cognitive", "workspace_patch"].includes(worker.execution_class) && ["active", "claimed"].includes(worker.status) && (worker.execution_class !== "workspace_patch" || workspacePatchEnabled || worker.status === "claimed")
    ).map((worker) => ({
      worker_id: worker.worker_id,
      run_id: worker.run_id,
      plan_node_id: worker.plan_node_id,
      status: worker.status,
      claimed_by: worker.claimed_by || null,
      objective: worker.objective,
      deliverables: worker.deliverables,
      required_evidence: worker.required_evidence,
      capability_bindings: worker.capability_bindings || [],
      capability_enforcement: worker.capability_enforcement || "shadow",
      capability_invocation_refs: worker.capability_invocation_refs || [],
      capability_protocols: capabilityProtocols2(worker.capability_bindings || []),
      read_scope: worker.read_scope,
      write_scope: worker.write_scope,
      output_contract: worker.output_contract,
      candidate_digest: reviewCandidateDigest(root, worker),
      lease_expires_at: worker.claim_expires_at || null,
      fencing_token: worker.fencing_token || 0,
      claim_expired: worker.status === "claimed" && claimExpired(worker),
      workspace_path: readJson(
        join37(workerDir(root, worker.run_id, worker.worker_id), "action-workspace.json"),
        null
      )?.workspace_path || null
    }))
  );
}
function reviewCandidateDigest(root, worker) {
  if (!worker.plan_node_id.endsWith("review")) return null;
  const run = loadRun(root, worker.run_id);
  const queue = readJson(join37(root, "runs", worker.run_id, "merge-queue.json"), {
    schema_version: SCHEMA_VERSION,
    run_id: worker.run_id,
    updated_at: now(),
    items: [],
    conflicts: [],
    resolutions: []
  });
  return buildCandidateSet(root, run, queue, resolve20(root, "..")).candidate_digest;
}
function claimHostAction(root, workerId, hostId) {
  const worker = findWorker(root, workerId);
  if (worker.status === "claimed" && !claimExpired(worker) && worker.claimed_by === hostId) {
    return existingHostClaim(root, worker);
  }
  const nextFencingToken = Number(worker.fencing_token || 0) + 1;
  return withProjectTransaction(resolve20(root, ".."), {
    kind: "host-claim",
    idempotencyKey: `host-claim:${workerId}:${hostId}:${nextFencingToken}`
  }, () => claimHostActionTransaction(root, workerId, hostId)).result;
}
function claimHostActionTransaction(root, workerId, hostId) {
  const worker = findWorker(root, workerId);
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (worker.preferred_mode !== "interactive" || !["cognitive", "workspace_patch"].includes(worker.execution_class)) {
    throw new Error(`worker \u4E0D\u662F\u53EF claim \u7684 Interactive Host action\uFF1A${worker.worker_id}`);
  }
  if (worker.status === "claimed" && !claimExpired(worker) && worker.claimed_by !== hostId) {
    throw new Error(`worker \u5DF2\u88AB\u5176\u4ED6 host claim\uFF1A${worker.claimed_by}`);
  }
  if (worker.status === "claimed" && !claimExpired(worker) && worker.claimed_by === hostId) {
    return existingHostClaim(root, worker);
  }
  if (!["active", "claimed"].includes(worker.status)) {
    throw new Error(`worker \u5F53\u524D\u72B6\u6001\u4E0D\u53EF claim\uFF1A${worker.status}`);
  }
  if (worker.execution_class === "workspace_patch") {
    if (!interactiveWorkspacePatchEnabled(root)) {
      throw new Error("execution policy \u5DF2\u7981\u7528 Interactive workspace_patch\uFF1B\u8BF7\u4F7F\u7528 Factory Mode \u6216\u91CD\u65B0\u542F\u7528\u3002");
    }
    const claimedPatch = listHostActions(root).find(
      (item) => item.status === "claimed" && !item.claim_expired && item.worker_id !== worker.worker_id && findWorker(root, item.worker_id).execution_class === "workspace_patch"
    );
    if (claimedPatch) {
      throw new Error(`\u5DF2\u6709 workspace_patch action \u88AB claim\uFF1A${claimedPatch.worker_id}`);
    }
  }
  const project = readJson(join37(root, "project.json"));
  const timestamp = now();
  const leaseSeconds = readJson(join37(root, "policies", "execution.json")).interactive_host_claim?.lease_seconds || 1800;
  const claimToken = shortId("claim");
  const fencingToken = Number(worker.fencing_token || 0) + 1;
  const leaseExpiresAt = new Date(Date.parse(timestamp) + leaseSeconds * 1e3).toISOString();
  const action = {
    schema_version: SCHEMA_VERSION,
    action_id: shortId("host-action"),
    host_id: hostId,
    project_id: project.project_id,
    kind: "action_claim",
    payload: {
      worker_id: worker.worker_id,
      run_id: worker.run_id,
      plan_node_id: worker.plan_node_id,
      objective: worker.objective,
      capability_bindings: worker.capability_bindings || [],
      capability_enforcement: worker.capability_enforcement || "shadow",
      capability_invocation_refs: worker.capability_invocation_refs || [],
      capability_protocols: capabilityProtocols2(worker.capability_bindings || [])
    },
    idempotency_key: `${hostId}:${worker.worker_id}`,
    claim_token: claimToken,
    fencing_token: fencingToken,
    lease_expires_at: leaseExpiresAt,
    created_at: timestamp
  };
  let workspace = null;
  if (worker.execution_class === "workspace_patch") {
    workspace = createActionWorkspace(root, worker, action.action_id);
    action.payload.workspace_path = workspace.workspace_path;
    action.payload.base_fingerprint = workspace.base_fingerprint;
  }
  const validation = validateContract("host-action.schema.json", action, `${worker.namespace}/host-action.json`);
  if (!validation.valid) {
    if (workspace) discardActionWorkspace(resolve20(root, ".."), workspace, "failed");
    throw new Error(`host action contract \u65E0\u6548\uFF1A${JSON.stringify(validation.errors)}`);
  }
  if (worker.adapter !== "host") {
    worker.factory_executor_id = worker.executor_id || worker.adapter;
    worker.adapter = "host";
    worker.executor_id = "host";
  }
  worker.status = "claimed";
  worker.claimed_by = hostId;
  worker.claimed_at = timestamp;
  worker.claim_token = claimToken;
  worker.claim_expires_at = leaseExpiresAt;
  worker.fencing_token = fencingToken;
  worker.updated_at = timestamp;
  writeJson(join37(dir, "host-action.json"), action);
  writeJson(join37(dir, "worker.json"), worker);
  const event = appendEvent(root, "worker.host.claimed", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: action.action_id,
    fencing_token: fencingToken
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { action, worker, workspace };
}
function capabilityProtocols2(bindings) {
  assertCapabilityContextBudget(bindings);
  return bindings.map((binding) => ({
    capability_id: binding.capability_id,
    capability_version: binding.capability_version,
    required_host_capabilities: binding.required_host_capabilities,
    input_contract: binding.input_contract,
    output_contract: binding.output_contract,
    protocol: readCapabilityProtocol(binding.protocol_ref)
  }));
}
function submitHostResult(root, workerId, hostId, input) {
  const worker = findWorker(root, workerId);
  const action = readJson(
    join37(workerDir(root, worker.run_id, worker.worker_id), "host-action.json"),
    null
  );
  if (!action) throw new Error(`Host action \u7F3A\u5931\uFF1A${worker.worker_id}`);
  return withProjectTransaction(resolve20(root, ".."), {
    kind: "host-submit",
    idempotencyKey: `host-submit:${action.action_id}:${input.claimToken}`
  }, () => submitHostResultTransaction(root, workerId, hostId, input)).result;
}
function submitHostResultTransaction(root, workerId, hostId, input) {
  const worker = findWorker(root, workerId);
  if (worker.adapter !== "host" || !["cognitive", "workspace_patch"].includes(worker.execution_class)) {
    throw new Error(`worker \u4E0D\u662F Host action\uFF1A${worker.worker_id}`);
  }
  if (worker.status !== "claimed" || worker.claimed_by !== hostId) {
    throw new Error(`worker \u5FC5\u987B\u7531\u5F53\u524D host claim \u540E\u624D\u80FD submit\uFF1A${worker.worker_id}`);
  }
  const action = readJson(join37(workerDir(root, worker.run_id, worker.worker_id), "host-action.json"));
  assertActiveClaim(worker, action, input.claimToken);
  const timestamp = now();
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  let patch = null;
  let queueStatus = null;
  let semanticEvidenceRef = null;
  const capabilityEvidence = input.capabilityEvidence || [];
  const capabilityStatus = assertCapabilityEvidence(
    worker.capability_bindings || [],
    capabilityEvidence,
    { requireAll: worker.capability_enforcement === "enforce" }
  );
  const capabilityEvidenceRefs = persistCapabilityEvidence2(
    dir,
    worker.namespace,
    capabilityEvidence
  );
  if (worker.execution_class === "workspace_patch") {
    patch = buildHostPatch(root, worker, input.summary, timestamp);
  } else {
    const semanticEvidence = validateWorkerSemanticEvidence(
      root,
      worker,
      input.semanticEvidence
    );
    semanticEvidenceRef = `${worker.namespace}/cognitive-evidence.json`;
    writeJson(join37(dir, "cognitive-evidence.json"), semanticEvidence);
  }
  const result = {
    schema_version: SCHEMA_VERSION,
    action_id: action.action_id,
    host_id: hostId,
    status: "completed",
    summary: input.summary,
    artifact_refs: [
      ...input.refs || [],
      ...patch?.changed_files || [],
      ...input.semanticEvidence?.source_refs || [],
      ...capabilityEvidenceRefs
    ],
    semantic_evidence_ref: semanticEvidenceRef,
    capability_evidence_refs: capabilityEvidenceRefs,
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: capabilityStatus.submitted,
      missing: capabilityStatus.missing
    },
    error: null,
    created_at: timestamp
  };
  const validation = validateContract("host-result.schema.json", result, `${worker.namespace}/host-result.json`);
  if (!validation.valid) throw new Error(`host result contract \u65E0\u6548\uFF1A${JSON.stringify(validation.errors)}`);
  writeJson(join37(dir, "host-result.json"), result);
  const run = loadRun(root, worker.run_id);
  let artifact;
  if (patch) {
    artifact = createArtifact(root, run, "execute", {
      type: "patch",
      title: `HostPatch\uFF1A${worker.plan_node_id}`,
      body: result.summary,
      refs: [
        `${worker.namespace}/host-action.json`,
        `${worker.namespace}/host-result.json`,
        patchBundleRef(worker, patch.patch_id),
        ...capabilityEvidenceRefs,
        ...patch.changed_files
      ],
      timestamp
    });
    worker.status = "patch_submitted";
    worker.updated_at = timestamp;
    writeJson(join37(dir, "worker.json"), worker);
    const queue = enqueuePatchInternal(root, run, patch);
    queueStatus = queue.conflicts.length > 0 ? "blocked_conflict" : "queued";
  } else {
    artifact = createArtifact(root, run, "execute", {
      type: "evidence",
      title: `HostAgent\uFF1A${worker.plan_node_id}`,
      body: result.summary,
      refs: [
        `${worker.namespace}/host-action.json`,
        `${worker.namespace}/host-result.json`,
        semanticEvidenceRef,
        ...result.artifact_refs
      ].filter(Boolean),
      timestamp
    });
    worker.status = "evidence_submitted";
    worker.updated_at = timestamp;
    writeJson(join37(dir, "worker.json"), worker);
  }
  const event = appendEvent(root, "worker.host.submitted", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: result.action_id,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    result,
    worker: findWorker(root, worker.worker_id),
    artifact_id: artifact.artifact_id,
    patch_id: patch?.patch_id || null,
    queue_status: queueStatus
  };
}
function persistCapabilityEvidence2(dir, namespace, evidenceItems) {
  return evidenceItems.map((evidence) => {
    const name = `capability-evidence-${evidence.capability_id}.json`;
    writeJson(join37(dir, name), evidence);
    return `${namespace}/${name}`;
  });
}
function cancelHostAction(root, workerId, hostId, claimToken, reason) {
  const worker = findWorker(root, workerId);
  const action = readJson(
    join37(workerDir(root, worker.run_id, worker.worker_id), "host-action.json"),
    null
  );
  if (!action) throw new Error(`Host action \u7F3A\u5931\uFF1A${worker.worker_id}`);
  return withProjectTransaction(resolve20(root, ".."), {
    kind: "host-cancel",
    idempotencyKey: `host-cancel:${action.action_id}:${claimToken}`
  }, () => cancelHostActionTransaction(
    root,
    workerId,
    hostId,
    claimToken,
    reason
  )).result;
}
function cancelHostActionTransaction(root, workerId, hostId, claimToken, reason) {
  const worker = findWorker(root, workerId);
  if (worker.status !== "claimed" || worker.claimed_by !== hostId) {
    throw new Error(`worker \u5FC5\u987B\u7531\u5F53\u524D host claim \u540E\u624D\u80FD cancel\uFF1A${worker.worker_id}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const action = readJson(join37(dir, "host-action.json"));
  assertActiveClaim(worker, action, claimToken);
  const workspace = readJson(join37(dir, "action-workspace.json"), null);
  if (workspace) discardActionWorkspace(resolve20(root, ".."), workspace, "cancelled");
  const timestamp = now();
  const result = {
    schema_version: SCHEMA_VERSION,
    action_id: action.action_id,
    host_id: hostId,
    status: "cancelled",
    summary: reason,
    artifact_refs: [],
    error: null,
    created_at: timestamp
  };
  writeJson(join37(dir, "host-result.json"), result);
  worker.status = "cancelled";
  worker.updated_at = timestamp;
  writeJson(join37(dir, "worker.json"), worker);
  const event = appendEvent(root, "worker.host.cancelled", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: action.action_id,
    reason
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { result, worker };
}
function buildHostPatch(root, worker, summary, timestamp) {
  const projectDir = resolve20(root, "..");
  const manifestPath = join37(workerDir(root, worker.run_id, worker.worker_id), "action-workspace.json");
  const workspace = readJson(manifestPath, null);
  if (!workspace) throw new Error(`ActionWorkspace \u7F3A\u5931\uFF1A${worker.worker_id}`);
  const changes = collectActionWorkspaceChanges(projectDir, workspace);
  if (changes.out_of_scope_files.length > 0) {
    throw new Error(`Interactive Host \u4FEE\u6539\u8D85\u51FA write_scope\uFF1A${changes.out_of_scope_files.join(", ")}`);
  }
  if (changes.unsupported_files.length > 0) {
    throw new Error(`Interactive Host \u5305\u542B\u4E0D\u652F\u6301\u7684\u4FEE\u6539\uFF1A${changes.unsupported_files.join(", ")}`);
  }
  if (changes.operations.length === 0) {
    throw new Error(`Interactive Host \u672A\u4EA7\u751F patch\uFF1A${worker.worker_id}`);
  }
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary,
    changed_files: changes.changed_files,
    operations: changes.operations,
    evidence_refs: [],
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);
  persistPatchBundle(root, patch);
  markActionWorkspaceSubmitted(projectDir, workspace);
  return patch;
}
function interactiveWorkspacePatchEnabled(root) {
  const policy = readJson(join37(root, "policies", "execution.json"), {});
  return policy.interactive_workspace_patch?.enabled === true;
}
function existingHostClaim(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const existingAction = readJson(join37(dir, "host-action.json"), null);
  if (!existingAction) throw new Error(`\u5DF2 claim worker \u7F3A\u5C11 host action\uFF1A${worker.worker_id}`);
  return {
    action: existingAction,
    worker,
    workspace: readJson(join37(dir, "action-workspace.json"), null)
  };
}
function parseSemanticEvidence(args) {
  const inline2 = args["evidence-json"];
  const file = args["evidence-file"];
  if (!inline2 && !file) return null;
  if (inline2 && file) throw new Error("\u53EA\u80FD\u6307\u5B9A --evidence-json \u6216 --evidence-file \u4E4B\u4E00");
  try {
    return JSON.parse(file ? readFileSync19(resolve20(String(file)), "utf8") : String(inline2));
  } catch (error) {
    throw new Error(`semantic evidence JSON \u65E0\u6548\uFF1A${error.message}`);
  }
}
function parseCapabilityEvidence(args) {
  const inline2 = args["capability-evidence-json"];
  const file = args["capability-evidence-file"];
  if (!inline2 && !file) return [];
  if (inline2 && file) {
    throw new Error(
      "\u53EA\u80FD\u6307\u5B9A --capability-evidence-json \u6216 --capability-evidence-file \u4E4B\u4E00"
    );
  }
  let value;
  try {
    value = JSON.parse(
      file ? readFileSync19(resolve20(String(file)), "utf8") : String(inline2)
    );
  } catch (error) {
    throw new Error(`capability evidence JSON \u65E0\u6548\uFF1A${error.message}`);
  }
  if (!Array.isArray(value)) {
    throw new Error("capability evidence JSON \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  return value;
}
function assertActiveClaim(worker, action, claimToken) {
  if (!claimToken || claimToken !== worker.claim_token || claimToken !== action.claim_token) {
    throw new Error(`Host claim token \u65E0\u6548\uFF1A${worker.worker_id}`);
  }
  if (worker.fencing_token !== action.fencing_token) {
    throw new Error(`Host fencing token \u5DF2\u5931\u6548\uFF1A${worker.worker_id}`);
  }
  if (claimExpired(worker) || Date.parse(action.lease_expires_at) <= Date.now()) {
    throw new Error(`Host claim lease \u5DF2\u8FC7\u671F\uFF1A${worker.worker_id}`);
  }
}
function claimExpired(worker) {
  return !worker.claim_expires_at || Date.parse(worker.claim_expires_at) <= Date.now();
}

// src/commands/dsh-lifecycle.mjs
import { resolve as resolve21 } from "node:path";
function handleDecisionCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  if (subcommand === "list") {
    console.log(JSON.stringify(listDecisionNotes(root, {
      runId: args["run-id"] ? String(args["run-id"]) : null,
      status: args.status ? String(args.status) : null
    }), null, 2));
    return;
  }
  if (subcommand === "show") {
    console.log(JSON.stringify(
      getDecisionNote(root, required(args, "id")),
      null,
      2
    ));
    return;
  }
  if (subcommand === "propose") {
    const run = loadRun(root, required(args, "run-id"));
    const options = splitList(args.options).map((summary, index) => ({
      option_id: `option-${index + 1}`,
      summary,
      tradeoffs: []
    }));
    if (options.length < 2) {
      throw new Error("Decision propose \u5FC5\u987B\u63D0\u4F9B\u81F3\u5C11\u4E24\u4E2A --options");
    }
    const proposedOption = String(args["proposed-option"] || options[0].option_id);
    if (!options.some((option) => option.option_id === proposedOption)) {
      throw new Error(`Decision proposed option \u4E0D\u5B58\u5728\uFF1A${proposedOption}`);
    }
    const note = withProjectTransaction(resolve21(root, ".."), {
      kind: "decision-propose",
      idempotencyKey: [
        "decision-propose",
        run.run_id,
        required(args, "title"),
        proposedOption
      ].join(":")
    }, () => proposeDecisionNote(root, run, {
      trigger: "manual",
      title: required(args, "title"),
      scope: String(args.scope || "project"),
      rationale: required(args, "rationale"),
      options,
      proposedOption,
      refs: splitList(args.refs)
    })).result;
    console.log(JSON.stringify(note, null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 decision \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function handleNegativeControlCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  if (subcommand === "show") {
    const record = readNegativeControlRecord(root, run.run_id);
    if (!record) throw new Error(`run \u672A\u8981\u6C42 Negative Control\uFF1A${run.run_id}`);
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  const transition = withProjectTransaction(resolve21(root, ".."), {
    kind: `negative-control-${subcommand}`,
    idempotencyKey: [
      "negative-control",
      subcommand,
      run.run_id,
      String(args.command || ""),
      String(args.evidence || "")
    ].join(":")
  }, () => {
    if (subcommand === "record-red") {
      return recordNegativeControlRed(root, run, {
        command: required(args, "command"),
        faultModel: required(args, "fault-model"),
        expectedFailureSignature: required(args, "expected-signature"),
        observedFailureSignature: required(args, "observed-signature"),
        evidenceRefs: splitList(args.evidence)
      });
    }
    if (subcommand === "record-green") {
      return recordNegativeControlGreen(root, run, {
        command: required(args, "command"),
        evidenceRefs: splitList(args.evidence)
      });
    }
    if (subcommand === "restore") {
      return restoreNegativeControl(root, run, {
        evidenceRefs: splitList(args.evidence)
      });
    }
    throw new Error(
      `\u672A\u77E5 negative-control \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`
    );
  }).result;
  console.log(JSON.stringify(transition, null, 2));
}

// src/commands/worker.mjs
import { cpSync as cpSync3, existsSync as existsSync27, readFileSync as readFileSync21, readdirSync as readdirSync17, rmSync as rmSync9, symlinkSync as symlinkSync3, writeFileSync as writeFileSync14 } from "node:fs";
import { createHash as createHash13 } from "node:crypto";
import { join as join40, resolve as resolve23 } from "node:path";
import { spawnSync as spawnSync12 } from "node:child_process";

// src/core/worker-results.mjs
import { existsSync as existsSync25, readdirSync as readdirSync16 } from "node:fs";
import { join as join38 } from "node:path";
function buildWorkerSummary(root, worker, record = false) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const results = existsSync25(dir) ? readdirSync16(dir).filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json")).map((file) => readJson(join38(dir, file))).sort((left, right) => left.created_at.localeCompare(right.created_at)) : [];
  const patch = readJson(join38(dir, "patch-bundle.json"), null);
  const summary = {
    schema_version: "v0",
    summary_id: shortId("worker-summary"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    generated_at: now(),
    final_status: worker.status,
    verdict: ["patch_submitted", "queued", "merged", "evidence_submitted", "decision_submitted"].includes(worker.status) ? "pass" : worker.status === "blocked" ? "fail" : "partial",
    adapters: Array.from(new Set(results.map((result) => result.adapter))),
    initial_model_tier: worker.initial_model_tier || null,
    final_model_tier: worker.model_tier || results.at(-1)?.model_tier || null,
    final_model_id: worker.model_id || results.at(-1)?.requested_model || null,
    models: Array.from(new Set(results.map((result) => result.reported_model || result.requested_model).filter(Boolean))),
    attempts: results.map((result) => ({
      result_id: result.result_id,
      adapter: result.adapter,
      model_tier: result.model_tier || null,
      requested_model: result.requested_model || null,
      reported_model: result.reported_model || null,
      status: result.status,
      failure_kind: result.failure_kind || null,
      exit_code: result.exit_code ?? null,
      duration_ms: result.duration_ms || 0,
      usage: result.usage || {
        input_tokens: null,
        output_tokens: null,
        tool_calls: null,
        agent_turns: null
      },
      summary: result.summary || ""
    })),
    failures: results.filter((result) => result.status === "FAIL").map((result) => result.failure_kind || "unknown"),
    changed_files: patch?.changed_files || Array.from(new Set(results.flatMap((result) => result.changed_files || []))),
    patch_id: patch?.patch_id || null,
    usage: results.reduce((total, result) => ({
      input_tokens: addNullable(total.input_tokens, result.usage?.input_tokens),
      output_tokens: addNullable(total.output_tokens, result.usage?.output_tokens),
      tool_calls: addNullable(total.tool_calls, result.usage?.tool_calls),
      agent_turns: addNullable(total.agent_turns, result.usage?.agent_turns),
      duration_ms: total.duration_ms + (result.duration_ms || 0)
    }), {
      input_tokens: null,
      output_tokens: null,
      tool_calls: null,
      agent_turns: null,
      duration_ms: 0
    })
  };
  if (record) writeJson(join38(dir, "worker-summary.json"), summary);
  return summary;
}
function addNullable(left, right) {
  if (left == null && right == null) return null;
  return Number(left || 0) + Number(right || 0);
}

// src/core/git-delivery.mjs
import {
  closeSync as closeSync2,
  existsSync as existsSync26,
  fsyncSync as fsyncSync2,
  mkdirSync as mkdirSync7,
  openSync as openSync2,
  readFileSync as readFileSync20,
  realpathSync as realpathSync6,
  renameSync as renameSync3,
  rmSync as rmSync8,
  statSync as statSync5,
  writeFileSync as writeFileSync13
} from "node:fs";
import { createHash as createHash12, randomUUID as randomUUID4 } from "node:crypto";
import { basename as basename8, isAbsolute as isAbsolute2, join as join39, resolve as resolve22 } from "node:path";
import { spawnSync as spawnSync11 } from "node:child_process";
var DEFAULT_PROTECTED_BRANCHES = Object.freeze([
  "main",
  "master",
  "trunk",
  "release/*"
]);
var DEFAULT_MAX_STAGED_FILES = 25;
var GitDeliveryError = class extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitDeliveryError";
    this.code = code;
    this.details = details;
  }
};
function discoverGitDelivery(repositoryPath, options = {}) {
  const repository = discoverRepository(repositoryPath);
  const protectedBranches = normalizeProtectedBranches(
    options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES
  );
  const branch = discoverCurrentBranch(repository.root_path);
  const components = normalizeComponents(options.components ?? []);
  const delivery = {
    schema_version: SCHEMA_VERSION,
    document_type: "git_delivery",
    discovered_at: (/* @__PURE__ */ new Date()).toISOString(),
    repository,
    current_branch: {
      ...branch,
      protected: branch.name != null && protectedBranches.some((pattern) => branchMatches(branch.name, pattern))
    },
    worktrees: discoverWorktrees(repository.root_path),
    components,
    pull_request: normalizePullRequest(options.pullRequest ?? null),
    protected_branches: protectedBranches,
    staged_files: discoverStagedFiles(repository.root_path)
  };
  assertContract("git-delivery.schema.json", delivery, repository.root_path);
  return delivery;
}
function claimCheckout(repositoryPath, ownerInput2) {
  const repository = discoverRepository(repositoryPath);
  const owner = normalizeOwner(ownerInput2);
  const paths = checkoutClaimPaths(repository);
  mkdirSync7(paths.parent, { recursive: true, mode: 448 });
  try {
    mkdirSync7(paths.claim_dir, { mode: 448 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readClaimRecord(paths.claim_dir, repository);
    assertSameOwner(existing.owner, owner);
    return existing;
  }
  const claim = {
    schema_version: SCHEMA_VERSION,
    document_type: "checkout_claim",
    kind: "checkout_claim",
    claim_token: randomUUID4(),
    repository_id: repository.repository_id,
    checkout_path: repository.root_path,
    owner,
    status: "active",
    claimed_at: (/* @__PURE__ */ new Date()).toISOString(),
    released_at: null
  };
  assertContract("git-delivery.schema.json", claim, paths.owner_path);
  try {
    writeExclusiveJson(paths.owner_path, claim);
    fsyncDirectory2(paths.claim_dir);
    fsyncDirectory2(paths.parent);
  } catch (error) {
    rmSync8(paths.claim_dir, { recursive: true, force: true });
    throw error;
  }
  return claim;
}
function readCheckoutClaim(repositoryPath) {
  const repository = discoverRepository(repositoryPath);
  const paths = checkoutClaimPaths(repository);
  if (!existsSync26(paths.claim_dir)) return null;
  return readClaimRecord(paths.claim_dir, repository);
}
function releaseCheckout(repositoryPath, releaseInput) {
  const repository = discoverRepository(repositoryPath);
  const owner = normalizeOwner(releaseInput);
  const claimToken = requiredString(releaseInput?.claim_token, "claim_token");
  const paths = checkoutClaimPaths(repository);
  if (!existsSync26(paths.claim_dir)) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_NOT_FOUND",
      `checkout \u6CA1\u6709 active claim\uFF1A${repository.root_path}`,
      { checkout_path: repository.root_path }
    );
  }
  const existing = readClaimRecord(paths.claim_dir, repository);
  assertSameOwner(existing.owner, owner);
  if (existing.claim_token !== claimToken) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_TOKEN_MISMATCH",
      `checkout claim token \u4E0D\u5339\u914D\uFF1A${repository.root_path}`,
      { checkout_path: repository.root_path }
    );
  }
  const releaseDir = `${paths.claim_dir}.releasing-${process.pid}-${randomUUID4()}`;
  try {
    renameSync3(paths.claim_dir, releaseDir);
  } catch (error) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_RELEASE_RACE",
      `checkout claim \u5728\u91CA\u653E\u65F6\u53D1\u751F\u5E76\u53D1\u53D8\u5316\uFF1A${repository.root_path}`,
      { checkout_path: repository.root_path, cause: error.message }
    );
  }
  try {
    const moved = readClaimRecord(releaseDir, repository);
    assertSameOwner(moved.owner, owner);
    if (moved.claim_token !== claimToken) {
      throw new GitDeliveryError(
        "CHECKOUT_CLAIM_TOKEN_MISMATCH",
        `checkout claim token \u5728\u91CA\u653E\u65F6\u53D1\u751F\u53D8\u5316\uFF1A${repository.root_path}`,
        { checkout_path: repository.root_path }
      );
    }
    rmSync8(releaseDir, { recursive: true, force: true });
    fsyncDirectory2(paths.parent);
  } catch (error) {
    if (existsSync26(releaseDir) && !existsSync26(paths.claim_dir)) {
      renameSync3(releaseDir, paths.claim_dir);
    }
    throw error;
  }
  const released = {
    ...existing,
    status: "released",
    released_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  assertContract("git-delivery.schema.json", released, repository.root_path);
  return released;
}
function assertGitDeliveryGuards(delivery, options = {}) {
  if (!delivery || delivery.document_type !== "git_delivery") {
    throw new GitDeliveryError(
      "INVALID_GIT_DELIVERY",
      "Git Delivery context \u65E0\u6548"
    );
  }
  assertContract(
    "git-delivery.schema.json",
    delivery,
    delivery.repository?.root_path || "git delivery"
  );
  const stagedFiles = delivery.staged_files.map(
    (path) => normalizeRepositoryPath(path, "staged file")
  );
  const protectedBranches = normalizeProtectedBranches(delivery.protected_branches);
  const branchName = delivery.current_branch?.name;
  const protectedBranch = branchName != null && protectedBranches.some((pattern) => branchMatches(branchName, pattern));
  if (protectedBranch && options.allowProtectedBranch !== true) {
    throw new GitDeliveryError(
      "PROTECTED_BRANCH",
      `\u62D2\u7EDD\u5728 protected branch \u4E0A\u4EA4\u4ED8\uFF1A${branchName}`,
      { branch: branchName }
    );
  }
  const maxStagedFiles = options.maxStagedFiles ?? DEFAULT_MAX_STAGED_FILES;
  if (!Number.isSafeInteger(maxStagedFiles) || maxStagedFiles < 0) {
    throw new GitDeliveryError(
      "INVALID_GUARD_CONFIGURATION",
      "maxStagedFiles \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570",
      { max_staged_files: maxStagedFiles }
    );
  }
  if (stagedFiles.length > maxStagedFiles) {
    throw new GitDeliveryError(
      "BROAD_STAGING",
      `staged files \u8D85\u51FA\u4E0A\u9650\uFF1A${stagedFiles.length} > ${maxStagedFiles}`,
      {
        staged_file_count: stagedFiles.length,
        max_staged_files: maxStagedFiles,
        staged_files: stagedFiles
      }
    );
  }
  let component = null;
  if (options.componentId != null) {
    const componentId = requiredIdentifier(options.componentId, "componentId");
    component = delivery.components.find((item) => item.component_id === componentId);
    if (!component) {
      throw new GitDeliveryError(
        "COMPONENT_NOT_FOUND",
        `Git Delivery component \u4E0D\u5B58\u5728\uFF1A${componentId}`,
        { component_id: componentId }
      );
    }
    const componentRoot = normalizeRepositoryPath(
      component.root_path,
      `component ${componentId}`
    );
    const outOfScopeFiles = stagedFiles.filter(
      (path) => !pathInsideComponent(path, componentRoot)
    );
    if (outOfScopeFiles.length > 0) {
      throw new GitDeliveryError(
        "COMPONENT_SCOPE_VIOLATION",
        `\u5B58\u5728\u8D8A\u51FA component scope \u7684 staged files\uFF1A${componentId}`,
        {
          component_id: componentId,
          component_root: componentRoot,
          out_of_scope_files: outOfScopeFiles
        }
      );
    }
  }
  return {
    status: "PASS",
    repository_id: delivery.repository.repository_id,
    branch: branchName,
    component_id: component?.component_id ?? null,
    staged_files: stagedFiles
  };
}
function discoverRepository(repositoryPath) {
  const requestedPath = canonicalDirectory(repositoryPath);
  const bare = runGit(requestedPath, ["rev-parse", "--is-bare-repository"]).trim() === "true";
  if (bare) {
    throw new GitDeliveryError(
      "BARE_REPOSITORY_UNSUPPORTED",
      `Git Delivery \u9700\u8981 non-bare checkout\uFF1A${requestedPath}`
    );
  }
  const rootPath = canonicalDirectory(
    runGit(requestedPath, ["rev-parse", "--show-toplevel"]).trim()
  );
  const gitDir = canonicalDirectory(
    runGit(rootPath, ["rev-parse", "--absolute-git-dir"]).trim()
  );
  const commonDir = canonicalDirectory(
    runGit(rootPath, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir"
    ]).trim()
  );
  const headOid = tryGit(rootPath, ["rev-parse", "--verify", "HEAD"]);
  return {
    kind: "repository",
    repository_id: createHash12("sha256").update(commonDir).digest("hex"),
    name: basename8(rootPath),
    root_path: rootPath,
    git_dir: gitDir,
    common_dir: commonDir,
    head_oid: headOid?.trim() || null,
    bare: false
  };
}
function discoverCurrentBranch(repositoryRoot) {
  const ref = tryGit(repositoryRoot, ["symbolic-ref", "--quiet", "HEAD"])?.trim() || null;
  const name = tryGit(repositoryRoot, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD"
  ])?.trim() || null;
  const headOid = tryGit(repositoryRoot, ["rev-parse", "--verify", "HEAD"])?.trim() || null;
  return {
    kind: "branch",
    name,
    ref,
    head_oid: headOid,
    detached: ref == null,
    protected: false
  };
}
function discoverWorktrees(repositoryRoot) {
  const output = runGitBuffer(repositoryRoot, [
    "worktree",
    "list",
    "--porcelain",
    "-z"
  ]).toString("utf8");
  const records = [];
  let current = {};
  for (const token of output.split("\0")) {
    if (token === "") {
      if (current.worktree) records.push(current);
      current = {};
      continue;
    }
    const separator = token.indexOf(" ");
    const key = separator === -1 ? token : token.slice(0, separator);
    const value = separator === -1 ? "" : token.slice(separator + 1);
    current[key] = value;
  }
  if (current.worktree) records.push(current);
  return records.map((record) => {
    const checkoutPath = existsSync26(record.worktree) ? realpathSync6(record.worktree) : resolve22(record.worktree);
    return {
      kind: "checkout",
      checkout_path: checkoutPath,
      head_oid: record.HEAD || null,
      branch: record.branch?.startsWith("refs/heads/") ? record.branch.slice("refs/heads/".length) : record.branch || null,
      detached: Object.hasOwn(record, "detached"),
      bare: Object.hasOwn(record, "bare"),
      locked: Object.hasOwn(record, "locked"),
      prunable: Object.hasOwn(record, "prunable"),
      is_current: checkoutPath === repositoryRoot
    };
  });
}
function discoverStagedFiles(repositoryRoot) {
  const output = runGitBuffer(repositoryRoot, [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMRDTUXB",
    "--no-ext-diff",
    "--no-textconv",
    "-z"
  ]).toString("utf8");
  return [...new Set(
    output.split("\0").filter(Boolean).map((path) => normalizeRepositoryPath(path, "staged file"))
  )].sort();
}
function normalizeComponents(components) {
  if (!Array.isArray(components)) {
    throw new GitDeliveryError(
      "INVALID_COMPONENT",
      "components \u5FC5\u987B\u662F\u6570\u7EC4"
    );
  }
  const seen = /* @__PURE__ */ new Set();
  return components.map((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      throw new GitDeliveryError("INVALID_COMPONENT", "component \u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const componentId = requiredIdentifier(component.component_id, "component_id");
    if (seen.has(componentId)) {
      throw new GitDeliveryError(
        "DUPLICATE_COMPONENT",
        `component_id \u91CD\u590D\uFF1A${componentId}`
      );
    }
    seen.add(componentId);
    return {
      kind: "component",
      component_id: componentId,
      root_path: normalizeRepositoryPath(component.root_path, `component ${componentId}`)
    };
  });
}
function normalizePullRequest(pullRequest) {
  if (pullRequest == null) return null;
  if (typeof pullRequest !== "object" || Array.isArray(pullRequest)) {
    throw new GitDeliveryError("INVALID_PULL_REQUEST", "pullRequest \u5FC5\u987B\u662F\u5BF9\u8C61\u6216 null");
  }
  const provider = requiredString(pullRequest.provider, "pullRequest.provider");
  const allowedProviders = /* @__PURE__ */ new Set([
    "github",
    "gitlab",
    "bitbucket",
    "azure_devops",
    "gitea",
    "other"
  ]);
  if (!allowedProviders.has(provider)) {
    throw new GitDeliveryError(
      "INVALID_PULL_REQUEST",
      `\u4E0D\u652F\u6301\u7684 pull request provider\uFF1A${provider}`
    );
  }
  const status2 = pullRequest.status == null ? "unknown" : requiredString(pullRequest.status, "pullRequest.status");
  if (!["open", "draft", "closed", "merged", "unknown"].includes(status2)) {
    throw new GitDeliveryError(
      "INVALID_PULL_REQUEST",
      `\u4E0D\u652F\u6301\u7684 pull request status\uFF1A${status2}`
    );
  }
  const normalized = {
    kind: "pull_request",
    provider,
    pr_id: requiredString(pullRequest.pr_id, "pullRequest.pr_id"),
    base_branch: requiredString(pullRequest.base_branch, "pullRequest.base_branch"),
    head_branch: requiredString(pullRequest.head_branch, "pullRequest.head_branch"),
    status: status2
  };
  if (pullRequest.url != null) {
    normalized.url = requiredString(pullRequest.url, "pullRequest.url");
  }
  return normalized;
}
function normalizeProtectedBranches(patterns) {
  if (!Array.isArray(patterns)) {
    throw new GitDeliveryError(
      "INVALID_PROTECTED_BRANCHES",
      "protectedBranches \u5FC5\u987B\u662F\u6570\u7EC4"
    );
  }
  return [...new Set(patterns.map((pattern) => {
    const value = requiredString(pattern, "protected branch pattern");
    if (value.includes("\0") || value.includes("..") || /\s/.test(value)) {
      throw new GitDeliveryError(
        "INVALID_PROTECTED_BRANCHES",
        `protected branch pattern \u4E0D\u5B89\u5168\uFF1A${value}`
      );
    }
    return value;
  }))];
}
function normalizeOwner(owner) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner)) {
    throw new GitDeliveryError("INVALID_CHECKOUT_OWNER", "checkout owner \u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  const normalized = {
    owner_id: requiredString(owner.owner_id, "owner_id")
  };
  if (owner.run_id != null) normalized.run_id = requiredString(owner.run_id, "run_id");
  if (owner.worker_id != null) {
    normalized.worker_id = requiredString(owner.worker_id, "worker_id");
  }
  return normalized;
}
function assertSameOwner(existingOwner, requestedOwner) {
  if (existingOwner.owner_id !== requestedOwner.owner_id || (existingOwner.run_id ?? null) !== (requestedOwner.run_id ?? null) || (existingOwner.worker_id ?? null) !== (requestedOwner.worker_id ?? null)) {
    throw new GitDeliveryError(
      "CHECKOUT_OWNED_BY_FOREIGN_OWNER",
      `checkout \u5DF2\u7531\u5176\u4ED6 owner \u6301\u6709\uFF1A${existingOwner.owner_id}`,
      { current_owner: existingOwner, requested_owner: requestedOwner }
    );
  }
}
function checkoutClaimPaths(repository) {
  const key = createHash12("sha256").update(repository.root_path).digest("hex");
  const parent = join39(repository.common_dir, "apex-forge", "checkout-claims");
  const claimDir = join39(parent, `${key}.claim`);
  return {
    parent,
    claim_dir: claimDir,
    owner_path: join39(claimDir, "owner.json")
  };
}
function readClaimRecord(claimDir, repository) {
  const ownerPath = join39(claimDir, "owner.json");
  let claim;
  try {
    claim = JSON.parse(readFileSync20(ownerPath, "utf8"));
    assertContract("git-delivery.schema.json", claim, ownerPath);
  } catch (error) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_CORRUPT",
      `checkout claim \u65E0\u6CD5\u5B89\u5168\u8BFB\u53D6\uFF0C\u62D2\u7EDD\u63A5\u7BA1\uFF1A${repository.root_path}`,
      { checkout_path: repository.root_path, cause: error.message }
    );
  }
  if (claim.status !== "active" || claim.repository_id !== repository.repository_id || claim.checkout_path !== repository.root_path) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_CORRUPT",
      `checkout claim identity \u4E0D\u5339\u914D\uFF0C\u62D2\u7EDD\u63A5\u7BA1\uFF1A${repository.root_path}`,
      { checkout_path: repository.root_path }
    );
  }
  return claim;
}
function normalizeRepositoryPath(path, label) {
  const value = requiredString(path, label);
  if (value.includes("\0") || isAbsolute2(value) || /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\")) {
    throw new GitDeliveryError(
      "UNSAFE_REPOSITORY_PATH",
      `${label} \u4E0D\u662F\u5B89\u5168\u7684 repository-relative path\uFF1A${value}`,
      { path: value }
    );
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "..")) {
    throw new GitDeliveryError(
      "UNSAFE_REPOSITORY_PATH",
      `${label} \u8BD5\u56FE\u8D8A\u51FA repository\uFF1A${value}`,
      { path: value }
    );
  }
  const normalized = parts.filter((part) => part !== "" && part !== ".").join("/");
  if (value === "." || normalized === "") return ".";
  return normalized;
}
function pathInsideComponent(path, componentRoot) {
  if (componentRoot === ".") return true;
  return path === componentRoot || path.startsWith(`${componentRoot}/`);
}
function branchMatches(branch, pattern) {
  const expression = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${expression}$`).test(branch);
}
function requiredIdentifier(value, label) {
  const normalized = requiredString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new GitDeliveryError(
      "INVALID_IDENTIFIER",
      `${label} \u4E0D\u662F\u5B89\u5168\u6807\u8BC6\u7B26\uFF1A${normalized}`
    );
  }
  return normalized;
}
function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GitDeliveryError(
      "INVALID_GIT_DELIVERY_INPUT",
      `${label} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`
    );
  }
  if (value.includes("\0")) {
    throw new GitDeliveryError(
      "INVALID_GIT_DELIVERY_INPUT",
      `${label} \u5305\u542B NUL`
    );
  }
  return value;
}
function canonicalDirectory(path) {
  const value = requiredString(String(path ?? ""), "repository path");
  let canonical;
  try {
    canonical = realpathSync6(value);
  } catch (error) {
    throw new GitDeliveryError(
      "REPOSITORY_PATH_NOT_FOUND",
      `repository path \u4E0D\u5B58\u5728\uFF1A${value}`,
      { path: value, cause: error.message }
    );
  }
  if (!statSync5(canonical).isDirectory()) {
    throw new GitDeliveryError(
      "REPOSITORY_PATH_NOT_DIRECTORY",
      `repository path \u4E0D\u662F\u76EE\u5F55\uFF1A${canonical}`,
      { path: canonical }
    );
  }
  return canonical;
}
function runGit(cwd, args) {
  const result = spawnSync11("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnvironment()
  });
  if (result.status !== 0) throw gitCommandError(cwd, args, result);
  return result.stdout;
}
function runGitBuffer(cwd, args) {
  const result = spawnSync11("git", args, {
    cwd,
    encoding: "buffer",
    env: gitEnvironment()
  });
  if (result.status !== 0) throw gitCommandError(cwd, args, result);
  return result.stdout;
}
function tryGit(cwd, args) {
  const result = spawnSync11("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnvironment()
  });
  if (result.status === 0) return result.stdout;
  if (result.status === 1) return null;
  throw gitCommandError(cwd, args, result);
}
function gitEnvironment() {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0"
  };
}
function gitCommandError(cwd, args, result) {
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
  return new GitDeliveryError(
    "GIT_DISCOVERY_FAILED",
    `\u672C\u5730 git \u53D1\u73B0\u5931\u8D25\uFF1Agit ${args.join(" ")}`,
    {
      cwd,
      status: result.status,
      stderr: String(stderr || "").trim()
    }
  );
}
function writeExclusiveJson(path, value) {
  let descriptor = null;
  try {
    descriptor = openSync2(path, "wx", 384);
    writeFileSync13(descriptor, `${JSON.stringify(value, null, 2)}
`);
    fsyncSync2(descriptor);
    closeSync2(descriptor);
    descriptor = null;
  } finally {
    if (descriptor != null) closeSync2(descriptor);
  }
}
function fsyncDirectory2(path) {
  let descriptor = null;
  try {
    descriptor = openSync2(path, "r");
    fsyncSync2(descriptor);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error.code)) throw error;
  } finally {
    if (descriptor != null) closeSync2(descriptor);
  }
}

// src/commands/worker.mjs
function handleWorkerCommand(subcommand, args) {
  if (subcommand === "create") {
    createWorker(args);
    return;
  }
  if (subcommand === "list") {
    listWorkers(args);
    return;
  }
  if (subcommand === "submit-patch") {
    submitWorkerPatch(args);
    return;
  }
  if (subcommand === "sandbox") {
    handleWorkerSandbox(args);
    return;
  }
  if (subcommand === "promote-sandbox") {
    promoteWorkerSandbox(args);
    return;
  }
  if (subcommand === "exec-shell") {
    execWorkerShell(args);
    return;
  }
  if (subcommand === "exec-agent") {
    execWorkerAgent(args);
    return;
  }
  if (subcommand === "adapters") {
    listWorkerAdapters(args);
    return;
  }
  if (subcommand === "retry") {
    retryWorker(args);
    return;
  }
  if (subcommand === "fallback") {
    fallbackWorker(args);
    return;
  }
  if (subcommand === "results") {
    const root = requireStore(projectRoot(args));
    const worker = findWorker(root, required(args, "worker-id"));
    console.log(JSON.stringify(buildWorkerSummary(root, worker, Boolean(args.record)), null, 2));
    return;
  }
  if (subcommand === "resume") {
    resumeWorkerAgent(args);
    return;
  }
  if (subcommand === "decide") {
    decideWorker(args);
    return;
  }
  throw new Error(`\u672A\u77E5 worker \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function createWorker(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  requirePassedNode(run, "plan_graph");
  const plan = loadPlanGraph2(root, run.run_id);
  const planNodeId = required(args, "plan-node-id");
  const planNode2 = getPlanNode(plan, planNodeId);
  if (getWorkers(root, run.run_id).some((worker2) => worker2.plan_node_id === planNode2.id && worker2.status !== "merged")) {
    throw new Error(`plan node \u5DF2\u6709\u672A\u5B8C\u6210 worker\uFF1A${planNode2.id}`);
  }
  const worker = createWorkerForPlanNode(root, run, planNode2, {
    mode: args.mode ? String(args.mode) : null
  });
  console.log(JSON.stringify(worker, null, 2));
}
function listWorkers(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  console.log(JSON.stringify(getWorkers(root, runId), null, 2));
}
function handleWorkerSandbox(args) {
  const action = args._[0];
  if (action === "init") {
    initWorkerSandbox(args);
    return;
  }
  if (action === "write") {
    writeWorkerSandbox(args);
    return;
  }
  throw new Error(`\u672A\u77E5 worker sandbox \u52A8\u4F5C\uFF1A${action || "(\u7A7A)"}`);
}
function initWorkerSandbox(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const requestedType = normalizeEnum(args.type || "scratch", ["scratch", "worktree"], "type");
  const initialized = initializeWorkerSandbox(root, worker, requestedType);
  console.log(JSON.stringify(initialized, null, 2));
}
function initializeWorkerSandbox(root, worker, requestedType) {
  const projectDir = resolve23(root, "..");
  const existingDir = worker.sandbox?.path ? resolve23(projectDir, worker.sandbox.path) : null;
  if (worker.sandbox?.status === "ready" && existingDir && existsSync27(existingDir)) {
    const manifest2 = readJson(join40(existingDir, "sandbox.json"), null);
    if (worker.sandbox.type === "worktree" && worker.sandbox.checkout_claim_token) {
      const claim = claimCheckout(existingDir, checkoutOwner(worker));
      if (claim.claim_token !== worker.sandbox.checkout_claim_token) {
        throw new Error(`worktree checkout claim token \u6F02\u79FB\uFF1A${worker.worker_id}`);
      }
    }
    return { worker, manifest: manifest2 };
  }
  const gitRoot = findGitRoot(projectDir);
  const useWorktree = requestedType === "worktree" && gitRoot;
  const dir = join40(workerDir(root, worker.run_id, worker.worker_id), "sandbox");
  if (useWorktree) {
    ensureDir(dirnameForPath(dir));
    const result = spawnSync12("git", ["worktree", "add", "--detach", dir, "HEAD"], {
      cwd: gitRoot,
      encoding: "utf8"
    });
    if (result.status !== 0 && !existsSync27(dir)) {
      throw new Error(`git worktree add \u5931\u8D25\uFF1A${result.stderr || result.stdout}`);
    }
  } else {
    ensureDir(dir);
    copyProjectIntoScratchSandbox(projectDir, dir);
  }
  copyProjectContextSnapshot(projectDir, dir);
  const actualType = useWorktree ? "worktree" : "scratch";
  const fallbackReason = requestedType === "worktree" && !gitRoot ? "\u5F53\u524D\u9879\u76EE\u4E0D\u662F git repository\uFF0C\u964D\u7EA7\u4E3A scratch sandbox\u3002" : "";
  let checkoutClaim = null;
  if (useWorktree) {
    try {
      checkoutClaim = claimCheckout(dir, checkoutOwner(worker));
    } catch (error) {
      spawnSync12("git", ["worktree", "remove", dir, "--force"], {
        cwd: gitRoot,
        encoding: "utf8"
      });
      throw error;
    }
  }
  const manifest = {
    schema_version: SCHEMA_VERSION,
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    requested_type: requestedType,
    type: actualType,
    fallback_reason: fallbackReason,
    checkout_owner_id: checkoutClaim?.owner.owner_id || null,
    checkout_claim_token: checkoutClaim?.claim_token || null,
    created_at: now(),
    read_scope: worker.read_scope,
    write_scope: worker.write_scope,
    verification: worker.verification
  };
  writeJson(join40(dir, "sandbox.json"), manifest);
  ensureDir(join40(dir, ".apex-agent"));
  writeTextIfMissing(join40(dir, ".apex-agent", "README.md"), `# Worker Sandbox

\u672C\u76EE\u5F55\u662F worker \u7684\u9694\u79BB ${actualType} sandbox\u3002

- worker_id: ${worker.worker_id}
- run_id: ${worker.run_id}
- plan_node_id: ${worker.plan_node_id}

\u771F\u5B9E\u4EE3\u7801\u5199\u5165\u4ECD\u5FC5\u987B\u901A\u8FC7 patch bundle \u548C merge gate\u3002
`);
  worker.sandbox = {
    type: actualType,
    path: `${worker.namespace}/sandbox`,
    status: "ready",
    fallback_reason: fallbackReason,
    checkout_owner_id: checkoutClaim?.owner.owner_id || null,
    checkout_claim_token: checkoutClaim?.claim_token || null
  };
  worker.updated_at = now();
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.sandbox.initialized", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    sandbox: worker.sandbox.path
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  copyProjectContextSnapshot(projectDir, dir);
  return { worker, manifest };
}
function copyProjectIntoScratchSandbox(projectDir, sandboxDir) {
  const ignored = /* @__PURE__ */ new Set([
    ".git",
    ".apex-v2",
    ".apex-v2.lock",
    ".apex-v2.transaction-backups",
    "node_modules"
  ]);
  for (const entry of readdirSync17(projectDir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    cpSync3(join40(projectDir, entry.name), join40(sandboxDir, entry.name), {
      recursive: true,
      force: true
    });
  }
  const nodeModules = join40(projectDir, "node_modules");
  const sandboxNodeModules = join40(sandboxDir, "node_modules");
  if (existsSync27(nodeModules) && !existsSync27(sandboxNodeModules)) {
    symlinkSync3(nodeModules, sandboxNodeModules, "dir");
  }
}
function copyProjectContextSnapshot(projectDir, sandboxDir) {
  const sourceRoot = join40(projectDir, ".apex-v2");
  if (!existsSync27(sourceRoot)) return;
  const targetRoot = join40(sandboxDir, ".apex-v2");
  ensureDir(targetRoot);
  for (const relativePath of [
    "project.json",
    "events.jsonl",
    "intake",
    "roadmap",
    "knowledge",
    "risks",
    "policies",
    "learning",
    "approvals",
    "metrics"
  ]) {
    const source = join40(sourceRoot, relativePath);
    if (!existsSync27(source)) continue;
    cpSync3(source, join40(targetRoot, relativePath), {
      recursive: true,
      force: true
    });
  }
}
function writeWorkerSandbox(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  ensureWorkerSandboxReady(worker);
  const sandboxPath = required(args, "path");
  assertSafeRelativePath(sandboxPath);
  const target = resolve23(root, "..", worker.sandbox.path, sandboxPath);
  ensureDir(dirnameForPath(target));
  writeFileSync14(target, required(args, "content"));
  const event = appendEvent(root, "worker.sandbox.written", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    path: `${worker.sandbox.path}/${sandboxPath}`
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ worker_id: worker.worker_id, path: `${worker.sandbox.path}/${sandboxPath}` }, null, 2));
}
function promoteWorkerSandbox(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const sandboxPath = required(args, "sandbox-path");
  const targetFile = required(args, "target-file");
  const summary = required(args, "summary");
  const result = withProjectTransaction(resolve23(root, ".."), {
    kind: "worker-promote-sandbox",
    idempotencyKey: transitionKey("worker-promote-sandbox", {
      worker_id: worker.worker_id,
      sandbox_path: sandboxPath,
      target_file: targetFile,
      summary
    })
  }, () => promoteWorkerSandboxTransaction(
    root,
    worker,
    sandboxPath,
    targetFile,
    summary,
    splitList(args.evidence)
  )).result;
  console.log(JSON.stringify(result, null, 2));
}
function promoteWorkerSandboxTransaction(root, worker, sandboxPath, targetFile, summary, evidenceRefs) {
  ensureWorkerSandboxReady(worker);
  assertSafeRelativePath(sandboxPath);
  assertSafeRelativePath(targetFile);
  if (!isFileAllowedByScope(targetFile, worker.write_scope)) {
    throw new Error(`sandbox promote \u76EE\u6807\u8D85\u51FA worker write_scope\uFF1A${targetFile}`);
  }
  const source = resolve23(root, "..", worker.sandbox.path, sandboxPath);
  if (!existsSync27(source)) throw new Error(`sandbox \u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${sandboxPath}`);
  const content = readFileSync21(source, "utf8");
  const run = loadRun(root, worker.run_id);
  const timestamp = now();
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary,
    changed_files: [targetFile],
    operations: [{ op: "write_text", path: targetFile, content }],
    evidence_refs: evidenceRefs,
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);
  persistPatchBundle(root, patch);
  worker.status = "patch_submitted";
  worker.updated_at = timestamp;
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const artifact = createArtifact(root, run, "execute", {
    type: "patch",
    title: `SandboxPatch\uFF1A${worker.plan_node_id}`,
    body: patch.summary,
    refs: [
      patchBundleRef(worker, patch.patch_id),
      `${worker.sandbox.path}/${sandboxPath}`,
      targetFile
    ],
    timestamp
  });
  const event = appendEvent(root, "worker.sandbox.promoted", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    patch_id: patch.patch_id,
    artifact_id: artifact.artifact_id,
    target_file: targetFile
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { patch, artifact_id: artifact.artifact_id };
}
function submitWorkerPatch(args) {
  const root = requireStore(projectRoot(args));
  const workerId = required(args, "worker-id");
  const worker = findWorker(root, workerId);
  const result = withProjectTransaction(resolve23(root, ".."), {
    kind: "worker-submit-patch",
    idempotencyKey: transitionKey("worker-submit-patch", {
      worker_id: workerId,
      summary: args.summary,
      files: args.files,
      write_text_file: args["write-text-file"],
      write_text: args["write-text"],
      replace_file: args["replace-file"],
      old_text: args["old-text"],
      new_text: args["new-text"],
      evidence: args.evidence
    })
  }, () => submitWorkerPatchTransaction(root, worker, args)).result;
  console.log(JSON.stringify(result, null, 2));
}
function submitWorkerPatchTransaction(root, worker, args) {
  const run = loadRun(root, worker.run_id);
  const changedFiles = splitList(required(args, "files"));
  if (changedFiles.length === 0) throw new Error("patch bundle \u5FC5\u987B\u5305\u542B changed files");
  const operations = buildPatchOperations(args);
  for (const operation of operations) {
    if (!changedFiles.includes(operation.path)) {
      throw new Error(`operation path \u5FC5\u987B\u5305\u542B\u5728 changed_files \u4E2D\uFF1A${operation.path}`);
    }
  }
  const outOfScope = changedFiles.filter((file) => !isFileAllowedByScope(file, worker.write_scope));
  if (outOfScope.length > 0) {
    throw new Error(`patch \u4FEE\u6539\u8D85\u51FA worker write_scope\uFF1A${outOfScope.join(", ")}`);
  }
  const timestamp = now();
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary: required(args, "summary"),
    changed_files: changedFiles,
    operations,
    evidence_refs: splitList(args.evidence),
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);
  persistPatchBundle(root, patch);
  worker.status = "patch_submitted";
  worker.updated_at = timestamp;
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const artifact = createArtifact(root, run, "execute", {
    type: "patch",
    title: `PatchBundle\uFF1A${worker.plan_node_id}`,
    body: patch.summary,
    refs: [
      patchBundleRef(worker, patch.patch_id),
      ...changedFiles
    ],
    timestamp
  });
  const event = appendEvent(root, "worker.patch.submitted", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    patch_id: patch.patch_id,
    artifact_id: artifact.artifact_id,
    changed_files: changedFiles
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { patch, artifact_id: artifact.artifact_id };
}
function execWorkerShell(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const worker = findWorker(root, required(args, "worker-id"));
  if (!["active", "evidence_submitted", "decision_submitted"].includes(worker.status)) {
    throw new Error(`worker \u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u6267\u884C shell adapter\uFF1A${worker.status}`);
  }
  const command = required(args, "cmd");
  const result = executeWorkerShell(
    root,
    worker,
    command,
    "manual",
    parseCapabilityEvidence2(args)
  );
  console.log(JSON.stringify({ result: result.adapterResult, artifact_id: result.artifact.artifact_id }, null, 2));
}
function parseCapabilityEvidence2(args) {
  const inline2 = args["capability-evidence-json"];
  const file = args["capability-evidence-file"];
  if (!inline2 && !file) return [];
  if (inline2 && file) {
    throw new Error(
      "\u53EA\u80FD\u6307\u5B9A --capability-evidence-json \u6216 --capability-evidence-file \u4E4B\u4E00"
    );
  }
  let value;
  try {
    value = JSON.parse(
      file ? readFileSync21(resolve23(String(file)), "utf8") : String(inline2)
    );
  } catch (error) {
    throw new Error(`capability evidence JSON \u65E0\u6548\uFF1A${error.message}`);
  }
  if (!Array.isArray(value)) {
    throw new Error("capability evidence JSON \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  return value;
}
function execWorkerAgent(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const worker = findWorker(root, required(args, "worker-id"));
  const adapter = normalizeEnum(args.adapter || worker.adapter || "codex", ["codex", "claude", "gemini"], "adapter");
  assertAdapterAllowed(root, adapter);
  const plan = loadPlanGraph2(root, worker.run_id);
  const planNode2 = getPlanNode(plan, worker.plan_node_id);
  const requestedTimeoutMs = Number(args["timeout-ms"] || 30 * 60 * 1e3);
  const route = readJson(join40(workerDir(root, worker.run_id, worker.worker_id), "execution-route.json"), null);
  const timeoutMs = effectiveAgentTimeout(root, requestedTimeoutMs, route?.cost_budget);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms \u5FC5\u987B\u662F\u6B63\u6574\u6570");
  }
  const result = executeWorkerExecutor(root, worker, planNode2, {
    command: args.command ? String(args.command) : void 0,
    adapter,
    model: args.model ? String(args.model) : void 0,
    profile: args.profile ? String(args.profile) : void 0,
    timeoutMs,
    executionClaimToken: args["execution-claim-token"] ? String(args["execution-claim-token"]) : null
  });
  console.log(JSON.stringify({
    result: result.adapterResult,
    patch: result.patch,
    artifact_id: result.artifact.artifact_id
  }, null, 2));
}
function listWorkerAdapters(args) {
  const root = requireStore(projectRoot(args));
  const adapters = [
    { adapter: "shell", available: true, mode: "command evidence" },
    { adapter: "human", available: true, mode: "structured decision" },
    ...inspectWorkerExecutors().map((item) => ({ ...item, mode: "isolated coding agent" }))
  ];
  if (args.history) {
    console.log(JSON.stringify(buildAdapterTrend(root), null, 2));
    return;
  }
  if (args.smoke) {
    const report = runAdapterSmoke({
      live: Boolean(args.live),
      adapters: args.adapter ? splitList(args.adapter) : void 0,
      timeoutMs: Number(args["timeout-ms"] || 18e4)
    });
    if (args.record) {
      recordAdapterSmokeReport(root, report, {
        trigger: "manual",
        inspections: adapters.filter((item) => !["shell", "human"].includes(item.adapter))
      });
    }
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
    return;
  }
  if (args.diff) {
    console.log(JSON.stringify(evaluateAdapterCapabilityDrift(root, adapters), null, 2));
    return;
  }
  if (args.record) {
    const drift = evaluateAdapterCapabilityDrift(root, adapters);
    const approval = ensureAdapterBaselineApproval(root, drift);
    if (!approval.allowed) {
      if (approval.created) {
        const event = appendEvent(root, "approval.requested", "apex-v2", {
          approval_id: approval.approval.id,
          kind: "adapter_baseline",
          fingerprint: approval.approval.fingerprint,
          reasons: approval.approval.reasons
        });
        updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
      }
      throw new Error(`adapter baseline approval required\uFF1A${approval.approval.id}=${approval.approval.decision || "pending"}`);
    }
    ensureDir(join40(root, "adapters"));
    writeJson(join40(root, "adapters", "capabilities.json"), {
      schema_version: SCHEMA_VERSION,
      generated_at: now(),
      adapters
    });
    recordAdapterObservation(root, adapters, { source: "baseline" });
  }
  console.log(JSON.stringify(adapters, null, 2));
}
function evaluateAdapterCapabilityDrift(root, adapters = null) {
  const currentAdapters = adapters || [
    { adapter: "shell", available: true, mode: "command evidence" },
    { adapter: "human", available: true, mode: "structured decision" },
    ...inspectWorkerExecutors().map((item) => ({ ...item, mode: "isolated coding agent" }))
  ];
  const baseline = readJson(join40(root, "adapters", "capabilities.json"), null);
  const previous = new Map((baseline?.adapters || []).map((item) => [item.adapter, item]));
  const changes = [];
  for (const current of currentAdapters) {
    const before = previous.get(current.adapter);
    if (!before) {
      changes.push({ adapter: current.adapter, kind: "added", severity: "info" });
      continue;
    }
    if (before.available && !current.available) changes.push({ adapter: current.adapter, kind: "unavailable", severity: "blocking" });
    if (before.version && current.version && before.version !== current.version) changes.push({ adapter: current.adapter, kind: "version_changed", from: before.version, to: current.version, severity: "info" });
    const removed = (before.capabilities || []).filter((capability) => !(current.capabilities || []).includes(capability));
    if (removed.length > 0) changes.push({ adapter: current.adapter, kind: "capabilities_removed", capabilities: removed, severity: "blocking" });
  }
  return { status: changes.some((change) => change.severity === "blocking") ? "FAIL" : "PASS", baseline_generated_at: baseline?.generated_at || null, changes, adapters: currentAdapters };
}
function retryWorker(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const result = retryWorkerInternal(root, worker, "manual");
  console.log(JSON.stringify(result, null, 2));
}
function fallbackWorker(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const result = fallbackWorkerInternal(root, worker, "manual");
  console.log(JSON.stringify(result, null, 2));
}
function resumeWorkerAgent(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  if (worker.status !== "blocked") throw new Error(`\u53EA\u6709 blocked worker \u53EF\u4EE5 resume\uFF1A${worker.status}`);
  if (!worker.session_id || !["claude", "gemini"].includes(worker.session_adapter)) {
    throw new Error(`worker \u6CA1\u6709\u53EF\u6062\u590D session\uFF1A${worker.worker_id}`);
  }
  resetWorkerSandbox(root, worker);
  worker.adapter = worker.session_adapter;
  worker.status = "active";
  initializeWorkerSandbox(root, worker, "scratch");
  const plan = loadPlanGraph2(root, worker.run_id);
  const planNode2 = getPlanNode(plan, worker.plan_node_id);
  const timeoutMs = effectiveAgentTimeout(root, Number(args["timeout-ms"] || 30 * 60 * 1e3));
  const result = executeWorkerExecutor(root, worker, planNode2, {
    adapter: worker.session_adapter,
    sessionId: worker.session_id,
    timeoutMs
  });
  const event = appendEvent(root, "worker.session.resumed", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    adapter: worker.session_adapter,
    session_id: worker.session_id,
    status: result.adapterResult.status
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ result: result.adapterResult, patch: result.patch, artifact_id: result.artifact.artifact_id }, null, 2));
}
function fallbackWorkerInternal(root, worker, via) {
  if (worker.status !== "blocked") throw new Error(`\u53EA\u6709 blocked worker \u53EF\u4EE5 fallback\uFF1A${worker.status}`);
  const latest = latestWorkerAdapterResult(root, worker);
  const failureKind = latest?.failure_kind || "unknown";
  const policy = readJson(join40(root, "policies", "execution.json"));
  if (!policy.permissions.adapter_fallback_failure_kinds.includes(failureKind)) {
    throw new Error(`failure_kind \u4E0D\u5141\u8BB8 adapter fallback\uFF1A${failureKind}`);
  }
  const current = worker.last_adapter || worker.adapter;
  const order = policy.permissions.adapter_fallback_order;
  const start = Math.max(-1, order.indexOf(current));
  const available = new Map(inspectWorkerExecutors().map((item) => [item.adapter, item]));
  const next = order.slice(start + 1).find(
    (name) => policy.permissions.allowed_adapters.includes(name) && available.get(name)?.available
  );
  if (!next) throw new Error(`\u6CA1\u6709\u53EF\u7528 fallback adapter\uFF0Ccurrent=${current}`);
  resetWorkerSandbox(root, worker);
  worker.adapter = next;
  worker.executor_id = next;
  worker.status = "active";
  worker.execution_claim_token = null;
  worker.execution_claimed_at = null;
  worker.execution_claim_expires_at = null;
  worker.updated_at = now();
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.adapter.fallback", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    from: current,
    to: next,
    failure_kind: failureKind,
    via
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { worker, from: current, to: next, failure_kind: failureKind };
}
function retryWorkerInternal(root, worker, via) {
  if (worker.status !== "blocked") {
    throw new Error(`\u53EA\u6709 blocked worker \u53EF\u4EE5 retry\uFF0C\u5F53\u524D\u72B6\u6001\uFF1A${worker.status}`);
  }
  const policy = readJson(join40(root, "policies", "retry.json"));
  const adapter = worker.last_adapter || worker.adapter || "shell";
  const maxAttempts = Number(policy.max_attempts?.[adapter] || 1);
  const latestResult = latestWorkerAdapterResult(root, worker);
  const failureKind = latestResult?.failure_kind || "unknown";
  if (Number(worker.attempt || 0) >= maxAttempts) {
    throw new Error(`worker \u5DF2\u8FBE\u5230 ${adapter} \u6700\u5927\u5C1D\u8BD5\u6B21\u6570\uFF1A${worker.attempt}/${maxAttempts}`);
  }
  if (!policy.auto_retry.retryable_failure_kinds.includes(failureKind)) {
    throw new Error(`failure_kind \u4E0D\u5141\u8BB8 retry\uFF1A${failureKind}`);
  }
  if (policy.auto_retry.reset_sandbox) resetWorkerSandbox(root, worker);
  worker.status = "active";
  worker.execution_claim_token = null;
  worker.execution_claimed_at = null;
  worker.execution_claim_expires_at = null;
  worker.updated_at = now();
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.retry.requested", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    attempt: worker.attempt,
    max_attempts: maxAttempts,
    failure_kind: failureKind,
    via
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    worker,
    policy: {
      adapter,
      attempt: worker.attempt,
      max_attempts: maxAttempts,
      failure_kind: failureKind
    }
  };
}
function resetWorkerSandbox(root, worker) {
  if (!worker.sandbox?.path) return;
  const projectDir = resolve23(root, "..");
  const sandboxDir = resolve23(projectDir, worker.sandbox.path);
  if (existsSync27(sandboxDir) && worker.sandbox.type === "worktree") {
    if (worker.sandbox.checkout_claim_token) {
      releaseCheckout(sandboxDir, {
        ...checkoutOwner(worker),
        claim_token: worker.sandbox.checkout_claim_token
      });
    }
    spawnSync12("git", ["worktree", "remove", sandboxDir, "--force"], {
      cwd: projectDir,
      encoding: "utf8"
    });
  }
  rmSync9(sandboxDir, { recursive: true, force: true });
  worker.sandbox = {
    type: "none",
    path: "",
    status: "missing"
  };
}
function checkoutOwner(worker) {
  return {
    owner_id: `apex-v2-worker:${worker.worker_id}`,
    run_id: worker.run_id,
    worker_id: worker.worker_id
  };
}
function latestWorkerAdapterResult(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (!existsSync27(dir)) return null;
  return readdirSync17(dir).filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json")).map((file) => readJson(join40(dir, file))).sort((left, right) => right.created_at.localeCompare(left.created_at))[0] || null;
}
function decideWorker(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  if (!["active", "evidence_submitted", "decision_submitted"].includes(worker.status)) {
    throw new Error(`worker \u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u6267\u884C human adapter\uFF1A${worker.status}`);
  }
  const timestamp = now();
  const adapterResult = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: "human",
    status: "DECISION",
    decision: required(args, "decision"),
    summary: String(args.summary || ""),
    refs: splitList(args.refs),
    created_at: timestamp
  };
  const file = `adapter-result-${adapterResult.result_id}.json`;
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), file), adapterResult);
  worker.status = "decision_submitted";
  worker.updated_at = timestamp;
  writeJson(join40(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const run = loadRun(root, worker.run_id);
  const artifact = createArtifact(root, run, "execute", {
    type: "decision",
    title: "HumanAdapter\uFF1Adecision submitted",
    body: `${adapterResult.decision}

${adapterResult.summary}`,
    refs: [`${worker.namespace}/${file}`, ...adapterResult.refs],
    timestamp
  });
  const event = appendEvent(root, "worker.adapter.human", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: adapterResult.result_id,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ result: adapterResult, artifact_id: artifact.artifact_id }, null, 2));
}
function buildPatchOperations(args) {
  const operations = [];
  if (args["write-text-file"] || args["write-text"]) {
    operations.push({
      op: "write_text",
      path: required(args, "write-text-file"),
      content: required(args, "write-text")
    });
  }
  if (args["replace-file"] || args["old-text"] || args["new-text"]) {
    operations.push({
      op: "replace_text",
      path: required(args, "replace-file"),
      old_text: required(args, "old-text"),
      new_text: required(args, "new-text")
    });
  }
  return operations;
}
function transitionKey(kind, value) {
  return `${kind}:${createHash13("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
function loadPlanGraph2(root, runId) {
  const plan = readJson(join40(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`\u627E\u4E0D\u5230 plan graph\uFF1A${runId}`);
  return plan;
}
function getPlanNode(plan, id) {
  const node = plan.nodes.find((item) => item.id === id);
  if (!node) throw new Error(`\u627E\u4E0D\u5230 plan node\uFF1A${id}`);
  return node;
}

// src/commands/project-workspace.mjs
import { existsSync as existsSync28, readFileSync as readFileSync22 } from "node:fs";
import { basename as basename9, join as join41 } from "node:path";

// src/core/policy-defaults.mjs
function defaultGatePolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    human_gates: ["production_change", "destructive_operation", "external_api_side_effect", "security_sensitive_change", "knowledge_governance"],
    automatic_gates: ["schema_valid", "required_evidence_present", "no_untriaged_execution", "derived_views_not_worker_written"],
    dsh_lifecycle: {
      negative_control: {
        mode: "shadow",
        intake_types: ["bug", "test_failure"]
      },
      decision_note: {
        mode: "shadow",
        auto_propose: true,
        risk_levels: ["high", "critical"],
        workflows: ["governed"]
      }
    }
  };
}
function defaultRetryPolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    max_attempts: defaultRetryAttempts(),
    auto_retry: {
      enabled: true,
      reset_sandbox: true,
      retryable_failure_kinds: ["timeout", "execution_error", "contract_error", "agent_reported_failure", "no_patch"]
    },
    non_retryable_failure_kinds: ["scope_violation", "unsupported_change", "budget_exceeded", "unknown"]
  };
}
function defaultExecutionPolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    interactive_workspace_patch: {
      enabled: true
    },
    interactive_host_claim: {
      lease_seconds: 1800
    },
    execution_router: {
      force_factory_risks: ["critical"],
      factory_on_isolation: true,
      factory_on_resume: true,
      factory_on_background: true,
      factory_on_parallel_execution: true
    },
    model_routing: defaultModelRoutingPolicy(),
    cost_governor: {
      enabled: true,
      unknown_usage: "record",
      default_budget: routeBudget(30, 12, 80, 16e4, 3e4),
      method_pack_budgets: {
        quick: routeBudget(12, 6, 30, 6e4, 12e3),
        "disciplined-tdd": routeBudget(30, 12, 80, 16e4, 3e4),
        "phase-context": routeBudget(30, 12, 80, 16e4, 3e4),
        governed: routeBudget(60, 24, 180, 36e4, 7e4)
      }
    },
    budgets: {
      max_changed_files_per_patch: 20,
      max_patch_bytes: 1e6,
      max_agent_duration_ms: 12e5,
      max_agent_runs_per_tick: 3,
      max_agent_cycles_per_tick: 12
    },
    permissions: {
      allowed_adapters: defaultAllowedExecutionAdapters(),
      adapter_fallback_order: [...DEFAULT_EXECUTOR_FALLBACK_ORDER],
      adapter_fallback_failure_kinds: ["timeout", "execution_error", "contract_error", "agent_reported_failure", "no_patch"],
      merge_approval_risks: ["critical"],
      sensitive_paths: [".github/", "infra/", "migrations/", "deploy/", "Dockerfile", "package-lock.json"]
    },
    approval: {
      ttl_minutes: 60,
      required_capabilities: { merge: "merge_apply", adapter_baseline: "adapter_baseline_update" }
    }
  };
}
function routeBudget(wallMinutes, agentTurns, toolCalls, inputTokens, outputTokens) {
  return {
    max_wall_minutes: wallMinutes,
    max_agent_turns: agentTurns,
    max_tool_calls: toolCalls,
    max_input_tokens: inputTokens,
    max_output_tokens: outputTokens
  };
}
function defaultQualityPolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    block_new_runs_on_failure: true,
    block_new_runs_on_smoke_failure: true,
    adapter_smoke_max_age_hours: 24,
    adapter_smoke_auto_refresh: true,
    adapter_smoke_refresh_timeout_ms: 18e4,
    adapter_observation_interval_hours: 24,
    rolling_window_days: 7,
    rolling_run_count: 20,
    thresholds: {
      max_open_risks: 0,
      max_verification_failures: 0,
      max_adapter_failure_rate: 0.2,
      max_cycle_regression_percent: 50
    }
  };
}

// src/commands/project-workspace.mjs
function initProject(args) {
  const projectDir = projectRoot(args);
  const root = storeRoot(projectDir);
  const timestamp = now();
  const firstInit = !existsSync28(join41(root, "project.json"));
  const projectName = String(args.name || basename9(projectDir) || "apex-v2-project");
  for (const dir of [
    root,
    join41(root, "intake"),
    join41(root, "roadmap"),
    join41(root, "knowledge"),
    join41(root, "risks"),
    join41(root, "runs"),
    join41(root, "artifacts"),
    join41(root, "decisions"),
    join41(root, "derived"),
    join41(root, "policies"),
    join41(root, "learning"),
    join41(root, "learning", "receipts"),
    join41(root, "approvals"),
    join41(root, "metrics"),
    join41(root, "adapters"),
    join41(root, "adapters", "history"),
    join41(root, "notifications")
  ]) {
    ensureDir(dir);
  }
  if (firstInit) {
    writeJson(join41(root, "project.json"), {
      schema_version: SCHEMA_VERSION,
      format_version: 1,
      revision: 0,
      project_id: shortId("project"),
      project_name: projectName,
      created_at: timestamp,
      updated_at: timestamp,
      active_milestone: null,
      knowledge_version: 0,
      last_event_id: null,
      active_runs: [],
      wip_limits: {
        active_runs: 3,
        parallel_workers: 6
      }
    });
    writeJson(join41(root, "intake", "items.json"), []);
    writeJson(join41(root, "roadmap", "graph.json"), {
      schema_version: SCHEMA_VERSION,
      updated_at: timestamp,
      milestones: [],
      nodes: [],
      edges: [],
      wip_limits: {
        active_nodes: 5
      }
    });
    writeJson(join41(root, "risks", "register.json"), []);
    writeJson(join41(root, "decisions", "index.json"), []);
    writeJson(join41(root, "policies", "gates.json"), defaultGatePolicy(timestamp));
    writeJson(join41(root, "policies", "retry.json"), defaultRetryPolicy(timestamp));
    writeJson(join41(root, "policies", "execution.json"), defaultExecutionPolicy(timestamp));
    writeJson(join41(root, "policies", "method-packs.json"), defaultMethodPackRegistry(timestamp));
    writeJson(join41(root, "policies", "quality.json"), defaultQualityPolicy(timestamp));
    writeJson(join41(root, "policies", "notifications.json"), defaultNotificationPolicy(timestamp));
    writeJson(join41(root, "approvals", "items.json"), []);
    writeJson(join41(root, "learning", "proposals.json"), []);
    writeJson(join41(root, "learning", "jobs.json"), []);
    writeJson(join41(root, "notifications", "outbox.json"), []);
  }
  if (!existsSync28(join41(root, "learning", "jobs.json"))) {
    writeJson(join41(root, "learning", "jobs.json"), []);
  }
  if (!existsSync28(join41(root, "decisions", "index.json"))) {
    writeJson(join41(root, "decisions", "index.json"), []);
  }
  ensureDir(join41(root, "learning", "receipts"));
  if (!existsSync28(join41(root, "policies", "gates.json"))) {
    writeJson(join41(root, "policies", "gates.json"), defaultGatePolicy(timestamp));
  } else {
    const gatePolicy = readJson(join41(root, "policies", "gates.json"));
    if (!gatePolicy.dsh_lifecycle) {
      gatePolicy.dsh_lifecycle = defaultGatePolicy(timestamp).dsh_lifecycle;
      gatePolicy.updated_at = timestamp;
      writeJson(join41(root, "policies", "gates.json"), gatePolicy);
    }
  }
  if (!existsSync28(join41(root, "policies", "retry.json"))) {
    writeJson(join41(root, "policies", "retry.json"), defaultRetryPolicy(timestamp));
  } else {
    const retryPolicy = readJson(join41(root, "policies", "retry.json"));
    retryPolicy.max_attempts.claude = retryPolicy.max_attempts.claude || 3;
    retryPolicy.max_attempts.gemini = retryPolicy.max_attempts.gemini || 3;
    retryPolicy.max_attempts.host = retryPolicy.max_attempts.host || 1;
    retryPolicy.max_attempts["deepseek-runner"] = retryPolicy.max_attempts["deepseek-runner"] || 3;
    writeJson(join41(root, "policies", "retry.json"), retryPolicy);
  }
  if (!existsSync28(join41(root, "policies", "execution.json"))) {
    writeJson(join41(root, "policies", "execution.json"), defaultExecutionPolicy(timestamp));
  } else {
    const executionPolicy = readJson(join41(root, "policies", "execution.json"));
    if (!executionPolicy.interactive_workspace_patch) {
      executionPolicy.interactive_workspace_patch = { enabled: true };
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.interactive_host_claim) {
      executionPolicy.interactive_host_claim = { lease_seconds: 1800 };
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.execution_router) {
      executionPolicy.execution_router = defaultExecutionPolicy(timestamp).execution_router;
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.cost_governor) {
      executionPolicy.cost_governor = defaultExecutionPolicy(timestamp).cost_governor;
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.budgets.max_agent_cycles_per_tick) {
      executionPolicy.budgets.max_agent_cycles_per_tick = defaultExecutionPolicy(timestamp).budgets.max_agent_cycles_per_tick;
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.permissions.adapter_fallback_order) {
      executionPolicy.permissions.allowed_adapters = Array.from(/* @__PURE__ */ new Set(["host", ...executionPolicy.permissions.allowed_adapters, "claude", "gemini", "deepseek-runner"]));
      executionPolicy.permissions.adapter_fallback_order = ["codex", "claude", "gemini"];
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.permissions.adapter_fallback_failure_kinds) {
      executionPolicy.permissions.adapter_fallback_failure_kinds = ["timeout", "execution_error", "contract_error", "agent_reported_failure", "no_patch"];
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.approval) {
      executionPolicy.approval = {
        ttl_minutes: 60,
        required_capabilities: {
          merge: "merge_apply",
          adapter_baseline: "adapter_baseline_update"
        }
      };
      executionPolicy.updated_at = timestamp;
    }
    writeJson(join41(root, "policies", "execution.json"), executionPolicy);
  }
  if (!existsSync28(join41(root, "policies", "method-packs.json"))) {
    writeJson(join41(root, "policies", "method-packs.json"), defaultMethodPackRegistry(timestamp));
  }
  if (!existsSync28(join41(root, "policies", "quality.json"))) {
    writeJson(join41(root, "policies", "quality.json"), defaultQualityPolicy(timestamp));
  } else {
    const qualityPolicy = readJson(join41(root, "policies", "quality.json"));
    if (qualityPolicy.block_new_runs_on_smoke_failure == null) {
      qualityPolicy.block_new_runs_on_smoke_failure = true;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_smoke_max_age_hours == null) {
      qualityPolicy.adapter_smoke_max_age_hours = 24;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_smoke_auto_refresh == null) {
      qualityPolicy.adapter_smoke_auto_refresh = true;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_smoke_refresh_timeout_ms == null) {
      qualityPolicy.adapter_smoke_refresh_timeout_ms = 18e4;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_observation_interval_hours == null) {
      qualityPolicy.adapter_observation_interval_hours = 24;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.rolling_window_days == null) {
      qualityPolicy.rolling_window_days = 7;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.rolling_run_count == null) {
      qualityPolicy.rolling_run_count = 20;
      qualityPolicy.updated_at = timestamp;
    }
    writeJson(join41(root, "policies", "quality.json"), qualityPolicy);
  }
  if (!existsSync28(join41(root, "approvals", "items.json"))) writeJson(join41(root, "approvals", "items.json"), []);
  migrateApprovalRecords(root);
  if (!existsSync28(join41(root, "policies", "notifications.json"))) {
    writeJson(join41(root, "policies", "notifications.json"), defaultNotificationPolicy(timestamp));
  }
  if (!existsSync28(join41(root, "notifications", "outbox.json"))) {
    writeJson(join41(root, "notifications", "outbox.json"), []);
  }
  migrateNotificationState(root, timestamp);
  writeKnowledgeBase(root, timestamp);
  writeTextIfMissing(join41(root, "derived", "README.md"), derivedReadme());
  writeTextIfMissing(join41(root, "events.jsonl"), "");
  if (firstInit) {
    const event = appendEvent(root, "project.initialized", "apex-v2", {
      project_name: projectName
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  console.log(`\u5DF2\u521D\u59CB\u5316\u9879\u76EE\u7EA7\u5DE5\u4F5C\u533A\uFF1A${root}`);
}
function writeKnowledgeBase(root, timestamp) {
  const knowledgeDir = join41(root, "knowledge");
  const manifestPath = join41(knowledgeDir, "manifest.json");
  const existing = readJson(manifestPath, null);
  const staleAfter = new Date(Date.parse(timestamp) + 7 * 864e5).toISOString();
  const files = [];
  for (const [name, purpose] of KNOWLEDGE_FILES) {
    const filePath = join41(knowledgeDir, name);
    writeTextIfMissing(filePath, knowledgeTemplate(name, purpose));
    files.push({
      path: `knowledge/${name}`,
      purpose,
      owner: "project-kernel",
      derived: false,
      generated_at: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.generated_at || timestamp,
      stale_after: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.stale_after || staleAfter,
      confidence: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.confidence ?? 0.5,
      source_refs: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.source_refs || existing?.source_refs || []
    });
  }
  writeJson(manifestPath, {
    schema_version: SCHEMA_VERSION,
    version: existing?.version ?? 0,
    updated_at: existing?.updated_at ?? timestamp,
    files,
    source_refs: existing?.source_refs || []
  });
}
function knowledgeTemplate(name, purpose) {
  return `# ${name.replace(".md", "")}

\u7528\u9014\uFF1A${purpose}

## \u5DF2\u9A8C\u8BC1\u4E8B\u5B9E

- \u6682\u65E0\u3002

## \u672A\u9A8C\u8BC1\u7EBF\u7D22

- \u6682\u65E0\u3002

## \u6765\u6E90

- \u521D\u59CB\u5316\u5360\u4F4D\uFF0C\u7B49\u5F85\u9879\u76EE\u7EA7 Context Fabric \u66F4\u65B0\u3002
`;
}
function derivedReadme() {
  return `# derived

\u672C\u76EE\u5F55\u53EA\u5B58\u653E\u53EF\u4ECE events\u3001artifacts\u3001intake\u3001roadmap\u3001runs \u91CD\u5EFA\u7684\u6D3E\u751F\u89C6\u56FE\u3002

\u89C4\u5219\uFF1A

- worker \u4E0D\u5F97\u76F4\u63A5\u5199 derived view\uFF1B
- coordinator \u53EF\u4EE5\u91CD\u5EFA derived view\uFF1B
- derived view \u4E0D\u80FD\u4F5C\u4E3A\u552F\u4E00\u4E8B\u5B9E\u6765\u6E90\u3002
`;
}
function status(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const project = readJson(join41(root, "project.json"));
  const intake = readJson(join41(root, "intake", "items.json"), []);
  const roadmap = readJson(join41(root, "roadmap", "graph.json"));
  const risks = readJson(join41(root, "risks", "register.json"), []);
  const learning = readJson(join41(root, "learning", "proposals.json"), []);
  const decisions = readJson(join41(root, "decisions", "index.json"), []);
  console.log(JSON.stringify({
    project: project.project_name,
    project_id: project.project_id,
    active_milestone: project.active_milestone,
    knowledge_version: project.knowledge_version,
    intake: {
      total: intake.length,
      new: intake.filter((item) => item.triage.status === "new").length,
      accepted: intake.filter((item) => item.triage.status === "accepted").length
    },
    roadmap: {
      nodes: roadmap.nodes.length,
      active: roadmap.nodes.filter((node) => node.status === "active").length,
      ready: roadmap.nodes.filter((node) => node.status === "ready").length
    },
    risks: risks.length,
    active_runs: project.active_runs,
    learning_proposals: learning.length,
    decisions: {
      total: decisions.length,
      proposed: decisions.filter((item) => item.status === "proposed").length
    }
  }, null, 2));
}
function validateProject(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const errors = [];
  const requiredFiles = [
    "project.json",
    "events.jsonl",
    "intake/items.json",
    "roadmap/graph.json",
    "knowledge/manifest.json",
    "risks/register.json",
    "policies/gates.json",
    "policies/retry.json",
    "policies/execution.json",
    "policies/quality.json",
    "approvals/items.json",
    "learning/proposals.json"
  ];
  for (const file of requiredFiles) {
    const path = join41(root, file);
    if (!existsSync28(path)) {
      errors.push(`\u7F3A\u5C11\u6587\u4EF6\uFF1A${file}`);
      continue;
    }
    if (file.endsWith(".json")) {
      try {
        readJson(path);
      } catch (error) {
        errors.push(`JSON \u89E3\u6790\u5931\u8D25\uFF1A${file}\uFF1A${error.message}`);
      }
    }
  }
  for (const [name] of KNOWLEDGE_FILES) {
    if (!existsSync28(join41(root, "knowledge", name))) {
      errors.push(`\u7F3A\u5C11\u77E5\u8BC6\u6587\u4EF6\uFF1Aknowledge/${name}`);
    }
  }
  const intake = readJson(join41(root, "intake", "items.json"), []);
  const roadmap = readJson(join41(root, "roadmap", "graph.json"), null);
  const project = readJson(join41(root, "project.json"), null);
  if (!Array.isArray(intake)) errors.push("intake/items.json \u5FC5\u987B\u662F\u6570\u7EC4");
  if (!roadmap || !Array.isArray(roadmap.nodes) || !Array.isArray(roadmap.edges)) {
    errors.push("roadmap/graph.json \u5FC5\u987B\u5305\u542B nodes \u548C edges \u6570\u7EC4");
  }
  if (!project?.project_id) errors.push("project.json \u7F3A\u5C11 project_id");
  if (args["strict-knowledge"]) {
    const manifest = readJson(join41(root, "knowledge", "manifest.json"), null);
    const index = existsSync28(join41(root, "knowledge", "index.md")) ? readFileSync22(join41(root, "knowledge", "index.md"), "utf8") : "";
    if (!manifest || manifest.version < 1) {
      errors.push("strict-knowledge \u8981\u6C42 knowledge/manifest.json version >= 1");
    }
    if (index.includes("\u521D\u59CB\u5316\u5360\u4F4D") || index.includes("\u6682\u65E0")) {
      errors.push("strict-knowledge \u8981\u6C42 knowledge/index.md \u5DF2\u88AB\u771F\u5B9E\u9879\u76EE\u77E5\u8BC6\u5237\u65B0");
    }
  }
  const contractReport = scanProjectContracts(projectDir);
  if (contractReport.status !== "PASS") {
    for (const issue2 of contractReport.errors.slice(0, 10)) {
      const detail = issue2.errors.map((item) => `${item.instance_path || "/"} ${item.message}`).join("; ");
      errors.push(`contract \u6821\u9A8C\u5931\u8D25\uFF1A${issue2.path} -> ${issue2.schema_name || "JSON"}\uFF1A${detail}`);
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    throw new Error(`\u9879\u76EE\u6821\u9A8C\u5931\u8D25\uFF0C\u5171 ${errors.length} \u4E2A\u95EE\u9898`);
  }
  console.log(`\u9879\u76EE\u6821\u9A8C\u901A\u8FC7\uFF1A${root}`);
}

// src/commands/git-delivery.mjs
import { join as join42 } from "node:path";
function handleGitDeliveryCommand(action, args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  if (action === "discover") {
    const delivery = discoverGitDelivery(projectDir, discoveryOptions(args));
    if (args.record) {
      ensureDir(join42(root, "delivery"));
      writeJson(join42(root, "delivery", "git.json"), delivery);
      recordEvent(root, "git.delivery.discovered", {
        repository_id: delivery.repository.repository_id,
        branch: delivery.current_branch.name,
        worktree_count: delivery.worktrees.length
      });
    }
    console.log(JSON.stringify(delivery, null, 2));
    return;
  }
  if (action === "guard") {
    const delivery = args.recorded ? readJson(join42(root, "delivery", "git.json"), null) : discoverGitDelivery(projectDir, discoveryOptions(args));
    if (!delivery) throw new Error("\u627E\u4E0D\u5230 recorded Git Delivery context");
    console.log(JSON.stringify(assertGitDeliveryGuards(delivery, {
      allowProtectedBranch: Boolean(args["allow-protected-branch"]),
      componentId: args["component-id"] ? String(args["component-id"]) : void 0,
      maxStagedFiles: args["max-staged-files"] == null ? void 0 : Number(args["max-staged-files"])
    }), null, 2));
    return;
  }
  if (action === "claim") {
    const owner = ownerInput(args);
    const claim = claimCheckout(projectDir, owner);
    recordEvent(root, "git.checkout.claimed", {
      repository_id: claim.repository_id,
      checkout_path: claim.checkout_path,
      owner: claim.owner,
      claim_token: claim.claim_token
    });
    console.log(JSON.stringify(claim, null, 2));
    return;
  }
  if (action === "release") {
    const released = releaseCheckout(projectDir, {
      ...ownerInput(args),
      claim_token: required(args, "claim-token")
    });
    recordEvent(root, "git.checkout.released", {
      repository_id: released.repository_id,
      checkout_path: released.checkout_path,
      owner: released.owner,
      claim_token: released.claim_token
    });
    console.log(JSON.stringify(released, null, 2));
    return;
  }
  if (action === "claim-status") {
    console.log(JSON.stringify(readCheckoutClaim(projectDir), null, 2));
    return;
  }
  throw new Error(`\u672A\u77E5 project git \u52A8\u4F5C\uFF1A${action || "(\u7A7A)"}`);
}
function discoveryOptions(args) {
  return {
    protectedBranches: args["protected-branches"] ? splitList(args["protected-branches"]) : void 0,
    components: parseJsonArray(args["components-json"], "components-json"),
    pullRequest: parseJsonObject(args["pr-json"], "pr-json")
  };
}
function parseJsonArray(value, name) {
  if (value == null) return void 0;
  const parsed = parseJson(value, name);
  if (!Array.isArray(parsed)) throw new Error(`--${name} \u5FC5\u987B\u662F JSON \u6570\u7EC4`);
  return parsed;
}
function parseJsonObject(value, name) {
  if (value == null) return void 0;
  const parsed = parseJson(value, name);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`--${name} \u5FC5\u987B\u662F JSON \u5BF9\u8C61`);
  }
  return parsed;
}
function parseJson(value, name) {
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`--${name} \u4E0D\u662F\u6709\u6548 JSON\uFF1A${error.message}`);
  }
}
function ownerInput(args) {
  return {
    owner_id: required(args, "owner-id"),
    run_id: args["run-id"] ? String(args["run-id"]) : void 0,
    worker_id: args["worker-id"] ? String(args["worker-id"]) : void 0
  };
}
function recordEvent(root, type, payload) {
  const event = appendEvent(root, type, "apex-v2", payload);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
}

// src/core/heartbeat-scheduler.mjs
import { createHash as createHash14 } from "node:crypto";
import { chmodSync as chmodSync4, existsSync as existsSync29, mkdirSync as mkdirSync8 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { join as join43, resolve as resolve24 } from "node:path";
import { spawnSync as spawnSync13 } from "node:child_process";
function heartbeatJobId(projectDir) {
  const suffix = createHash14("sha256").update(resolve24(projectDir)).digest("hex").slice(0, 12);
  return `com.apex-forge-v2.heartbeat.${suffix}`;
}
function installHeartbeatScheduler(projectDir, options = {}) {
  const resolvedProject = resolve24(projectDir);
  const root = join43(resolvedProject, ".apex-v2");
  if (!existsSync29(join43(root, "project.json"))) throw new Error(`\u9879\u76EE\u5C1A\u672A\u521D\u59CB\u5316\uFF1A${root}`);
  const intervalMinutes = Number(options.intervalMinutes || 60);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new Error("heartbeat intervalMinutes \u5FC5\u987B\u662F\u6B63\u6574\u6570");
  }
  const home = options.homeDir || homedir6();
  const stateDir = join43(root, "heartbeat");
  const logDir = join43(stateDir, "logs");
  mkdirSync8(logDir, { recursive: true });
  const label = heartbeatJobId(resolvedProject);
  const runnerPath = join43(stateDir, "run.zsh");
  const statePlistPath = join43(stateDir, `${label}.plist`);
  const launchAgentsDir = join43(home, "Library", "LaunchAgents");
  const installedPlistPath = join43(launchAgentsDir, `${label}.plist`);
  mkdirSync8(launchAgentsDir, { recursive: true });
  const envFile = options.envFile || defaultEnvFile(home);
  atomicWriteFile(runnerPath, renderHeartbeatRunner({
    projectDir: resolvedProject,
    nodePath: options.nodePath || process.execPath,
    cliPath: options.cliPath || new URL("../apex-v2.mjs", import.meta.url).pathname,
    envFile
  }));
  chmodSync4(runnerPath, 448);
  const plist = renderLaunchdPlist({
    label,
    runnerPath,
    projectDir: resolvedProject,
    intervalSeconds: intervalMinutes * 60,
    stdoutPath: join43(logDir, "stdout.log"),
    stderrPath: join43(logDir, "stderr.log")
  });
  atomicWriteFile(statePlistPath, plist);
  atomicWriteFile(installedPlistPath, plist);
  let activation = null;
  if (options.activate) {
    const launcher = options.launcher || spawnSync13;
    const domain = `gui/${process.getuid()}`;
    launcher("launchctl", ["bootout", domain, installedPlistPath], { encoding: "utf8" });
    const bootstrap = launcher("launchctl", ["bootstrap", domain, installedPlistPath], { encoding: "utf8" });
    if (bootstrap.status !== 0) {
      throw new Error(`launchctl bootstrap \u5931\u8D25\uFF1A${bootstrap.stderr || bootstrap.stdout}`);
    }
    const kickstart = launcher("launchctl", ["kickstart", "-k", `${domain}/${label}`], { encoding: "utf8" });
    if (kickstart.status !== 0) {
      throw new Error(`launchctl kickstart \u5931\u8D25\uFF1A${kickstart.stderr || kickstart.stdout}`);
    }
    activation = { domain, bootstrap: bootstrap.status, kickstart: kickstart.status };
  }
  return {
    label,
    interval_minutes: intervalMinutes,
    runner_path: runnerPath,
    state_plist_path: statePlistPath,
    installed_plist_path: installedPlistPath,
    env_file: envFile,
    activated: Boolean(options.activate),
    activation
  };
}
function heartbeatSchedulerStatus(projectDir, options = {}) {
  const label = heartbeatJobId(projectDir);
  const launcher = options.launcher || spawnSync13;
  const domain = `gui/${process.getuid()}`;
  const status2 = launcher("launchctl", ["print", `${domain}/${label}`], { encoding: "utf8" });
  const output = `${status2.stdout || ""}
${status2.stderr || ""}`;
  return {
    label,
    loaded: status2.status === 0,
    runs: numberFrom(output, /\bruns = (\d+)/),
    last_exit_code: numberFrom(output, /\blast exit code = (-?\d+)/),
    state: output.match(/\bstate = ([^\n]+)/)?.[1]?.trim() || "unknown"
  };
}
function renderLaunchdPlist(options) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(options.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${xml(options.runnerPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(options.projectDir)}</string>
  <key>StartInterval</key>
  <integer>${options.intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(options.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(options.stderrPath)}</string>
</dict>
</plist>
`;
}
function renderHeartbeatRunner(options) {
  const source = options.envFile ? `if [[ -f ${shell(options.envFile)} ]]; then
  set -a
  source ${shell(options.envFile)}
  set +a
fi
` : "";
  return `#!/bin/zsh
set -euo pipefail
${source}exec ${shell(options.nodePath)} ${shell(options.cliPath)} project heartbeat --project ${shell(options.projectDir)}
`;
}
function defaultEnvFile(home) {
  const candidate = join43(home, ".codex", "provider-modes", "third-party.env");
  return existsSync29(candidate) ? candidate : null;
}
function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function shell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
function numberFrom(value, pattern) {
  const match = value.match(pattern);
  return match ? Number(match[1]) : null;
}

// src/core/heartbeat-daemon-control.mjs
import { closeSync as closeSync3, openSync as openSync3 } from "node:fs";
import { join as join44, resolve as resolve25 } from "node:path";
import { spawn, spawnSync as spawnSync14 } from "node:child_process";
var DAEMON = new URL("./heartbeat-daemon.mjs", import.meta.url).pathname;
function startHeartbeatDaemon(projectDir, options = {}) {
  const resolvedProject = resolve25(projectDir);
  const root = join44(resolvedProject, ".apex-v2");
  const statePath = join44(root, "heartbeat", "daemon.json");
  const current = readJson(statePath, null);
  if (current && processAlive2(current.pid)) return { ...current, already_running: true };
  const intervalMinutes = Number(options.intervalMinutes || 60);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new Error("heartbeat daemon intervalMinutes \u5FC5\u987B\u662F\u6B63\u6574\u6570");
  }
  const stdoutFd = openSync3(join44(root, "heartbeat", "logs", "daemon-stdout.log"), "a");
  const stderrFd = openSync3(join44(root, "heartbeat", "logs", "daemon-stderr.log"), "a");
  const child = spawn(process.execPath, [options.daemonPath || DAEMON, resolvedProject, String(intervalMinutes * 6e4)], {
    cwd: resolvedProject,
    detached: true,
    env: process.env,
    stdio: ["ignore", stdoutFd, stderrFd]
  });
  child.unref();
  closeSync3(stdoutFd);
  closeSync3(stderrFd);
  const state = {
    pid: child.pid,
    started_at: now(),
    interval_minutes: intervalMinutes,
    project_dir: resolvedProject
  };
  writeJson(statePath, state);
  return { ...state, already_running: false };
}
function heartbeatDaemonStatus(projectDir) {
  const state = readJson(join44(resolve25(projectDir), ".apex-v2", "heartbeat", "daemon.json"), null);
  return {
    configured: Boolean(state),
    running: Boolean(state && processAlive2(state.pid)),
    ...state
  };
}
function stopHeartbeatDaemon(projectDir) {
  const state = readJson(join44(resolve25(projectDir), ".apex-v2", "heartbeat", "daemon.json"), null);
  if (!state || !processAlive2(state.pid)) return { stopped: false, reason: "not-running" };
  signalDaemon(state.pid, "SIGTERM");
  waitForExit(state.pid, 1e3);
  let forceKilled = false;
  if (processAlive2(state.pid)) {
    signalDaemon(state.pid, "SIGKILL");
    forceKilled = true;
    waitForExit(state.pid, 1e3);
  }
  if (processAlive2(state.pid)) {
    throw new Error(`heartbeat daemon \u672A\u80FD\u505C\u6B62\uFF1A${state.pid}`);
  }
  return { stopped: true, pid: state.pid, force_killed: forceKilled };
}
function processAlive2(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const state = spawnSync14("ps", ["-o", "stat=", "-p", String(pid)], {
    encoding: "utf8"
  });
  const status2 = String(state.stdout || "").trim();
  return !status2.startsWith("Z");
}
function signalDaemon(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (processAlive2(pid) && Date.now() < deadline) {
    Atomics.wait(signal, 0, 0, 25);
  }
}

// src/core/project-audit.mjs
import { spawnSync as spawnSync15 } from "node:child_process";
function runProjectAuditTests(projectDir, options = {}) {
  if (options.skip) {
    return {
      status: "SKIPPED",
      command: options.command || "npm test",
      exit_code: null,
      duration_ms: 0,
      tests: 0,
      pass: 0,
      fail: 0,
      test_names: [],
      stdout_tail: "",
      stderr_tail: "test execution explicitly skipped"
    };
  }
  const command = options.command || "npm test";
  const startedAt = Date.now();
  const execution = spawnSync15(command, {
    cwd: projectDir,
    encoding: "utf8",
    shell: true,
    timeout: options.timeoutMs || 15 * 60 * 1e3,
    env: process.env
  });
  const stdout = String(execution.stdout || "");
  const stderr = String(execution.stderr || execution.error?.message || "");
  const summary = parseNodeTestSummary(stdout);
  return {
    status: execution.status === 0 && summary.fail === 0 && summary.tests > 0 ? "PASS" : "FAIL",
    command,
    exit_code: execution.status ?? 1,
    duration_ms: Date.now() - startedAt,
    tests: summary.tests,
    pass: summary.pass,
    fail: summary.fail,
    test_names: summary.test_names,
    stdout_tail: tail2(stdout),
    stderr_tail: tail2(stderr)
  };
}
function hasExecutedTest(testExecution, pattern) {
  if (testExecution?.status !== "PASS") return false;
  return testExecution.test_names.some(
    (name) => typeof pattern === "string" ? name.includes(pattern) : pattern.test(name)
  );
}
function parseNodeTestSummary(output) {
  const text = String(output || "");
  const readCount = (label) => {
    const patterns = [
      new RegExp(`(?:\u2139|#)\\s*${label}\\s+(\\d+)`, "i"),
      new RegExp(`^${label}\\s*[:=]\\s*(\\d+)`, "im")
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return 0;
  };
  const testNames = text.split("\n").map((line) => line.match(/^\s*[✔✓]\s+(.+?)(?:\s+\(\d+(?:\.\d+)?ms\))?\s*$/)?.[1]).filter(Boolean);
  return {
    tests: readCount("tests") || testNames.length,
    pass: readCount("pass") || testNames.length,
    fail: readCount("fail"),
    test_names: testNames
  };
}
function tail2(value, max = 8e3) {
  return value.length > max ? value.slice(-max) : value;
}

// src/audit/project-audit-report.mjs
function buildAuditChecks(summary) {
  return [
    auditCheck("continuous-intake", summary.intake_total >= 1 && summary.intake_accepted === summary.intake_total, "\u6301\u7EED\u63A5\u6536\u548C\u6CBB\u7406\u65B0\u9700\u6C42", [`intake_total=${summary.intake_total}`, `intake_accepted=${summary.intake_accepted}`], "\u9700\u8981\u6240\u6709 intake \u90FD\u6709\u660E\u786E triage\u3002"),
    auditCheck("project-knowledge", summary.knowledge_version >= 1 && summary.learning_applied > 0, "\u9879\u76EE\u5171\u4EAB\u77E5\u8BC6\u5E93\u6301\u7EED\u66F4\u65B0\u5E76\u5438\u6536\u5B66\u4E60", [`knowledge_version=${summary.knowledge_version}`, `learning_applied=${summary.learning_applied}`], "\u9700\u8981\u901A\u8FC7 governance \u5199\u56DE\u5B66\u4E60\u3002"),
    auditCheck("multi-run-factory", summary.runs_total >= 3 && summary.active_runs === 0, "\u9879\u76EE\u7EA7 run \u5DE5\u5382\u80FD\u6301\u7EED\u521B\u5EFA\u5E76\u6536\u675F\u591A\u4E2A run", [`runs_total=${summary.runs_total}`, `active_runs=${summary.active_runs}`], "\u9700\u8981\u591A\u4E2A run \u4E14\u65E0\u5806\u79EF active run\u3002"),
    auditCheck("evidence-gates", summary.artifacts_total >= summary.runs_total && summary.evidence_artifacts >= 1, "\u5173\u952E gate \u4F7F\u7528 artifact evidence", [`artifacts_total=${summary.artifacts_total}`, `evidence_artifacts=${summary.evidence_artifacts}`], "\u9700\u8981\u6709\u8DB3\u591F artifact \u4F5C\u4E3A gate \u8BC1\u636E\u3002"),
    auditCheck("automation-tests", summary.test_execution_status === "PASS" && summary.test_count > 0 && summary.test_count === summary.test_pass && summary.test_fail === 0 && summary.verification_reports >= 1, "\u81EA\u52A8\u6D4B\u8BD5\u8986\u76D6\u6838\u5FC3\u751F\u4EA7\u7EBF\u5E76\u6709 verification report", [`execution=${summary.test_execution_status}`, `command=${summary.test_execution_command}`, `exit_code=${summary.test_execution_exit_code}`, `test_count=${summary.test_count}`, `test_pass=${summary.test_pass}`, `test_fail=${summary.test_fail}`, `verification_reports=${summary.verification_reports}`], "\u9700\u8981\u5F53\u524D\u6D4B\u8BD5\u771F\u5B9E\u6267\u884C\u5E76\u5168\u90E8\u901A\u8FC7\uFF0C\u540C\u65F6\u5B58\u5728 verification report\u3002"),
    auditCheck("audit-evidence-integrity", summary.test_execution_status === "PASS" && summary.test_count === summary.test_pass && summary.test_fail === 0, "Audit \u4F7F\u7528\u5F53\u524D\u6267\u884C\u8BC1\u636E\u800C\u4E0D\u662F\u6D4B\u8BD5\u6587\u672C\u6216 capability \u81EA\u58F0\u660E", [`execution=${summary.test_execution_status}`, `tests=${summary.test_count}`, `pass=${summary.test_pass}`, `fail=${summary.test_fail}`, `duration_ms=${summary.test_execution_duration_ms}`], "\u9700\u8981\u6267\u884C\u5F53\u524D\u6D4B\u8BD5\uFF0C\u8DF3\u8FC7\u6216\u5931\u8D25\u4E0D\u80FD\u4EA7\u751F Audit PASS\u3002"),
    auditCheck("merge-conflict", summary.resolution_count >= 1 && summary.merged_integrations >= 1, "\u652F\u6301\u51B2\u7A81\u68C0\u6D4B\u3001resolution \u548C\u6210\u529F\u5408\u5E76", [`resolution_count=${summary.resolution_count}`, `merged_integrations=${summary.merged_integrations}`], "\u9700\u8981\u81F3\u5C11\u4E00\u4E2A resolution \u548C merged integration\u3002"),
    auditCheck("low-code-path", summary.noop_integrations >= 1, "\u652F\u6301\u65E0\u4EE3\u7801\u53D8\u66F4 no-op integration\uFF0C\u907F\u514D\u4E3A\u4EA4\u4ED8\u800C\u4EA4\u4ED8\u4EE3\u7801", [`noop_integrations=${summary.noop_integrations}`], "\u9700\u8981 evidence/decision-only run \u80FD\u5B8C\u6210\u3002"),
    auditCheck("sandbox-isolation", summary.worker_sandbox_ready >= 1 && summary.worktree_or_fallback_tested, "worker \u5177\u5907\u9694\u79BB sandbox/worktree \u8DEF\u5F84", [`worker_sandbox_ready=${summary.worker_sandbox_ready}`, `worktree_or_fallback_tested=${summary.worktree_or_fallback_tested}`], "\u9700\u8981 sandbox ready \u4E14 worktree/fallback \u8DEF\u5F84\u88AB\u9A8C\u8BC1\u3002"),
    auditCheck("task-aware-planning", summary.task_aware_plan_feature && summary.task_aware_plans >= 1, "PlanGraph \u6309\u5177\u4F53 intake \u548C\u9879\u76EE\u4E0A\u4E0B\u6587\u751F\u6210\uFF0C\u800C\u4E0D\u662F\u590D\u7528\u56FA\u5B9A\u6A21\u677F", [`feature=${summary.task_aware_plan_feature}`, `task_aware_plans=${summary.task_aware_plans}`], "\u9700\u8981\u4EFB\u52A1\u611F\u77E5 PlanGraph \u7684\u673A\u5668\u80FD\u529B\u58F0\u660E\u548C\u771F\u5B9E run evidence\u3002"),
    auditCheck("complete-plan-gate", summary.complete_plan_gate_feature && summary.fully_covered_plans >= 1, "execute \u53EA\u6709\u5728\u5168\u90E8 PlanGraph \u8282\u70B9\u5B8C\u6210\u540E\u624D\u80FD\u901A\u8FC7", [`feature=${summary.complete_plan_gate_feature}`, `fully_covered_plans=${summary.fully_covered_plans}`], "\u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u5168\u8282\u70B9 worker \u8986\u76D6\u7684 run \u8BC1\u660E\u8C03\u5EA6\u4E0D\u4F1A\u63D0\u524D\u6536\u53E3\u3002"),
    auditCheck("staged-patch-verification", summary.staged_verification_feature && summary.staged_verification_reports >= 1, "verification \u5728\u9694\u79BB workspace \u7269\u5316\u5019\u9009 patch \u540E\u8FD0\u884C", [`feature=${summary.staged_verification_feature}`, `staged_verification_reports=${summary.staged_verification_reports}`], "\u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u5305\u542B\u771F\u5B9E patch operations \u7684 staged verification PASS \u62A5\u544A\u3002"),
    auditCheck("codex-coding-agent", summary.codex_agent_feature && summary.codex_available && summary.codex_patch_runs >= 1, "\u771F\u5B9E Codex worker \u80FD\u5728\u9694\u79BB workspace \u4EA7\u51FA\u53D7 write_scope \u7EA6\u675F\u7684 patch", [`feature=${summary.codex_agent_feature}`, `codex_available=${summary.codex_available}`, `codex_version=${summary.codex_version}`, `codex_patch_runs=${summary.codex_patch_runs}`], "\u9700\u8981\u672C\u673A Codex \u53EF\u7528\uFF0C\u5E76\u81F3\u5C11\u5B8C\u6210\u4E00\u6B21\u771F\u5B9E Codex patch run\u3002"),
    auditCheck("state-reconciliation", summary.reconciliation_feature && summary.event_log_issues === 0 && summary.successful_reconciliations >= 1, "event log \u5B8C\u6574\u4E14 ProjectState \u6F02\u79FB\u53EF\u68C0\u6D4B\u3001\u53EF\u5B89\u5168\u4FEE\u590D", [`feature=${summary.reconciliation_feature}`, `event_log_issues=${summary.event_log_issues}`, `successful_reconciliations=${summary.successful_reconciliations}`], "\u9700\u8981\u5B8C\u6574 event log \u548C\u81F3\u5C11\u4E00\u6B21 post-check CONSISTENT \u7684 reconciliation\u3002"),
    auditCheck("policy-controlled-retry", summary.retry_policy_feature && summary.retry_policy_present && summary.policy_retry_events >= 1, "worker retry \u53D7\u6700\u5927\u5C1D\u8BD5\u6B21\u6570\u548C failure_kind policy \u7EA6\u675F", [`feature=${summary.retry_policy_feature}`, `retry_policy_present=${summary.retry_policy_present}`, `policy_retry_events=${summary.policy_retry_events}`], "\u9700\u8981 retry policy \u6587\u4EF6\u548C\u81F3\u5C11\u4E00\u6B21 policy-enforced retry \u4E8B\u4EF6\u3002"),
    auditCheck("runtime-contract-registry", summary.contract_registry_feature && summary.contract_scan_status === "PASS" && summary.contract_errors === 0, "\u6838\u5FC3\u6301\u4E45\u5316\u5BF9\u8C61\u5728\u5199\u5165\u524D\u548C\u9879\u76EE\u6821\u9A8C\u65F6\u6267\u884C JSON Schema contract", [`feature=${summary.contract_registry_feature}`, `schema_count=${summary.contract_schema_count}`, `validated_contracts=${summary.validated_contracts}`, `contract_errors=${summary.contract_errors}`], "\u9700\u8981 Contract Registry \u542F\u7528\u4E14\u5168\u9879\u76EE contract scan \u65E0\u9519\u8BEF\u3002"),
    auditCheck("partial-pass-carry-forward", summary.carry_forward_feature && summary.carry_forward_handled >= 1 && summary.carry_forward_open === 0, "PARTIAL_PASS \u6B8B\u4F59\u98CE\u9669\u53EF\u6682\u505C run\uFF0C\u5E76\u901A\u8FC7 evidence \u6216 human acceptance \u663E\u5F0F\u6536\u675F", [`feature=${summary.carry_forward_feature}`, `carry_total=${summary.carry_forward_total}`, `carry_handled=${summary.carry_forward_handled}`, `carry_open=${summary.carry_forward_open}`], "\u9700\u8981\u81F3\u5C11\u4E00\u6B21\u5DF2\u5904\u7406 carry-forward dogfood\uFF0C\u4E14\u4E0D\u80FD\u9057\u7559 open carry\u3002"),
    auditCheck("execution-budget-approval", summary.execution_governance_feature && summary.approvals_approved >= 1 && summary.approvals_pending === 0, "patch/agent \u6267\u884C\u53D7\u9884\u7B97\u7EA6\u675F\uFF0Ccritical \u6216\u654F\u611F merge \u9700\u8981\u5185\u5BB9\u6307\u7EB9 approval", [`feature=${summary.execution_governance_feature}`, `approvals_total=${summary.approvals_total}`, `approvals_approved=${summary.approvals_approved}`, `approvals_pending=${summary.approvals_pending}`], "\u9700\u8981\u81F3\u5C11\u4E00\u6B21\u5DF2\u6279\u51C6\u7684\u9AD8\u98CE\u9669 merge dogfood\uFF0C\u4E14\u4E0D\u80FD\u9057\u7559 pending approval\u3002"),
    auditCheck("risk-register-metrics", summary.risk_metrics_feature && summary.risks_handled >= 1 && summary.metrics_snapshot_present, "\u8D28\u91CF\u4FE1\u53F7\u8FDB\u5165\u957F\u671F Risk Register\uFF0C\u5E76\u751F\u6210\u9879\u76EE metrics/eval snapshot", [`feature=${summary.risk_metrics_feature}`, `risks_open=${summary.risks_open}`, `risks_handled=${summary.risks_handled}`, `metrics_snapshot_present=${summary.metrics_snapshot_present}`], "\u9700\u8981\u81F3\u5C11\u4E00\u6761\u5DF2\u5904\u7406\u98CE\u9669\u548C\u6301\u4E45\u5316 metrics snapshot\u3002"),
    auditCheck("multi-agent-adapters", summary.multi_adapter_feature && summary.available_agent_adapters.length >= 2, "coding worker \u5177\u5907\u591A adapter registry \u548C\u663E\u5F0F fallback \u80FD\u529B", [`feature=${summary.multi_adapter_feature}`, `available=${summary.available_agent_adapters.join(",")}`], "\u9700\u8981\u81F3\u5C11\u4E24\u4E2A\u53EF\u7528 coding-agent CLI\uFF0C\u5E76\u7531 registry \u663E\u5F0F\u89E3\u6790\u3002"),
    auditCheck("runtime-adapter-failover", summary.adapter_failover_feature && summary.adapter_fallback_events >= 1, "retryable adapter failure \u80FD\u4FDD\u7559\u8BC1\u636E\u3001\u91CD\u7F6E sandbox \u5E76\u5207\u6362 runtime", [`feature=${summary.adapter_failover_feature}`, `fallback_events=${summary.adapter_fallback_events}`], "\u9700\u8981\u81F3\u5C11\u4E00\u6B21\u9879\u76EE\u7EA7 adapter failover dogfood\u3002"),
    auditCheck("quality-risk-attempt-synthesis", summary.quality_risk_synthesis_feature && summary.multi_attempt_summaries >= 1, "\u8D28\u91CF\u5931\u8D25\u8FDB\u5165\u98CE\u9669\u6CBB\u7406\uFF0C\u591A adapter attempts \u6C47\u603B\u4E3A\u5355\u4E00 worker evidence", [`feature=${summary.quality_risk_synthesis_feature}`, `worker_summaries=${summary.worker_summaries}`, `multi_attempt_summaries=${summary.multi_attempt_summaries}`], "\u9700\u8981\u81F3\u5C11\u4E00\u4EFD\u5305\u542B\u591A\u6B21 adapter attempt \u7684 worker summary\u3002"),
    auditCheck("adapter-session-resume", summary.adapter_session_feature && summary.adapter_session_results >= 1, "Claude/Gemini session metadata \u88AB\u6301\u4E45\u5316\u5E76\u53EF\u901A\u8FC7 worker resume \u7EE7\u7EED", [`feature=${summary.adapter_session_feature}`, `session_results=${summary.adapter_session_results}`], "\u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u6301\u4E45\u5316 adapter session result\u3002"),
    auditCheck("metrics-quality-gate", summary.quality_regression_feature && summary.metrics_snapshot_present && summary.latest_quality_status === "PASS", "\u9879\u76EE metrics \u9608\u503C\u80FD\u963B\u6B62\u8D28\u91CF\u56DE\u5F52\u65F6\u521B\u5EFA\u65B0 run", [`feature=${summary.quality_regression_feature}`, `metrics_snapshot_present=${summary.metrics_snapshot_present}`, `latest_quality_status=${summary.latest_quality_status}`], "\u9700\u8981\u6700\u65B0 metrics snapshot \u901A\u8FC7\u8D28\u91CF\u9608\u503C\u3002"),
    auditCheck("adapter-capability-drift", summary.adapter_capability_drift_status === "PASS" && summary.adapter_capability_blocking_changes === 0, "adapter capability \u57FA\u7EBF\u65E0\u963B\u65AD\u6027\u9000\u5316", [`status=${summary.adapter_capability_drift_status}`, `blocking_changes=${summary.adapter_capability_blocking_changes}`], "\u9700\u8981\u91CD\u5F55\u5DF2\u786E\u8BA4\u7684 adapter capability \u57FA\u7EBF\u6216\u4FEE\u590D runtime\u3002"),
    auditCheck("adapter-baseline-governance", summary.adapter_baseline_governance_feature && summary.adapter_baseline_approvals >= 1, "adapter capability \u57FA\u7EBF\u66F4\u65B0\u53D7 diff fingerprint approval \u7EA6\u675F", [`feature=${summary.adapter_baseline_governance_feature}`, `approved_baseline_changes=${summary.adapter_baseline_approvals}`], "\u9700\u8981\u81F3\u5C11\u4E00\u6B21\u9879\u76EE\u7EA7\u57FA\u7EBF\u53D8\u5316\u5BA1\u6279 dogfood\u3002"),
    auditCheck("live-adapter-smoke", summary.live_adapter_smoke_feature && summary.latest_adapter_smoke_mode === "live" && summary.latest_adapter_smoke_status === "PASS" && summary.live_adapter_smoke_passes >= 3, "Codex/Claude/Gemini \u771F\u5B9E structured-output smoke \u5168\u90E8\u901A\u8FC7", [`feature=${summary.live_adapter_smoke_feature}`, `mode=${summary.latest_adapter_smoke_mode}`, `status=${summary.latest_adapter_smoke_status}`, `passes=${summary.live_adapter_smoke_passes}`], "\u9700\u8981\u8BB0\u5F55\u4E09\u79CD runtime \u5168\u90E8 PASS \u7684 live smoke report\u3002"),
    auditCheck("adapter-smoke-freshness", summary.latest_adapter_smoke_age_hours != null && summary.latest_adapter_smoke_age_hours <= summary.adapter_smoke_max_age_hours, `adapter live smoke \u672A\u8D85\u8FC7 ${summary.adapter_smoke_max_age_hours} \u5C0F\u65F6\u6709\u6548\u671F`, [`age_hours=${summary.latest_adapter_smoke_age_hours}`, `max_age_hours=${summary.adapter_smoke_max_age_hours}`], "\u9700\u8981\u91CD\u65B0\u6267\u884C\u5E76\u8BB0\u5F55 live adapter smoke\u3002"),
    auditCheck("adapter-smoke-auto-refresh", summary.adapter_smoke_auto_refresh_feature && summary.adapter_smoke_auto_refresh_enabled, "\u5F85\u8C03\u5EA6\u4EFB\u52A1\u9047\u5230\u8FC7\u671F live smoke \u65F6\u7531 policy \u81EA\u52A8\u5237\u65B0", [`feature=${summary.adapter_smoke_auto_refresh_feature}`, `enabled=${summary.adapter_smoke_auto_refresh_enabled}`], "\u9700\u8981\u542F\u7528 adapter smoke \u81EA\u52A8\u5237\u65B0\u80FD\u529B\u548C quality policy\u3002"),
    auditCheck("failure-notification-policy", summary.failure_notification_feature && summary.failure_notification_policy_enabled && summary.failure_notification_events.includes("adapter.smoke.failed"), "adapter smoke \u5931\u8D25\u8FDB\u5165\u6301\u4E45\u5316\u3001\u53EF\u53BB\u91CD\u7684\u901A\u77E5 outbox", [`feature=${summary.failure_notification_feature}`, `enabled=${summary.failure_notification_policy_enabled}`, `queued=${summary.notifications_queued}`], "\u9700\u8981\u542F\u7528\u5931\u8D25\u901A\u77E5 policy \u5E76\u8BA2\u9605 adapter.smoke.failed\u3002"),
    auditCheck("adapter-capability-version-history", summary.adapter_trend_history_feature && summary.adapter_history_snapshots >= 1, "adapter capability/version/smoke \u89C2\u6D4B\u5F62\u6210 append-only \u8D8B\u52BF\u5386\u53F2", [`feature=${summary.adapter_trend_history_feature}`, `snapshots=${summary.adapter_history_snapshots}`, `version_changes=${summary.adapter_history_version_changes}`], "\u9700\u8981\u81F3\u5C11\u8BB0\u5F55\u4E00\u6B21 adapter observation\u3002"),
    auditCheck("capability-discoverability", summary.capability_groups >= 5 && summary.capability_commands >= 20, "\u9879\u76EE\u80FD\u529B\u6709\u673A\u5668\u53EF\u8BFB manifest\uFF0C\u4FBF\u4E8E\u7EF4\u62A4\u548C\u5BA1\u8BA1", [`capability_groups=${summary.capability_groups}`, `capability_commands=${summary.capability_commands}`], "\u9700\u8981 capabilities.json \u8986\u76D6\u4E3B\u8981\u547D\u4EE4\u9762\u3002")
  ];
}
function auditCheck(id, pass, claim, evidence, gap) {
  return {
    id,
    status: pass ? "PASS" : "FAIL",
    claim,
    evidence,
    gap: pass ? "" : gap
  };
}
function renderAuditMarkdown(report) {
  return `# Project Audit

audit_id: ${report.audit_id}
status: ${report.status}
created_at: ${report.created_at}

## Objective

${report.objective}

## Checks

${report.checks.map((check2) => `### ${check2.id}: ${check2.status}

${check2.claim}

Evidence:
${bullet(check2.evidence)}

Gap: ${check2.gap || "\u65E0"}
`).join("\n")}

## Summary

\`\`\`json
${JSON.stringify(report.summary, null, 2)}
\`\`\`
`;
}

// src/audit/project-audit-summary.mjs
import { readdirSync as readdirSync18 } from "node:fs";
import { join as join45 } from "node:path";
function buildAuditSummary(root, projectDir, testExecution, deps) {
  const { evaluateAdapterCapabilityDrift: evaluateAdapterCapabilityDrift2, findFilesByName: findFilesByName2, findRunFiles: findRunFiles2, getWorkers: getWorkers2, listRunStates: listRunStates2, workerSuccessfullyCompleted: workerSuccessfullyCompleted2 } = deps;
  const project = readJson(join45(root, "project.json"));
  const intake = readJson(join45(root, "intake", "items.json"), []);
  const roadmap = readJson(join45(root, "roadmap", "graph.json"));
  const learning = readJson(join45(root, "learning", "proposals.json"), []);
  const approvals = readJson(join45(root, "approvals", "items.json"), []);
  const risks = readJson(join45(root, "risks", "register.json"), []);
  const latestMetrics = readJson(join45(root, "metrics", "latest.json"), null);
  const latestAdapterSmoke = readJson(join45(root, "adapters", "latest-live-smoke.json"), null);
  const qualityPolicy = readJson(join45(root, "policies", "quality.json"), null);
  const notificationPolicy = readJson(join45(root, "policies", "notifications.json"), null);
  const notifications = readJson(join45(root, "notifications", "outbox.json"), []);
  const adapterTrend = readJson(join45(root, "adapters", "latest-trend.json"), buildAdapterTrend(root));
  const runs = listRunStates2(root);
  const carryForward = runs.flatMap((run) => run.carry_forward || []);
  const artifacts = listAllArtifacts(root);
  const schemaCount = readdirSync18(join45(projectDir, "schemas")).filter((file) => file.endsWith(".json")).length;
  const capabilities = readJson(join45(projectDir, "capabilities.json"), { groups: [] });
  const capabilityCommandCount = (capabilities.groups || []).reduce((sum, group) => sum + (group.commands?.length || 0), 0);
  const verificationReports = findRunFiles2(root, "verification-report.json");
  const verificationReportData = verificationReports.map((file) => readJson(file));
  const reviewReports = findRunFiles2(root, "review-report.json");
  const integrationReports = findRunFiles2(root, "integration-report.json");
  const mergeQueues = findRunFiles2(root, "merge-queue.json").map((file) => readJson(file));
  const allWorkers = runs.flatMap((run) => getWorkers2(root, run.run_id));
  const adapterResults = findFilesByName2(root, (name) => name.startsWith("adapter-result-") && name.endsWith(".json")).map((file) => readJson(file));
  const workerSummaries = findFilesByName2(root, (name) => name === "worker-summary.json").map((file) => readJson(file));
  const codexAdapter = inspectWorkerExecutor("codex");
  const agentAdapters = inspectWorkerExecutors();
  const adapterDrift = evaluateAdapterCapabilityDrift2(root);
  const retryPolicy = readJson(join45(root, "policies", "retry.json"), null);
  const eventLog = inspectEventLog(join45(root, "events.jsonl"));
  const reconciliationReports = findFilesByName2(root, (name) => name.startsWith("reconcile-") && name.endsWith(".json")).map((file) => readJson(file));
  const contractReport = scanProjectContracts(projectDir);
  const planGraphs = findRunFiles2(root, "plan-graph.json").map((file) => readJson(file));
  const taskAwarePlans = planGraphs.filter(
    (plan) => plan.source_intake_id && plan.source_title && Array.isArray(plan.planning_basis) && plan.nodes.some((node) => node.objective.includes(plan.source_title))
  );
  const fullyCoveredPlans = planGraphs.filter((plan) => {
    const workers = getWorkers2(root, plan.run_id);
    return plan.nodes.every(
      (node) => workers.some((worker) => worker.plan_node_id === node.id && workerSuccessfullyCompleted2(worker))
    );
  });
  const resolutionCount = findRunFiles2(root, "resolutions").length + findFilesByName2(root, (name) => name.startsWith("resolution-") && name.endsWith(".json")).length;
  const executed = (pattern) => hasExecutedTest(testExecution, pattern);
  const stagedVerificationFeature = executed("verify run \u5728 staged workspace") && executed("verify run \u62D2\u7EDD changed_files \u6CA1\u6709\u5B8C\u6574 operations");
  const contractRegistryFeature = executed("runtime contract gate \u5728\u65E0\u6548 ProjectState \u843D\u76D8\u524D\u62D2\u7EDD\u5199\u5165") && executed("contracts validate \u5B9A\u4F4D\u7ED5\u8FC7\u5199\u5165 gate \u7684\u6301\u4E45\u5316 contract \u635F\u574F");
  const executionGovernanceFeature = executed("execution policy \u963B\u6B62\u8D85\u51FA changed-files \u9884\u7B97\u7684 patch") && executed("critical merge \u5FC5\u987B\u901A\u8FC7\u5185\u5BB9\u6307\u7EB9 approval \u540E\u624D\u80FD apply");
  return {
    project_name: project.project_name,
    knowledge_version: project.knowledge_version,
    intake_total: intake.length,
    intake_accepted: intake.filter((item) => item.triage.status === "accepted").length,
    roadmap_nodes: roadmap.nodes.length,
    roadmap_done: roadmap.nodes.filter((node) => node.status === "done").length,
    active_runs: project.active_runs.length,
    runs_total: runs.length,
    runs_done: runs.filter((run) => run.status === "done").length,
    carry_forward_total: carryForward.length,
    carry_forward_open: carryForward.filter((item) => item.status === "open").length,
    carry_forward_handled: carryForward.filter((item) => ["resolved", "accepted"].includes(item.status)).length,
    artifacts_total: artifacts.length,
    evidence_artifacts: artifacts.filter((artifact) => artifact.type === "evidence").length,
    patch_artifacts: artifacts.filter((artifact) => artifact.type === "patch").length,
    verification_reports: verificationReports.length,
    review_reports: reviewReports.length,
    integration_reports: integrationReports.length,
    learning_total: learning.length,
    learning_applied: learning.filter((item) => item.status === "applied").length,
    schema_count: schemaCount,
    test_execution_status: testExecution.status,
    test_execution_command: testExecution.command,
    test_execution_exit_code: testExecution.exit_code,
    test_execution_duration_ms: testExecution.duration_ms,
    test_count: testExecution.tests,
    test_pass: testExecution.pass,
    test_fail: testExecution.fail,
    capability_groups: capabilities.groups?.length || 0,
    capability_commands: capabilityCommandCount,
    task_aware_plan_feature: executed("plan graph \u4F1A\u6309 intake \u7C7B\u578B\u3001\u6807\u9898\u548C affected area \u751F\u6210\u4EFB\u52A1\u76F8\u5173\u8303\u56F4"),
    complete_plan_gate_feature: executed("project tick --complete-execute \u5FC5\u987B\u7B49\u5F85\u5168\u90E8 PlanGraph \u8282\u70B9\u5B8C\u6210"),
    staged_verification_feature: stagedVerificationFeature,
    codex_agent_feature: executed("worker exec-agent \u5728 scratch \u526F\u672C\u6267\u884C Codex \u5E76\u81EA\u52A8\u751F\u6210 patch bundle"),
    reconciliation_feature: executed("project reconcile \u68C0\u6D4B\u5E76\u4FEE\u590D ProjectState\u3001Roadmap \u548C knowledge \u6F02\u79FB") && executed("project reconcile \u5728 event log \u635F\u574F\u65F6\u62D2\u7EDD apply"),
    retry_policy_feature: executed("worker retry \u9075\u5B88 adapter \u6700\u5927\u5C1D\u8BD5\u6B21\u6570\u5E76\u91CD\u7F6E sandbox"),
    contract_registry_feature: contractRegistryFeature,
    carry_forward_feature: executed("PARTIAL_PASS \u5FC5\u987B\u58F0\u660E carry-forward"),
    execution_governance_feature: executionGovernanceFeature,
    risk_metrics_feature: executed("quality metrics FAIL \u963B\u6B62\u65B0 run"),
    multi_adapter_feature: executed("adapter registry \u68C0\u6D4B\u591A CLI \u5E76\u6309\u663E\u5F0F fallback order \u89E3\u6790"),
    adapter_failover_feature: executed("worker fallback \u5728 retryable adapter failure \u540E\u5207\u6362\u5230\u4E0B\u4E00\u4E2A\u53EF\u7528 runtime"),
    quality_risk_synthesis_feature: testExecution.status === "PASS" && workerSummaries.some((item) => item.attempts.length > 1),
    adapter_session_feature: executed("Claude/Gemini adapters \u89E3\u6790 structured output\u3001session id \u548C resume \u53C2\u6570"),
    adapter_baseline_governance_feature: executed("adapter capability \u57FA\u7EBF\u53D1\u751F\u53D8\u5316\u65F6\u5FC5\u987B\u5BA1\u6279\u540E\u624D\u80FD\u91CD\u5F55"),
    live_adapter_smoke_feature: executed("adapter smoke FAIL report \u963B\u6B62\u65B0 run"),
    quality_regression_feature: executed("quality metrics FAIL \u963B\u6B62\u65B0 run"),
    adapter_smoke_auto_refresh_feature: executed("project tick \u5728\u5F85\u8C03\u5EA6\u4EFB\u52A1\u9047\u5230\u8FC7\u671F live smoke \u65F6\u81EA\u52A8\u5237\u65B0\u5E76\u7EE7\u7EED\u521B\u5EFA run"),
    failure_notification_feature: executed("live adapter smoke \u5931\u8D25\u6309\u901A\u77E5\u7B56\u7565\u8FDB\u5165\u53BB\u91CD outbox"),
    adapter_trend_history_feature: executed("adapter capability/version \u89C2\u6D4B\u5F62\u6210 append-only \u8D8B\u52BF\u5386\u53F2"),
    codex_available: codexAdapter.available,
    codex_version: codexAdapter.version,
    codex_agent_runs: adapterResults.filter((result) => result.adapter === "codex").length,
    codex_patch_runs: adapterResults.filter(
      (result) => result.adapter === "codex" && result.status === "PASS" && result.executable === "codex" && result.changed_files?.length > 0 && result.out_of_scope_files?.length === 0
    ).length,
    available_agent_adapters: agentAdapters.filter((item) => item.available).map((item) => item.adapter),
    adapter_fallback_events: eventLog.events.filter((event) => event.type === "worker.adapter.fallback").length,
    worker_summaries: workerSummaries.length,
    multi_attempt_summaries: workerSummaries.filter((item) => item.attempts.length > 1).length,
    adapter_session_results: adapterResults.filter((item) => item.session_id).length,
    adapter_capability_drift_status: adapterDrift.status,
    adapter_capability_blocking_changes: adapterDrift.changes.filter((item) => item.severity === "blocking").length,
    event_log_issues: eventLog.issues.length,
    reconciliation_reports: reconciliationReports.length,
    successful_reconciliations: reconciliationReports.filter(
      (report) => report.applied && report.post_check?.status === "CONSISTENT"
    ).length,
    retry_policy_present: Boolean(retryPolicy),
    policy_retry_events: eventLog.events.filter(
      (event) => event.type === "worker.retry.requested" && event.payload?.max_attempts && event.payload?.failure_kind
    ).length,
    contract_scan_status: contractReport.status,
    contract_schema_count: contractReport.schema_count,
    validated_contracts: contractReport.validated_contracts,
    contract_errors: contractReport.errors.length,
    approvals_total: approvals.length,
    approvals_approved: approvals.filter((item) => item.decision === "approved").length,
    approvals_pending: approvals.filter((item) => item.status === "pending").length,
    adapter_baseline_approvals: approvals.filter((item) => item.kind === "adapter_baseline" && item.decision === "approved").length,
    risks_open: risks.filter((item) => item.status === "open").length,
    risks_handled: risks.filter((item) => ["mitigated", "accepted", "closed"].includes(item.status)).length,
    metrics_snapshot_present: Boolean(latestMetrics),
    latest_quality_status: latestMetrics?.evaluation?.status || null,
    latest_adapter_smoke_status: latestAdapterSmoke?.status || null,
    latest_adapter_smoke_mode: latestAdapterSmoke?.mode || null,
    latest_adapter_smoke_age_hours: latestAdapterSmoke ? (Date.now() - Date.parse(latestAdapterSmoke.generated_at)) / 36e5 : null,
    adapter_smoke_max_age_hours: qualityPolicy?.adapter_smoke_max_age_hours || 24,
    live_adapter_smoke_passes: latestAdapterSmoke?.results?.filter((item) => item.status === "PASS").length || 0,
    adapter_smoke_auto_refresh_enabled: Boolean(qualityPolicy?.adapter_smoke_auto_refresh),
    failure_notification_policy_enabled: Boolean(notificationPolicy?.enabled),
    failure_notification_events: notificationPolicy?.notify_on || [],
    notifications_total: notifications.length,
    notifications_queued: notifications.filter((item) => item.status === "queued").length,
    adapter_history_snapshots: adapterTrend.snapshot_count || 0,
    adapter_history_version_changes: (adapterTrend.adapters || []).reduce((sum, item) => sum + item.version_changes.length, 0),
    plan_graphs_total: planGraphs.length,
    task_aware_plans: taskAwarePlans.length,
    fully_covered_plans: fullyCoveredPlans.length,
    staged_verification_reports: verificationReportData.filter(
      (report) => report.status === "PASS" && report.workspace?.mode === "staged-copy" && report.workspace.patch_ids.length > 0 && report.workspace.unmaterialized_patch_ids.length === 0
    ).length,
    worker_total: allWorkers.length,
    worker_merged: allWorkers.filter((worker) => worker.status === "merged").length,
    worker_sandbox_ready: allWorkers.filter((worker) => worker.sandbox?.status === "ready").length,
    worktree_or_fallback_tested: allWorkers.some((worker) => worker.sandbox?.type === "worktree" || worker.sandbox?.fallback_reason),
    conflict_reports: mergeQueues.reduce((sum, queue) => sum + (queue.conflicts?.length || 0), 0),
    resolution_count: resolutionCount,
    noop_integrations: integrationReports.map((file) => readJson(file)).filter((report) => report.status === "NOOP").length,
    merged_integrations: integrationReports.map((file) => readJson(file)).filter((report) => report.status === "MERGED").length
  };
}

// src/core/worker-supervisor.mjs
import { spawn as spawn2 } from "node:child_process";
var DEFAULT_TIMEOUT_MS = 30 * 60 * 1e3;
var DEFAULT_KILL_GRACE_MS = 1e3;
var DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
var DEFAULT_PARENT_CLEANUP_GRACE_MS = 250;
var PARENT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
var activeSupervisors = /* @__PURE__ */ new Set();
var parentSignalHandlers = /* @__PURE__ */ new Map();
var parentExitHandler = null;
var handlingParentSignal = false;
var WorkerSupervisor = class {
  constructor(options = {}) {
    this.maxConcurrency = positiveInteger2(
      options.maxConcurrency ?? 1,
      "maxConcurrency"
    );
    this.defaultTimeoutMs = positiveInteger2(
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "defaultTimeoutMs"
    );
    this.defaultKillGraceMs = nonNegativeInteger(
      options.defaultKillGraceMs ?? DEFAULT_KILL_GRACE_MS,
      "defaultKillGraceMs"
    );
    this.defaultMaxOutputBytes = positiveInteger2(
      options.defaultMaxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      "defaultMaxOutputBytes"
    );
    this.parentCleanupGraceMs = nonNegativeInteger(
      options.parentCleanupGraceMs ?? DEFAULT_PARENT_CLEANUP_GRACE_MS,
      "parentCleanupGraceMs"
    );
    this.cleanupOnParentExit = options.cleanupOnParentExit !== false;
    this.spawnProcess = options.spawnProcess || spawn2;
    this.active = /* @__PURE__ */ new Map();
    this.closed = false;
    this.running = false;
    this.stopReason = null;
  }
  async run(jobs) {
    if (this.closed) throw new Error("WorkerSupervisor is closed");
    if (this.running) throw new Error("WorkerSupervisor already has an active run");
    const normalizedJobs = normalizeJobs(jobs, this);
    if (normalizedJobs.length === 0) return [];
    this.running = true;
    if (this.cleanupOnParentExit) registerSupervisor(this);
    const results = new Array(normalizedJobs.length);
    let nextIndex = 0;
    let completed = 0;
    try {
      return await new Promise((resolve28) => {
        const schedule = () => {
          if (this.stopReason != null) {
            while (nextIndex < normalizedJobs.length) {
              results[nextIndex] = cancelledBeforeStart(
                normalizedJobs[nextIndex],
                this.stopReason
              );
              nextIndex += 1;
              completed += 1;
            }
            if (completed === normalizedJobs.length) resolve28(results);
            return;
          }
          while (nextIndex < normalizedJobs.length && this.active.size < this.maxConcurrency) {
            const index = nextIndex;
            nextIndex += 1;
            this.startJob(normalizedJobs[index]).then((result) => {
              results[index] = result;
              completed += 1;
              if (completed === normalizedJobs.length) {
                resolve28(results);
                return;
              }
              schedule();
            });
          }
        };
        schedule();
      });
    } finally {
      this.running = false;
      if (this.cleanupOnParentExit && this.active.size === 0) {
        unregisterSupervisor(this);
      }
    }
  }
  async close({ reason = "supervisor-close" } = {}) {
    this.closed = true;
    this.stopReason ||= reason;
    const active = [...this.active.values()];
    for (const state of active) {
      this.terminate(state, reason, state.killGraceMs);
    }
    await Promise.allSettled(active.map((state) => state.done));
    unregisterSupervisor(this);
  }
  startJob(job) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const state = {
      job,
      child: null,
      pid: null,
      startedAt,
      startedAtMs,
      stdout: [],
      stderr: [],
      stdoutBytes: 0,
      stderrBytes: 0,
      capturedOutputBytes: 0,
      observedOutputBytes: 0,
      timedOut: false,
      outputLimitExceeded: false,
      terminationReason: null,
      spawnError: null,
      termSent: false,
      forceKilled: false,
      settled: false,
      timeoutTimer: null,
      killTimer: null,
      killGraceMs: job.killGraceMs,
      done: null
    };
    state.done = new Promise((resolve28) => {
      state.resolve = resolve28;
    });
    let child;
    try {
      child = this.spawnProcess(job.command, job.args, {
        cwd: job.cwd,
        env: job.env,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      state.spawnError = error;
      this.finish(state, null, null);
      return state.done;
    }
    state.child = child;
    state.pid = child.pid || null;
    if (state.pid != null) this.active.set(state.pid, state);
    else this.active.set(Symbol(job.id), state);
    child.stdout.on("data", (chunk) => {
      this.captureOutput(state, "stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      this.captureOutput(state, "stderr", chunk);
    });
    child.once("error", (error) => {
      state.spawnError = error;
    });
    child.once("close", (code, signal) => {
      this.finish(state, code, signal);
    });
    state.timeoutTimer = setTimeout(() => {
      state.timedOut = true;
      this.terminate(state, "timeout", state.killGraceMs);
    }, job.timeoutMs);
    state.timeoutTimer.unref();
    if (job.input == null) child.stdin.end();
    else child.stdin.end(job.input);
    return state.done;
  }
  captureOutput(state, stream, value) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    state.observedOutputBytes += chunk.length;
    if (stream === "stdout") state.stdoutBytes += chunk.length;
    else state.stderrBytes += chunk.length;
    const remaining = Math.max(
      0,
      state.job.maxOutputBytes - state.capturedOutputBytes
    );
    if (remaining > 0) {
      const captured = chunk.subarray(0, remaining);
      state[stream].push(captured);
      state.capturedOutputBytes += captured.length;
    }
    if (!state.outputLimitExceeded && state.observedOutputBytes > state.job.maxOutputBytes) {
      state.outputLimitExceeded = true;
      this.terminate(state, "output-limit", state.killGraceMs);
    }
  }
  terminate(state, reason, graceMs) {
    if (state.settled) return;
    if (state.terminationReason == null) state.terminationReason = reason;
    if (!state.termSent) {
      state.termSent = true;
      signalProcessTree(state.child, state.pid, "SIGTERM");
    }
    if (state.killTimer != null) return;
    state.killTimer = setTimeout(() => {
      if (state.settled) return;
      state.forceKilled = true;
      signalProcessTree(state.child, state.pid, "SIGKILL");
    }, graceMs);
    state.killTimer.unref();
  }
  finish(state, code, signal) {
    if (state.settled) return;
    state.settled = true;
    clearTimeout(state.timeoutTimer);
    clearTimeout(state.killTimer);
    for (const [key, activeState] of this.active) {
      if (activeState === state) {
        this.active.delete(key);
        break;
      }
    }
    if (this.cleanupOnParentExit && this.active.size === 0 && !this.running) {
      unregisterSupervisor(this);
    }
    const endedAtMs = Date.now();
    const result = {
      job_id: state.job.id,
      status: resultStatus(state, code, signal),
      command: state.job.command,
      args: [...state.job.args],
      pid: state.pid,
      stdout: Buffer.concat(state.stdout).toString("utf8"),
      stderr: Buffer.concat(state.stderr).toString("utf8"),
      stdout_bytes: state.stdoutBytes,
      stderr_bytes: state.stderrBytes,
      observed_output_bytes: state.observedOutputBytes,
      captured_output_bytes: state.capturedOutputBytes,
      output_limit_bytes: state.job.maxOutputBytes,
      output_limit_exceeded: state.outputLimitExceeded,
      timed_out: state.timedOut,
      termination_reason: state.terminationReason,
      term_sent: state.termSent,
      force_killed: state.forceKilled,
      exit_code: code,
      signal: signal || null,
      spawn_error: state.spawnError?.message || null,
      started_at: state.startedAt,
      ended_at: new Date(endedAtMs).toISOString(),
      duration_ms: endedAtMs - state.startedAtMs
    };
    state.resolve(result);
  }
  async terminateForParentSignal() {
    this.stopReason ||= "parent-exit";
    const active = [...this.active.values()];
    for (const state of active) {
      this.terminate(state, "parent-exit", this.parentCleanupGraceMs);
    }
    await Promise.allSettled(active.map((state) => state.done));
  }
  forceTerminateForParentExit() {
    for (const state of this.active.values()) {
      if (state.settled) continue;
      state.terminationReason ||= "parent-exit";
      signalProcessTree(state.child, state.pid, "SIGTERM");
      signalProcessTree(state.child, state.pid, "SIGKILL");
    }
  }
};
async function runWorkerJobs(jobs, options = {}) {
  const supervisor = new WorkerSupervisor(options);
  try {
    return await supervisor.run(jobs);
  } finally {
    await supervisor.close();
  }
}
function normalizeJobs(jobs, supervisor) {
  if (!Array.isArray(jobs)) throw new Error("jobs must be an array");
  const ids = /* @__PURE__ */ new Set();
  return jobs.map((job, index) => {
    if (job == null || typeof job !== "object" || Array.isArray(job)) {
      throw new Error(`jobs[${index}] must be an object`);
    }
    const id = String(job.id || "").trim();
    if (!id) throw new Error(`jobs[${index}].id is required`);
    if (ids.has(id)) throw new Error(`duplicate worker job id: ${id}`);
    ids.add(id);
    const command = String(job.command || "").trim();
    if (!command) throw new Error(`jobs[${index}].command is required`);
    if (job.args != null && !Array.isArray(job.args)) {
      throw new Error(`jobs[${index}].args must be an array`);
    }
    const args = (job.args || []).map((argument) => String(argument));
    const timeoutMs = positiveInteger2(
      job.timeoutMs ?? supervisor.defaultTimeoutMs,
      `jobs[${index}].timeoutMs`
    );
    const killGraceMs = nonNegativeInteger(
      job.killGraceMs ?? supervisor.defaultKillGraceMs,
      `jobs[${index}].killGraceMs`
    );
    const maxOutputBytes = positiveInteger2(
      job.maxOutputBytes ?? supervisor.defaultMaxOutputBytes,
      `jobs[${index}].maxOutputBytes`
    );
    return {
      id,
      command,
      args,
      cwd: job.cwd,
      env: job.env == null ? process.env : { ...process.env, ...job.env },
      input: job.input,
      timeoutMs,
      killGraceMs,
      maxOutputBytes
    };
  });
}
function resultStatus(state, code, signal) {
  if (state.spawnError) return "spawn_error";
  if (state.timedOut) return "timed_out";
  if (state.outputLimitExceeded) return "output_limit";
  if (state.terminationReason != null) return "cancelled";
  if (code === 0 && signal == null) return "succeeded";
  return "failed";
}
function cancelledBeforeStart(job, reason) {
  return {
    job_id: job.id,
    status: "cancelled",
    command: job.command,
    args: [...job.args],
    pid: null,
    stdout: "",
    stderr: "",
    stdout_bytes: 0,
    stderr_bytes: 0,
    observed_output_bytes: 0,
    captured_output_bytes: 0,
    output_limit_bytes: job.maxOutputBytes,
    output_limit_exceeded: false,
    timed_out: false,
    termination_reason: reason,
    term_sent: false,
    force_killed: false,
    exit_code: null,
    signal: null,
    spawn_error: null,
    started_at: null,
    ended_at: (/* @__PURE__ */ new Date()).toISOString(),
    duration_ms: 0
  };
}
function signalProcessTree(child, pid, signal) {
  if (process.platform !== "win32" && Number.isInteger(pid) && pid > 1) {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      if (error.code !== "ESRCH") {
        try {
          child?.kill(signal);
        } catch {
        }
      }
      return;
    }
  }
  try {
    child?.kill(signal);
  } catch {
  }
}
function registerSupervisor(supervisor) {
  activeSupervisors.add(supervisor);
  if (parentExitHandler != null) return;
  parentExitHandler = () => {
    for (const activeSupervisor of activeSupervisors) {
      activeSupervisor.forceTerminateForParentExit();
    }
  };
  process.on("exit", parentExitHandler);
  for (const signal of PARENT_SIGNALS) {
    const handler = () => {
      handleParentSignal(signal);
    };
    parentSignalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}
function unregisterSupervisor(supervisor) {
  activeSupervisors.delete(supervisor);
  if (activeSupervisors.size > 0 || parentExitHandler == null) return;
  process.off("exit", parentExitHandler);
  parentExitHandler = null;
  for (const [signal, handler] of parentSignalHandlers) {
    process.off(signal, handler);
  }
  parentSignalHandlers.clear();
}
async function handleParentSignal(signal) {
  if (handlingParentSignal) return;
  handlingParentSignal = true;
  const supervisors = [...activeSupervisors];
  await Promise.allSettled(
    supervisors.map((supervisor) => supervisor.terminateForParentSignal())
  );
  removeAllParentHandlers();
  process.kill(process.pid, signal);
}
function removeAllParentHandlers() {
  activeSupervisors.clear();
  if (parentExitHandler != null) {
    process.off("exit", parentExitHandler);
    parentExitHandler = null;
  }
  for (const [signal, handler] of parentSignalHandlers) {
    process.off(signal, handler);
  }
  parentSignalHandlers.clear();
}
function positiveInteger2(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}
function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

// src/core/scheduler-lock.mjs
import {
  existsSync as existsSync30,
  mkdirSync as mkdirSync9,
  readFileSync as readFileSync23,
  renameSync as renameSync4,
  rmSync as rmSync10,
  statSync as statSync6,
  writeFileSync as writeFileSync15
} from "node:fs";
import { randomUUID as randomUUID5 } from "node:crypto";
import { join as join46, resolve as resolve26 } from "node:path";
var SLEEP_BUFFER2 = new Int32Array(new SharedArrayBuffer(4));
function acquireSchedulerLock(projectDir, options = {}) {
  const root = resolve26(projectDir);
  const lockPath = join46(root, ".apex-v2.scheduler-lock");
  const ownerPath = join46(lockPath, "owner.json");
  const token = randomUUID5();
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 3e4;
  const retryMs = options.retryMs ?? 25;
  while (true) {
    try {
      mkdirSync9(lockPath);
      writeFileSync15(ownerPath, `${JSON.stringify({
        token,
        pid: process.pid,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      })}
`);
      return () => releaseSchedulerLock(lockPath, ownerPath, token);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearDeadScheduler(lockPath, ownerPath);
      if (!existsSync30(lockPath)) continue;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`scheduler lock timeout\uFF1A${lockPath}`);
      }
      Atomics.wait(SLEEP_BUFFER2, 0, 0, retryMs);
    }
  }
}
function clearDeadScheduler(lockPath, ownerPath) {
  let owner;
  try {
    owner = JSON.parse(readFileSync23(ownerPath, "utf8"));
  } catch {
    try {
      if (Date.now() - statSync6(lockPath).mtimeMs < 1e3) return;
    } catch {
      return;
    }
    rmSync10(lockPath, { recursive: true, force: true });
    return;
  }
  if (processAlive3(owner.pid)) return;
  const quarantine = `${lockPath}.stale-${randomUUID5()}`;
  try {
    renameSync4(lockPath, quarantine);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  rmSync10(quarantine, { recursive: true, force: true });
}
function releaseSchedulerLock(lockPath, ownerPath, token) {
  try {
    const owner = JSON.parse(readFileSync23(ownerPath, "utf8"));
    if (owner.token !== token) return;
  } catch {
    return;
  }
  rmSync10(lockPath, { recursive: true, force: true });
}
function processAlive3(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// src/apex-v2.mjs
registerJsonWriteValidator(validatePersistedValue);
async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  try {
    if (!command || command === "help" || command === "--help") {
      printHelp();
      return;
    }
    if (command === "init") {
      initProject(parseArgs([subcommand, ...rest]));
      return;
    }
    if (command === "status") {
      status(parseArgs([subcommand, ...rest]));
      return;
    }
    if (command === "validate") {
      validateProject(parseArgs([subcommand, ...rest]));
      return;
    }
    if (command === "intake") {
      handleIntakeCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "roadmap") {
      handleRoadmapCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "capability") {
      handleCapabilityCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "run") {
      handleRunCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "artifact") {
      handleArtifactCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "knowledge") {
      handleKnowledgeCommand(subcommand, parseArgs(rest), { appendAppliedLearning });
      return;
    }
    if (command === "worker") {
      handleWorkerCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "host") {
      handleHostCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "decision") {
      handleDecisionCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "negative-control") {
      handleNegativeControlCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "merge") {
      handleMergeCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "verify") {
      handleVerifyCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "review") {
      handleReviewCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "learn") {
      handleLearn(subcommand, parseArgs(rest));
      return;
    }
    if (command === "project") {
      await handleProject(subcommand, parseArgs(rest));
      return;
    }
    if (command === "contracts") {
      handleContractsCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "approval") {
      handleApprovalCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "risk") {
      handleRiskCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "notification") {
      handleNotificationCommand(subcommand, parseArgs(rest));
      return;
    }
    throw new Error(`\u672A\u77E5\u547D\u4EE4\uFF1A${command}`);
  } catch (error) {
    console.error(`\u9519\u8BEF\uFF1A${error.message}`);
    process.exitCode = 1;
  }
}
function handleLearn(subcommand, args) {
  if (subcommand === "propose") {
    proposeLearning(args);
    return;
  }
  if (subcommand === "list") {
    listLearning(args);
    return;
  }
  if (subcommand === "approve") {
    approveLearning(args);
    return;
  }
  if (subcommand === "apply") {
    applyLearning(args);
    return;
  }
  throw new Error(`\u672A\u77E5 learn \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function proposeLearning(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const result = proposeLearningInternal(root, run);
  console.log(JSON.stringify(result, null, 2));
}
function proposeLearningInternal(root, run) {
  requirePassedNode(run, "integrate");
  const timestamp = now();
  const verification = readJson(join47(root, "runs", run.run_id, "verification-report.json"), null);
  const review = readJson(join47(root, "runs", run.run_id, "review-report.json"), null);
  const integration = readJson(join47(root, "runs", run.run_id, "integration-report.json"), null);
  if (!verification || verification.status !== "PASS") throw new Error("\u7F3A\u5C11 PASS verification-report\uFF0C\u4E0D\u80FD\u751F\u6210 learning proposal");
  if (!review || review.status !== "PASS") throw new Error("\u7F3A\u5C11 PASS review-report\uFF0C\u4E0D\u80FD\u751F\u6210 learning proposal");
  if (!integration || !["MERGED", "NOOP"].includes(integration.status)) throw new Error("\u7F3A\u5C11 MERGED/NOOP integration-report\uFF0C\u4E0D\u80FD\u751F\u6210 learning proposal");
  const candidates = [
    {
      target_file: "knowledge/decisions.md",
      proposed_change: "Apex Forge V2 \u7684\u6301\u7EED\u4EA4\u4ED8\u95ED\u73AF\u91C7\u7528 artifact evidence gate\uFF1Arun \u8282\u70B9 PASS \u5FC5\u987B\u5F15\u7528\u5F53\u524D\u8282\u70B9 artifact\uFF0Creview \u5FC5\u987B\u57FA\u4E8E verification report \u548C merge queue\uFF0Cintegration \u5FC5\u987B\u5728 review PASS \u540E\u5E94\u7528 merge queue\u3002",
      evidence_refs: [
        `.apex-v2/runs/${run.run_id}/run.json`,
        `.apex-v2/runs/${run.run_id}/verification-report.json`,
        `.apex-v2/runs/${run.run_id}/review-report.json`,
        `.apex-v2/runs/${run.run_id}/integration-report.json`
      ],
      confidence: 0.95
    },
    {
      target_file: "knowledge/test-map.md",
      proposed_change: "\u5F53\u524D\u6700\u5C0F\u56DE\u5F52\u7EC4\u4E3A npm test\u3001node --check src/apex-v2.mjs\u3001strict project validate\u3001schemas JSON parse\uFF1Bverification report \u5FC5\u987B\u8BB0\u5F55\u6BCF\u6761\u547D\u4EE4\u7684 exit code \u548C\u8F93\u51FA\u5C3E\u90E8\u3002",
      evidence_refs: [`.apex-v2/runs/${run.run_id}/verification-report.json`, "tests/apex-v2.test.mjs"],
      confidence: 0.95
    },
    {
      target_file: "knowledge/danger-zones.md",
      proposed_change: "merge queue \u72B6\u6001\u91CD\u7B97\u4E0D\u5F97\u56DE\u6EDA\u5DF2 merged patch\uFF1B\u540C\u6587\u4EF6 patch \u5FC5\u987B\u751F\u6210 conflict report \u5E76\u963B\u585E\u76F8\u5173 worker\uFF0C\u76F4\u5230 coordinator \u4E32\u884C\u5904\u7406\u3002",
      evidence_refs: [`.apex-v2/runs/${run.run_id}/merge-queue.json`, "src/apex-v2.mjs", "tests/apex-v2.test.mjs"],
      confidence: 0.9
    }
  ];
  const proposalsPath = join47(root, "learning", "proposals.json");
  const jobsPath = join47(root, "learning", "jobs.json");
  const proposals = readJson(proposalsPath, []);
  const jobs = readJson(jobsPath, []);
  const created = [];
  const queuedJobs = [];
  for (const candidate of candidates) {
    let proposal = proposals.find(
      (item) => item.source_run_id === run.run_id && item.target_file === candidate.target_file && item.proposed_change === candidate.proposed_change
    );
    if (!proposal) {
      proposal = {
        schema_version: SCHEMA_VERSION,
        id: shortId("learning"),
        source_run_id: run.run_id,
        target_file: candidate.target_file,
        proposed_change: candidate.proposed_change,
        evidence_refs: candidate.evidence_refs,
        confidence: candidate.confidence,
        status: "proposed",
        apply_job_id: null,
        apply_receipt_id: null,
        applied_at: null,
        created_at: timestamp,
        updated_at: timestamp
      };
      proposals.push(proposal);
    }
    let job = jobs.find((item) => item.proposal_id === proposal.id);
    if (!job) {
      job = {
        schema_version: SCHEMA_VERSION,
        job_id: shortId("learning-job"),
        run_id: run.run_id,
        proposal_id: proposal.id,
        status: proposal.status === "approved" ? "queued" : proposal.status === "applied" ? "applied" : "waiting_approval",
        attempt: 0,
        idempotency_key: `learning-apply-job-v1:${proposal.id}`,
        requested_at: timestamp,
        started_at: null,
        completed_at: null,
        receipt_id: proposal.apply_receipt_id || null,
        error: null,
        updated_at: timestamp
      };
      jobs.push(job);
    }
    proposal.apply_job_id = job.job_id;
    proposal.updated_at = timestamp;
    created.push(proposal);
    queuedJobs.push(job);
  }
  writeJson(proposalsPath, proposals);
  writeJson(jobsPath, jobs);
  const reportPath = join47(root, "runs", run.run_id, "learning-report.json");
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("learning-report"),
    run_id: run.run_id,
    created_at: timestamp,
    proposal_ids: created.map((proposal) => proposal.id),
    queue_job_ids: queuedJobs.map((job) => job.job_id),
    completion_kind: "proposal_queued",
    proposal_artifact_id: null
  };
  writeJson(reportPath, report);
  const artifact = createArtifact(root, run, "learn", {
    type: "decision",
    title: "Learning\uFF1A\u5DF2\u751F\u6210\u6CBB\u7406\u63D0\u6848",
    body: `\u5DF2\u751F\u6210 ${created.length} \u6761 learning proposals\uFF0C\u7B49\u5F85 governance approval\u3002`,
    refs: [
      ".apex-v2/learning/proposals.json",
      `.apex-v2/runs/${run.run_id}/learning-report.json`
    ],
    timestamp
  });
  report.proposal_artifact_id = artifact.artifact_id;
  writeJson(reportPath, report);
  const event = appendEvent(root, "learning.proposed", "apex-v2", {
    run_id: run.run_id,
    proposal_ids: created.map((proposal) => proposal.id),
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    proposals: created,
    jobs: queuedJobs,
    artifact_id: artifact.artifact_id
  };
}
function listLearning(args) {
  const root = requireStore(projectRoot(args));
  const proposals = readJson(join47(root, "learning", "proposals.json"), []);
  const status2 = args.status ? String(args.status) : null;
  console.log(JSON.stringify(status2 ? proposals.filter((proposal) => proposal.status === status2) : proposals, null, 2));
}
function approveLearning(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const proposal = withProjectTransaction(resolve27(root, ".."), {
    kind: "learning-approve",
    idempotencyKey: `learning-approve:${id}`
  }, () => {
    const approved = updateLearningProposal(root, id, (item) => {
      if (item.status !== "proposed") throw new Error(`\u53EA\u6709 proposed proposal \u53EF\u4EE5 approve\uFF0C\u5F53\u524D\u72B6\u6001\uFF1A${item.status}`);
      item.status = "approved";
      item.updated_at = now();
    });
    queueApprovedLearningJob(root, approved);
    const event = appendEvent(root, "learning.approved", "apex-v2", { proposal_id: approved.id });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    return approved;
  }).result;
  console.log(JSON.stringify(proposal, null, 2));
}
function applyLearning(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const proposal = getLearningProposal(root, id);
  if (proposal.status !== "approved" && proposal.status !== "applied") {
    throw new Error(`\u53EA\u6709 approved proposal \u53EF\u4EE5 apply\uFF0C\u5F53\u524D\u72B6\u6001\uFF1A${proposal.status}`);
  }
  if (proposal.status === "applied" && proposal.apply_receipt_id) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }
  const job = queueApprovedLearningJob(root, proposal);
  const [result] = processLearningJobs(root, {
    limit: 1,
    jobId: job.job_id
  });
  if (!result || result.status !== "APPLIED") {
    throw new Error(result?.error || `learning job \u672A\u5E94\u7528\uFF1A${job.job_id}`);
  }
  console.log(JSON.stringify(getLearningProposal(root, id), null, 2));
}
async function handleProject(subcommand, args) {
  if (subcommand === "git") {
    handleGitDeliveryCommand(args._[0], args);
    return;
  }
  if (subcommand === "tick") {
    await projectTick(args);
    return;
  }
  if (subcommand === "heartbeat") {
    const action = args._[0];
    if (action === "install") {
      console.log(JSON.stringify(installHeartbeatScheduler(projectRoot(args), {
        intervalMinutes: Number(args["interval-minutes"] || 60),
        envFile: args["env-file"] ? String(args["env-file"]) : void 0,
        activate: Boolean(args.activate)
      }), null, 2));
      return;
    }
    if (action === "status") {
      console.log(JSON.stringify(heartbeatSchedulerStatus(projectRoot(args)), null, 2));
      return;
    }
    if (action === "daemon-start") {
      console.log(JSON.stringify(startHeartbeatDaemon(projectRoot(args), {
        intervalMinutes: Number(args["interval-minutes"] || 60)
      }), null, 2));
      return;
    }
    if (action === "daemon-status") {
      console.log(JSON.stringify(heartbeatDaemonStatus(projectRoot(args)), null, 2));
      return;
    }
    if (action === "daemon-stop") {
      console.log(JSON.stringify(stopHeartbeatDaemon(projectRoot(args)), null, 2));
      return;
    }
    console.log(JSON.stringify(runProjectHeartbeat(requireStore(projectRoot(args)), {
      forceNotifications: Boolean(args["force-notifications"])
    }), null, 2));
    return;
  }
  if (subcommand === "audit") {
    auditProject(args);
    return;
  }
  if (subcommand === "reconcile") {
    reconcileProject(args);
    return;
  }
  if (subcommand === "metrics") {
    projectMetrics(args);
    return;
  }
  if (subcommand === "quality") {
    projectQuality(args);
    return;
  }
  throw new Error(`\u672A\u77E5 project \u5B50\u547D\u4EE4\uFF1A${subcommand || "(\u7A7A)"}`);
}
function projectMetrics(args) {
  const root = requireStore(projectRoot(args));
  const snapshot = buildProjectMetrics(root);
  if (args.record) {
    ensureDir(join47(root, "metrics"));
    writeJson(join47(root, "metrics", `${snapshot.snapshot_id}.json`), snapshot);
    writeJson(join47(root, "metrics", "latest.json"), snapshot);
    const event = appendEvent(root, "project.metrics.recorded", "apex-v2", { snapshot_id: snapshot.snapshot_id });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  console.log(JSON.stringify(snapshot, null, 2));
}
function projectQuality(args) {
  const action = args._[0];
  if (action !== "set") throw new Error(`\u672A\u77E5 project quality \u52A8\u4F5C\uFF1A${action || "(\u7A7A)"}`);
  const root = requireStore(projectRoot(args));
  const path = join47(root, "policies", "quality.json");
  const policy = readJson(path);
  const mappings = [
    ["max-open-risks", "max_open_risks"],
    ["max-verification-failures", "max_verification_failures"],
    ["max-adapter-failure-rate", "max_adapter_failure_rate"],
    ["max-cycle-regression-percent", "max_cycle_regression_percent"]
  ];
  for (const [argName, field] of mappings) {
    if (args[argName] == null) continue;
    const value = Number(args[argName]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${argName} \u5FC5\u987B\u662F\u975E\u8D1F\u6570\u5B57`);
    policy.thresholds[field] = value;
  }
  if (args["adapter-smoke-max-age-hours"] != null) {
    const value = Number(args["adapter-smoke-max-age-hours"]);
    if (!Number.isFinite(value) || value < 1) throw new Error("--adapter-smoke-max-age-hours \u5FC5\u987B\u662F\u4E0D\u5C0F\u4E8E 1 \u7684\u6570\u5B57");
    policy.adapter_smoke_max_age_hours = value;
  }
  if (args["adapter-smoke-refresh-timeout-ms"] != null) {
    const value = Number(args["adapter-smoke-refresh-timeout-ms"]);
    if (!Number.isInteger(value) || value < 1e3) throw new Error("--adapter-smoke-refresh-timeout-ms \u5FC5\u987B\u662F\u4E0D\u5C0F\u4E8E 1000 \u7684\u6574\u6570");
    policy.adapter_smoke_refresh_timeout_ms = value;
  }
  if (args["adapter-smoke-auto-refresh"] != null) {
    const value = String(args["adapter-smoke-auto-refresh"]);
    if (!["true", "false"].includes(value)) throw new Error("--adapter-smoke-auto-refresh \u53EA\u80FD\u662F true \u6216 false");
    policy.adapter_smoke_auto_refresh = value === "true";
  }
  if (args["adapter-observation-interval-hours"] != null) {
    const value = Number(args["adapter-observation-interval-hours"]);
    if (!Number.isInteger(value) || value < 1) throw new Error("--adapter-observation-interval-hours \u5FC5\u987B\u662F\u6B63\u6574\u6570");
    policy.adapter_observation_interval_hours = value;
  }
  if (args["rolling-window-days"] != null) {
    const value = Number(args["rolling-window-days"]);
    if (!Number.isInteger(value) || value < 1) throw new Error("--rolling-window-days \u5FC5\u987B\u662F\u6B63\u6574\u6570");
    policy.rolling_window_days = value;
  }
  if (args["rolling-run-count"] != null) {
    const value = Number(args["rolling-run-count"]);
    if (!Number.isInteger(value) || value < 1) throw new Error("--rolling-run-count \u5FC5\u987B\u662F\u6B63\u6574\u6570");
    policy.rolling_run_count = value;
  }
  policy.updated_at = now();
  writeJson(path, policy);
  const event = appendEvent(root, "quality.policy.updated", "human", {
    thresholds: policy.thresholds,
    adapter_smoke_max_age_hours: policy.adapter_smoke_max_age_hours,
    adapter_smoke_auto_refresh: policy.adapter_smoke_auto_refresh,
    adapter_smoke_refresh_timeout_ms: policy.adapter_smoke_refresh_timeout_ms,
    adapter_observation_interval_hours: policy.adapter_observation_interval_hours,
    rolling_window_days: policy.rolling_window_days,
    rolling_run_count: policy.rolling_run_count
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify(policy, null, 2));
}
function reconcileProject(args) {
  const root = requireStore(projectRoot(args));
  const timestamp = now();
  const inspection = inspectProjectConsistency(root);
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("reconcile"),
    created_at: timestamp,
    status: inspection.status,
    applied: false,
    inspection,
    post_check: null
  };
  if (args.apply) {
    if (inspection.status === "INVALID") {
      throw new Error(`reconcile \u62D2\u7EDD apply\uFF1Aevent/state integrity \u6709 ${inspection.issues.length} \u4E2A\u95EE\u9898`);
    }
    applyProjectReconciliation(root, inspection);
    const operational = inspectOperationalIntegrity(root);
    const event = appendEvent(root, "project.reconciled", "apex-v2", {
      report_id: report.report_id,
      change_count: inspection.changes.length,
      active_runs: inspection.derived.active_runs,
      knowledge_version: inspection.derived.knowledge_version,
      operational_state_hash: operational.state_hash,
      operational_state: operational.state
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    report.applied = true;
    report.status = inspection.changes.length > 0 ? "REPAIRED" : "CONSISTENT";
    report.post_check = inspectProjectConsistency(root);
    const reportDir = join47(root, "reconciliations");
    ensureDir(reportDir);
    writeJson(join47(reportDir, `${report.report_id}.json`), report);
  }
  console.log(JSON.stringify(report, null, 2));
}
async function projectTick(args) {
  const root = requireStore(projectRoot(args));
  const timestamp = now();
  const intakePath = join47(root, "intake", "items.json");
  const roadmapPath = join47(root, "roadmap", "graph.json");
  const projectPath = join47(root, "project.json");
  const intake = readJson(intakePath, []);
  const roadmap = readJson(roadmapPath);
  const project = readJson(projectPath);
  const promoted = [];
  const createdRuns = [];
  const advancedRuns = [];
  let dispatchedWorkers = [];
  let retriedWorkers = [];
  let fallbackWorkers = [];
  let workerRuns = [];
  let agentRuns = [];
  let collectedResults = [];
  let completedExecuteRuns = [];
  let verifiedRuns = [];
  let reviewedRuns = [];
  let integratedRuns = [];
  let learnedRuns = [];
  let learningJobs = [];
  let agentScheduler = null;
  let adapterSmokeRefresh = {
    attempted: false,
    reason: "no-ready-nodes",
    status: null,
    smoke_id: null
  };
  for (const item of intake) {
    if (item.triage.status !== "accepted") continue;
    if (roadmap.nodes.some((node2) => node2.source_intake_id === item.id)) continue;
    const node = createRoadmapNodeFromIntake(item, timestamp);
    roadmap.nodes.push(node);
    if (item.triage.target_milestone && !roadmap.milestones.includes(item.triage.target_milestone)) {
      roadmap.milestones.push(item.triage.target_milestone);
    }
    promoted.push(node);
    appendEvent(root, "roadmap.promoted", "apex-v2", { roadmap_node_id: node.id, intake_id: item.id, via: "project.tick" });
  }
  roadmap.updated_at = timestamp;
  writeJson(roadmapPath, roadmap);
  let activeRunSlots = Math.max(0, project.wip_limits.active_runs - project.active_runs.length);
  let activeNodeSlots = Math.max(0, roadmap.wip_limits.active_nodes - roadmap.nodes.filter((node) => node.status === "active").length);
  const readyNodes = roadmap.nodes.filter((node) => node.status === "ready").sort(compareRoadmapPriority);
  const qualityPolicy = readJson(join47(root, "policies", "quality.json"));
  const latestMetrics = readJson(join47(root, "metrics", "latest.json"), null);
  if (readyNodes.length > 0 && qualityPolicy.block_new_runs_on_failure && latestMetrics?.evaluation?.status === "FAIL") {
    throw new Error(`quality gate \u963B\u6B62\u521B\u5EFA\u65B0 run\uFF1A${latestMetrics.evaluation.failures.join(",")}`);
  }
  if (readyNodes.length > 0) {
    adapterSmokeRefresh = refreshStaleAdapterSmoke(root, qualityPolicy, {
      trigger: "project.tick"
    });
  }
  const latestSmoke = readJson(join47(root, "adapters", "latest-live-smoke.json"), null);
  if (readyNodes.length > 0 && qualityPolicy.block_new_runs_on_smoke_failure && latestSmoke?.status === "FAIL") {
    throw new Error(`adapter smoke gate \u963B\u6B62\u521B\u5EFA\u65B0 run\uFF1A${latestSmoke.results.filter((item) => item.status === "FAIL").map((item) => item.adapter).join(",")}`);
  }
  if (readyNodes.length > 0 && latestSmoke && Date.now() - Date.parse(latestSmoke.generated_at) > qualityPolicy.adapter_smoke_max_age_hours * 36e5) {
    throw new Error("adapter smoke gate \u963B\u6B62\u521B\u5EFA\u65B0 run\uFF1Alatest smoke \u5DF2\u8FC7\u671F");
  }
  const adapterDrift = evaluateAdapterCapabilityDrift(root);
  if (readyNodes.length > 0 && adapterDrift.baseline_generated_at && adapterDrift.status === "FAIL") {
    throw new Error(`adapter capability gate \u963B\u6B62\u521B\u5EFA\u65B0 run\uFF1A${adapterDrift.changes.filter((item) => item.severity === "blocking").map((item) => `${item.adapter}:${item.kind}`).join(",")}`);
  }
  for (const node of readyNodes) {
    if (activeRunSlots <= 0 || activeNodeSlots <= 0) break;
    const run = createRunForRoadmapNode(root, node.id, timestamp);
    createdRuns.push(run);
    activeRunSlots -= 1;
    activeNodeSlots -= 1;
  }
  if (args.advance) {
    const refreshedProject = readJson(projectPath);
    for (const runId of refreshedProject.active_runs) {
      const advanced = advanceRunPlanning(root, runId);
      if (advanced.actions.length > 0) advancedRuns.push(advanced);
    }
  }
  if (args["run-agents"]) {
    const limit = effectiveAgentLimit(root, Math.max(1, Number(args["agent-limit"] || 1)));
    const releaseScheduler = acquireSchedulerLock(resolve27(root, ".."));
    try {
      agentScheduler = await runProjectAgentScheduler(root, limit, args);
    } finally {
      releaseScheduler();
    }
    dispatchedWorkers = agentScheduler.dispatched_workers;
    retriedWorkers = agentScheduler.retried_workers;
    fallbackWorkers = agentScheduler.fallback_workers;
    workerRuns = agentScheduler.worker_runs;
    agentRuns = agentScheduler.agent_runs;
    collectedResults = agentScheduler.collected_results;
    completedExecuteRuns = agentScheduler.completed_execute_runs;
  } else {
    if (args.dispatch) {
      const refreshedProject = readJson(projectPath);
      dispatchedWorkers = dispatchReadyWorkers(root, refreshedProject.active_runs, {
        mode: args["execution-mode"] ? String(args["execution-mode"]) : null
      });
    }
    if (args["retry-workers"]) {
      const refreshedProject = readJson(projectPath);
      const limit = Math.max(1, Number(args["retry-limit"] || 1));
      retriedWorkers = retryBlockedWorkers(root, refreshedProject.active_runs, limit);
    }
    if (args["fallback-agents"]) {
      const refreshedProject = readJson(projectPath);
      const limit = Math.max(1, Number(args["fallback-limit"] || 1));
      fallbackWorkers = fallbackBlockedAgents(root, refreshedProject.active_runs, limit);
    }
    if (args["run-workers"]) {
      const refreshedProject = readJson(projectPath);
      const limit = Math.max(1, Number(args["worker-limit"] || 1));
      workerRuns = runReadyWorkerAdapters(root, refreshedProject.active_runs, limit);
    }
    if (args["collect-results"]) {
      const refreshedProject = readJson(projectPath);
      collectedResults = collectWorkerResults(root, refreshedProject.active_runs);
    }
    if (args["complete-execute"]) {
      const refreshedProject = readJson(projectPath);
      completedExecuteRuns = completeReadyExecuteNodes(root, refreshedProject.active_runs);
    }
  }
  if (args.verify) {
    const refreshedProject = readJson(projectPath);
    verifiedRuns = verifyReadyRuns(root, refreshedProject.active_runs, projectRoot(args));
  }
  if (args.review) {
    const refreshedProject = readJson(projectPath);
    reviewedRuns = reviewReadyRuns(root, refreshedProject.active_runs);
  }
  if (args.integrate) {
    const refreshedProject = readJson(projectPath);
    integratedRuns = integrateReadyRuns(root, refreshedProject.active_runs);
  }
  if (args.learn) {
    const refreshedProject = readJson(projectPath);
    learnedRuns = learnReadyRuns(root, refreshedProject.active_runs);
  }
  if (args["apply-learning"]) {
    approveLearningForRuns(root, learnedRuns);
  }
  if (args["learning-worker"] || args["apply-learning"]) {
    learningJobs = processLearningJobs(root, {
      limit: Math.max(1, Number(args["learning-limit"] || 3))
    });
  }
  const event = appendEvent(root, "project.tick", "apex-v2", {
    promoted: promoted.map((node) => node.id),
    created_runs: createdRuns.map((run) => run.run_id),
    advanced_runs: advancedRuns,
    dispatched_workers: dispatchedWorkers,
    retried_workers: retriedWorkers,
    fallback_workers: fallbackWorkers,
    worker_runs: workerRuns,
    agent_runs: agentRuns,
    collected_results: collectedResults,
    completed_execute_runs: completedExecuteRuns,
    verified_runs: verifiedRuns,
    reviewed_runs: reviewedRuns,
    integrated_runs: integratedRuns,
    learned_runs: learnedRuns,
    learning_jobs: learningJobs,
    agent_scheduler: agentScheduler,
    adapter_smoke_refresh: adapterSmokeRefresh
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({
    promoted,
    created_runs: createdRuns,
    advanced_runs: advancedRuns,
    dispatched_workers: dispatchedWorkers,
    retried_workers: retriedWorkers,
    fallback_workers: fallbackWorkers,
    worker_runs: workerRuns,
    agent_runs: agentRuns,
    collected_results: collectedResults,
    completed_execute_runs: completedExecuteRuns,
    verified_runs: verifiedRuns,
    reviewed_runs: reviewedRuns,
    integrated_runs: integratedRuns,
    learned_runs: learnedRuns,
    learning_jobs: learningJobs,
    agent_scheduler: agentScheduler,
    adapter_smoke_refresh: adapterSmokeRefresh,
    remaining_ready: readJson(roadmapPath).nodes.filter((node) => node.status === "ready").length,
    active_runs: readJson(projectPath).active_runs
  }, null, 2));
}
function auditProject(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const timestamp = now();
  const objective = String(args.objective || "\u628A Apex Forge V2 \u5B9E\u73B0\u4E3A\u9879\u76EE\u7EA7\u534A\u81EA\u52A8\u5316\u4EA7\u7814\u5DE5\u5382\uFF1A\u6301\u7EED\u63A5\u6536\u9700\u6C42\u3001\u591A\u7EBF\u5E76\u884C\u7814\u53D1\u3001\u81EA\u52A8\u6D4B\u8BD5\u3001\u6700\u9AD8\u8BC1\u636E\u3001\u81EA\u52A8\u5408\u5E76\u4E0E\u51B2\u7A81\u5904\u7406\u3002");
  const testExecution = runProjectAuditTests(projectDir, {
    command: "npm test",
    skip: Boolean(args["skip-tests"])
  });
  const summary = buildAuditSummary(root, projectDir, testExecution, {
    evaluateAdapterCapabilityDrift,
    findFilesByName,
    findRunFiles,
    getWorkers,
    listRunStates,
    workerSuccessfullyCompleted
  });
  const checks = buildAuditChecks(summary);
  const status2 = checks.every((check2) => check2.status === "PASS") ? "PASS" : checks.some((check2) => check2.status === "FAIL") ? "FAIL" : "PARTIAL";
  const report = {
    schema_version: SCHEMA_VERSION,
    audit_id: shortId("audit"),
    created_at: timestamp,
    objective,
    status: status2,
    checks,
    summary
  };
  const auditDir = join47(root, "audits");
  ensureDir(auditDir);
  writeJson(join47(auditDir, `${report.audit_id}.json`), report);
  writeFileSync16(join47(auditDir, `${report.audit_id}.md`), renderAuditMarkdown(report));
  const event = appendEvent(root, "project.audit", "apex-v2", {
    audit_id: report.audit_id,
    status: report.status
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  if (args["create-intake"]) {
    const createdIntake = createIntakeFromAuditGaps(root, report);
    console.log(JSON.stringify({ report, created_intake: createdIntake }, null, 2));
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}
function createIntakeFromAuditGaps(root, report) {
  const path = join47(root, "intake", "items.json");
  const items = readJson(path, []);
  const created = [];
  for (const check2 of report.checks.filter((item) => item.status !== "PASS")) {
    const dedupe = `audit-gap:${check2.id}`;
    const existing = items.find((item) => item.evidence_refs?.includes(dedupe) && item.triage.status !== "rejected");
    if (existing) continue;
    const timestamp = now();
    const intake = {
      schema_version: SCHEMA_VERSION,
      id: shortId("intake"),
      source: "project-audit",
      type: "tech_debt",
      title: `Audit gap\uFF1A${check2.claim}`,
      description: `${check2.gap}

Evidence:
${check2.evidence.join("\n")}`,
      priority: check2.status === "FAIL" ? "P1" : "P2",
      risk: check2.status === "FAIL" ? "high" : "medium",
      affected_area: `audit/${check2.id}`,
      evidence_refs: [
        dedupe,
        `.apex-v2/audits/${report.audit_id}.json`,
        `.apex-v2/audits/${report.audit_id}.md`
      ],
      triage: {
        status: "new",
        decision: null,
        target_milestone: null,
        reason: null
      },
      created_at: timestamp,
      updated_at: timestamp
    };
    items.push(intake);
    created.push(intake);
  }
  writeJson(path, items);
  if (created.length > 0) {
    const event = appendEvent(root, "audit.intake.created", "apex-v2", {
      audit_id: report.audit_id,
      intake_ids: created.map((item) => item.id)
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  return created;
}
function verifyReadyRuns(root, runIds, projectDir) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "execute").status !== "passed") continue;
    if (getRunNode(run, "verify").status !== "pending") continue;
    const result = runVerificationInternal(root, run, projectDir);
    if (result.report.status === "PASS") {
      passNode(root, run.run_id, "verify", result.artifact_id, "project tick \u81EA\u52A8\u5B8C\u6210 verification report\u3002");
    }
    out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
  }
  return out;
}
function reviewReadyRuns(root, runIds) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "verify").status !== "passed") continue;
    if (getRunNode(run, "review").status !== "pending") continue;
    const result = generateReviewInternal(root, run);
    if (result.report.status === "PASS") {
      passNode(root, run.run_id, "review", result.artifact_id, "project tick \u81EA\u52A8\u5B8C\u6210 review report\u3002");
    }
    out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
  }
  return out;
}
function integrateReadyRuns(root, runIds) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "review").status !== "passed") continue;
    if (getRunNode(run, "integrate").status !== "pending") continue;
    try {
      const result = applyMergeInternal(root, run);
      passNode(root, run.run_id, "integrate", result.artifact_id, `project tick \u81EA\u52A8\u5B8C\u6210 integration\uFF1A${result.report.status}`);
      out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
    } catch (error) {
      out.push({ run_id: run.run_id, status: "BLOCKED", error: error.message });
    }
  }
  return out;
}
function learnReadyRuns(root, runIds) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "integrate").status !== "passed") continue;
    if (getRunNode(run, "learn").status !== "pending") continue;
    const transition = withProjectTransaction(resolve27(root, ".."), {
      kind: "learning-governance",
      idempotencyKey: `learning-governance-v2:${run.run_id}:proposal-queued`
    }, () => learnReadyRunTransaction(root, run)).result;
    out.push(transition);
  }
  return out;
}
function learnReadyRunTransaction(root, run) {
  const result = proposeLearningInternal(root, run);
  const proposalIds = result.proposals.map((proposal) => proposal.id);
  const jobIds = result.jobs.map((job) => job.job_id);
  const current = loadRun(root, run.run_id);
  current.learning_proposal_ids = proposalIds;
  current.learning_apply_job_ids = jobIds;
  writeRun(root, current);
  passNode(
    root,
    run.run_id,
    "learn",
    result.artifact_id,
    "learning proposal \u5DF2\u8FDB\u5165 durable queue\uFF1Bapply \u5728\u4EA4\u4ED8\u5173\u95ED\u540E\u5F02\u6B65\u6267\u884C\u3002"
  );
  return {
    run_id: run.run_id,
    proposal_ids: proposalIds,
    queue_job_ids: jobIds,
    applied: [],
    artifact_id: result.artifact_id
  };
}
async function runProjectAgentScheduler(root, limit, args) {
  const policy = readJson(join47(root, "policies", "execution.json"));
  const configuredCycles = Number(
    args["agent-cycles"] || policy.budgets?.max_agent_cycles_per_tick || 12
  );
  if (!Number.isInteger(configuredCycles) || configuredCycles <= 0) {
    throw new Error("--agent-cycles \u5FC5\u987B\u662F\u6B63\u6574\u6570");
  }
  const aggregate = {
    max_cycles: configuredCycles,
    max_agent_runs: Number(policy.budgets?.max_agent_runs_per_tick || limit),
    cycles: [],
    stop_reason: "max-cycles",
    dispatched_workers: [],
    retried_workers: [],
    fallback_workers: [],
    worker_runs: [],
    agent_runs: [],
    collected_results: [],
    completed_execute_runs: [],
    recovered_workers: []
  };
  let remainingAgentRuns = aggregate.max_agent_runs;
  for (let cycle = 1; cycle <= configuredCycles; cycle += 1) {
    const runIds = readJson(join47(root, "project.json")).active_runs;
    if (runIds.length === 0) {
      aggregate.stop_reason = "no-active-runs";
      break;
    }
    const recovered = recoverExpiredWorkerExecutions(root, runIds);
    const fallback = fallbackBlockedAgents(root, runIds, limit);
    const retry = retryBlockedWorkers(root, runIds, limit);
    const dispatched = dispatchReadyWorkers(root, runIds, {
      mode: args["execution-mode"] ? String(args["execution-mode"]) : null,
      limit
    });
    const deterministic = runReadyWorkerAdapters(root, runIds, limit);
    const batchLimit = Math.min(limit, remainingAgentRuns);
    const agents = batchLimit > 0 ? await runReadyCodingAgents(root, runIds, batchLimit, args) : [];
    remainingAgentRuns -= agents.filter((item) => item.status !== "STALE").length;
    const collected = collectWorkerResults(root, runIds);
    const completed = completeReadyExecuteNodes(root, runIds);
    const progressCount = [
      ...fallback.filter((item) => item.status === "FALLBACK_READY"),
      ...recovered,
      ...retry.filter((item) => item.status === "RETRY_READY"),
      ...dispatched,
      ...deterministic,
      ...agents.filter((item) => item.status !== "STALE"),
      ...collected,
      ...completed
    ].length;
    aggregate.fallback_workers.push(...fallback);
    aggregate.recovered_workers.push(...recovered);
    aggregate.retried_workers.push(...retry);
    aggregate.dispatched_workers.push(...dispatched);
    aggregate.worker_runs.push(...deterministic);
    aggregate.agent_runs.push(...agents);
    aggregate.collected_results.push(...collected);
    aggregate.completed_execute_runs.push(...completed);
    aggregate.cycles.push({
      cycle,
      progress_count: progressCount,
      recovered_workers: recovered.map((item) => item.worker_id),
      dispatched_workers: dispatched.map((item) => item.worker_id),
      fallback_workers: fallback.filter((item) => item.status === "FALLBACK_READY").map((item) => item.worker_id),
      retried_workers: retry.filter((item) => item.status === "RETRY_READY").map((item) => item.worker_id),
      deterministic_workers: deterministic.map((item) => item.worker_id),
      agent_workers: agents.map((item) => item.worker_id),
      collected_workers: collected.map((item) => item.worker_id),
      completed_runs: completed.map((item) => item.run_id)
    });
    if (remainingAgentRuns <= 0) {
      aggregate.stop_reason = "agent-run-budget";
      break;
    }
    if (progressCount === 0) {
      aggregate.stop_reason = schedulerStopReason(root, runIds);
      break;
    }
    if (cycle === configuredCycles) {
      aggregate.stop_reason = "max-cycles";
    }
  }
  return aggregate;
}
function schedulerStopReason(root, runIds) {
  const workers = runIds.flatMap((runId) => getWorkers(root, runId));
  if (workers.some(
    (worker) => worker.adapter === "host" && ["active", "claimed"].includes(worker.status)
  )) {
    return "waiting-for-coordinator";
  }
  if (workers.some((worker) => worker.status === "blocked")) {
    return "blocked";
  }
  if (workers.some((worker) => worker.status === "running")) {
    return "worker-running";
  }
  return "drained";
}
function runReadyWorkerAdapters(root, runIds, limit) {
  const out = [];
  for (const runId of runIds) {
    if (out.length >= limit) break;
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      if (worker.status !== "active") continue;
      if ((worker.adapter || "shell") !== "shell") continue;
      const command = chooseWorkerCommand(worker);
      if (!command) continue;
      const result = executeWorkerShell(root, worker, command, "project.tick");
      out.push({
        run_id: worker.run_id,
        worker_id: worker.worker_id,
        plan_node_id: worker.plan_node_id,
        status: result.adapterResult.status,
        artifact_id: result.artifact.artifact_id,
        command
      });
    }
  }
  return out;
}
function retryBlockedWorkers(root, runIds, limit) {
  const out = [];
  const policy = readJson(join47(root, "policies", "retry.json"));
  if (!policy.auto_retry.enabled) return out;
  for (const runId of runIds) {
    if (out.length >= limit) break;
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      if (worker.status !== "blocked") continue;
      try {
        const result = retryWorkerInternal(root, worker, "project.tick");
        out.push({
          run_id: runId,
          worker_id: worker.worker_id,
          status: "RETRY_READY",
          ...result.policy
        });
      } catch (error) {
        out.push({
          run_id: runId,
          worker_id: worker.worker_id,
          status: "NOT_RETRYABLE",
          reason: error.message
        });
      }
    }
  }
  return out;
}
function fallbackBlockedAgents(root, runIds, limit) {
  const out = [];
  const executorIds = new Set(inspectWorkerExecutors().map((item) => item.executor_id));
  for (const runId of runIds) {
    if (out.length >= limit) break;
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      if (worker.status !== "blocked" || !executorIds.has(worker.last_adapter || worker.executor_id || worker.adapter)) continue;
      try {
        const result = fallbackWorkerInternal(root, worker, "project.tick");
        out.push({ run_id: runId, worker_id: worker.worker_id, status: "FALLBACK_READY", from: result.from, to: result.to, failure_kind: result.failure_kind });
      } catch (error) {
        out.push({ run_id: runId, worker_id: worker.worker_id, status: "NO_FALLBACK", reason: error.message });
      }
    }
  }
  return out;
}
async function runReadyCodingAgents(root, runIds, limit, args) {
  const out = [];
  const executorIds = new Set(inspectWorkerExecutors().map((item) => item.executor_id));
  const requestedSandbox = normalizeEnum(args["agent-sandbox"] || "worktree", ["scratch", "worktree"], "agent-sandbox");
  const timeoutMs = effectiveAgentTimeout(root, Number(args["agent-timeout-ms"] || 30 * 60 * 1e3));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--agent-timeout-ms \u5FC5\u987B\u662F\u6B63\u6574\u6570");
  }
  const selected = [];
  for (const runId of runIds) {
    if (selected.length >= limit) break;
    const run = loadRun(root, runId);
    const plan = loadPlanGraph3(root, runId);
    for (const worker of getWorkers(root, runId)) {
      if (selected.length >= limit) break;
      const executorId = worker.executor_id || worker.adapter;
      if (worker.status !== "active" || !executorIds.has(executorId)) continue;
      let selection = {
        run,
        worker,
        planNode: null,
        executorId,
        claimToken: null,
        job: null
      };
      try {
        assertAdapterAllowed(root, executorId);
        const planNode2 = getPlanNode2(plan, worker.plan_node_id);
        const claim = claimWorkerExecution(
          root,
          worker.worker_id,
          timeoutMs + 3e4,
          "project.tick"
        );
        if (!claim.claimed) continue;
        selection = {
          ...selection,
          worker: claim.worker,
          planNode: planNode2,
          claimToken: claim.claim_token
        };
        const initialized = initializeWorkerSandbox(
          root,
          claim.worker,
          requestedSandbox
        ).worker;
        selection = {
          ...selection,
          worker: initialized,
          planNode: planNode2,
          executorId,
          claimToken: claim.claim_token,
          job: {
            id: initialized.worker_id,
            command: process.execPath,
            args: workerAgentChildArgs({
              projectDir: resolve27(root, ".."),
              worker: initialized,
              executorId,
              timeoutMs,
              executionClaimToken: claim.claim_token,
              agentCommand: args["agent-command"],
              agentModel: args["agent-model"],
              agentProfile: args["agent-profile"]
            }),
            cwd: resolve27(root, ".."),
            timeoutMs: timeoutMs + 15e3,
            maxOutputBytes: 16 * 1024 * 1024
          }
        };
        selected.push(selection);
      } catch (error) {
        out.push(recordSupervisorFailure(root, selection, {
          status: "failed",
          command: process.execPath,
          args: [],
          stderr: error.message,
          stdout: "",
          exit_code: 1,
          duration_ms: 0,
          timed_out: false
        }));
      }
    }
  }
  const supervisorResults = await runWorkerJobs(
    selected.map((item) => item.job),
    {
      maxConcurrency: Math.max(1, Math.min(limit, selected.length || 1)),
      defaultTimeoutMs: timeoutMs + 15e3
    }
  );
  for (const [index, supervised] of supervisorResults.entries()) {
    const selection = selected[index];
    if (supervised.status !== "succeeded") {
      out.push(recordSupervisorFailure(root, selection, supervised));
      continue;
    }
    let result;
    try {
      result = JSON.parse(supervised.stdout);
    } catch {
      out.push(recordSupervisorFailure(root, selection, {
        ...supervised,
        status: "failed",
        stderr: [
          supervised.stderr,
          "worker child returned invalid JSON"
        ].filter(Boolean).join("\n")
      }));
      continue;
    }
    let queueStatus = null;
    let queueError = null;
    if (result.patch) {
      try {
        const currentRun = loadRun(root, selection.run.run_id);
        const queue = enqueuePatchInternal(root, currentRun, result.patch);
        queueStatus = queue.conflicts.length > 0 ? "blocked_conflict" : "queued";
      } catch (error) {
        queueStatus = "enqueue_failed";
        queueError = error.message;
        const event = appendEvent(root, "worker.patch.enqueue.failed", "apex-v2", {
          run_id: selection.run.run_id,
          worker_id: selection.worker.worker_id,
          patch_id: result.patch.patch_id,
          error: error.message
        });
        updateProject(root, {
          last_event_id: event.event_id,
          updated_at: event.timestamp
        });
      }
    }
    out.push({
      run_id: selection.run.run_id,
      worker_id: selection.worker.worker_id,
      plan_node_id: selection.worker.plan_node_id,
      status: result.result?.status || "FAIL",
      patch_id: result.patch?.patch_id || null,
      queue_status: queueStatus,
      queue_error: queueError,
      artifact_id: result.artifact_id || null,
      supervisor_status: supervised.status,
      duration_ms: supervised.duration_ms
    });
  }
  return out;
}
function workerAgentChildArgs({
  projectDir,
  worker,
  executorId,
  timeoutMs,
  executionClaimToken,
  agentCommand,
  agentModel,
  agentProfile
}) {
  const values = [
    fileURLToPath(import.meta.url),
    "worker",
    "exec-agent",
    "--project",
    projectDir,
    "--worker-id",
    worker.worker_id,
    "--adapter",
    executorId,
    "--timeout-ms",
    String(timeoutMs),
    "--execution-claim-token",
    executionClaimToken
  ];
  if (agentCommand) values.push("--command", String(agentCommand));
  if (agentModel) values.push("--model", String(agentModel));
  if (agentProfile) values.push("--profile", String(agentProfile));
  return values;
}
function recordSupervisorFailure(root, selection, supervised) {
  return withProjectTransaction(resolve27(root, ".."), {
    kind: "worker-supervisor-failure",
    idempotencyKey: [
      "worker-supervisor-failure",
      selection.worker.worker_id,
      selection.claimToken || "unclaimed",
      shortId("failure")
    ].join(":")
  }, () => recordSupervisorFailureTransaction(
    root,
    selection,
    supervised
  )).result;
}
function recordSupervisorFailureTransaction(root, selection, supervised) {
  const worker = findWorker(root, selection.worker.worker_id);
  if (selection.claimToken && (worker.status !== "running" || worker.execution_claim_token !== selection.claimToken) || !selection.claimToken && (worker.status !== "active" || worker.updated_at !== selection.worker.updated_at)) {
    const event2 = appendEvent(root, "worker.supervisor.stale", "apex-v2", {
      run_id: worker.run_id,
      worker_id: worker.worker_id,
      expected_claim_token: selection.claimToken,
      current_status: worker.status,
      supervisor_status: supervised.status
    });
    updateProject(root, {
      last_event_id: event2.event_id,
      updated_at: event2.timestamp
    });
    return {
      run_id: worker.run_id,
      worker_id: worker.worker_id,
      plan_node_id: worker.plan_node_id,
      status: "STALE",
      error: supervised.stderr || supervised.status,
      supervisor_status: supervised.status
    };
  }
  const failureKind = supervised.timed_out ? "timeout" : "execution_error";
  const timestamp = now();
  const result = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: selection.executorId,
    executor_id: selection.executorId,
    model_tier: worker.model_tier || "standard",
    requested_model: worker.model_id || null,
    reported_model: null,
    status: "FAIL",
    failure_kind: failureKind,
    command: [supervised.command, ...supervised.args || []].join(" "),
    summary: supervised.stderr || `worker supervisor ${supervised.status}`,
    adapter_version: "",
    session_id: null,
    executable: supervised.command,
    exit_code: supervised.exit_code ?? 1,
    duration_ms: supervised.duration_ms || 0,
    stdout_tail: tail(supervised.stdout),
    stderr_tail: tail(supervised.stderr),
    changed_files: [],
    out_of_scope_files: [],
    unsupported_files: [],
    usage: {
      input_tokens: null,
      output_tokens: null,
      tool_calls: null,
      agent_turns: null
    },
    cost_evaluation: {
      status: "NOT_CONFIGURED",
      exceeded: [],
      unknown: []
    },
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: [],
      missing: (worker.capability_bindings || []).filter((binding) => binding.required).map((binding) => binding.capability_id),
      error: supervised.stderr || supervised.status
    },
    semantic_evidence_status: {
      required: worker.execution_class === "cognitive",
      valid: false,
      error: supervised.stderr || supervised.status
    },
    refs: [],
    created_at: timestamp
  };
  writeJson(
    join47(
      workerDir(root, worker.run_id, worker.worker_id),
      `adapter-result-${result.result_id}.json`
    ),
    result
  );
  worker.status = "blocked";
  worker.last_adapter = selection.executorId;
  worker.attempt = Number(worker.attempt || 0) + 1;
  worker.execution_claim_token = null;
  worker.execution_claimed_at = null;
  worker.execution_claim_expires_at = null;
  worker.updated_at = timestamp;
  writeJson(join47(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.supervisor.failed", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: result.result_id,
    failure_kind: failureKind,
    supervisor_status: supervised.status
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    plan_node_id: worker.plan_node_id,
    status: "FAIL",
    error: result.summary,
    supervisor_status: supervised.status
  };
}
function chooseWorkerCommand(worker) {
  const candidates = worker.verification || [];
  return candidates.find((command) => command.includes("node --check")) || candidates.find((command) => command.includes("validate --project")) || candidates[0] || null;
}
function collectWorkerResults(root, runIds) {
  const collected = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "execute").status !== "pending") continue;
    const queue = readDecisionQueue2(root, runId);
    for (const worker of getWorkers(root, runId)) {
      if (!["evidence_submitted", "decision_submitted"].includes(worker.status)) continue;
      if (queue.items.some((item2) => item2.worker_id === worker.worker_id)) continue;
      const artifacts = findArtifactsForWorker(root, runId, worker);
      const results = findAdapterResultsForWorker(root, worker);
      if (artifacts.length === 0 || results.length === 0) continue;
      const item = {
        worker_id: worker.worker_id,
        plan_node_id: worker.plan_node_id,
        kind: worker.status === "decision_submitted" ? "decision" : "evidence",
        status: "collected",
        artifact_ids: artifacts.map((artifact) => artifact.artifact_id),
        result_ids: results.map((result) => result.result_id)
      };
      queue.items.push(item);
      collected.push({ run_id: runId, ...item });
    }
    writeDecisionQueue(root, queue);
  }
  return collected;
}
function completeReadyExecuteNodes(root, runIds) {
  const completed = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    const executeNode = getRunNode(run, "execute");
    if (executeNode.status !== "pending") continue;
    const plan = loadPlanGraph3(root, runId);
    const workers = getWorkers(root, runId);
    if (workers.length === 0) continue;
    const workersByPlanNode = new Map(workers.map((worker) => [worker.plan_node_id, worker]));
    if (plan.nodes.some((node) => !workersByPlanNode.has(node.id))) continue;
    if (workers.some((worker) => !workerSuccessfullyCompleted(worker))) continue;
    const evidenceRefs = [];
    let ready = true;
    const decisionQueue = readDecisionQueue2(root, runId);
    for (const worker of workers) {
      if (["evidence_submitted", "decision_submitted"].includes(worker.status)) {
        const item = decisionQueue.items.find((entry) => entry.worker_id === worker.worker_id);
        if (!item) {
          ready = false;
          break;
        }
        evidenceRefs.push(...item.artifact_ids);
      } else if (["queued", "merged"].includes(worker.status)) {
        const artifacts = findArtifactsForWorker(root, runId, worker);
        if (artifacts.length === 0) {
          ready = false;
          break;
        }
        evidenceRefs.push(...artifacts.map((artifact) => artifact.artifact_id));
      } else {
        ready = false;
        break;
      }
    }
    const uniqueEvidenceRefs = Array.from(new Set(evidenceRefs));
    if (!ready || uniqueEvidenceRefs.length === 0) continue;
    passNode(root, runId, "execute", uniqueEvidenceRefs.join(","), "project tick \u81EA\u52A8\u6536\u96C6 worker result \u5E76\u901A\u8FC7 execute\u3002");
    completed.push({ run_id: runId, evidence_refs: uniqueEvidenceRefs });
  }
  return completed;
}
function readDecisionQueue2(root, runId) {
  return readJson(join47(root, "runs", runId, "decision-queue.json"), {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    updated_at: now(),
    items: []
  });
}
function writeDecisionQueue(root, queue) {
  queue.updated_at = now();
  writeJson(join47(root, "runs", queue.run_id, "decision-queue.json"), queue);
}
function findArtifactsForWorker(root, runId, worker) {
  const artifactDir = join47(root, "artifacts", runId);
  if (!existsSync31(artifactDir)) return [];
  return readDirectoryJsonFiles(artifactDir).map((file) => readJson(join47(artifactDir, file))).filter((artifact) => artifact.refs.some((ref) => ref.startsWith(`${worker.namespace}/`)));
}
function findAdapterResultsForWorker(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (!existsSync31(dir)) return [];
  const results = readdirSync19(dir).filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json")).map((file) => readJson(join47(dir, file)));
  const hostResult = readJson(join47(dir, "host-result.json"), null);
  if (hostResult) {
    results.push({
      result_id: hostResult.action_id,
      adapter: hostResult.host_id,
      status: hostResult.status === "completed" ? "PASS" : "FAIL",
      summary: hostResult.summary,
      created_at: hostResult.created_at
    });
  }
  return results;
}
function dispatchReadyWorkers(root, runIds, options = {}) {
  const project = readJson(join47(root, "project.json"));
  const dispatched = [];
  const requestedLimit = Number.isInteger(Number(options.limit)) ? Math.max(0, Number(options.limit)) : Number.POSITIVE_INFINITY;
  let available = Math.min(
    requestedLimit,
    Math.max(0, project.wip_limits.parallel_workers - countOpenWorkers(root))
  );
  if (available <= 0) return dispatched;
  for (const runId of runIds) {
    if (available <= 0) break;
    const run = loadRun(root, runId);
    if (getRunNode(run, "plan_graph").status !== "passed") continue;
    if (getRunNode(run, "execute").status !== "pending") continue;
    const plan = loadPlanGraph3(root, runId);
    const workers = getWorkers(root, runId);
    const existingPlanNodeIds = new Set(workers.map((worker) => worker.plan_node_id));
    const completedPlanNodeIds = new Set(
      workers.filter(workerSuccessfullyCompleted).map((worker) => worker.plan_node_id)
    );
    const readyNodes = plan.nodes.filter(
      (node) => !existingPlanNodeIds.has(node.id) && node.dependencies.every((dependency) => completedPlanNodeIds.has(dependency))
    );
    for (const planNode2 of readyNodes) {
      if (available <= 0) break;
      const worker = createWorkerForPlanNode(root, run, planNode2, options);
      dispatched.push({
        run_id: run.run_id,
        worker_id: worker.worker_id,
        plan_node_id: worker.plan_node_id
      });
      available -= 1;
    }
  }
  return dispatched;
}
function countOpenWorkers(root) {
  const runsDir = join47(root, "runs");
  if (!existsSync31(runsDir)) return 0;
  let count = 0;
  for (const runEntry of readdirSync19(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    for (const worker of getWorkers(root, runEntry.name)) {
      if (["active", "running", "claimed"].includes(worker.status)) count += 1;
    }
  }
  return count;
}
function workerSuccessfullyCompleted(worker) {
  return ["evidence_submitted", "decision_submitted", "queued", "merged"].includes(worker.status);
}
function advanceRunPlanning(root, runId) {
  const actions = [];
  let run = loadRun(root, runId);
  if (getRunNode(run, "mandate").status === "pending") {
    const artifact = createArtifact(root, run, "mandate", {
      type: "evidence",
      title: "Auto Mandate\uFF1A\u7531 accepted intake \u548C roadmap node \u751F\u6210",
      body: renderAutoMandate(root, run),
      refs: [".apex-v2/intake/items.json", ".apex-v2/roadmap/graph.json"],
      timestamp: now()
    });
    passNode(root, run.run_id, "mandate", artifact.artifact_id, "project tick \u81EA\u52A8\u751F\u6210 mandate evidence\u3002");
    actions.push({ node_id: "mandate", artifact_id: artifact.artifact_id });
    run = loadRun(root, runId);
  }
  if (getRunNode(run, "context").status === "pending") {
    const artifact = createArtifact(root, run, "context", {
      type: "evidence",
      title: `Auto Context\uFF1Aknowledge_version ${run.context_snapshot.knowledge_version}`,
      body: `\u5F53\u524D run \u4F7F\u7528 ProjectKnowledgeBase snapshot ${run.context_snapshot.knowledge_version}\uFF0C\u5305\u542B ${run.context_snapshot.files.length} \u4E2A\u77E5\u8BC6\u6587\u4EF6\u3002`,
      refs: [".apex-v2/knowledge/manifest.json", ...run.context_snapshot.files.map((file) => `.apex-v2/${file}`)],
      timestamp: now()
    });
    passNode(root, run.run_id, "context", artifact.artifact_id, "project tick \u81EA\u52A8\u786E\u8BA4 context snapshot\u3002");
    actions.push({ node_id: "context", artifact_id: artifact.artifact_id });
    run = loadRun(root, runId);
  }
  if (getRunNode(run, "plan_graph").status === "pending") {
    const generated = generateRunPlanInternal(root, run);
    passNode(root, run.run_id, "plan_graph", generated.artifact_id, "project tick \u81EA\u52A8\u751F\u6210\u5E76\u6821\u9A8C plan graph\u3002");
    actions.push({ node_id: "plan_graph", artifact_id: generated.artifact_id, plan_id: generated.plan.plan_id });
  }
  return { run_id: runId, actions };
}
function passNode(root, runId, nodeId, artifactIds, reason) {
  const run = loadRun(root, runId);
  const node = getRunNode(run, nodeId);
  const evidenceRefs = splitList(artifactIds);
  for (const artifactId of evidenceRefs) {
    assertArtifact(root, run.run_id, artifactId, nodeId);
  }
  const timestamp = now();
  node.status = "passed";
  node.started_at = node.started_at || timestamp;
  node.completed_at = timestamp;
  node.evidence_refs = evidenceRefs;
  node.gate = { status: "PASS", reason, blocking: [] };
  run.status = "active";
  run.updated_at = timestamp;
  run.gate = node.gate;
  closeRunIfComplete(root, run);
  writeRun(root, run);
  const event = appendEvent(root, "run.node.completed", "apex-v2", {
    run_id: run.run_id,
    node_id: node.id,
    gate: "PASS",
    evidence_refs: evidenceRefs,
    via: "project.tick"
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  recordRunClosure(root, run, "project.tick");
}
function renderAutoMandate(root, run) {
  const roadmap = readJson(join47(root, "roadmap", "graph.json"));
  const intake = readJson(join47(root, "intake", "items.json"), []);
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  const intakeItem = intake.find((item) => item.id === roadmapNode?.source_intake_id);
  return `\u76EE\u6807\uFF1A${roadmapNode?.title || run.roadmap_node_id}

\u6765\u6E90 intake\uFF1A${intakeItem?.id || "unknown"}

\u63CF\u8FF0\uFF1A${intakeItem?.description || ""}

\u4F18\u5148\u7EA7\uFF1A${roadmapNode?.priority || "unknown"}
\u98CE\u9669\uFF1A${roadmapNode?.risk || "unknown"}

\u6210\u529F\u6807\u51C6\uFF1A\u8FDB\u5165 plan_graph \u524D\uFF0C\u5FC5\u987B\u62E5\u6709 context snapshot \u548C\u53EF\u9A8C\u8BC1 PlanGraph\u3002`;
}
function updateLearningProposal(root, id, updater) {
  const path = join47(root, "learning", "proposals.json");
  const proposals = readJson(path, []);
  const proposal = proposals.find((item) => item.id === id);
  if (!proposal) throw new Error(`\u627E\u4E0D\u5230 learning proposal\uFF1A${id}`);
  updater(proposal);
  writeJson(path, proposals);
  return proposal;
}
function getLearningProposal(root, id) {
  const proposals = readJson(join47(root, "learning", "proposals.json"), []);
  const proposal = proposals.find((item) => item.id === id);
  if (!proposal) throw new Error(`\u627E\u4E0D\u5230 learning proposal\uFF1A${id}`);
  return proposal;
}
function approveLearningForRuns(root, transitions) {
  for (const proposalId of transitions.flatMap((item) => item.proposal_ids || [])) {
    const proposal = getLearningProposal(root, proposalId);
    if (proposal.status !== "proposed") continue;
    withProjectTransaction(resolve27(root, ".."), {
      kind: "learning-auto-approve",
      idempotencyKey: `learning-auto-approve:${proposalId}`
    }, () => {
      const approved = updateLearningProposal(root, proposalId, (item) => {
        item.status = "approved";
        item.updated_at = now();
      });
      queueApprovedLearningJob(root, approved);
      const event = appendEvent(root, "learning.approved", "apex-v2", {
        proposal_id: proposalId,
        via: "project.tick"
      });
      updateProject(root, {
        last_event_id: event.event_id,
        updated_at: event.timestamp
      });
      return approved;
    });
  }
}
function queueApprovedLearningJob(root, proposal) {
  const path = join47(root, "learning", "jobs.json");
  const jobs = readJson(path, []);
  let job = jobs.find(
    (item) => item.job_id === proposal.apply_job_id || item.proposal_id === proposal.id
  );
  const timestamp = now();
  if (!job) {
    job = {
      schema_version: SCHEMA_VERSION,
      job_id: shortId("learning-job"),
      run_id: proposal.source_run_id,
      proposal_id: proposal.id,
      status: "queued",
      attempt: 0,
      idempotency_key: `learning-apply-job-v1:${proposal.id}`,
      requested_at: timestamp,
      started_at: null,
      completed_at: null,
      receipt_id: proposal.apply_receipt_id || null,
      error: null,
      updated_at: timestamp
    };
    jobs.push(job);
  } else if (job.status !== "applied") {
    job.status = "queued";
    job.error = null;
    job.updated_at = timestamp;
  }
  writeJson(path, jobs);
  if (proposal.apply_job_id !== job.job_id) {
    updateLearningProposal(root, proposal.id, (item) => {
      item.apply_job_id = job.job_id;
      item.updated_at = timestamp;
    });
  }
  return job;
}
function processLearningJobs(root, options = {}) {
  const limit = Math.max(1, Number(options.limit || 1));
  const snapshot = readJson(join47(root, "learning", "jobs.json"), []);
  const selected = snapshot.filter(
    (job) => (!options.jobId || job.job_id === options.jobId) && (job.status === "queued" || job.status === "failed" && Number(job.attempt || 0) < 3)
  ).slice(0, limit);
  const results = [];
  for (const selectedJob of selected) {
    try {
      const result = withProjectTransaction(resolve27(root, ".."), {
        kind: "learning-apply-job",
        idempotencyKey: selectedJob.idempotency_key
      }, () => applyLearningJobTransaction(root, selectedJob.job_id)).result;
      results.push(result);
    } catch (error) {
      const failed = withProjectTransaction(resolve27(root, ".."), {
        kind: "learning-apply-job-failed",
        idempotencyKey: `learning-apply-job-failed:${selectedJob.job_id}:${shortId("attempt")}`
      }, () => {
        const path = join47(root, "learning", "jobs.json");
        const jobs = readJson(path, []);
        const job = jobs.find((item) => item.job_id === selectedJob.job_id);
        if (!job || job.status === "applied") return job;
        job.status = "failed";
        job.attempt = Number(job.attempt || 0) + 1;
        job.error = error.message;
        job.completed_at = now();
        job.updated_at = job.completed_at;
        writeJson(path, jobs);
        const event = appendEvent(root, "learning.apply.failed", "apex-v2", {
          run_id: job.run_id,
          job_id: job.job_id,
          proposal_id: job.proposal_id,
          attempt: job.attempt,
          error: error.message
        });
        updateProject(root, {
          last_event_id: event.event_id,
          updated_at: event.timestamp
        });
        return job;
      }).result;
      results.push({
        job_id: selectedJob.job_id,
        proposal_id: selectedJob.proposal_id,
        status: "FAILED",
        attempt: failed?.attempt || selectedJob.attempt,
        error: error.message
      });
    }
  }
  return results;
}
function applyLearningJobTransaction(root, jobId) {
  const jobsPath = join47(root, "learning", "jobs.json");
  const jobs = readJson(jobsPath, []);
  const job = jobs.find((item) => item.job_id === jobId);
  if (!job) throw new Error(`\u627E\u4E0D\u5230 learning apply job\uFF1A${jobId}`);
  if (job.status === "applied" && job.receipt_id) {
    return {
      job_id: job.job_id,
      proposal_id: job.proposal_id,
      receipt_id: job.receipt_id,
      status: "APPLIED",
      replayed: true
    };
  }
  const proposal = getLearningProposal(root, job.proposal_id);
  if (proposal.status !== "approved") {
    throw new Error(
      `learning apply job \u7B49\u5F85 approval\uFF1A${proposal.id}=${proposal.status}`
    );
  }
  const timestamp = now();
  job.status = "running";
  job.started_at = timestamp;
  job.completed_at = null;
  job.error = null;
  job.updated_at = timestamp;
  writeJson(jobsPath, jobs);
  const project = readJson(join47(root, "project.json"));
  const knowledgeVersionBefore = Number(project.knowledge_version || 0);
  const appliedFile = appendLearningToKnowledge(root, proposal);
  const knowledgeVersionAfter = bumpKnowledgeVersion(root);
  const receipt = {
    schema_version: SCHEMA_VERSION,
    receipt_id: shortId("learning-receipt"),
    job_id: job.job_id,
    run_id: job.run_id,
    proposal_id: proposal.id,
    knowledge_version_before: knowledgeVersionBefore,
    knowledge_version_after: knowledgeVersionAfter,
    target_file: appliedFile.target_file,
    applied_content: appliedFile.applied_content,
    content_sha256: appliedFile.content_sha256,
    evidence_refs: proposal.evidence_refs,
    applied_at: now()
  };
  ensureDir(join47(root, "learning", "receipts"));
  writeJson(
    join47(root, "learning", "receipts", `receipt-${receipt.receipt_id}.json`),
    receipt
  );
  updateLearningProposal(root, proposal.id, (item) => {
    item.status = "applied";
    item.apply_job_id = job.job_id;
    item.apply_receipt_id = receipt.receipt_id;
    item.applied_at = receipt.applied_at;
    item.updated_at = receipt.applied_at;
  });
  job.status = "applied";
  job.attempt = Number(job.attempt || 0) + 1;
  job.completed_at = receipt.applied_at;
  job.receipt_id = receipt.receipt_id;
  job.updated_at = receipt.applied_at;
  writeJson(jobsPath, jobs);
  const event = appendEvent(root, "learning.applied", "apex-v2", {
    run_id: job.run_id,
    job_id: job.job_id,
    proposal_id: proposal.id,
    receipt_id: receipt.receipt_id,
    target_file: proposal.target_file,
    knowledge_version: knowledgeVersionAfter
  });
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return {
    job_id: job.job_id,
    proposal_id: proposal.id,
    receipt_id: receipt.receipt_id,
    status: "APPLIED",
    knowledge_version: knowledgeVersionAfter,
    replayed: false
  };
}
function appendLearningToKnowledge(root, proposal) {
  const target = join47(root, proposal.target_file);
  if (!target.startsWith(join47(root, "knowledge"))) {
    throw new Error(`learning proposal \u53EA\u80FD\u5199\u5165 knowledge/\uFF1A${proposal.target_file}`);
  }
  const section = renderAppliedLearningSection(proposal);
  const existing = existsSync31(target) ? readFileSync24(target, "utf8") : "";
  if (!existing.includes(`learning_id: ${proposal.id}`)) {
    writeFileSync16(target, `${existing.trimEnd()}

${section}
`);
  }
  return {
    target_file: proposal.target_file,
    content_sha256: createHash15("sha256").update(section).digest("hex"),
    applied_content: section
  };
}
function renderAppliedLearningSection(proposal) {
  return `## \u5DF2\u5E94\u7528\u5B66\u4E60\uFF1A${proposal.id}

learning_id: ${proposal.id}
source_run_id: ${proposal.source_run_id}
confidence: ${proposal.confidence}
status: applied

### \u5185\u5BB9

${proposal.proposed_change}

### \u8BC1\u636E

${bullet(proposal.evidence_refs)}
`;
}
function appendAppliedLearning(root) {
  const proposals = readJson(join47(root, "learning", "proposals.json"), []);
  for (const proposal of proposals.filter((item) => item.status === "applied")) {
    appendLearningToKnowledge(root, proposal);
  }
}
function bumpKnowledgeVersion(root) {
  const timestamp = now();
  const manifestPath = join47(root, "knowledge", "manifest.json");
  const manifest = readJson(manifestPath, { version: 0, files: [] });
  manifest.version = Number(manifest.version || 0) + 1;
  manifest.updated_at = timestamp;
  writeJson(manifestPath, manifest);
  updateProject(root, {
    knowledge_version: manifest.version,
    updated_at: timestamp
  });
  return manifest.version;
}
function loadPlanGraph3(root, runId) {
  const plan = readJson(join47(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`\u627E\u4E0D\u5230 plan graph\uFF1A${runId}`);
  return plan;
}
function getPlanNode2(plan, planNodeId) {
  const node = plan.nodes.find((entry) => entry.id === planNodeId);
  if (!node) throw new Error(`\u627E\u4E0D\u5230 plan node\uFF1A${planNodeId}`);
  return node;
}
function listRunStates(root) {
  const runsDir = join47(root, "runs");
  if (!existsSync31(runsDir)) return [];
  return readdirSync19(runsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => readJson(join47(runsDir, entry.name, "run.json"), null)).filter(Boolean);
}
function findRunFiles(root, name) {
  const runsDir = join47(root, "runs");
  if (!existsSync31(runsDir)) return [];
  const out = [];
  for (const runEntry of readdirSync19(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    const file = join47(runsDir, runEntry.name, name);
    if (existsSync31(file)) out.push(file);
  }
  return out;
}
function findFilesByName(root, predicate) {
  const out = [];
  function walk(dir) {
    if (!existsSync31(dir)) return;
    for (const entry of readdirSync19(dir, { withFileTypes: true })) {
      const path = join47(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(path);
      }
    }
  }
  walk(root);
  return out;
}
await main();
