import { isTemplateStringsArray } from '../utilities/types'
import { setLocation } from './loc'

export type Site = TemplateStringsArray
export interface Key {
  site: Site
  deps: any[]
  equals(other: Key): boolean
}

export type Keyable = (key: Key) => any

export type Keyed<F extends Keyable> =
  ((parts: TemplateStringsArray, ...subs: any[]) => ReturnType<F>) & ReturnType<F>

export const keyed = <F extends Keyable>(func: F): Keyed<F> => (
  (...args: any[]) => {
    const [site, ...deps] = args
    if (isTemplateStringsArray(site)) {
      setLocation(site, 2)
      return func(new DepKey(site, deps))
    }
    return func(anonymous()).apply(undefined, args)
  }
) as any

const anonymous = (): Key => {
  const site = Object.assign([], {raw: []})
  setLocation(site, 3)
  return new DepKey(site)
}

class DepKey implements Key {
  constructor (public readonly site: Site, public readonly deps: any[] = []) {
    setLocation(this, site)
  }

  equals(other: Key) {
    return other && other.site === this.site && isShallowEqual(this.deps, other.deps)
  }
}

function isShallowEqual(a: any[], b: any[]) {
  if (a.length !== b.length) return false
  let i = a.length; while (i --> 0) {
    if (a[i] !== b[i]) return false
  }
  return true
}
