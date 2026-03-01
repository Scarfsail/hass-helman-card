import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing, TemplateResult } from "lit-html";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LocalizeFunction } from "../localize/localize";
import { convertToKWh, getDisplayEnergyUnit } from "../helman/energy-unit-converter";
import { formatPower } from "../power-format";

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
}

export interface SolarDetailParams {
    nodeType: 'solar';
    power: number;                        // watts
    powerEntityId: string | null;
    todayEnergyEntityId: string | null;
    forecastEntityId: string | null;
}

export interface GridDetailParams {
    nodeType: 'grid';
    power: number;                        // watts, signed (positive = importing)
    powerEntityId: string | null;
    todayImportEntityId: string | null;
    todayExportEntityId: string | null;
}

export interface HouseDetailParams {
    nodeType: 'house';
    power: number;                        // watts
    powerEntityId: string | null;
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
        const power = Math.abs(p.power);
        const mode = p.power > 50 ? 'charging' : p.power < -50 ? 'discharging' : 'idle';
        const powerFmt = formatPower(power);
        const powerDisplay = mode === 'charging'    ? `↑ ${powerFmt.display}`
                           : mode === 'discharging' ? `↓ ${powerFmt.display}`
                           : powerFmt.display;

        // ETA sensor
        const etaEntityId = mode === 'discharging' ? 'sensor.helman_battery_time_to_empty'
                          : mode === 'charging'    ? 'sensor.helman_battery_time_to_full'
                          : null;
        const etaSensor = etaEntityId ? this.hass.states[etaEntityId] : null;
        const totalMinutes = etaSensor ? parseFloat(etaSensor.state) : NaN;
        const etaAvailable = !!etaSensor
            && etaSensor.state !== 'unavailable'
            && etaSensor.state !== 'unknown'
            && !isNaN(totalMinutes)
            && totalMinutes > 0;

