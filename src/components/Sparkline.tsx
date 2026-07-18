/** A minimal inline SVG sparkline - no charting library, just enough to
 * show a short trend line for a handful of recent samples. */
export default function Sparkline({
  data,
  width = 160,
  height = 36,
  color = "var(--accent)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} />;
  }

  const max = Math.max(...data, 0.0001);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const lastY = height - ((last - min) / range) * height;

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
