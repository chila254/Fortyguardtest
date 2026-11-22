const API_BASE_URL = "https://api.fortyguard.com";
const API_KEY = process.env.FORTYGUARD_API_KEY ?? "";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60;
const FETCH_TIMEOUT_MS = 60000;

export interface HeatmapRequest {
  polygon: GeoJsonPolygon;
  startDate?: string;
  startTime?: string;
  granularity?: number;
}

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface HeatmapTile {
  id: string;
  type: string;
  properties: {
    tile_id: number;
    average_temperature: number;
    min_temperature: number;
    max_temperature: number;
  };
  geometry?: {
    type: string;
    coordinates: number[][][];
  };
}

export interface HeatmapStats {
  temperature_stats?: {
    minimum?: number;
    maximum?: number;
    mean?: number;
    standard_deviation?: number;
  };
}

export interface HeatmapResult {
  activityId: string;
  status: string;
  tiles: HeatmapTile[];
  stats?: HeatmapStats;
}

interface HeatmapStatusResponse {
  error?: boolean;
  message?: string;
  data?: {
    status?: string;
    error?: { message?: string };
    result?: {
      map_download_url?: string;
      stats_download_url?: string;
    };
  };
}

interface HeatmapSubmissionResponse {
  error?: boolean;
  message?: string;
  data?: { activity_id?: string };
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller });
}

async function decodeJsonPayload(text: string): Promise<unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed === "string") {
    return JSON.parse(parsed as string) as unknown;
  }
  return parsed;
}

async function waitForActivity(activityId: string): Promise<{
  status: string;
  mapData?: { features?: HeatmapTile[] };
  stats?: HeatmapStats;
}> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const statusResponse = await fetchWithTimeout(`${API_BASE_URL}/v1/status/${activityId}?result_delivery=links`, {
      headers: { "api-key": API_KEY },
      cache: "no-store",
    });
    const statusJson = (await statusResponse.json()) as HeatmapStatusResponse;
    const status = statusJson?.data?.status;
    if (statusJson?.error) {
      throw new Error(statusJson?.message ?? "Heatmap status check failed");
    }
    if (status === "Completed") {
      const result = statusJson.data?.result;
      const mapResponse = await fetchWithTimeout(result?.map_download_url ?? "", { cache: "no-store" });
      const statsResponse = await fetchWithTimeout(result?.stats_download_url ?? "", { cache: "no-store" });
      const mapJson = (await mapResponse.json()) as unknown;
      const statsJson = (await statsResponse.json()) as unknown;
      const mapData = (await decodeJsonPayload(JSON.stringify(mapJson))) as {
        features?: HeatmapTile[];
      };
      const stats = (await decodeJsonPayload(JSON.stringify(statsJson))) as HeatmapStats;
      return { status, mapData, stats };
    }
    if (status === "Failed") {
      throw new Error(`Heatmap activity ${activityId} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Heatmap activity ${activityId} did not complete in time`);
}

export async function createHeatmap(input: HeatmapRequest): Promise<HeatmapResult> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/v1/heatmap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
    },
    body: JSON.stringify({
      polygon_aoi: input.polygon,
      date_time: {
        start_date: input.startDate ?? "2024-07-15",
        start_time: input.startTime ?? "14:00",
        filter_type: 1,
      },
      granularity: input.granularity ?? 100,
    }),
    cache: "no-store",
  });
  const json = (await response.json()) as HeatmapSubmissionResponse;
  if (!response.ok || json.error) {
    throw new Error(json?.message ?? `Heatmap request failed with status ${response.status}`);
  }
  const activityId = json.data?.activity_id;
  if (!activityId) {
    throw new Error("Heatmap submission did not return an activity_id");
  }
  const outcome = await waitForActivity(activityId);
  return {
    activityId,
    status: outcome.status,
    tiles: outcome.mapData?.features ?? [],
    stats: outcome.stats,
  };
}