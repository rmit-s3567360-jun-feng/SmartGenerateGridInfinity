export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

export function evenlySpacedCenters(
  count: number,
  span: number,
  itemSize: number,
  desiredGap: number,
) {
  if (count < 1) {
    throw new Error('至少需要一个元素。')
  }

  if (count === 1) {
    if (itemSize > span) {
      throw new Error('当前尺寸不足以容纳目标元素。')
    }

    return { centers: [0], gap: 0 }
  }

  const maxGap = (span - count * itemSize) / (count - 1)

  if (maxGap < 0) {
    throw new Error('当前尺寸不足以容纳目标元素。')
  }

  const gap = Math.min(desiredGap, maxGap)
  const usedSpan = count * itemSize + (count - 1) * gap
  const start = -usedSpan / 2 + itemSize / 2
  const centers = Array.from({ length: count }, (_, index) => {
    return start + index * (itemSize + gap)
  })

  return { centers, gap }
}

export function firstSentence(message: string) {
  return message.split('\n').find(Boolean) ?? message
}
