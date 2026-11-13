"use client";

import React, { useId, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils/currency";
import { AnalyticsSeriesPoint, AnalyticsSummary } from "./types";
import styles from "./page.module.css";

type ChartMetric = "views" | "clicks" | "ctr";

interface MyAdsAnalyticsPanelProps {
  series: AnalyticsSeriesPoint[];
  summary: AnalyticsSummary;
  currencyCountry?: string | null;
  autoRefreshEnabled?: boolean;
}

function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function MyAdsAnalyticsPanel({
  series,
  summary,
  currencyCountry,
  autoRefreshEnabled = false,
}: MyAdsAnalyticsPanelProps) {
  const [metric, setMetric] = useState<ChartMetric>("views");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartUid = useId().replace(/:/g, "");

  const safeSeries = useMemo<AnalyticsSeriesPoint[]>(() => {
    if (Array.isArray(series) && series.length > 0) return series;
    const today = new Date().toISOString().slice(0, 10);
    return [{ date: today, views: summary.totalViews, clicks: summary.totalClicks, ctr: summary.avgCtr }];
  }, [series, summary]);

  const metricConfig = useMemo(() => {
    switch (metric) {
      case "clicks":
        return {
          label: "Daily Clicks",
          stroke: "#10b981",
          fillStart: "rgba(16, 185, 129, 0.28)",
          fillEnd: "rgba(16, 185, 129, 0.01)",
          formatValue: (v: number) => Math.round(v).toLocaleString(),
          getValue: (pt: AnalyticsSeriesPoint) => pt.clicks,
        };
      case "ctr":
        return {
          label: "Daily CTR (%)",
          stroke: "#60a5fa",
          fillStart: "rgba(96, 165, 250, 0.28)",
          fillEnd: "rgba(96, 165, 250, 0.01)",
          formatValue: (v: number) => `${v.toFixed(2)}%`,
          getValue: (pt: AnalyticsSeriesPoint) => pt.ctr,
        };
      case "views":
      default:
        return {
          label: "Daily Views",
          stroke: "#3b82f6",
          fillStart: "rgba(59, 130, 246, 0.28)",
          fillEnd: "rgba(59, 130, 246, 0.01)",
          formatValue: (v: number) => Math.round(v).toLocaleString(),
          getValue: (pt: AnalyticsSeriesPoint) => pt.views,
        };
    }
  }, [metric]);

  const chartGeometry = useMemo(() => {
    const width = 720;
    const height = 200;
    const padLeft = 46;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const values = safeSeries.map((pt) => Math.max(0, metricConfig.getValue(pt)));
    const rawMax = Math.max(...values, 0);
    const maxVal = rawMax > 0 ? rawMax * 1.15 : metric === "ctr" ? 5 : 10;

    const points = safeSeries.map((pt, idx) => {
      const x =
        safeSeries.length === 1
          ? padLeft + plotW / 2
          : padLeft + (idx / (safeSeries.length - 1)) * plotW;
      const val = Math.max(0, metricConfig.getValue(pt));
      const y = padTop + plotH - (val / maxVal) * plotH;
      return { x, y, val, pt };
    });

    const linePath = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
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

    return { width, height, padLeft, padRight, padTop, padBottom, plotW, plotH, points, linePath, areaPath, yTicks };
  }, [safeSeries, metricConfig, metric]);

  const activePoint =
    hoveredIdx !== null && chartGeometry.points[hoveredIdx]
      ? chartGeometry.points[hoveredIdx]
      : chartGeometry.points[chartGeometry.points.length - 1];

  const financialItems = [
    {
      label: "Total Spend",
      value: formatCurrency(summary.totalSpend, currencyCountry),
    },
    {
      label: "Effective CPV",
      value: summary.effectiveCpv > 0 ? formatCurrency(summary.effectiveCpv, currencyCountry) : "—",
    },
    {
      label: "Effective CPC",
      value: summary.effectiveCpc > 0 ? formatCurrency(summary.effectiveCpc, currencyCountry) : "—",
    },
  ];

  const gradientId = `myads-trend-grad-${chartUid}-${metric}`;

  return (
    <section className={styles.analyticsPanel} aria-label="Campaign Performance Analytics">
      {/* 14-Day Multi-Metric Trend Chart */}
      <div className={styles.analyticsChartCard}>
        <div className={styles.analyticsFinancialBar}>
          {financialItems.map((item) => (
            <div key={item.label} className={styles.analyticsFinancialCell}>
              <span className={styles.analyticsStripLabel}>{item.label}</span>
              <span className={styles.analyticsStripValue}>{item.value}</span>
            </div>
          ))}
        </div>
        <div className={styles.analyticsChartHeader}>
          <div className={styles.analyticsChartTitleGroup}>
            <div className={styles.analyticsChartTitleRow}>
              <h3 className={styles.analyticsChartTitle}>14-Day Delivery &amp; Engagement Trend</h3>
              {autoRefreshEnabled && (
                <span className={styles.analyticsLiveBadge} title="Auto-refresh polling active (every 30s)">
                  <span className={styles.liveDot} /> Live
                </span>
              )}
            </div>
            {activePoint && (
              <p className={styles.analyticsTooltipSummary}>
                <strong>{formatShortDate(activePoint.pt.date)}</strong>
                <span> · {activePoint.pt.views.toLocaleString()} views</span>
                <span> · {activePoint.pt.clicks.toLocaleString()} clicks</span>
                <span> · {activePoint.pt.ctr.toFixed(2)}% CTR</span>
              </p>
            )}
          </div>

          <div className={styles.analyticsMetricTabs} role="tablist" aria-label="Chart metric selector">
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

        <div className={styles.analyticsSvgWrap}>
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            className={styles.analyticsSvg}
            role="img"
            aria-label={`${metricConfig.label} over last ${safeSeries.length} days`}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metricConfig.fillStart} />
                <stop offset="100%" stopColor={metricConfig.fillEnd} />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines + Y-axis labels */}
            {chartGeometry.yTicks.map((tick) => (
              <g key={tick.ratio}>
                <line
                  x1={chartGeometry.padLeft}
                  y1={tick.y}
                  x2={chartGeometry.width - chartGeometry.padRight}
                  y2={tick.y}
                  stroke="var(--card-border, #2a2a28)"
                  strokeDasharray={tick.ratio === 0 ? undefined : "4 4"}
                  strokeWidth={1}
                />
                <text
                  x={chartGeometry.padLeft - 8}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--text-muted, #94a3b8)"
                >
                  {metric === "ctr" ? `${tick.value.toFixed(1)}%` : Math.round(tick.value).toLocaleString()}
                </text>
              </g>
            ))}

            {/* Area & Line */}
            {chartGeometry.areaPath && (
              <path d={chartGeometry.areaPath} fill={`url(#${gradientId})`} />
            )}
            {chartGeometry.linePath && (
              <path
                d={chartGeometry.linePath}
                fill="none"
                stroke={metricConfig.stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Active hover crosshair */}
            {activePoint && hoveredIdx !== null && (
              <line
                x1={activePoint.x}
                y1={chartGeometry.padTop}
                x2={activePoint.x}
                y2={chartGeometry.padTop + chartGeometry.plotH}
                stroke={metricConfig.stroke}
                strokeOpacity={0.45}
                strokeDasharray="3 3"
                strokeWidth={1.25}
              />
            )}

            {/* Interactive data points & X-axis labels */}
            {chartGeometry.points.map((point, idx) => {
              const isSelected = hoveredIdx === idx;
              const showXAxisLabel =
                chartGeometry.points.length <= 7 ||
                idx === 0 ||
                idx === chartGeometry.points.length - 1 ||
                idx % 3 === 0;

              const sliceWidth =
                chartGeometry.points.length > 1
                  ? chartGeometry.plotW / (chartGeometry.points.length - 1)
                  : chartGeometry.plotW;

              return (
                <g key={point.pt.date}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 5 : 3}
                    fill={isSelected ? metricConfig.stroke : "var(--card-bg, #0d0d0c)"}
                    stroke={metricConfig.stroke}
                    strokeWidth={2}
                  />
                  {showXAxisLabel && (
                    <text
                      x={point.x}
                      y={chartGeometry.height - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fill={isSelected ? "var(--foreground)" : "var(--text-muted, #94a3b8)"}
                    >
                      {formatShortDate(point.pt.date)}
                    </text>
                  )}
                  <rect
                    x={point.x - sliceWidth / 2}
                    y={chartGeometry.padTop}
                    width={Math.max(18, sliceWidth)}
                    height={chartGeometry.plotH + 14}
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
    </section>
  );
}
