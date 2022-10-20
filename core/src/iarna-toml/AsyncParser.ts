import { JsonMap } from "@iarna/toml";

const PosParser = require('./PosParser.js');
const TOMLParser = require('@iarna/toml/lib/toml-parser').makeParserClass(PosParser);
const prettyError = require('@iarna/toml/parse-pretty-error.js')

export function parseAsync (str: string, opts?: any) {
  if (!opts) opts = {}
  const index = 0
  const blocksize = opts.blocksize || 40960
  const parser = new TOMLParser()
  return new Promise<JsonMap>((resolve, reject) => {
    setImmediate(parseAsyncNext, index, blocksize, resolve, reject)
  })
  function parseAsyncNext (index: number, blocksize: number, resolve: (obj: JsonMap) => void, reject: (err: Error) => void) {
    if (index >= str.length) {
      try {
        return resolve(parser.finish())
      } catch (err) {
        return reject(prettyError(err, str))
      }
    }
    try {
      parser.parse(str.slice(index, index + blocksize))
      setImmediate(parseAsyncNext, index + blocksize, blocksize, resolve, reject)
    } catch (err) {
      reject(prettyError(err, str))
    }
  }
}

export const PosSymbol = PosParser.PosSymbol as Symbol;

export type CodePos = {line: number; col: number;};