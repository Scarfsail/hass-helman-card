import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { LocalizeFunction } from "../../localize/localize";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import type { SolarDetailParams } from "./node-detail-types";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import "../../helman/power-device";

@customElement("node-detail-solar-content")
export class NodeDetailSolarContent extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: SolarDetailParams;

    render() {
        const p = this.params;

        return html`
            <div class="content">
                ${p.solarNode ? html`
                    <div class="power-device-wrapper">
                        <power-device
                            .hass=${this.hass}
                            .device=${p.solarNode}
                            .currentParentPower=${p.productionNode?.powerValue}
                            .parentPowerHistory=${p.productionNode?.powerHistory}
                            .historyBuckets=${p.historyBuckets}
                            .historyBucketDuration=${p.historyBucketDuration}
                        ></power-device>
                    </div>
                ` : nothing}
                ${this._renderForecastSection()}
            </div>
        `;
    }

    private _renderForecastSection() {
        const forecast = this.params.forecast;
        if (!forecast || forecast.status === "not_configured") {
            return nothing;
        }

        return html`
            <div class="forecast-section">
                <div class="section-title">${this.localize("node_detail.solar.forecast_section")}</div>
                ${forecast.remainingTodayKwh !== null ? html`
                    <div class="detail-row">
                        <span class="label">${this.localize("node_detail.solar.remaining_today")}</span>
                        <span class="value">${this._formatEnergy(forecast.remainingTodayKwh)}</span>
                    </div>
                ` : nothing}
                ${forecast.status === "unavailable" ? html`
                    <div class="muted">${this.localize("node_detail.solar.forecast_unavailable")}</div>
                ` : html`
                    <div class="forecast-list">
                        ${forecast.points.map((point) => html`
                            <div class="detail-row">
                                <span class="label">${this._formatDate(point.timestamp)}</span>
                                <span class="value">${this._formatEnergy(point.value)}</span>
                            </div>
                        `)}
                    </div>
                `}
            </div>
        `;
    }

    private _formatDate(timestamp: string): string {
        return new Date(timestamp).toLocaleDateString(
            this.hass.locale?.language || navigator.language,
            {
                weekday: "short",
                day: "numeric",
                month: "numeric",
            },
        );
    }

    private _formatEnergy(value: number): string {
        const display = getDisplayEnergyUnit(value);
        return `${display.value.toFixed(1)} ${display.unit}`;
    }
}
