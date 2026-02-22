import type { HomeAssistant } from "../hass-frontend/src/types";
import type { HelmanCardConfig } from "./HelmanCardConfig";

const BACKEND_AVAILABLE_ENTITY = "sensor.helman_power_summary";

export async function loadConfig(
  hass: HomeAssistant,
  cardConfig: HelmanCardConfig
): Promise<HelmanCardConfig> {
  if (!hass.states[BACKEND_AVAILABLE_ENTITY]) {
    // Legacy mode: use card YAML config as-is
    return cardConfig;
  }

  const result = await hass.connection.sendMessagePromise({
    type: "helman/get_config",
  });

  // Merge: backend config as base, card YAML overrides for per-card customisation
  return { ...result, ...cardConfig };
}
