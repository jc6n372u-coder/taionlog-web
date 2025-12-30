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
        pointHitRadius: 20,
      },
      {
        label: "薬",
        // ★修正1: ここで y: 39 だけでなく、medName: m.name を渡すように変更
        data: medications.map(m => ({ x: m.time, y: 39, medName: m.name })),
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
    maintainAspectRatio: false, // スマホで見やすくするためアスペクト比固定を解除推奨（お好みで）
    scales: {
      x: {
        type: "time",
        time: {
          unit: "day",
          displayFormats: { day: "d" },
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
            },
            // ★修正2: ツールチップの中身（ラベル）をカスタマイズ
            label: (context: any) => {
                // "薬"のデータセットの場合
                if (context.dataset.label === "薬") {
                    // 修正1で埋め込んだ medName を取り出す
                    const medName = context.raw.medName;
                    return `💊 ${medName || "薬"}`;
                }
                // 体温の場合
                return `${context.dataset.label}: ${context.parsed.y}℃`;
            }
         }
      }
    },
  };

  return <Line data={data} options={options} />;
}