import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { LocalDb } from "../../data/local/localDb";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

type Props = {
  userUuid: string;
  dateOffset: number; // 0=今日, -1=昨日...
};

export default function TempChart({ userUuid, dateOffset }: Props) {
  const [dataPoints, setDataPoints] = useState<{ x: string, y: number }[]>([]);

  useEffect(() => {
    loadData();
  }, [userUuid, dateOffset]);

  const loadData = async () => {
    // 対象のユーザーの記録を取得
    const records = await LocalDb.listRecords(userUuid);
    
    // 表示する日付を計算
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    const dateStr = targetDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // その日のデータだけに絞り込み & 体温があるものだけ
    const filtered = records
        .filter(r => r.measured_at.startsWith(dateStr) && r.temp > 0)
        .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
        .map(r => ({
            x: new Date(r.measured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            y: r.temp
        }));

    setDataPoints(filtered);
  };

  const data = {
    labels: dataPoints.map(p => p.x),
    datasets: [
      {
        label: '体温',
        data: dataPoints.map(p => p.y),
        borderColor: '#66A9D9',
        backgroundColor: '#66A9D9',
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 35,
        max: 40,
      }
    },
    plugins: {
      legend: {
        display: false,
      }
    }
  };

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {dataPoints.length > 0 ? (
          <Line data={data} options={options} />
      ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999" }}>
            データがありません
          </div>
      )}
    </div>
  );
}