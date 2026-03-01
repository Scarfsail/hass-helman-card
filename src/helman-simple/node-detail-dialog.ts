import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing, TemplateResult } from "lit-html";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LocalizeFunction } from "../localize/localize";
import { convertToKWh, getDisplayEnergyUnit } from "../helman/energy-unit-converter";
import { DeviceNode } from "../helman/DeviceNode";
import type { HelmanUiConfig } from "../helman-api";
import "../helman/power-house-devices-section";
import "../helman/power-device";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeType = 'solar' | 'battery' | 'grid' | 'house';

export interface BatteryDetailParams {
    nodeType: 'battery';
    power: number;                        // watts, signed (positive = charging)
    powerEntityId: string | null;
    soc: number;                          // %
    socEntityId: string | null;
    minSoc: number;                       // %
    minSocEntityId: string | null;
    maxSocEntityId: string | null;
    remainingEnergyEntityId: string | null;
    batteryProducerNode: DeviceNode | null;
    batteryConsumerNode: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
}

export interface SolarDetailParams {
    nodeType: 'solar';
    power: number;                        // watts
    powerEntityId: string | null;
    todayEnergyEntityId: string | null;
    forecastEntityId: string | null;
    solarNode: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
}

export interface GridDetailParams {
    nodeType: 'grid';
    power: number;                        // watts, signed (positive = importing)
    powerEntityId: string | null;
    todayImportEntityId: string | null;
    todayExportEntityId: string | null;
    gridProducerNode: DeviceNode | null;
    gridConsumerNode: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
}

export interface HouseDetailParams {
    nodeType: 'house';
    power: number;                        // watts
    powerEntityId: string | null;
    devices: DeviceNode[];
    parentPowerHistory?: number[];
    historyBuckets: number;
    historyBucketDuration: number;
    uiConfig?: HelmanUiConfig;
    houseNode: DeviceNode | null;
}

export type NodeDetailParams =
    | BatteryDetailParams
    | SolarDetailParams
    | GridDetailParams
    | HouseDetailParams;

// ── Component ─────────────────────────────────────────────────────────────────

@customElement("node-detail-dialog")
export class NodeDetailDialog extends LitElement {

    // 2. Static styles
    static styles = css`
        .content {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: 240px;
            padding: 8px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }
        .detail-row.clickable {
            cursor: pointer;
            border-radius: 4px;
            padding: 2px 4px;
            margin: 0 -4px;
        }
        .detail-row.clickable:hover {
            background: var(--secondary-background-color);
        }
        .label {
            color: var(--secondary-text-color);
            font-size: 0.9rem;
        }
        .value {
            font-weight: 600;
            font-size: 0.9rem;
        }
        .section-title {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--secondary-text-color);
            letter-spacing: 0.05em;
            margin-top: 4px;
        }
        .power-device-wrapper {
            display: flex;
            width: 100%;
        }
        .power-devices-dual {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 8px;
            width: 100%;
        }
        .power-device-section {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 160px;
            gap: 4px;
        }
    `;

    // 4. Public properties
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: NodeDetailParams;
    @property({ type: Boolean }) public open = false;

    // 10. Render method
    render() {
        if (!this.open || !this.params) return nothing;
        return html`
            <ha-dialog
                .open=${this.open}
                @closed=${this._onClosed}
                .heading=${this._title()}
            >
                <div class="content">
                    ${this._renderContent()}
                </div>
                <mwc-button slot="primaryAction" @click=${this._close}>
                    ${this.localize('node_detail.close')}
                </mwc-button>
            </ha-dialog>
        `;
    }

    // 12. Private helper methods

    private _title(): string {
        return this.localize(`node_detail.title.${this.params.nodeType}`);
    }

    private _renderContent(): TemplateResult {
        switch (this.params.nodeType) {
            case 'battery': return this._renderBattery(this.params);
            case 'solar':   return this._renderSolar(this.params);
            case 'grid':    return this._renderGrid(this.params);
            case 'house':   return this._renderHouse(this.params);
        }
    }

