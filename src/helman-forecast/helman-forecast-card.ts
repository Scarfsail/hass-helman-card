import { LitElement, css, html } from "lit-element";
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard } from "../../hass-frontend/src/panels/lovelace/types";
import type { ForecastPayload } from "../helman-api";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../helman/forecast-loader";
import { getLocalizeFunction, type LocalizeFunction } from "../localize/localize";
import { LocalHourBoundaryController } from "../helman-simple/node-detail/local-hour-boundary-controller";
import {
    type HelmanForecastCardConfig,
    type HelmanForecastSectionVisibility,
} from "./HelmanForecastCardConfig";
import "./helman-unified-forecast-detail";

@customElement("helman-forecast-card")
export class HelmanForecastCard extends LitElement implements LovelaceCard {
    // 1. Static HA configuration methods
    public static async getStubConfig(_hass: HomeAssistant): Promise<Partial<HelmanForecastCardConfig>> {
        return { type: "custom:helman-forecast-card" };
    }

    public static getConfigForm() {
        return {
            schema: [
                {
                    name: "transparent_background",
                    selector: { boolean: {} },
                },
                {
                    name: "mobile_density",
                    selector: {
                        select: {
                            mode: "dropdown",
                            options: ["comfortable", "compact"],
                        },
                    },
                },
                {
                    name: "show_solar",
                    selector: { boolean: {} },
                },
                {
                    name: "show_battery",
                    selector: { boolean: {} },
                },
                {
                    name: "show_house",
                    selector: { boolean: {} },
                },
                {
                    name: "show_price",
                    selector: { boolean: {} },
                },
            ],
        };
    }

    // 2. Static styles
    static styles = css`
        :host { display: block; }
        ha-card { overflow: hidden; }
        ha-card.transparent {
            background: transparent;
            box-shadow: none;
            border: none;
        }
        .card-content {
            padding: 12px;
        }
    `;

    // 3. Private properties
    private _config!: HelmanForecastCardConfig;
    private _localize?: LocalizeFunction;
    private _forecastRefreshTimer: number | null = null;
    private readonly _localHourBoundaryController = new LocalHourBoundaryController(
        this,
        () => this._hass?.config.time_zone ?? null,
        () => this._handleLocalHourBoundary(),
    );

    // 5. State properties
    @state() private _hass?: HomeAssistant;
    @state() private _forecast: ForecastPayload | null = null;

    // 7. HA-specific property setter
    public set hass(value: HomeAssistant) {
        const shouldReloadForecast = this._hass?.connection !== value.connection;
        this._hass = value;
        if (!this._localize) {
            this._localize = getLocalizeFunction(value);
        }
        if (shouldReloadForecast) {
            this._forecast = null;
        }
        if (this.isConnected) {
            this._ensureForecastLifecycle();
        }
    }

    // 8. HA-specific methods
    getCardSize() { return 4; }

    setConfig(config: HelmanForecastCardConfig) {
        this._config = {
            transparent_background: false,
            mobile_density: "comfortable",
            show_solar: true,
            show_battery: true,
            show_house: true,
            show_price: true,
            ...config,
        };
    }

    // 9. Lifecycle methods
    connectedCallback(): void {
        super.connectedCallback();
        this._ensureForecastLifecycle();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._clearForecastRefreshTimer();
    }

    // 10. Render method
    render() {
        if (!this._hass || !this._localize) {
            return html`
                <ha-card class=${this._config?.transparent_background ? "transparent" : ""}></ha-card>
            `;
        }

        return html`
            <ha-card class=${this._config?.transparent_background ? "transparent" : ""}>
                <div class="card-content">
                    <helman-unified-forecast-detail
                        .hass=${this._hass}
                        .localize=${this._localize}
                        .forecast=${this._forecast}
                        .sectionVisibility=${this._getSectionVisibility()}
                        .mobileDensity=${this._config.mobile_density ?? "comfortable"}
                    ></helman-unified-forecast-detail>
                </div>
            </ha-card>
        `;
    }

    // Private helper methods
    private _ensureForecastLifecycle(): void {
        if (!this._hass) {
            return;
        }

        if (this._forecast === null) {
            void this._loadInitialForecast();
        }
        this._startForecastRefreshTimer();
    }

    private _getSectionVisibility(): HelmanForecastSectionVisibility {
        return {
            solar: this._config.show_solar !== false,
            battery: this._config.show_battery !== false,
            house: this._config.show_house !== false,
            price: this._config.show_price !== false,
        };
    }

    private async _handleLocalHourBoundary(): Promise<void> {
        if (!this._hass) {
            return;
        }

        await this._refreshForecast();
    }

    private async _loadInitialForecast(): Promise<void> {
        const hass = this._hass;
        if (!hass) {
            return;
        }

        const connection = hass.connection;
        try {
            const forecast = await loadForecast(hass);
            if (this._hass?.connection === connection) {
                this._forecast = forecast;
            }
        } catch (err) {
            if (this._hass?.connection === connection) {
                console.error("helman-forecast-card: failed to load forecast", err);
            }
        }
    }

    private _startForecastRefreshTimer(): void {
        if (this._forecastRefreshTimer !== null) {
            return;
        }

        this._forecastRefreshTimer = window.setInterval(() => {
            if (!this._hass) {
                return;
            }
            void this._refreshForecast();
        }, FORECAST_REFRESH_MS);
    }

    private _clearForecastRefreshTimer(): void {
        if (this._forecastRefreshTimer !== null) {
            window.clearInterval(this._forecastRefreshTimer);
            this._forecastRefreshTimer = null;
        }
    }

    private async _refreshForecast(): Promise<void> {
        const hass = this._hass;
        if (!hass) {
            return;
        }

        const connection = hass.connection;
        const forecast = await refreshForecast(hass, this._forecast);
        if (this._hass?.connection === connection) {
            this._forecast = forecast;
        }
    }
}

// Card registration
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: "helman-forecast-card",
    name: "Helman Forecast Card",
    description: "Unified solar, battery, house, and price forecast visualization.",
    preview: true,
});
