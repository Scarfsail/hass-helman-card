import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { LocalizeFunction } from "../../localize/localize";
import type { SolarDetailParams } from "./node-detail-types";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import "../../helman/power-device";
import "./helman-forecast-detail";

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
        const { solarForecast, gridForecast } = this.params;
        if ((!solarForecast || solarForecast.status === "not_configured")
            && (!gridForecast || gridForecast.status === "not_configured")) {
            return nothing;
        }

        return html`
            <helman-forecast-detail
                .hass=${this.hass}
                .localize=${this.localize}
                .solarForecast=${solarForecast}
                .gridForecast=${gridForecast}
                .remainingTodayEnergyEntityId=${this.params.remainingTodayEnergyEntityId}
            ></helman-forecast-detail>
        `;
    }
}
