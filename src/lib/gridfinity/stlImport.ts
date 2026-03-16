import { geometries, measurements, modifiers, primitives } from '@jscad/modeling'
import type Geom3 from '@jscad/modeling/src/geometries/geom3/type'

import type {
  BoundsSummary,
  ImportedAssetRecord,
  ImportedStlSourceSummary,
  StlFormat,
} from './types'

const { geom3 } = geometries
const { measureBoundingBox } = measurements
const { polyhedron } = primitives
const generalizeGeometry = modifiers.generalize as unknown as (
  options: { snap: boolean; triangulate: boolean },
  geometry: Geom3,
) => Geom3

export const MAX_STL_FILE_BYTES = 25 * 1024 * 1024
export const MAX_STL_TRIANGLES = 150000
export const INVALID_STL_GEOMETRY_MESSAGE = '模型不是可稳定求解的封闭实体。'

type Triangle = [[number, number, number], [number, number, number], [number, number, number]]

export interface ParsedStlAsset {
  geometry: Geom3
  summary: Omit<ImportedStlSourceSummary, 'assetId'>
}

export function parseStlAsset(
  fileName: string,
  bytes: ArrayBuffer,
): ParsedStlAsset {
  if (bytes.byteLength === 0) {
    throw new Error('STL 文件为空。')
  }

  if (bytes.byteLength > MAX_STL_FILE_BYTES) {
    throw new Error(`STL 文件不能超过 ${Math.floor(MAX_STL_FILE_BYTES / 1024 / 1024)}MB。`)
  }

  const triangles = parseTriangles(bytes)

  if (triangles.length === 0) {
    throw new Error('STL 中没有可用三角面。')
  }

  const geometry = trianglesToGeometry(triangles)
  const bounds = getFiniteBounds(geometry)

  return {
    geometry,
    summary: {
      name: fileName,
      format: detectFormat(bytes),
      sizeBytes: bytes.byteLength,
      triangleCount: triangles.length,
      originalBounds: bounds,
      originalSizeMm: bounds.size,
    },
  }
}

export function createImportedAssetRecord(
  assetId: string,
  fileName: string,
  bytes: ArrayBuffer,
): ImportedAssetRecord {
  const parsed = parseStlAsset(fileName, bytes)

  return {
    geometry: parsed.geometry,
    summary: {
      ...parsed.summary,
      assetId,
    },
  }
}

function parseTriangles(bytes: ArrayBuffer) {
  const binaryTriangles = tryParseBinaryStl(bytes)

  if (binaryTriangles !== null) {
    return binaryTriangles
  }

  return parseAsciiStl(bytes)
}

function detectFormat(bytes: ArrayBuffer): StlFormat {
  return isLikelyBinaryStl(bytes) ? 'binary' : 'ascii'
}

function isLikelyBinaryStl(bytes: ArrayBuffer) {
  if (bytes.byteLength < 84) {
    return false
  }

  const view = new DataView(bytes)
  const triangleCount = view.getUint32(80, true)
  const expectedLength = 84 + triangleCount * 50

  return expectedLength === bytes.byteLength
}

function tryParseBinaryStl(bytes: ArrayBuffer): Triangle[] | null {
  if (!isLikelyBinaryStl(bytes)) {
    return null
  }

  const view = new DataView(bytes)
  const triangleCount = view.getUint32(80, true)

  if (triangleCount === 0) {
    throw new Error('STL 中没有可用三角面。')
  }

  if (triangleCount > MAX_STL_TRIANGLES) {
    throw new Error(`STL 三角面数量不能超过 ${MAX_STL_TRIANGLES}。`)
  }

  const triangles: Triangle[] = []

  for (let index = 0; index < triangleCount; index += 1) {
    const offset = 84 + index * 50
    const vertices: Array<[number, number, number]> = []

    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const vertexOffset = offset + 12 + vertexIndex * 12
      const x = view.getFloat32(vertexOffset, true)
      const y = view.getFloat32(vertexOffset + 4, true)
      const z = view.getFloat32(vertexOffset + 8, true)

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error('STL 顶点坐标包含非法数值。')
      }

      vertices.push([x, y, z])
    }

    triangles.push(vertices as Triangle)
  }

  return triangles
}

function parseAsciiStl(bytes: ArrayBuffer) {
  const text = new TextDecoder().decode(bytes)
  const lines = text.split(/\r?\n/)
  const triangles: Triangle[] = []
  let currentVertices: Array<[number, number, number]> = []
  let sawFacet = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      continue
    }

    const lower = trimmed.toLowerCase()

    if (lower.startsWith('facet ')) {
      sawFacet = true
      currentVertices = []
      continue
    }

    if (lower.startsWith('vertex ')) {
      const parts = trimmed.split(/\s+/)

      if (parts.length < 4) {
        throw new Error('ASCII STL 顶点格式无效。')
      }

      const x = Number(parts[1])
      const y = Number(parts[2])
      const z = Number(parts[3])

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error('ASCII STL 顶点坐标包含非法数值。')
      }

      currentVertices.push([x, y, z])
      continue
    }

    if (lower.startsWith('endfacet')) {
      if (currentVertices.length !== 3) {
        throw new Error('ASCII STL facet 不包含 3 个顶点。')
      }

      triangles.push(currentVertices as Triangle)

      if (triangles.length > MAX_STL_TRIANGLES) {
        throw new Error(`STL 三角面数量不能超过 ${MAX_STL_TRIANGLES}。`)
      }

      currentVertices = []
    }
  }

  if (!sawFacet) {
    throw new Error('无法识别 STL 文件格式。')
  }

  if (triangles.length === 0) {
    throw new Error('STL 中没有可用三角面。')
  }

  return triangles
}

function trianglesToGeometry(triangles: Triangle[]) {
  const points: Array<[number, number, number]> = []
  const faces: number[][] = []

  for (const triangle of triangles) {
    if (isDegenerateTriangle(triangle)) {
      continue
    }

    const face: number[] = []

    for (const vertex of triangle) {
      points.push(vertex)
      face.push(points.length - 1)
    }

    faces.push(face)
  }

  if (faces.length === 0) {
    throw new Error('STL 中没有非退化三角面。')
  }

  try {
    const geometry = polyhedron({
      points,
      faces,
      orientation: 'outward',
    }) as Geom3
    const normalized = generalizeGeometry(
      { snap: true, triangulate: true },
      geometry,
    )

    if (geom3.toPolygons(normalized).length === 0) {
      throw new Error(INVALID_STL_GEOMETRY_MESSAGE)
    }

    getFiniteBounds(normalized)
    return normalized
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if (message === INVALID_STL_GEOMETRY_MESSAGE) {
      throw error
    }

    throw new Error(INVALID_STL_GEOMETRY_MESSAGE)
  }
}

function getFiniteBounds(geometry: Geom3): BoundsSummary {
  const [min, max] = measureBoundingBox(geometry) as [
    [number, number, number],
    [number, number, number],
  ]
  const values = [...min, ...max]

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(INVALID_STL_GEOMETRY_MESSAGE)
  }

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  }
}

function isDegenerateTriangle(triangle: Triangle) {
  const [a, b, c] = triangle
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  const areaSquared =
    cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]

  return areaSquared < 1e-10
}
