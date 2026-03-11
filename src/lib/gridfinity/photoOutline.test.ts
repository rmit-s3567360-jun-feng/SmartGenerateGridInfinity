import {
  createPhotoOutlineFixtureAnalysis,
  detectPhotoOutlineFromRaster,
  getPhotoOutlineRecommendationSummary,
  resolvePhotoOutlinePlan,
  updatePhotoOutlineEditedPoints,
} from './photoOutline'
import { defaultGridfinitySpec } from './spec'
import { templateDefinitions } from './templates'
import type {
  PhotoBounds,
  PhotoOutlineAnalysis,
  PhotoOutlineBinParams,
  PhotoPoint,
} from './types'

describe('photo outline helpers', () => {
  it('detects ruler scale and contour from a synthetic raster', () => {
    const raster = createSyntheticRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
    })

    expect(analysis.status).toBe('ready')
    expect(analysis.ruler.status).toBe('detected')
    expect(analysis.ruler.mmPerPixel).toBeGreaterThan(1)
    expect(analysis.ruler.mmPerPixel).toBeLessThan(5)
    expect(analysis.contour?.pointsPx.length).toBeGreaterThanOrEqual(4)
    expect(analysis.contour?.widthMm).toBeGreaterThan(40)
    expect(analysis.contour?.heightMm).toBeGreaterThan(20)
  })

  it('returns a missing-ruler error when the image only contains an object', () => {
    const raster = createObjectOnlyRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
    })

    expect(analysis.status).toBe('error')
    expect(analysis.ruler.status).toBe('missing')
    expect(analysis.message).toContain('未识别到 L 形标尺')
  })

  it('produces a size recommendation for the fixture analysis', () => {
    const template = templateDefinitions['photo-outline-bin']
    const params: PhotoOutlineBinParams = {
      ...(template.defaultParams as PhotoOutlineBinParams),
      analysis: createPhotoOutlineFixtureAnalysis(),
    }
    const summary = getPhotoOutlineRecommendationSummary(params, defaultGridfinitySpec)

    expect(summary.size.gridX).toBeGreaterThanOrEqual(1)
    expect(summary.size.gridY).toBeGreaterThanOrEqual(1)
    expect(summary.size.heightUnits).toBeGreaterThanOrEqual(2)
    expect(summary.pointCount).toBeGreaterThanOrEqual(4)
  })

  it('prefers a single right-side grip when double-sided reserve does not fit', () => {
    const template = templateDefinitions['photo-outline-bin']
    const params: PhotoOutlineBinParams = {
      ...(template.defaultParams as PhotoOutlineBinParams),
      analysis: createManualAnalysis(
        [
          { x: 80, y: 42 },
          { x: 124, y: 36 },
          { x: 168, y: 46 },
          { x: 178, y: 82 },
          { x: 160, y: 112 },
          { x: 116, y: 118 },
          { x: 90, y: 82 },
        ],
        0.5,
      ),
      gripMode: 'auto-side',
    }

    const plan = resolvePhotoOutlinePlan(params, defaultGridfinitySpec)

    expect(plan.size.gridX).toBe(2)
    expect(plan.gripSides).toEqual(['right'])
    expect(plan.gripLabel).toContain('单侧双层')
  })

  it('keeps point order and count stable while editing', () => {
    const analysis = createPhotoOutlineFixtureAnalysis()
    const nextPoints = analysis.contour!.pointsPx.map((point) => ({ ...point }))
    nextPoints[1] = {
      x: (nextPoints[0].x + nextPoints[2].x) / 2,
      y: (nextPoints[0].y + nextPoints[2].y) / 2,
    }

    const updated = updatePhotoOutlineEditedPoints(analysis, nextPoints)

    expect(updated.contour?.pointsPx).toHaveLength(analysis.contour!.pointsPx.length)
    expect(updated.contour?.pointsPx[1]).toEqual(nextPoints[1])
  })
})

