export interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
}

export interface SettingsResponse {
  theme: "light" | "dark";
  notifications: boolean;
  language: string;
}
