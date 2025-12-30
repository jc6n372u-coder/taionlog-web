import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale } from "chart.js";
import { Line } from "react-chartjs-2";
import "chartjs-adapter-date-fns";
import { ja } from "date-fns/locale";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale);

type Props = {
  temperatures: { time: number; value: number }[];
  medications: { time: number; name: string }[];
};

export default function TemperatureMedicationChart({ temperatures, medications }: Props) {
  // 時系列ソート
  const sortedTemps = [...temperatures].sort((a, b) => a.time - b.time);

  const data = {
    datasets: [
      {
        label: "体温",
        data: sortedTemps.map(t => ({ x: t.time, y: t.value })),
        borderColor: "#4CAF50",
        backgroundColor: "#4CAF50",
        tension: 0.3,
        pointRadius: 5,
        pointHitRadius: 20, // ★ここ修正：タップ判定を広げる（指サイズ）
      },
      {
        label: "薬",
        data: medications.map(m => ({ x: m.time, y: 39 })), // 上の方に表示
        pointStyle: "rectRot",
        pointRadius: 6,
        backgroundColor: "#FFA726",
        borderColor: "#FFA726",
        showLine: false, 
      }
    ],
  };

  const options: any = {
    responsive: true,
    scales: {
      x: {
        type: "time",
        time: {
          unit: "day",
          displayFormats: { day: "d" }, // ★ここ修正：日付のみ表示（14, 15...）
        },
        adapters: { date: { locale: ja } },
        grid: { color: "#f0f0f0" },
      },
      y: {
        min: 35,
        max: 40,
        grid: { color: "#f0f0f0" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
         callbacks: {
            title: (ctx: any) => {
                const d = new Date(ctx[0].parsed.x);
                return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
            }
         }
      }
    },
  };

  return <Line data={data} options={options} />;
}