    private _renderBattery(p: BatteryDetailParams): TemplateResult {
        const mode = p.power > 50 ? 'charging' : p.power < -50 ? 'discharging' : 'idle';

        const maxSocState = this._readState(p.maxSocEntityId);
        const maxSocValue = maxSocState ? parseFloat(maxSocState.state) : NaN;
        const remainingKwh = this._readKWh(p.remainingEnergyEntityId);
        const remainingDisplay = remainingKwh !== null ? getDisplayEnergyUnit(remainingKwh) : null;

        return html`
            ${p.batteryProducerNode || p.batteryConsumerNode ? html`
                <div class="power-devices-dual">
                    ${p.batteryProducerNode ? html`
                        <div class="power-device-section">
                            <div class="section-title">${this.localize('node_detail.battery.section_producer')}</div>
                            <power-device
                                .hass=${this.hass}
                                .device=${p.batteryProducerNode}
                                .historyBuckets=${p.historyBuckets}
                                .historyBucketDuration=${p.historyBucketDuration}
                            ></power-device>
                        </div>
                    ` : nothing}
                    ${p.batteryConsumerNode ? html`
                        <div class="power-device-section">
                            <div class="section-title">${this.localize('node_detail.battery.section_consumer')}</div>
                            <power-device
                                .hass=${this.hass}
                                .device=${p.batteryConsumerNode}
                                .historyBuckets=${p.historyBuckets}
                                .historyBucketDuration=${p.historyBucketDuration}
                            ></power-device>
                        </div>
                    ` : nothing}
                </div>
            ` : nothing}
            <div class="detail-row">
                <span class="label">${this.localize('node_detail.battery.mode')}</span>
                <span class="value">${this.localize(`node_detail.battery.mode_${mode}`)}</span>
            </div>
            ${remainingDisplay ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.remainingEnergyEntityId)}>
                    <span class="label">${this.localize('node_detail.battery.remaining_energy')}</span>
                    <span class="value">${remainingDisplay.value.toFixed(1)} ${remainingDisplay.unit}</span>
                </div>
            ` : nothing}
        `;
    }

    private _renderSolar(p: SolarDetailParams): TemplateResult {
        const todayKwh = this._readKWh(p.todayEnergyEntityId);
        const todayDisplay = todayKwh !== null ? getDisplayEnergyUnit(todayKwh) : null;
        const forecastKwh = this._readKWh(p.forecastEntityId);
        const forecastDisplay = forecastKwh !== null ? getDisplayEnergyUnit(forecastKwh) : null;

        return html`
            ${p.solarNode ? html`
                <div class="power-device-wrapper">
                    <power-device
                        .hass=${this.hass}
                        .device=${p.solarNode}
                        .historyBuckets=${p.historyBuckets}
                        .historyBucketDuration=${p.historyBucketDuration}
                    ></power-device>
                </div>
            ` : nothing}
        `;
    }

    private _renderGrid(p: GridDetailParams): TemplateResult {
        const importKwh = this._readKWh(p.todayImportEntityId);
        const importDisplay = importKwh !== null ? getDisplayEnergyUnit(importKwh) : null;
        const exportKwh = this._readKWh(p.todayExportEntityId);
        const exportDisplay = exportKwh !== null ? getDisplayEnergyUnit(exportKwh) : null;

        return html`
            ${p.gridProducerNode || p.gridConsumerNode ? html`
                <div class="power-devices-dual">
                    ${p.gridProducerNode ? html`
                        <div class="power-device-section">
                            <div class="section-title">${this.localize('node_detail.grid.section_producer')}</div>
                            <power-device
                                .hass=${this.hass}
                                .device=${p.gridProducerNode}
                                .historyBuckets=${p.historyBuckets}
                                .historyBucketDuration=${p.historyBucketDuration}
                            ></power-device>
                        </div>
                    ` : nothing}
                    ${p.gridConsumerNode ? html`
                        <div class="power-device-section">
                            <div class="section-title">${this.localize('node_detail.grid.section_consumer')}</div>
                            <power-device
                                .hass=${this.hass}
                                .device=${p.gridConsumerNode}
                                .historyBuckets=${p.historyBuckets}
                                .historyBucketDuration=${p.historyBucketDuration}
                            ></power-device>
                        </div>
                    ` : nothing}
                </div>
            ` : nothing}

        `;
    }

    private _renderHouse(p: HouseDetailParams): TemplateResult {
        return html`
            ${p.houseNode ? html`
                <div class="power-device-wrapper">
                    <power-device
                        .hass=${this.hass}
                        .device=${p.houseNode}
                        .historyBuckets=${p.historyBuckets}
                        .historyBucketDuration=${p.historyBucketDuration}
                    ></power-device>
                </div>
            ` : nothing}
            ${p.devices.length > 0 ? html`
                <power-house-devices-section
                    .hass=${this.hass}
                    .devices=${p.devices}
                    .historyBuckets=${p.historyBuckets}
                    .historyBucketDuration=${p.historyBucketDuration}
                    .currentParentPower=${p.power}
                    .parentPowerHistory=${p.parentPowerHistory}
                    .devices_full_width=${true}
                    .sortChildrenByPower=${true}
                    .initial_show_only_top_children=${5}
                    .uiConfig=${p.uiConfig}
                ></power-house-devices-section>
            ` : nothing}
        `;
    }

    private _close() {
        (this.shadowRoot?.querySelector('ha-dialog') as any)?.close();
    }

    private _onClosed() {
        this.dispatchEvent(new CustomEvent('closed', { bubbles: true, composed: true }));
    }

    private _showMoreInfo(entityId: string | null) {
        if (!entityId) return;
        this.dispatchEvent(new CustomEvent('hass-more-info', {
            bubbles: true,
            composed: true,
            detail: { entityId },
        }));
    }

    private _readState(entityId: string | null) {
        if (!entityId) return null;
        return this.hass.states[entityId] ?? null;
    }

    private _readKWh(entityId: string | null): number | null {
        const state = this._readState(entityId);
        if (!state) return null;
        const raw = parseFloat(state.state);
        if (isNaN(raw)) return null;
        return convertToKWh(raw, state.attributes.unit_of_measurement);
    }
}
