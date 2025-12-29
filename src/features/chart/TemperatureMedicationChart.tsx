import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import 'chartjs-adapter-date-fns'; // 日付アダプタが必要

type TempPoint = { time: number; value: number };
type MedPoint = { time: number; name: string };

type Props = {
  temperatures: TempPoint[];
  medications: MedPoint[];
};

const FEVER_LINE = 37.5;

export default function TemperatureMedicationChart({ temperatures, medications }: Props) {
  // データを時系列昇順に
  const sortedTemps = [...temperatures].sort((a,b) => a.time - b.time);

  const data = {
    datasets: [
      {
        label: '体温',
        data: sortedTemps.map(t => ({ x: t.time, y: t.value })),
        borderColor: '#3b82f6',
        pointBackgroundColor: sortedTemps.map(t => t.value >= FEVER_LINE ? '#ef4444' : '#3b82f6'),
        tension: 0.1,
      },
      {
        label: '高熱ライン',
        data: sortedTemps.length > 0 ? [
          { x: sortedTemps[0].time, y: FEVER_LINE }, 
          { x: sortedTemps[sortedTemps.length-1].time, y: FEVER_LINE }
        ] : [],
        borderColor: '#f87171',
        borderDash: [5, 5],
        pointRadius: 0,
        borderWidth: 1,
      },
    ],
  };

  const options: any = {
    responsive: true,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', tooltipFormat: 'MM/dd HH:mm' },
        title: { display: true, text: '日時' }
      },
      y: {
        suggestedMin: 36,
        suggestedMax: 40,
        title: { display: true, text: '℃' }
      },
    },
    plugins: {
      legend: { display: false },
    }
  };

  return <Line data={data} options={options} />;
}
