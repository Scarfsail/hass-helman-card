import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { LocalizeFunction } from "../../localize/localize";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import type { SolarDetailParams } from "./node-detail-types";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import { readKWh } from "./node-detail-utils";
import "../../helman/power-device";

@customElement("node-detail-solar-content")
export class NodeDetailSolarContent extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: SolarDetailParams;

    render() {
        const p = this.params;
        const todayKwh = readKWh(this.hass, p.todayEnergyEntityId);
        const todayDisplay = todayKwh !== null ? getDisplayEnergyUnit(todayKwh) : null;
        const forecastKwh = readKWh(this.hass, p.forecastEntityId);
        const forecastDisplay = forecastKwh !== null ? getDisplayEnergyUnit(forecastKwh) : null;

        void todayDisplay;
        void forecastDisplay;

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
            </div>
        `;
    }
}
