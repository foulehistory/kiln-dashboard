/** A minimal inline SVG sparkline - no charting library, just enough to
 * show a short trend line for a handful of recent samples. An optional
 * second series (`data2`/`color2`) overlays a second line in the same
 * chart, sharing one scale - e.g. network download/upload, where seeing
 * both directions' shape relative to each other matters more than each
 * one's own absolute precision. */
export default function Sparkline({
  data,
  data2,
  width = 160,
  height = 36,
  color = "var(--accent)",
  color2,
}: {
  data: number[];
  data2?: number[];
  width?: number;
  height?: number;
  color?: string;
  color2?: string;
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} />;
  }

  const allValues = data2 && data2.length >= 2 ? [...data, ...data2] : data;
  const max = Math.max(...allValues, 0.0001);
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const toPoints = (series: number[]) =>
    series.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  const toLastY = (series: number[]) => height - ((series[series.length - 1] - min) / range) * height;

  return (
    <svg width={width} height={height} className="sparkline">
      {data2 && data2.length >= 2 && (
        <>
          <polyline
            points={toPoints(data2)}
            fill="none"
            stroke={color2 ?? "var(--accent)"}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={width} cy={toLastY(data2)} r={2} fill={color2 ?? "var(--accent)"} />
        </>
      )}
      <polyline points={toPoints(data)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={toLastY(data)} r={2} fill={color} />
    </svg>
  );
}
