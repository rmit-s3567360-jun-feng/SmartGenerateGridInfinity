import { geometries, measurements } from '@jscad/modeling'

import type { BoundsSummary, MeshData } from './types'

const { geom3 } = geometries
const { measureBoundingBox } = measurements

export function geometryToMeshData(geometry: ReturnType<typeof geom3.create>): MeshData {
  const polygons = geom3.toPolygons(geometry)
  const positions: number[] = []

  for (const polygon of polygons) {
    const [anchor, ...rest] = polygon.vertices

    for (let index = 0; index < rest.length - 1; index += 1) {
      const current = rest[index]
      const next = rest[index + 1]
      positions.push(...anchor, ...current, ...next)
    }
  }

  return {
    positions: new Float32Array(positions),
  }
}

export function getBoundsFromGeometry(
  geometry: ReturnType<typeof geom3.create>,
): BoundsSummary {
  const [min, max] = measureBoundingBox(geometry) as [
    [number, number, number],
    [number, number, number],
  ]

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  }
}

export function mergeArrayBuffers(parts: ArrayBuffer[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0

  for (const part of parts) {
    merged.set(new Uint8Array(part), offset)
    offset += part.byteLength
  }

  return merged.buffer
}
