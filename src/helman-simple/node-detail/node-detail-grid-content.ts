import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { LocalizeFunction } from "../../localize/localize";
import type { GridDetailParams } from "./node-detail-types";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import "../../helman/power-device";

@customElement("node-detail-grid-content")
export class NodeDetailGridContent extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: GridDetailParams;

    render() {
        const p = this.params;

        return html`
            <div class="content">
                ${p.gridProducerNode || p.gridConsumerNode ? html`
                    <div class="power-devices-dual">
                        ${p.gridConsumerNode ? html`
                            <div class="power-device-section">
                                <div class="section-title">${this.localize("node_detail.grid.section_consumer")}</div>
                                <power-device
                                    .hass=${this.hass}
                                    .device=${p.gridConsumerNode}
                                    .currentParentPower=${p.consumptionNode?.powerValue}
                                    .parentPowerHistory=${p.consumptionNode?.powerHistory}
                                    .historyBuckets=${p.historyBuckets}
                                    .historyBucketDuration=${p.historyBucketDuration}
                                ></power-device>
                            </div>
                        ` : nothing}
                        ${p.gridProducerNode ? html`
                            <div class="power-device-section">
                                <div class="section-title">${this.localize("node_detail.grid.section_producer")}</div>
                                <power-device
                                    .hass=${this.hass}
                                    .device=${p.gridProducerNode}
                                    .currentParentPower=${p.productionNode?.powerValue}
                                    .parentPowerHistory=${p.productionNode?.powerHistory}
                                    .historyBuckets=${p.historyBuckets}
                                    .historyBucketDuration=${p.historyBucketDuration}
                                ></power-device>
                            </div>
                        ` : nothing}
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
                <div class="section-title">${this.localize("node_detail.grid.forecast_section")}</div>
                ${forecast.currentSellPrice !== null ? html`
                    <div class="detail-row">
                        <span class="label">${this.localize("node_detail.grid.current_sell_price")}</span>
                        <span class="value">${this._formatValue(forecast.currentSellPrice, forecast.unit)}</span>
                    </div>
                ` : nothing}
                ${forecast.status === "unavailable" ? html`
                    <div class="muted">${this.localize("node_detail.grid.forecast_unavailable")}</div>
                ` : forecast.points.length > 0 ? html`
                    <div class="forecast-list">
                        ${forecast.points.map((point) => html`
                            <div class="detail-row">
                                <span class="label">${this._formatTime(point.timestamp)}</span>
                                <span class="value">${this._formatValue(point.value, forecast.unit)}</span>
                            </div>
                        `)}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _formatTime(timestamp: string): string {
        return new Date(timestamp).toLocaleTimeString(
            this.hass.locale?.language || navigator.language,
            {
                hour: "2-digit",
                minute: "2-digit",
            },
        );
    }

    private _formatValue(value: number, unit: string | null): string {
        const formattedValue = new Intl.NumberFormat(
            this.hass.locale?.language || navigator.language,
            { maximumFractionDigits: 3 },
        ).format(value);

        return unit ? `${formattedValue} ${unit}` : formattedValue;
    }
}
