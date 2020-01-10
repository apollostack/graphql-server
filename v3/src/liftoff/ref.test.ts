import { ScalarType, __ref_testing__ } from './ref'
import { TypeCheck, checkString } from '../test-helpers'

const { createScalarType } = __ref_testing__

describe('createScalarType creates scalar ref types', () => {
  const string = createScalarType<string> `string`

  it('with a location', () =>
    expect(getLocation(string)).toBeDefined())

  testIsRefType(string, checkString)
})

import { getLocation } from './loc'
import { trace, def } from './pattern'

function testIsRefType<T>(ref: ScalarType<T>, check: TypeCheck<T>) {
  describe(`${ref} creates Ref<${check.typeName}>`, () => {
    it('the creator has a location', () =>
      expect(getLocation(ref)).toBeDefined())

    it('creates ref with a location', () =>
      expect(getLocation(ref `a ref` ())).toBeDefined())

    it(`creates refs accepting ${check.typeName} values`, () => {
      trace(() => def(ref `another ref` ()) (check.example))
    })
  })
}
