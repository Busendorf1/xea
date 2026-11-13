"use client";

import React, { useId, useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Ad, AnalyticsSeriesPoint } from "./types";
import { buildFallbackAnalyticsSeries } from "./adUtils";
import styles from "./page.module.css";

interface AdPerformanceChartProps {
  ad: Ad;
  series?: AnalyticsSeriesPoint[];
  timeNow: number;
}

type MetricKey = "views" | "clicks" | "ctr";

function formatShortDate(isoDate: string): string {
  const parts = String(isoDate || "").split("-");
  if (parts.length !== 3) return isoDate;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
  return `${monthNames[mIdx]} ${parseInt(parts[2], 10)}`;
}

/**
 * Compact per-ad 14-day sparkline & expandable interactive chart rendered inside `MyAdCard`.
 */
export default function AdPerformanceChart({ ad, series, timeNow }: AdPerformanceChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("views");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const reactId = useId().replace(/:/g, "");

  const safeSeries = useMemo(() => {
    if (Array.isArray(series) && series.length > 0) return series;
    return buildFallbackAnalyticsSeries([ad], timeNow);
  }, [series, ad, timeNow]);

  const metricConfig = useMemo(() => {
    if (metric === "clicks") {
      return {
        label: "Clicks",
        stroke: "#10b981",
        fillStart: "rgba(16, 185, 129, 0.30)",
        fillEnd: "rgba(16, 185, 129, 0.02)",
      };
    }
    if (metric === "ctr") {
      return {
        label: "CTR %",
        stroke: "#f59e0b",
        fillStart: "rgba(245, 158, 11, 0.30)",
        fillEnd: "rgba(245, 158, 11, 0.02)",
      };
    }
    return {
      label: "Views",
      stroke: "#3b82f6",
      fillStart: "rgba(59, 130, 246, 0.30)",
      fillEnd: "rgba(59, 130, 246, 0.02)",
    };
  }, [metric]);

  const sparklinePath = useMemo(() => {
    const w = 68;
    const h = 20;
    const pad = 2;
    const vals = safeSeries.map((pt) => Math.max(0, Number(pt.views || 0)));
    const maxVal = Math.max(1, ...vals);
    if (vals.length === 0) return "";
    return vals
      .map((v, idx) => {
        const x = vals.length === 1 ? w / 2 : pad + (idx / (vals.length - 1)) * (w - pad * 2);
        const y = h - pad - (v / maxVal) * (h - pad * 2);
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [safeSeries]);

  const chartGeometry = useMemo(() => {
    const width = 720;
    const height = 108;
    const padLeft = 40;
    const padRight = 14;
    const padTop = 10;
    const padBottom = 20;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const rawValues = safeSeries.map((pt) => Math.max(0, Number(pt[metric] || 0)));
    const maxVal = Math.max(metric === "ctr" ? 1 : 4, ...rawValues);

    const points = safeSeries.map((pt, idx) => {
      const val = Math.max(0, Number(pt[metric] || 0));
      const x = safeSeries.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (safeSeries.length - 1)) * plotW;
      const y = padTop + plotH - (val / maxVal) * plotH;
      return { x, y, val, pt };
    });

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const areaPath =
      points.length > 0
        ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(padTop + plotH).toFixed(2)} L ${points[0].x.toFixed(2)} ${(padTop + plotH).toFixed(2)} Z`
        : "";

    const yTicks = [0, 0.5, 1].map((ratio) => ({
      ratio,
      y: padTop + plotH - ratio * plotH,
      value: maxVal * ratio,
    }));

    return { width, height, padLeft, padRight, padTop, plotW, plotH, points, linePath, areaPath, yTicks };
  }, [safeSeries, metric]);

  const activePoint =
    hoveredIdx !== null && chartGeometry.points[hoveredIdx]
      ? chartGeometry.points[hoveredIdx]
      : chartGeometry.points[chartGeometry.points.length - 1];

  const todayPoint = safeSeries[safeSeries.length - 1];
  const gradientId = `ad-mini-grad-${reactId}-${metric}`;

  return (
    <div className={styles.perAdChartWrap}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={styles.perAdChartToggleBtn}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide 14-day ad performance chart" : "Show 14-day ad performance chart"}
      >
        <div className={styles.perAdChartToggleLeft}>
          <BarChart3 size={14} className={styles.perAdChartIcon} />
          <span className={styles.perAdChartTitle}>14-Day Ad Chart</span>
          {todayPoint && (
            <span className={styles.perAdChartTodayMeta}>
              Today: {todayPoint.views.toLocaleString()}v · {todayPoint.clicks.toLocaleString()}c
            </span>
          )}
        </div>
        <div className={styles.perAdChartToggleRight}>
          <svg width="68" height="20" viewBox="0 0 68 20" className={styles.perAdSparkSvg} aria-hidden="true">
            {sparklinePath && (
              <path
                d={sparklinePath}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {expanded && (
        <div className={styles.perAdChartBody}>
          <div className={styles.perAdChartToolbar}>
            {activePoint && (
              <p className={styles.perAdChartDaySummary}>
                <strong>{formatShortDate(activePoint.pt.date)}</strong>
                <span> · {activePoint.pt.views.toLocaleString()} views</span>
                <span> · {activePoint.pt.clicks.toLocaleString()} clicks</span>
                <span> · {activePoint.pt.ctr.toFixed(2)}% CTR</span>
              </p>
            )}
            <div className={styles.analyticsMetricTabs} role="tablist" aria-label="Per-ad chart metric">
              {(
                [
                  { id: "views", label: "Views" },
                  { id: "clicks", label: "Clicks" },
                  { id: "ctr", label: "CTR %" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={metric === tab.id}
                  onClick={() => setMetric(tab.id)}
                  className={`${styles.analyticsMetricTab} ${
                    metric === tab.id ? styles.analyticsMetricTabActive : ""
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.perAdChartSvgWrap}>
            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className={styles.perAdChartSvg}
              role="img"
              aria-label={`14-day ${metricConfig.label} trend for ad ${ad.id}`}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metricConfig.fillStart} />
                  <stop offset="100%" stopColor={metricConfig.fillEnd} />
                </linearGradient>
              </defs>

              {chartGeometry.yTicks.map((tick) => (
                <g key={tick.ratio}>
                  <line
                    x1={chartGeometry.padLeft}
                    y1={tick.y}
                    x2={chartGeometry.width - chartGeometry.padRight}
                    y2={tick.y}
                    stroke="var(--card-border, #2a2a28)"
                    strokeDasharray={tick.ratio === 0 ? undefined : "3 3"}
                    strokeWidth={1}
                  />
                  <text
                    x={chartGeometry.padLeft - 6}
                    y={tick.y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--text-muted, #94a3b8)"
                  >
                    {metric === "ctr" ? `${tick.value.toFixed(1)}%` : Math.round(tick.value).toLocaleString()}
                  </text>
                </g>
              ))}

              {chartGeometry.areaPath && <path d={chartGeometry.areaPath} fill={`url(#${gradientId})`} />}
              {chartGeometry.linePath && (
                <path
                  d={chartGeometry.linePath}
                  fill="none"
                  stroke={metricConfig.stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {activePoint && hoveredIdx !== null && (
                <line
                  x1={activePoint.x}
                  y1={chartGeometry.padTop}
                  x2={activePoint.x}
                  y2={chartGeometry.padTop + chartGeometry.plotH}
                  stroke={metricConfig.stroke}
                  strokeOpacity={0.45}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              )}

              {chartGeometry.points.map((point, idx) => {
                const isSelected = hoveredIdx === idx;
                const showXAxisLabel = idx === 0 || idx === chartGeometry.points.length - 1 || idx % 4 === 0;
                const sliceWidth =
                  chartGeometry.points.length > 1
                    ? chartGeometry.plotW / (chartGeometry.points.length - 1)
                    : chartGeometry.plotW;
                return (
                  <g key={point.pt.date}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isSelected ? 4 : 2.25}
                      fill={isSelected ? metricConfig.stroke : "var(--card-bg, #0d0d0c)"}
                      stroke={metricConfig.stroke}
                      strokeWidth={1.75}
                    />
                    {showXAxisLabel && (
                      <text
                        x={point.x}
                        y={chartGeometry.height - 6}
                        textAnchor="middle"
                        fontSize="9"
                        fill={isSelected ? "var(--foreground)" : "var(--text-muted, #94a3b8)"}
                      >
                        {formatShortDate(point.pt.date)}
                      </text>
                    )}
                    <rect
                      x={point.x - sliceWidth / 2}
                      y={chartGeometry.padTop}
                      width={Math.max(16, sliceWidth)}
                      height={chartGeometry.plotH + 12}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onFocus={() => setHoveredIdx(idx)}
                      tabIndex={0}
                      aria-label={`${formatShortDate(point.pt.date)}: ${point.pt.views} views, ${point.pt.clicks} clicks, ${point.pt.ctr.toFixed(2)}% CTR`}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
