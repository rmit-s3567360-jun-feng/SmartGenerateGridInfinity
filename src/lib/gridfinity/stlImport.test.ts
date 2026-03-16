import {
  MAX_STL_FILE_BYTES,
  MAX_STL_TRIANGLES,
  parseStlAsset,
} from './stlImport'

type Triangle = [[number, number, number], [number, number, number], [number, number, number]]

describe('stl import helpers', () => {
  it('parses an ASCII STL fixture', () => {
    const asset = parseStlAsset('cube-ascii.stl', encodeAsciiStl(createCubeTriangles()))

    expect(asset.summary.format).toBe('ascii')
    expect(asset.summary.triangleCount).toBe(12)
    expect(asset.summary.originalSizeMm).toEqual([10, 10, 10])
  })

  it('parses a binary STL fixture', () => {
    const asset = parseStlAsset('cube-binary.stl', createBinaryStl(createCubeTriangles()))

    expect(asset.summary.format).toBe('binary')
    expect(asset.summary.triangleCount).toBe(12)
    expect(asset.summary.originalBounds.size).toEqual([10, 10, 10])
  })

  it('rejects empty STL files', () => {
    expect(() => parseStlAsset('empty.stl', new ArrayBuffer(0))).toThrow('STL 文件为空')
  })

  it('rejects invalid STL contents', () => {
    expect(() =>
      parseStlAsset('broken.stl', encodeAsciiStlString('solid bad\nthis is not stl\nendsolid bad')),
    ).toThrow('无法识别 STL 文件格式')
  })

  it('rejects oversized files', () => {
    expect(() =>
      parseStlAsset('huge.stl', new ArrayBuffer(MAX_STL_FILE_BYTES + 1)),
    ).toThrow('STL 文件不能超过')
  })

  it('rejects files with too many triangles', () => {
    const triangleCount = MAX_STL_TRIANGLES + 1
    const bytes = new ArrayBuffer(84 + triangleCount * 50)
    const view = new DataView(bytes)
    view.setUint32(80, triangleCount, true)

    expect(() => parseStlAsset('too-many.stl', bytes)).toThrow('三角面数量不能超过')
  })
})

function createCubeTriangles(size = 10): Triangle[] {
  const p000: [number, number, number] = [0, 0, 0]
  const p100: [number, number, number] = [size, 0, 0]
  const p110: [number, number, number] = [size, size, 0]
  const p010: [number, number, number] = [0, size, 0]
  const p001: [number, number, number] = [0, 0, size]
  const p101: [number, number, number] = [size, 0, size]
  const p111: [number, number, number] = [size, size, size]
  const p011: [number, number, number] = [0, size, size]

  return [
    [p000, p110, p100],
    [p000, p010, p110],
    [p001, p101, p111],
    [p001, p111, p011],
    [p000, p100, p101],
    [p000, p101, p001],
    [p010, p111, p110],
    [p010, p011, p111],
    [p000, p001, p011],
    [p000, p011, p010],
    [p100, p110, p111],
    [p100, p111, p101],
  ]
}

function encodeAsciiStl(triangles: Triangle[]) {
  const body = triangles
    .map(
      (triangle) => `facet normal 0 0 0
  outer loop
    vertex ${triangle[0][0]} ${triangle[0][1]} ${triangle[0][2]}
    vertex ${triangle[1][0]} ${triangle[1][1]} ${triangle[1][2]}
    vertex ${triangle[2][0]} ${triangle[2][1]} ${triangle[2][2]}
  endloop
endfacet`,
    )
    .join('\n')

  return encodeAsciiStlString(`solid cube\n${body}\nendsolid cube`)
}

function encodeAsciiStlString(source: string) {
  return new TextEncoder().encode(source).buffer
}

function createBinaryStl(triangles: Triangle[]) {
  const bytes = new ArrayBuffer(84 + triangles.length * 50)
  const view = new DataView(bytes)

  view.setUint32(80, triangles.length, true)

  triangles.forEach((triangle, index) => {
    const offset = 84 + index * 50

    triangle.forEach((vertex, vertexIndex) => {
      const vertexOffset = offset + 12 + vertexIndex * 12

      view.setFloat32(vertexOffset, vertex[0], true)
      view.setFloat32(vertexOffset + 4, vertex[1], true)
      view.setFloat32(vertexOffset + 8, vertex[2], true)
    })
  })

  return bytes
}
