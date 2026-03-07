import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { LocalizeFunction } from "../../localize/localize";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import type { GridDetailParams } from "./node-detail-types";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import { readKWh } from "./node-detail-utils";
import "../../helman/power-device";

@customElement("node-detail-grid-content")
export class NodeDetailGridContent extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: GridDetailParams;

    render() {
        const p = this.params;
        const importKwh = readKWh(this.hass, p.todayImportEntityId);
        const importDisplay = importKwh !== null ? getDisplayEnergyUnit(importKwh) : null;
        const exportKwh = readKWh(this.hass, p.todayExportEntityId);
        const exportDisplay = exportKwh !== null ? getDisplayEnergyUnit(exportKwh) : null;

        void importDisplay;
        void exportDisplay;

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
            </div>
        `;
    }
}
