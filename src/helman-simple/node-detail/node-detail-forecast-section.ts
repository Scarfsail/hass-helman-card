import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload } from "../../helman-api";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import {
    getUnifiedForecastOverviewConfig,
    type UnifiedForecastOverviewConfig,
    type UnifiedForecastOverviewPreset,
} from "../../helman-forecast/unified-forecast-visibility";
import type { LocalizeFunction } from "../../localize/localize";
import { LocalHourBoundaryController } from "./local-hour-boundary-controller";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import type { NodeType } from "./node-detail-types";
import "../../helman-forecast/helman-unified-forecast-detail";

const OVERVIEW_PRESET_BY_NODE_TYPE: Record<NodeType, UnifiedForecastOverviewPreset> = {
    battery: "battery",
    house: "house",
    solar: "solar",
    grid: "grid",
};

@customElement("node-detail-forecast-section")
export class NodeDetailForecastSection extends LitElement {
    static styles = [nodeDetailSharedStyles];

    private _forecastRefreshTimer: number | null = null;
    private readonly _localHourBoundaryController = new LocalHourBoundaryController(
        this,
        () => this.hass?.config.time_zone ?? null,
        () => this._handleLocalHourBoundary(),
    );

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: String }) public nodeType!: NodeType;

    @state() private _forecast: ForecastPayload | null = null;
    @state() private _isForecastLoading = false;
    @state() private _forecastLoadFailed = false;

    connectedCallback(): void {
        super.connectedCallback();
        this._ensureForecastLifecycle();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._clearForecastRefreshTimer();
    }

    updated(changedProperties: Map<string, unknown>): void {
        super.updated(changedProperties);

        if (!changedProperties.has("hass")) {
            return;
        }

        const previousHass = changedProperties.get("hass") as HomeAssistant | undefined;
        if (previousHass?.connection !== this.hass?.connection) {
            this._forecast = null;
            this._isForecastLoading = false;
            this._forecastLoadFailed = false;
        }
        this._ensureForecastLifecycle();
    }

    render() {
        if (!this.hass || !this.localize || !this.nodeType) {
            return nothing;
        }

        const overviewConfig = this._getOverviewConfig();

        return html`
            <div class="forecast-section">
                <helman-unified-forecast-detail
                    .hass=${this.hass}
                    .localize=${this.localize}
                    .forecast=${this._forecast}
                    .loading=${this._isForecastLoading}
                    .loadFailed=${this._forecastLoadFailed}
                    .overviewConfig=${overviewConfig}
                    .mobileDensity=${"comfortable"}
                    .showSectionTitle=${false}
                ></helman-unified-forecast-detail>
            </div>
        `;
    }

    private _getOverviewConfig(): UnifiedForecastOverviewConfig {
        return getUnifiedForecastOverviewConfig(OVERVIEW_PRESET_BY_NODE_TYPE[this.nodeType]);
    }

    private _ensureForecastLifecycle(): void {
        if (!this.hass) {
            return;
        }

        if (this._forecast === null && !this._isForecastLoading) {
            void this._loadInitialForecast();
        }
        this._startForecastRefreshTimer();
    }

    private async _handleLocalHourBoundary(): Promise<void> {
        if (!this.hass) {
            return;
        }

        await this._refreshForecast();
    }

    private async _loadInitialForecast(): Promise<void> {
        const hass = this.hass;
        if (!hass) {
            return;
        }

        const connection = hass.connection;
        this._isForecastLoading = true;
        this._forecastLoadFailed = false;
        try {
            const forecast = await loadForecast(hass);
            if (this.hass?.connection === connection) {
                this._forecast = forecast;
                this._forecastLoadFailed = false;
            }
        } catch (err) {
            if (this.hass?.connection === connection) {
                this._forecastLoadFailed = true;
                console.error("node-detail-forecast-section: failed to load forecast", err);
            }
        } finally {
            if (this.hass?.connection === connection) {
                this._isForecastLoading = false;
            }
        }
    }

    private _startForecastRefreshTimer(): void {
        if (this._forecastRefreshTimer !== null) {
            return;
        }

        this._forecastRefreshTimer = window.setInterval(() => {
            if (!this.hass) {
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
        const hass = this.hass;
        if (!hass) {
            return;
        }

        const connection = hass.connection;
        const forecast = await refreshForecast(hass, this._forecast);
        if (this.hass?.connection === connection) {
            this._forecast = forecast;
        }
    }
}
