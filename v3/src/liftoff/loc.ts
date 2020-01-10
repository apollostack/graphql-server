import {basename} from 'path'
import Parser, {StackFrame} from 'error-stack-parser'

const locations = new WeakMap<any, Location>()

export class Location {
  public readonly isConstructor?: boolean
  public readonly isEval?: boolean
  public readonly isNative?: boolean
  public readonly isTopLevel?: boolean

  public get file() {
    return basename(this.frame.fileName!)
  }
  public get path() {
    return this.frame.fileName
  }
  public get line() { return this.frame.lineNumber }
  public get col() { return this.frame.columnNumber }

  public get short() {
    return `${this.file}:${this.line}:${this.col}`
  }

  public readonly functionName?: string
  public readonly args?: any[]

  /**
   * Create a location describing a point in the source.
   *
   * @param error {Error} an Error whose stack includes the location
   * @param depth {number} the index of the stack frame holding the location
   */
  constructor(public readonly error: Error, public readonly depth: number) {}

  get stack(): readonly Readonly<StackFrame>[] {
    const value = Object.freeze(
      Parser.parse(this.error).map(Object.freeze) as Readonly<StackFrame>[]
    )
    Object.defineProperty(this, 'stack', {
      value, writable: false, configurable: false
    })
    return value
  }

  get frame() {
    return this.stack[this.depth]
  }
}


export function setLocation(of: any): void
export function setLocation(of: any, src: object): void
export function setLocation(of: any, depth: number): void

export function setLocation(of: any, srcOrDepth: object | number = 1) {
  if (locations.has(of)) return
  const loc = typeof srcOrDepth === 'number'
    ? new Location(new Error, srcOrDepth)
    :
    (getLocation(srcOrDepth) || new Location(new Error, 1))
  locations.set(of, loc)
}

export function getLocation(of: object) {
  return locations.get(of)
}

;['isConstructor',
'isEval',
'isNative',
'isTopLevel',
'functionName',
'args',].forEach(prop => {
  Object.defineProperty(Location.prototype, prop, {
    get() { return this.frame[prop] }
  })
})
