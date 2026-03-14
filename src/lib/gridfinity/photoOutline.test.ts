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
  PhotoOutlineBinParams,
  PhotoPoint,
} from './types'

describe('photo outline helpers', () => {
  it('detects ruler scale and contour from a synthetic raster', () => {
    const raster = createSyntheticRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
      contourMode: 'smooth',
    })

    expect(analysis.status).toBe('ready')
    expect(analysis.ruler.status).toBe('detected')
    expect(analysis.ruler.mmPerPixel).toBeGreaterThan(1)
    expect(analysis.ruler.mmPerPixel).toBeLessThan(5)
    expect(analysis.contour?.pointsPx.length).toBeGreaterThanOrEqual(4)
    expect(analysis.contour?.widthMm).toBeGreaterThan(40)
    expect(analysis.contour?.heightMm).toBeGreaterThan(20)
  })

  it('detects a brown ruler on a light background', () => {
    const raster = createSyntheticRaster([124, 88, 58])
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
      contourMode: 'smooth',
    })

    expect(analysis.status).toBe('ready')
    expect(analysis.ruler.status).toBe('detected')
    expect(analysis.ruler.corner).toBe('bottom-left')
  })

  it('detects a white object on a light background when the ruler is present', () => {
    const raster = createWhiteObjectRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
      contourMode: 'smooth',
    })

    expect(analysis.status).toBe('ready')
    expect(analysis.ruler.status).toBe('detected')
    expect(analysis.contour?.widthMm).toBeGreaterThan(20)
    expect(analysis.contour?.heightMm).toBeGreaterThan(24)
  })

  it('extracts the outer silhouette instead of internal logo edges', () => {
    const raster = createLowContrastLogoRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.8,
      contourMode: 'smooth',
    })

    expect(analysis.status).toBe('ready')
    expect(analysis.ruler.status).toBe('detected')
    expect(analysis.contour?.boundsPx.minX).toBeLessThanOrEqual(79)
    expect(analysis.contour?.boundsPx.maxX).toBeGreaterThanOrEqual(147)
    expect(analysis.contour?.boundsPx.minY).toBeLessThanOrEqual(77)
    expect(analysis.contour?.boundsPx.maxY).toBeGreaterThanOrEqual(149)
    expect(analysis.contour?.pointsPx.length).toBeLessThanOrEqual(12)
  })

  it('returns a missing-ruler error when the image only contains an object', () => {
    const raster = createObjectOnlyRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
      contourMode: 'smooth',
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

  it('accepts thin objects below 4mm', () => {
    const template = templateDefinitions['photo-outline-bin']
    const params: PhotoOutlineBinParams = {
      ...(template.defaultParams as PhotoOutlineBinParams),
      objectHeight: 1,
      analysis: createPhotoOutlineFixtureAnalysis(),
    }

    expect(template.schema.safeParse(params).success).toBe(true)
    expect(() => resolvePhotoOutlinePlan(params, defaultGridfinitySpec)).not.toThrow()
  })

  it('offers a rounded envelope mode for easier editing', () => {
    const raster = createWhiteObjectRaster()
    const analysis = detectPhotoOutlineFromRaster(raster, {
      foregroundThreshold: 36,
      simplifyTolerance: 2.5,
      contourMode: 'rounded',
    })

    expect(analysis.status).toBe('ready')
    expect(analysis.contour?.pointsPx).toHaveLength(8)
    expect(analysis.contour?.widthMm).toBeGreaterThan(20)
    expect(analysis.contour?.heightMm).toBeGreaterThan(24)
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

function createSyntheticRaster(rulerColor: readonly [number, number, number] = [15, 18, 20]) {
  const width = 160
  const height = 120
  const data = new Uint8ClampedArray(width * height * 4)

  fillRect(data, width, height, 0, 0, width, height, [248, 248, 244])
  fillRect(data, width, height, 10, 86, 48, 92, rulerColor)
  fillRect(data, width, height, 10, 48, 16, 92, rulerColor)
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

function createWhiteObjectRaster() {
  const width = 220
  const height = 280
  const data = new Uint8ClampedArray(width * height * 4)

  fillRect(data, width, height, 0, 0, width, height, [244, 241, 232])
  fillRect(data, width, height, 18, 252, 98, 262, [18, 18, 18])
  fillRect(data, width, height, 18, 202, 28, 262, [18, 18, 18])
  fillRoundedRect(data, width, height, 74, 72, 146, 146, 16, [224, 220, 212])
  fillRoundedRect(data, width, height, 78, 68, 150, 142, 16, [251, 248, 242])
  fillRoundedRect(data, width, height, 95, 84, 106, 125, 3, [221, 217, 210])
  fillRoundedRect(data, width, height, 120, 96, 129, 105, 4, [229, 225, 218])

  return {
    data,
    width,
    height,
    name: 'white-object.png',
  }
}

function createLowContrastLogoRaster() {
  const width = 220
  const height = 280
  const data = new Uint8ClampedArray(width * height * 4)

  fillRect(data, width, height, 0, 0, width, height, [244, 241, 232])
  fillRect(data, width, height, 18, 252, 98, 262, [18, 18, 18])
  fillRect(data, width, height, 18, 202, 28, 262, [18, 18, 18])
  fillRoundedRect(data, width, height, 74, 72, 154, 152, 18, [232, 228, 220])
  fillRoundedRect(data, width, height, 78, 76, 150, 148, 18, [248, 246, 239])
  fillRect(data, width, height, 92, 94, 104, 132, [82, 78, 70])
  fillRect(data, width, height, 122, 94, 134, 132, [82, 78, 70])
  fillRect(data, width, height, 100, 106, 126, 118, [82, 78, 70])
  fillRoundedRect(data, width, height, 108, 122, 136, 140, 6, [214, 176, 84])
  fillRoundedRect(data, width, height, 166, 92, 182, 108, 4, [88, 82, 74])

  return {
    data,
    width,
    height,
    name: 'low-contrast-logo-object.png',
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

function fillRoundedRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  radius: number,
  color: readonly [number, number, number],
) {
  for (let y = minY; y < maxY && y < height; y += 1) {
    for (let x = minX; x < maxX && x < width; x += 1) {
      if (isPointInRoundedRect(x + 0.5, y + 0.5, minX, minY, maxX, maxY, radius)) {
        setPixel(data, width, x, y, color)
      }
    }
  }
}

function isPointInRoundedRect(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  radius: number,
) {
  const clampedX = Math.max(minX + radius, Math.min(x, maxX - radius))
  const clampedY = Math.max(minY + radius, Math.min(y, maxY - radius))

  return (x - clampedX) ** 2 + (y - clampedY) ** 2 <= radius ** 2
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
