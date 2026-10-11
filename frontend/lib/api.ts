import type {
  ClassifyResult, DatasetPage, FarmSite, ModelCard, ScenarioParams, ScenarioResult, SocietyInput,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const getFarmSites = () => request<FarmSite[]>("/api/farm-sites");

export const runScenario = (params: ScenarioParams, signal?: AbortSignal) =>
  request<ScenarioResult>("/api/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });

export const getModelCard = () => request<ModelCard>("/api/model");

export const classifySociety = (input: SocietyInput, signal?: AbortSignal) =>
  request<ClassifyResult>("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

export const getDataset = (
  query: { page: number; page_size: number; q?: string; outcome?: string; role?: string },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
  );
  return request<DatasetPage>(`/api/dataset?${params}`, { signal });
};
