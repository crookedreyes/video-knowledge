export interface HealthResponse {
  status: "ok";
  timestamp: string;
  version?: string;
}

export interface SettingsResponse {
  theme: "light" | "dark";
  notifications: boolean;
  language: string;
}
