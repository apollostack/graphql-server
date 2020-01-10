import { Plugin, Config, Refs } from 'pretty-format'
import { isRef, Ref } from '../liftoff'

export default {
  test(value: any) {
    return isRef(value)
  },

  serialize(
    value: Ref<any>,
    _config: Config,
    _indentation: string,
    _depth: number,
    _refs: Refs,
    _printer: any,
  ): string {
    return value.toString()
  },
} as Plugin
