"use strict";
const Parser = require("@iarna/toml/lib/parser.js");

const _pos = Symbol("pos");

const improveState = (parser, state, line, col) => {
  state.line = line;
  state.col = col;
  Object.defineProperty(state, "resultTable", {
    set: (val) => {
      if (val && typeof val == "object") {
        Object.defineProperty(val, _pos, { value: [{ line: line, col: col }] });
      }
      state._resultTable = val;
    },
    get: () => {
      return state._resultTable;
    },
  });
  Object.defineProperty(state, "resultArr", {
    set: (val) => {
      if (val && typeof val == "object") {
        Object.defineProperty(val, _pos, { value: [{ line: line, col: col }] });
        val._push = val.push
        val.push = (...args) => {
          val[_pos].push({line: parser.line, col: parser.col - (typeof args[0] == "string" ? args[0].length : 0)});
          return val._push(...args);
        }
      }
      state._resultArr = val;
    },
    get: () => {
      return state._resultArr;
    },
  });
};

class PosParser extends Parser {
  constructor(...args) {
    super(...args);
    improveState(this, this.state, 0, 0);
    Object.defineProperty(this, "ctx", {
      set: (val) => {
        if (val && typeof val == "object" && !val[_pos]) {
          Object.defineProperty(val, _pos, { value: [{ line: this.state.line, col: this.state.col }] });
        }
        if (this._ctx && Array.isArray(this._ctx[_pos])) {
          this._ctx[_pos].push({ line: this.line, col: this.col });
        }
        this._ctx = val;
      },
      get: () => {
        return this._ctx;
      },
    });
  }
  call(fn, ...args) {
    super.call(fn, ...args);
    improveState(this, this.state, this.line, this.col);
  }
  return(val) {
    if (val && typeof val == "object") {
      Array.isArray(val[_pos]) ? val[_pos].push({ line: this.line, col: this.col }) :  Object.defineProperty(val, _pos, { value: [{ line: this.state.line, col: this.state.col }] });
    }
    return super.return(val);
  }
}
PosParser.PosSymbol = _pos;
module.exports = PosParser;