        let targetTimeStr = '';
        let targetSoc: number | null = null;
        let hours = 0;
        let remainMinutes = 0;
        if (etaAvailable) {
            hours = Math.floor(totalMinutes / 60);
            remainMinutes = Math.round(totalMinutes % 60);
            const targetTime = new Date(etaSensor!.attributes.target_time);
            if (!isNaN(targetTime.getTime())) {
                targetTimeStr = targetTime.toLocaleTimeString(
                    this.hass.locale?.language || navigator.language,
                    { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' },
                );
            }
            targetSoc = etaSensor!.attributes.target_soc ?? null;
        }

        // Optional rows
        const maxSocState = this._readState(p.maxSocEntityId);
        const maxSocValue = maxSocState ? parseFloat(maxSocState.state) : NaN;
        const remainingKwh = this._readKWh(p.remainingEnergyEntityId);
        const remainingDisplay = remainingKwh !== null ? getDisplayEnergyUnit(remainingKwh) : null;

        return html`
            <div class="detail-row">
                <span class="label">${this.localize('node_detail.battery.mode')}</span>
                <span class="value">${this.localize(`node_detail.battery.mode_${mode}`)}</span>
            </div>
            <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.powerEntityId)}>
                <span class="label">${this.localize('node_detail.battery.power')}</span>
                <span class="value">${powerDisplay}</span>
            </div>
            <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.socEntityId)}>
                <span class="label">${this.localize('node_detail.battery.soc')}</span>
                <span class="value">${Math.round(p.soc)}%</span>
            </div>
            <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.minSocEntityId)}>
                <span class="label">${this.localize('node_detail.battery.min_soc')}</span>
                <span class="value">${Math.round(p.minSoc)}%</span>
            </div>
            ${p.maxSocEntityId && !isNaN(maxSocValue) ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.maxSocEntityId)}>
                    <span class="label">${this.localize('node_detail.battery.max_soc')}</span>
                    <span class="value">${Math.round(maxSocValue)}%</span>
                </div>
            ` : nothing}
            ${remainingDisplay ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.remainingEnergyEntityId)}>
                    <span class="label">${this.localize('node_detail.battery.remaining_energy')}</span>
                    <span class="value">${remainingDisplay.value.toFixed(1)} ${remainingDisplay.unit}</span>
                </div>
            ` : nothing}
            ${etaAvailable ? html`
                <div class="section-title">${this.localize('node_detail.battery.eta_section')}</div>
                ${targetSoc !== null ? html`
                    <div class="detail-row clickable" @click=${() => this._showMoreInfo(etaEntityId)}>
                        <span class="label">${this.localize('node_detail.battery.target_soc')}</span>
                        <span class="value">${targetSoc}%</span>
                    </div>
                ` : nothing}
                ${targetTimeStr ? html`
                    <div class="detail-row clickable" @click=${() => this._showMoreInfo(etaEntityId)}>
                        <span class="label">${this.localize('node_detail.battery.target_time')}</span>
                        <span class="value">${targetTimeStr}</span>
                    </div>
                ` : nothing}
                <div class="detail-row">
                    <span class="label">${this.localize('node_detail.battery.remaining_time')}</span>
                    <span class="value">${hours}:${String(remainMinutes).padStart(2, '0')}</span>
                </div>
            ` : nothing}
        `;
    }

    private _renderSolar(p: SolarDetailParams): TemplateResult {
        const powerFmt = formatPower(p.power);
        const todayKwh = this._readKWh(p.todayEnergyEntityId);
        const todayDisplay = todayKwh !== null ? getDisplayEnergyUnit(todayKwh) : null;
        const forecastKwh = this._readKWh(p.forecastEntityId);
        const forecastDisplay = forecastKwh !== null ? getDisplayEnergyUnit(forecastKwh) : null;

        return html`
            <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.powerEntityId)}>
                <span class="label">${this.localize('node_detail.solar.power')}</span>
                <span class="value">${powerFmt.display}</span>
            </div>
            ${todayDisplay ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.todayEnergyEntityId)}>
                    <span class="label">${this.localize('node_detail.solar.today_energy')}</span>
                    <span class="value">${todayDisplay.value.toFixed(1)} ${todayDisplay.unit}</span>
                </div>
            ` : nothing}
            ${forecastDisplay ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.forecastEntityId)}>
                    <span class="label">${this.localize('node_detail.solar.forecast')}</span>
                    <span class="value">${forecastDisplay.value.toFixed(1)} ${forecastDisplay.unit}</span>
                </div>
            ` : nothing}
        `;
    }

    private _renderGrid(p: GridDetailParams): TemplateResult {
        const powerFmt = formatPower(Math.abs(p.power));
        const arrow = p.power > 50 ? '← ' : p.power < -50 ? '→ ' : '';
        const powerDisplay = `${arrow}${powerFmt.display}`;

        const importKwh = this._readKWh(p.todayImportEntityId);
        const importDisplay = importKwh !== null ? getDisplayEnergyUnit(importKwh) : null;
        const exportKwh = this._readKWh(p.todayExportEntityId);
        const exportDisplay = exportKwh !== null ? getDisplayEnergyUnit(exportKwh) : null;

        return html`
            <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.powerEntityId)}>
                <span class="label">${this.localize('node_detail.grid.power')}</span>
                <span class="value">${powerDisplay}</span>
            </div>
            ${importDisplay ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.todayImportEntityId)}>
                    <span class="label">${this.localize('node_detail.grid.today_import')}</span>
                    <span class="value">${importDisplay.value.toFixed(1)} ${importDisplay.unit}</span>
                </div>
            ` : nothing}
            ${exportDisplay ? html`
                <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.todayExportEntityId)}>
                    <span class="label">${this.localize('node_detail.grid.today_export')}</span>
                    <span class="value">${exportDisplay.value.toFixed(1)} ${exportDisplay.unit}</span>
                </div>
            ` : nothing}
        `;
    }

    private _renderHouse(p: HouseDetailParams): TemplateResult {
        const powerFmt = formatPower(p.power);
        return html`
            <div class="detail-row clickable" @click=${() => this._showMoreInfo(p.powerEntityId)}>
                <span class="label">${this.localize('node_detail.house.power')}</span>
                <span class="value">${powerFmt.display}</span>
            </div>
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