function createSyntheticRaster() {
  const width = 160
  const height = 120
  const data = new Uint8ClampedArray(width * height * 4)

  fillRect(data, width, height, 0, 0, width, height, [248, 248, 244])
  fillRect(data, width, height, 10, 86, 48, 92, [15, 18, 20])
  fillRect(data, width, height, 10, 48, 16, 92, [15, 18, 20])
  fillPolygon(
    data,
    width,
    height,
    [
      { x: 82, y: 24 },
      { x: 126, y: 26 },
      { x: 142, y: 58 },
      { x: 126, y: 94 },
      { x: 86, y: 98 },
      { x: 68, y: 62 },
    ],
    [34, 122, 150],
  )

  return {
    data,
    width,
    height,
    name: 'synthetic-photo.png',
  }
}

function createObjectOnlyRaster() {
  const width = 180
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4)

  fillRect(data, width, height, 0, 0, width, height, [244, 241, 232])
  fillRect(data, width, height, 68, 30, 118, 112, [88, 104, 216])
  fillRect(data, width, height, 68, 30, 72, 112, [42, 48, 64])
  fillRect(data, width, height, 68, 30, 114, 34, [42, 48, 64])
  fillRect(data, width, height, 92, 48, 104, 96, [54, 60, 76])

  return {
    data,
    width,
    height,
    name: 'object-only.png',
  }
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  color: readonly [number, number, number],
) {
  for (let y = minY; y < maxY && y < height; y += 1) {
    for (let x = minX; x < maxX && x < width; x += 1) {
      setPixel(data, width, x, y, color)
    }
  }
}

function fillPolygon(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  polygon: PhotoPoint[],
  color: readonly [number, number, number],
) {
  const minX = Math.floor(Math.min(...polygon.map((point) => point.x)))
  const maxX = Math.ceil(Math.max(...polygon.map((point) => point.x)))
  const minY = Math.floor(Math.min(...polygon.map((point) => point.y)))
  const maxY = Math.ceil(Math.max(...polygon.map((point) => point.y)))

  for (let y = minY; y < maxY && y < height; y += 1) {
    for (let x = minX; x < maxX && x < width; x += 1) {
      if (isPointInPolygon(x + 0.5, y + 0.5, polygon)) {
        setPixel(data, width, x, y, color)
      }
    }
  }
}

function isPointInPolygon(x: number, y: number, polygon: PhotoPoint[]) {
  let inside = false

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const intersects =
      current.y > y !== previous.y > y &&
      x <
        ((previous.x - current.x) * (y - current.y)) /
          (previous.y - current.y) +
          current.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  [r, g, b]: readonly [number, number, number],
) {
  const offset = (y * width + x) * 4
  data[offset] = r
  data[offset + 1] = g
  data[offset + 2] = b
  data[offset + 3] = 255
}

function createManualAnalysis(pointsPx: PhotoPoint[], mmPerPixel: number): PhotoOutlineAnalysis {
  const boundsPx = getBounds(pointsPx)
  const centerX = (boundsPx.minX + boundsPx.maxX) / 2
  const centerY = (boundsPx.minY + boundsPx.maxY) / 2
  const pointsMm = pointsPx.map(({ x, y }) => ({
    x: Number(((x - centerX) * mmPerPixel).toFixed(3)),
    y: Number(((centerY - y) * mmPerPixel).toFixed(3)),
  }))
  const boundsMm = getBounds(pointsMm)

  return {
    status: 'ready',
    message: null,
    source: {
      name: 'manual-fixture.png',
      width: 240,
      height: 180,
    },
    ruler: {
      status: 'detected',
      corner: 'bottom-left',
      confidence: 0.92,
      mmPerPixel,
      knownWidthMm: 80,
      knownHeightMm: 60,
      barThicknessPx: 6,
      boundsPx: getBounds([
        { x: 8, y: 112 },
        { x: 88, y: 172 },
      ]),
    },
    contour: {
      pointsPx,
      pointsMm,
      boundsPx,
      boundsMm,
      widthMm: Number(boundsMm.width.toFixed(2)),
      heightMm: Number(boundsMm.height.toFixed(2)),
      areaMm2: Number(Math.abs(polygonArea(pointsMm)).toFixed(2)),
    },
    detection: {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
    },
  }
}

function getBounds(points: PhotoPoint[]): PhotoBounds {
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function polygonArea(points: PhotoPoint[]) {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}
