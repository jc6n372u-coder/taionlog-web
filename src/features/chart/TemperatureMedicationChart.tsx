import { Chart } from 'react-chartjs-2';
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import type { ChartData, ChartOptions } from 'chart.js';

type TempPoint = { time: number; value: number };
type MedPoint = { time: number; name: string };

export type ViewMode = 'day' | 'week' | 'month' | 'year';

type Props = {
  temperatures: TempPoint[];
  medications: MedPoint[];
  viewMode: ViewMode;
};

const COLORS = {
  BLUE: '#66A9D9',
  FEVER: '#FF5722',
  MEDICATION: '#F59E0B'
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
        borderColor: COLORS.BLUE,
        backgroundColor: COLORS.BLUE,
        pointBackgroundColor: temperatures.map(t =>
          t.value >= FEVER_LINE ? COLORS.FEVER : COLORS.BLUE
        ),
        pointRadius: 4,
        pointHoverRadius: 6,
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
          y: 39.0,
          medName: m.name
        })),
        backgroundColor: COLORS.MEDICATION,
        pointStyle: 'rectRot',
        pointRadius: 6,
        pointHoverRadius: 9,
      }
    ],
  };

  const options: ChartOptions<'line' | 'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        // ★修正1: カラーボックスを描画しない（エラー回避＆見た目改善）
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
             // ★修正2: データが存在しない場合にクラッシュしないようガードを入れる
             if (!context || !context.length || !context[0].parsed) {
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