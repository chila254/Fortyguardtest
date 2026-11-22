import { createHeatmap } from "@/lib/fortyguard";

const CITY = "San Jose, CA";
const CITY_LAT = 37.25;
const CITY_LON = -121.88;

const SAN_JOSE_POLYGON = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-121.9, 37.2],
      [-121.82, 37.2],
      [-121.82, 37.26],
      [-121.9, 37.26],
      [-121.9, 37.2],
    ],
  ],
};

function temperatureColor(celsius: number, min: number, max: number): string {
  const clampedMin = Math.min(min, max);
  const clampedMax = Math.max(min, max);
  const ratio = clampedMax === clampedMin ? 0 : (celsius - clampedMin) / (clampedMax - clampedMin);
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const blue = [59, 130, 246];
  const red = [239, 68, 68];
  const mix = blue.map((channel, index) =>
    Math.round(blue[index] + (red[index] - blue[index]) * clampedRatio),
  );
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

export default async function Home() {
  const result = await createHeatmap({
    polygon: SAN_JOSE_POLYGON,
    startDate: "2024-07-15",
    startTime: "14:00",
    granularity: 100,
  });

  const stats = result.stats?.temperature_stats;
  const temperatures = result.tiles.map((tile) => tile.properties.average_temperature);
  const min = stats?.minimum ?? Math.min(...temperatures);
  const max = stats?.maximum ?? Math.max(...temperatures);
  const mean = stats?.mean ?? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;

  const sortedTiles = [...result.tiles].sort(
    (a, b) => b.properties.average_temperature - a.properties.average_temperature,
  );

  return (
    <main className="page">
      <header className="header">
        <h1>FortyGuard Heat Demo</h1>
        <p>{CITY}</p>
      </header>

      <section className="card">
        <h2>Area statistics</h2>
        <div className="statsGrid">
          <div className="stat">
            <div className="label">Minimum</div>
            <div className="value">{min.toFixed(2)} °C</div>
          </div>
          <div className="stat">
            <div className="label">Mean</div>
            <div className="value">{mean.toFixed(2)} °C</div>
          </div>
          <div className="stat">
            <div className="label">Maximum</div>
            <div className="value">{max.toFixed(2)} °C</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Tiles by heat intensity</h2>
        <div className="tileGrid">
          {sortedTiles.map((tile) => (
            <div
              key={tile.id}
              className="tile"
              style={{ borderLeft: `4px solid ${temperatureColor(tile.properties.average_temperature, min, max)}` }}
            >
              <div className="temp">{tile.properties.average_temperature.toFixed(2)} °C</div>
              <div className="meta">
                tile {tile.properties.tile_id} · min {tile.properties.min_temperature.toFixed(2)} °C · max{" "}
                {tile.properties.max_temperature.toFixed(2)} °C
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Context</h2>
        <p className="note">
          City coordinates: {CITY_LAT.toFixed(2)}° N, {Math.abs(CITY_LON).toFixed(2)}° W. Demo consumes the FortyGuard
          Temperature API heatmap endpoint for a single-hour snapshot and renders tiles returned as GeoJSON
          polygons.
        </p>
      </section>
    </main>
  );
}
