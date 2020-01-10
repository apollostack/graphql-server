import { setLocation, getLocation, Location } from './loc'

describe('source locations — ', function testSourceLocations() {
  const obj = {}; setLocation(obj)

  it('setLocation sets the source location of an object; getLocation returns it', () => {
    expect(getLocation(obj)).toBeDefined()
  })


  describe('Location', () => {
    const location = getLocation(obj)!

    it.each `
    prop              | value
    ${'file'}         | ${'loc.test.ts'}
    ${'line'}         | ${4}
    ${'col'}          | ${19}
    ${'path'}         | ${/\/src\/liftoff\/loc.test.ts/}
    ${'functionName'} | ${'Suite.testSourceLocations'}
    ${'short'}        | ${'loc.test.ts:4:19'}
    `
    ('.$prop', ({ prop, value }: { prop: keyof Location, value: any }) => {
      const actual = location[prop]
      if (value instanceof RegExp) {
        expect(actual).toMatch(value)
      } else {
        expect(actual).toBe(value)
      }
    })
  })

  it('setLocation is idempotent', () => {
    const e = getLocation(obj)
    setLocation(obj)
    expect(getLocation(obj)).toBe(e)
  })

  it('setLocation(x, y) sets the location of x to be the location of y', () => {
    const other = {}
    setLocation(other, obj)
    expect(getLocation(other)).toBe(getLocation(obj))
  })

  function a(depth: number) {
    return b(depth)

    function b(depth: number) {
      return c(depth)

      function c(depth: number) {
        const obj = {}
        setLocation(obj, depth)
        return getLocation(obj)
      }
    }
  }

  it('setLocation(x, depth) sets the location of x to be the current stack at depth', () => {
    expect(a(1)?.functionName).toBe('c')
    expect(a(2)?.functionName).toBe('b')
    expect(a(3)?.functionName).toBe('a')
  })

  function tag(parts: TemplateStringsArray) {
    setLocation(parts)
    return getLocation(parts)
  }

  function testLocation() {
    return tag `hello world`
  }

  it('interestingly, template literal objects are allocated once per callsite', () => {
    expect(testLocation()).toBe(testLocation())
  })
})
