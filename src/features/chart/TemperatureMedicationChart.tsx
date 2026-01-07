import { Chart } from 'react-chartjs-2';
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import type { ChartData, ChartOptions } from 'chart.js';

type TempPoint = { time: number; value: number };
// ★変更: value (Y軸の位置) を受け取れるようにする
type MedPoint = { time: number; name: string; value?: number };

export type ViewMode = 'day' | 'week' | 'month' | 'year';

type Props = {
  temperatures: TempPoint[];
  medications: MedPoint[];
  viewMode: ViewMode;
};

const COLORS = {
  BLUE: '#66A9D9',
  FEVER: '#FF5722',
  MEDICATION: '#F59E0B',
  LINE_GRAY: '#CBD5E1', 
};

const FEVER_LINE = 37.5;

export default function TemperatureMedicationChart({ temperatures, medications, viewMode }: Props) {
  
  let timeUnit: 'hour' | 'day' | 'month' = 'day';
  let displayFmt = 'd';

  if (viewMode === 'day') {
      timeUnit = 'hour';
      displayFmt = 'H:mm';
  } else if (viewMode === 'year') {
      timeUnit = 'month';
      displayFmt = 'M月';
  } else {
      timeUnit = 'day';
      displayFmt = 'd';
  }

  const data: ChartData<'line' | 'scatter'> = {
    datasets: [
      {
        type: 'line' as const,
        label: '体温',
        data: temperatures.map(t => ({
          x: t.time,
          y: t.value,
        })),
        borderColor: COLORS.LINE_GRAY,
        borderWidth: 2,
        backgroundColor: COLORS.BLUE,
        pointBackgroundColor: temperatures.map(t =>
          t.value >= FEVER_LINE ? COLORS.FEVER : COLORS.BLUE
        ),
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
      },
      {
        type: 'line' as const,
        label: '高熱ライン',
        data: temperatures.map(t => ({ x: t.time, y: FEVER_LINE })),
        borderColor: '#f87171',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0, 
      },
      {
        type: 'scatter' as const,
        label: '投薬',
        data: medications.map(m => ({
          x: m.time,
          // ★修正: 受け取ったvalueがあればそれを使い、なければデフォルト37.0（または以前の39.0）
          y: m.value ?? 37.0,
          medName: m.name
        })),
        backgroundColor: COLORS.MEDICATION,
        pointStyle: 'rectRot',
        pointRadius: 7,
        pointHoverRadius: 10,
      }
    ],
  };

  const options: ChartOptions<'line' | 'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      axis: 'xy',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        filter: (item) => item.dataset.label !== '高熱ライン',
        callbacks: {
          label: (context: any) => {
            if (context.dataset.type === 'scatter') {
              return `💊 ${context.raw.medName}`;
            }
            return `${context.parsed.y.toFixed(1)}℃`;
          },
          title: (context: any) => {
             if (!context || !context.length || !context[0]?.parsed) {
                 return '';
             }
             const date = new Date(context[0].parsed.x);
             if (viewMode === 'day') return `${date.getHours()}:${date.getMinutes().toString().padStart(2,'0')}`;
             return `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2,'0')}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { 
          unit: timeUnit,
          displayFormats: { 
            hour: 'H:mm', 
            day: 'd', 
            month: 'M月' 
          } 
        },
        grid: { display: false },
        ticks: {
           maxRotation: 0,
           autoSkip: true,
        }
      },
      y: {
        suggestedMin: 36.0,
        suggestedMax: 40.0,
        ticks: { stepSize: 0.5 },
      },
    },
  };

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <Chart type="line" data={data} options={options} />
    </div>
  );
}
