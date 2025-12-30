import { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import "chartjs-adapter-date-fns";

type TempPoint = { time: number; value: number };
type MedPoint = { time: number; name: string };

type Props = {
  temperatures: TempPoint[];
  medications: MedPoint[];
};

const FEVER_LINE = 37.5;
const Y_MIN = 35;
const Y_MAX = 40;

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function formatDateTime(ms: number) {
  const d = new Date(ms);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatValue(v: number) {
  return v.toFixed(1);
}

const MedLinesPlugin = {
  id: "medLines",
  afterDatasetsDraw(chart: any) {
    const meds: MedPoint[] = (chart?.options?.plugins?.medLines?.medications ?? []) as MedPoint[];
    if (!meds?.length) return;

    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    if (!xScale) return;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";

    for (const med of meds) {
      const x = xScale.getPixelForValue(med.time);
      if (x < chartArea.left || x > chartArea.right) continue;

      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();

      const label = med.name ?? "投薬";
      ctx.setLineDash([]);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const padX = 6;
      const textW = ctx.measureText(label).width;
      const boxW = textW + padX * 2;
      const boxH = 18;
      const y = chartArea.top + 8;
      const boxX = Math.min(Math.max(x + 6, chartArea.left + 2), chartArea.right - boxW - 2);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;

      drawRoundRect(ctx, boxX, y, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.80)";
      ctx.fillText(label, boxX + padX, y + 13);

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
    }
    ctx.restore();
  },
} as const;

const SelectionLinePlugin = {
  id: "selectionLine",
  afterDatasetsDraw(chart: any) {
    const idx: number | null = chart?.options?.plugins?.selectionLine?.activeIndex ?? null;
    if (idx == null) return;

    const ds = chart.data?.datasets?.[0];
    const pt = ds?.data?.[idx];
    if (!pt) return;

    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    if (!xScale) return;

    const x = xScale.getPixelForValue(pt.x);
    if (x < chartArea.left || x > chartArea.right) return;

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(34, 197, 94, 0.75)";
    ctx.beginPath();
    ctx.moveTo(x, chartArea.bottom);
    ctx.lineTo(x, chartArea.top);
    ctx.stroke();
    ctx.restore();
  },
} as const;

export default function TemperatureMedicationChart({ temperatures, medications }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const safeTemps = useMemo(() => {
    return [...(temperatures ?? [])].sort((a, b) => a.time - b.time);
  }, [temperatures]);

  const data = useMemo(() => {
    const main = safeTemps.map((t) => ({ x: t.time, y: t.value }));
    return {
      datasets: [
        {
          label: "体温",
          data: main,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.12)",
          fill: true,
          borderWidth: 4,
          tension: 0.30,
          pointRadius: 7,
          pointHoverRadius: 8,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#22c55e",
          pointBorderWidth: 3,
        },
        {
          label: "高熱ライン",
          data: main.map((p) => ({ x: p.x, y: FEVER_LINE })),
          borderColor: "rgba(245, 158, 11, 0.55)",
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    };
  }, [safeTemps]);

  const options: any = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      onClick(_: any, elements: any[]) {
        if (!elements?.length) return setActiveIndex(null);
        const idx = elements[0].index as number;
        setActiveIndex(idx);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: false,
          backgroundColor: "rgba(55, 65, 81, 0.95)",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 10,
          cornerRadius: 10,
          caretSize: 0,
          callbacks: {
            title(items: any[]) {
              const ms = items?.[0]?.parsed?.x;
              return typeof ms === "number" ? formatDateTime(ms) : "";
            },
            label(item: any) {
              const y = item?.parsed?.y;
              return typeof y === "number" ? `${formatValue(y)}℃` : "";
            },
          },
        },
        selectionLine: { activeIndex },
        medLines: { medications },
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "day" },
          grid: {
            color: "rgba(0,0,0,0.12)",
            borderDash: [6, 6],
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            color: "rgba(0,0,0,0.65)",
          },
        },
        y: {
          min: Y_MIN,
          max: Y_MAX,
          grid: {
            color: "rgba(0,0,0,0.10)",
          },
          ticks: {
            stepSize: 1,
            color: "rgba(0,0,0,0.65)",
            callback(v: any) {
              const n = Number(v);
              return Number.isFinite(n) ? `${n}` : "";
            },
          },
        },
      },
    };
  }, [activeIndex, medications]);

  const activeInfo = useMemo(() => {
    if (activeIndex == null) return null;
    const t = safeTemps[activeIndex];
    if (!t) return null;
    return { ms: t.time, value: t.value };
  }, [activeIndex, safeTemps]);

  return (
    <div
      style={{
        width: "100%",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: 12,
        background: "white",
        boxSizing: "border-box", // 余白計算のバグ防止
      }}
    >
      {/* 【無限スクロール防止策】
        1. width: "99%" -> 100%だと計算誤差で1pxはみ出してループするため、少し小さくする
        2. overflow: "hidden" -> 万が一はみ出しても親を広げない
        3. height: "320px" -> px単位で固定
        4. margin: "0 auto" -> 99%にした分、真ん中に寄せる
      */}
      <div style={{ height: "320px", width: "99%", position: "relative", overflow: "hidden", margin: "0 auto" }}>
        <Line data={data as any} options={options} plugins={[MedLinesPlugin as any, SelectionLinePlugin as any]} />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>
          {activeInfo ? `${formatValue(activeInfo.value)}℃` : "—"}
        </div>
        <div style={{ fontSize: 14, opacity: 0.85 }}>
          {activeInfo ? formatDateTime(activeInfo.ms) : "グラフの点をタップすると表示されます"}
        </div>
      </div>
    </div>
  );
}