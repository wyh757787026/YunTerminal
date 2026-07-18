import { useEffect, useRef, useState } from 'react'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function buildPoints(
  data: number[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  maxValue?: number
): Array<{ x: number; y: number }> {
  if (data.length === 0) return []

  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom
  const max = maxValue ?? Math.max(...data, 1)

  if (data.length === 1) {
    const y = padding.top + plotH - (data[0] / max) * plotH
    return [
      { x: padding.left, y },
      { x: padding.left + plotW, y }
    ]
  }

  return data.map((value, index) => ({
    x: padding.left + (index / (data.length - 1)) * plotW,
    y: padding.top + plotH - (clamp(value, 0, max) / max) * plotH
  }))
}

function smoothLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return path
}

function areaPath(points: Array<{ x: number; y: number }>, baseline: number): string {
  if (points.length === 0) return ''
  const line = smoothLinePath(points)
  const last = points[points.length - 1]
  const first = points[0]
  return `${line} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} L ${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`
}

export interface ChartSeries {
  values: number[]
  color: string
  fillId: string
  label: string
}

export function SmoothLineChart({
  series,
  width = 268,
  height = 88,
  maxValue,
  formatY,
  timeWindowMinutes
}: {
  series: ChartSeries[]
  width?: number
  height?: number
  maxValue?: number
  formatY: (value: number) => string
  timeWindowMinutes: number
}): React.JSX.Element {
  const padding = { top: 8, right: 8, bottom: 18, left: 36 }
  const plotBottom = height - padding.bottom
  const allValues = series.flatMap((s) => s.values)
  const computedMax = maxValue ?? Math.max(...allValues, 1)

  const yTicks = [0, 0.5, 1].map((ratio) => ({
    ratio,
    value: computedMax * ratio,
    y: padding.top + (height - padding.top - padding.bottom) * (1 - ratio)
  }))

  const xLabels = [
    { label: `-${timeWindowMinutes}m`, x: padding.left },
    { label: `-${Math.round(timeWindowMinutes / 2)}m`, x: padding.left + (width - padding.left - padding.right) / 2 },
    { label: '现在', x: width - padding.right }
  ]

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        {series.map((s) => (
          <linearGradient key={s.fillId} id={s.fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>

      {yTicks.map((tick) => (
        <g key={tick.ratio}>
          <line
            x1={padding.left}
            y1={tick.y}
            x2={width - padding.right}
            y2={tick.y}
            className="stroke-surface-border"
            strokeWidth="1"
            strokeDasharray={tick.ratio === 0 ? undefined : '3 3'}
          />
          <text
            x={padding.left - 6}
            y={tick.y + 3}
            textAnchor="end"
            className="fill-accent-muted text-[9px]"
          >
            {formatY(tick.value)}
          </text>
        </g>
      ))}

      {series.map((s) => {
        const points = buildPoints(s.values, width, height, padding, computedMax)
        if (points.length === 0) return null
        return (
          <g key={s.fillId}>
            <path d={areaPath(points, plotBottom)} fill={`url(#${s.fillId})`} />
            <path
              d={smoothLinePath(points)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )
      })}

      {xLabels.map((item) => (
        <text
          key={item.label}
          x={item.x}
          y={height - 4}
          textAnchor={item.label === '现在' ? 'end' : item.label.startsWith('-') && item.x > padding.left + 10 ? 'middle' : 'start'}
          className="fill-accent-muted text-[9px]"
        >
          {item.label}
        </text>
      ))}
    </svg>
  )
}

export function chartPeak(values: number[]): number {
  return values.length ? Math.max(...values) : 0
}

export function chartLatest(values: number[]): number {
  return values.length ? values[values.length - 1] : 0
}

export function chartAverage(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function ResponsiveSmoothLineChart(
  props: Omit<Parameters<typeof SmoothLineChart>[0], 'width'> & { minWidth?: number }
): React.JSX.Element {
  const { minWidth = 140, ...chartProps } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(minWidth)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = (): void => {
      setWidth(Math.max(minWidth, element.clientWidth))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [minWidth])

  return (
    <div ref={containerRef} className="w-full shrink-0" style={{ minWidth: minWidth }}>
      <SmoothLineChart {...chartProps} width={width} />
    </div>
  )
}
