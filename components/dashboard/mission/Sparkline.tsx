// Tiny inline-SVG sparkline — no chart library. A single trend line for the
// last N days on a campaign card. Pure, deterministic, dark theme.

export function Sparkline({
  values,
  className = "",
  stroke = "#3B82F6",
  width = 120,
  height = 32,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return <div className={`h-8 w-full rounded bg-elevated ${className}`} />;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pad = 3;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + (height - 2 * pad) * (1 - (v - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1];
  const lastX = (values.length - 1) * stepX;
  const lastY = pad + (height - 2 * pad) * (1 - (last - min) / span);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-8 w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}
