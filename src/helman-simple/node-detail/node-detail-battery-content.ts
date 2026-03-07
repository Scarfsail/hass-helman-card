import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { LocalizeFunction } from "../../localize/localize";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import type { BatteryDetailParams } from "./node-detail-types";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import { readKWh } from "./node-detail-utils";
import "../../helman/power-device";

@customElement("node-detail-battery-content")
export class NodeDetailBatteryContent extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: BatteryDetailParams;

    render() {
        const p = this.params;
        const mode = p.power > 50 ? "charging" : p.power < -50 ? "discharging" : "idle";
        const remainingKwh = readKWh(this.hass, p.remainingEnergyEntityId);
        const remainingDisplay = remainingKwh !== null ? getDisplayEnergyUnit(remainingKwh) : null;

        return html`
            <div class="content">
                ${p.batteryProducerNode || p.batteryConsumerNode ? html`
                    <div class="power-devices-dual">
                        ${p.batteryProducerNode ? html`
                            <div class="power-device-section">
                                <div class="section-title">${this.localize("node_detail.battery.section_producer")}</div>
                                <power-device
                                    .hass=${this.hass}
                                    .device=${p.batteryProducerNode}
                                    .currentParentPower=${p.productionNode?.powerValue}
                                    .parentPowerHistory=${p.productionNode?.powerHistory}
                                    .historyBuckets=${p.historyBuckets}
                                    .historyBucketDuration=${p.historyBucketDuration}
                                ></power-device>
                            </div>
                        ` : nothing}
                        ${p.batteryConsumerNode ? html`
                            <div class="power-device-section">
                                <div class="section-title">${this.localize("node_detail.battery.section_consumer")}</div>
                                <power-device
                                    .hass=${this.hass}
                                    .device=${p.batteryConsumerNode}
                                    .currentParentPower=${p.consumptionNode?.powerValue}
                                    .parentPowerHistory=${p.consumptionNode?.powerHistory}
                                    .historyBuckets=${p.historyBuckets}
                                    .historyBucketDuration=${p.historyBucketDuration}
                                ></power-device>
                            </div>
                        ` : nothing}
                    </div>
                ` : nothing}
                <div class="detail-row">
                    <span class="label">${this.localize("node_detail.battery.mode")}</span>
                    <span class="value">${this.localize(`node_detail.battery.mode_${mode}`)}</span>
                </div>
                ${remainingDisplay ? html`
                    <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.remainingEnergyEntityId)}>
                        <span class="label">${this.localize("node_detail.battery.remaining_energy")}</span>
                        <span class="value">${remainingDisplay.value.toFixed(1)} ${remainingDisplay.unit}</span>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _showMoreInfo(entityId: string | null) {
        if (!entityId) return;

        this.dispatchEvent(new CustomEvent("hass-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId },
        }));
    }
}
