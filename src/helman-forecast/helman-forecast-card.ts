import { LitElement, css, html } from "lit-element";
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard } from "../../hass-frontend/src/panels/lovelace/types";
import type { ForecastPayload } from "../helman-api";
import { getLocalizeFunction, type LocalizeFunction } from "../localize/localize";
import {
    type HelmanForecastCardConfig,
} from "./HelmanForecastCardConfig";
import {
    getSharedForecastOwner,
    type SharedForecastOwner,
    type SharedForecastSnapshot,
} from "./shared-forecast-owner";
import {
    getUnifiedForecastOverviewConfig,
    normalizeUnifiedForecastOverviewConfig,
    type UnifiedForecastOverviewConfig,
} from "./unified-forecast-visibility";
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
                    name: "show_solar_gauge",
                    selector: { boolean: {} },
                },
                {
                    name: "show_solar_chart",
                    selector: { boolean: {} },
                },
                {
                    name: "show_battery_gauge",
                    selector: { boolean: {} },
                },
                {
                    name: "show_battery_chart",
                    selector: { boolean: {} },
                },
                {
                    name: "show_consumption_gauge",
                    selector: { boolean: {} },
                },
                {
                    name: "show_consumption_chart",
                    selector: { boolean: {} },
                },
                {
                    name: "show_price_chart",
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
    private _forecastOwner?: SharedForecastOwner;
    private _unsubscribeForecastOwner?: () => void;

    // 5. State properties
    @state() private _hass?: HomeAssistant;
    @state() private _forecast: ForecastPayload | null = null;
    @state() private _isForecastLoading = false;
    @state() private _forecastLoadFailed = false;

    // 7. HA-specific property setter
    public set hass(value: HomeAssistant) {
        const shouldReloadForecast = this._hass?.connection !== value.connection;
        this._hass = value;
        if (!this._localize) {
            this._localize = getLocalizeFunction(value);
        }
        if (shouldReloadForecast) {
            this._detachForecastOwner();
            this._resetForecastState();
        }
        if (this.isConnected) {
            this._syncForecastOwner();
        }
    }

    // 8. HA-specific methods
    getCardSize() { return 4; }

    setConfig(config: HelmanForecastCardConfig) {
        const defaultOverviewConfig = getUnifiedForecastOverviewConfig("solar");
        this._config = {
            transparent_background: false,
            mobile_density: "comfortable",
            show_solar_gauge: defaultOverviewConfig.solarGauge,
            show_solar_chart: defaultOverviewConfig.solarChart,
            show_battery_gauge: defaultOverviewConfig.batteryGauge,
            show_battery_chart: defaultOverviewConfig.batteryChart,
            show_consumption_gauge: defaultOverviewConfig.consumptionGauge,
            show_consumption_chart: defaultOverviewConfig.consumptionChart,
            show_price_chart: defaultOverviewConfig.priceChart,
            ...config,
        };
    }

    // 9. Lifecycle methods
    connectedCallback(): void {
        super.connectedCallback();
        this._syncForecastOwner();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._detachForecastOwner();
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
                        .loading=${this._isForecastLoading}
                        .loadFailed=${this._forecastLoadFailed}
                        .overviewConfig=${this._getOverviewConfig()}
                        .mobileDensity=${this._config.mobile_density ?? "comfortable"}
                    ></helman-unified-forecast-detail>
                </div>
            </ha-card>
        `;
    }

    // Private helper methods
    private _getOverviewConfig(): UnifiedForecastOverviewConfig {
        return normalizeUnifiedForecastOverviewConfig({
            solarGauge: this._config.show_solar_gauge !== false,
            solarChart: this._config.show_solar_chart !== false,
            batteryGauge: this._config.show_battery_gauge === true,
            batteryChart: this._config.show_battery_chart !== false,
            consumptionGauge: this._config.show_consumption_gauge === true,
            consumptionChart: this._config.show_consumption_chart === true,
            priceChart: this._config.show_price_chart !== false,
        });
    }

    private _resetForecastState(): void {
        this._forecast = null;
        this._isForecastLoading = false;
        this._forecastLoadFailed = false;
    }

    private _syncForecastOwner(): void {
        const hass = this._hass;
        if (!this.isConnected || !hass) {
            return;
        }

        const owner = getSharedForecastOwner(hass);
        if (this._forecastOwner === owner) {
            this._applyForecastSnapshot(owner.getSnapshot());
            return;
        }

        this._detachForecastOwner();
        this._forecastOwner = owner;
        this._applyForecastSnapshot(owner.getSnapshot());
        this._unsubscribeForecastOwner = owner.subscribe((snapshot) => {
            this._applyForecastSnapshot(snapshot);
        });
    }

    private _detachForecastOwner(): void {
        this._unsubscribeForecastOwner?.();
        this._unsubscribeForecastOwner = undefined;
        this._forecastOwner = undefined;
    }

    private _applyForecastSnapshot(snapshot: SharedForecastSnapshot): void {
        this._forecast = snapshot.forecast;
        this._isForecastLoading = snapshot.loading;
        this._forecastLoadFailed = snapshot.loadFailed;
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
