import { Ref } from './ref'
import { Key, Site, Keyed, keyed } from './key'
import { throws } from './errors'

export interface Bond<R=any> {
  type: string
  key: Key
  state: any
  rval: R
}

export interface PatternDelta {
  mut: 'add' | 'remove' | 'change'
  bond: Bond
}

export type Pattern = Map<Site, Bond>

const E_UNBOUND = throws('UNBOUND', 'No pattern is currently bound')

interface Scope {
  current: Pattern
  delta: PatternDelta[]
  removed: Set<Site>
}

let scope: Scope | void = void 0

interface KeyDelta {
  mut: 'add' | 'keep' | 'change'
  bond?: Bond
}

export function keyState(key: Key): KeyDelta {
  if (!scope) throw E_UNBOUND()
  const bond = scope.current.get(key.site)
  if (!bond) return { mut: 'add', bond }
  if (key.equals(bond.key)) return { mut: 'keep', bond }
  return { mut: 'change', bond }
}

export function trace(plan: () => any, pattern: Pattern = new Map): PatternDelta[] {
  const prevScope = scope
  try {
    scope = {
      current: pattern,
      delta: [],
      removed: new Set(pattern.keys())
    }
    plan()
    for (const site of scope.removed) {
      scope.delta.push({ mut: 'remove', bond: pattern.get(site)! })
    }
    return scope.delta
  } finally {
    scope = prevScope
  }
}

type Linkable<S, R> = (bond: (type: string, state: S, rval?: R) => R, state?: S) => any
export const linked = <L extends Linkable<any, any>>(linkable: L): Keyed<(key?: Key) => ReturnType<L>> => keyed(
  (key: Key) => {
    const stateForKey = keyState(key)
    const bond =
      stateForKey.mut === 'keep'
        ? <R>(_type: string, _state: any, _rval: R): R => {
          if (!scope) throw E_UNBOUND()
          scope.removed.delete(key.site)
          return stateForKey.bond?.rval
        }
        : <R>(type: string, state: any, rval: R): R => {
            if (!scope) throw E_UNBOUND()
            scope.delta.push({
              mut: stateForKey.mut as 'add' | 'change',
              bond: { type, key, state, rval }
            })
            return rval
          }
    return linkable(bond, stateForKey.bond?.state)
  }
)

type DefState = { ref: Ref<any>, def: any }

export const def = linked(
  (bond: <R>(type: string, state: DefState, rval: R) => R) =>
    <T>(ref: Ref<T>) => (def: T | Ref<T>): T | Ref<T> =>
      bond('def', { ref, def }, def)
)
