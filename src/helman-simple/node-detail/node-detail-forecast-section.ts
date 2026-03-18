import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing, type TemplateResult } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload } from "../../helman-api";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { HelmanForecastSectionVisibility } from "../../helman-forecast/HelmanForecastCardConfig";
import type { LocalizeFunction } from "../../localize/localize";
import { LocalHourBoundaryController } from "./local-hour-boundary-controller";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import type { NodeType } from "./node-detail-types";
import "../../helman-forecast/helman-unified-forecast-detail";
import "./helman-battery-forecast-detail";
import "./helman-forecast-detail";
import "./helman-house-forecast-detail";

type ForecastViewMode = "overall" | "specific";

const ALL_SECTIONS_VISIBLE: HelmanForecastSectionVisibility = {
    solar: true,
    battery: true,
    house: true,
    price: true,
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
    @state() private _mode: ForecastViewMode = "overall";

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
        }
        this._ensureForecastLifecycle();
    }

    render() {
        if (!this.hass || !this.localize || !this.nodeType) {
            return nothing;
        }

        const specificLabelKey = this._getSpecificLabelKey();

        return html`
            <div class="forecast-section">
                <div class="forecast-switch-header">
                    <div
                        class="forecast-switch"
                        role="group"
                        aria-label=${this.localize("node_detail.forecast_switch.label")}
                    >
                        <button
                            type="button"
                            class="forecast-switch-button ${this._mode === "overall" ? "active" : ""}"
                            aria-pressed=${String(this._mode === "overall")}
                            @click=${() => this._setMode("overall")}
                        >
                            ${this.localize("node_detail.forecast_switch.overall")}
                        </button>
                        <button
                            type="button"
                            class="forecast-switch-button ${this._mode === "specific" ? "active" : ""}"
                            aria-pressed=${String(this._mode === "specific")}
                            @click=${() => this._setMode("specific")}
                        >
                            ${this.localize(specificLabelKey)}
                        </button>
                    </div>
                </div>
                ${this._mode === "overall" ? this._renderOverallForecast() : this._renderSpecificForecast()}
            </div>
        `;
    }

    private _setMode(mode: ForecastViewMode): void {
        this._mode = mode;
    }

    private _renderOverallForecast(): TemplateResult {
        return html`
            <helman-unified-forecast-detail
                .hass=${this.hass}
                .localize=${this.localize}
                .forecast=${this._forecast}
                .sectionVisibility=${ALL_SECTIONS_VISIBLE}
                .mobileDensity=${"comfortable"}
                .showSectionTitle=${false}
            ></helman-unified-forecast-detail>
        `;
    }

    private _renderSpecificForecast(): TemplateResult {
        switch (this.nodeType) {
            case "battery":
                return html`
                    <helman-battery-forecast-detail
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .forecast=${this._forecast}
                        .showSectionTitle=${false}
                    ></helman-battery-forecast-detail>
                `;
            case "house":
                return html`
                    <helman-house-forecast-detail
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .forecast=${this._forecast}
                        .showSectionTitle=${false}
                    ></helman-house-forecast-detail>
                `;
            case "solar":
            case "grid":
                return html`
                    <helman-forecast-detail
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .forecast=${this._forecast}
                        .showSectionTitle=${false}
                    ></helman-forecast-detail>
                `;
        }
    }

    private _getSpecificLabelKey(): string {
        switch (this.nodeType) {
            case "battery":
                return "node_detail.forecast_switch.battery";
            case "house":
                return "node_detail.forecast_switch.house";
            case "solar":
                return "node_detail.forecast_switch.solar";
            case "grid":
                return "node_detail.forecast_switch.grid";
        }
    }

    private _ensureForecastLifecycle(): void {
        if (!this.hass) {
            return;
        }

        if (this._forecast === null) {
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
        try {
            const forecast = await loadForecast(hass);
            if (this.hass?.connection === connection) {
                this._forecast = forecast;
            }
        } catch (err) {
            if (this.hass?.connection === connection) {
                console.error("node-detail-forecast-section: failed to load forecast", err);
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
