import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { DeviceNode } from "./DeviceNode";
import { nothing, TemplateResult } from "lit-html";
import { BatteryDeviceConfig, GridDeviceConfig, SolarDeviceConfig } from "./DeviceConfig";
import type { HomeAssistant } from "../hass-frontend/src/types";

@customElement("power-device-info")
export class PowerDeviceInfo extends LitElement {
    @property({ attribute: false }) device!: DeviceNode;
    @property({ attribute: false }) public hass!: HomeAssistant;

    static get styles() {
        return css`
            .container {
                display: flex;
                flex-direction: row;
                gap: 5px;
                justify-content: space-evenly;
                height: 16px;
                margin-left:5px;
                margin-right:5px;
            }
            .info {
                display: flex;
                flex-direction: row;
                align-items: center;
                flex-basis: 100%;
                justify-content: space-evenly;   
                font-size: 0.7em;
                color: var(--secondary-text-color);
                text-wrap: nowrap;
            }
            .clickable {
                cursor: pointer;
            }          
        `;
    }
    private _showMoreInfo(entityId: string) {
        const event = new CustomEvent("show-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId },
        });
        this.dispatchEvent(event);
    }
    render() {
        if (!this.device || !this.device.show_additional_info) {
            return nothing;
        }

        return html`
            <div class="container">
                <div class="info">
                    ${this._renderDeviceInfo(this.device)}
                </div>
            </div>
        `;
    }

    private _renderDeviceInfo(device: DeviceNode): TemplateResult | typeof nothing {
        const batteryConfig = device.deviceConfig as BatteryDeviceConfig;
        if (batteryConfig.entities.capacity)
            return this._renderBatteryInfo(device, batteryConfig)

        const solarConfig = device.deviceConfig as SolarDeviceConfig;
        if (solarConfig.entities.remaining_today_energy_forecast)
            return this._renderSolarInfo(device, solarConfig)

        const gridConfig = device.deviceConfig as GridDeviceConfig;
        if (gridConfig.entities.today_export || gridConfig.entities.today_import)
            return this._renderGridInfo(device, gridConfig)

        return nothing;
    }

    private _renderGridInfo(device: DeviceNode, gridConfig: GridDeviceConfig): TemplateResult | typeof nothing {
        if (!gridConfig.entities.today_export || !gridConfig.entities.today_import) {
            return nothing;
        }
        const todayImportState = this.hass.states[gridConfig.entities.today_import];
        const todayExportState = this.hass.states[gridConfig.entities.today_export];

        if (!todayImportState || !todayExportState) {
            return nothing;
        }
        const todayImport = parseFloat(todayImportState.state);
        const todayExport = parseFloat(todayExportState.state);

        if (isNaN(todayImport) || isNaN(todayExport)) {
            return nothing;
        }
        if (device.isSource) {
            return html`
                <span class="clickable" @click=${() => this._showMoreInfo(gridConfig.entities.today_import!)}>⚡ ${(todayImport).toFixed(1)} kWh</span>
            `;
        } else {
            return html`
                <span class="clickable" @click=${() => this._showMoreInfo(gridConfig.entities.today_export!)}>⚡ ${(todayExport).toFixed(1)} kWh</span>
            `;
        }


    }

    private _renderSolarInfo(device: DeviceNode, solarConfig: SolarDeviceConfig): TemplateResult | typeof nothing {
        if (!solarConfig.entities.today_energy || !solarConfig.entities.remaining_today_energy_forecast) {
            return nothing;
        }
        const todayEnergyWhState = this.hass.states[solarConfig.entities.today_energy];
        const forecastEnergyState = this.hass.states[solarConfig.entities.remaining_today_energy_forecast];

        if (!todayEnergyWhState || !forecastEnergyState) {
            return nothing;
        }
        const todayEnergyWh = parseFloat(todayEnergyWhState.state);
        const forecastEnergyWh = parseFloat(forecastEnergyState.state);

        if (isNaN(todayEnergyWh) || isNaN(forecastEnergyWh)) {
            return nothing;
        }

        return html`
            <span class="clickable" @click=${() => this._showMoreInfo(solarConfig.entities.today_energy!)}>⚡${(todayEnergyWh / 1000).toFixed(1)} kWh</span>
            <span class="clickable" @click=${() => this._showMoreInfo(solarConfig.entities.remaining_today_energy_forecast!)}>✨${(forecastEnergyWh / 1000).toFixed(1)} kWh</span>
        `;
    }

    private _renderBatteryInfo(device: DeviceNode, cfg: BatteryDeviceConfig): TemplateResult | typeof nothing {
        if (!device.powerHistory || device.powerHistory.length === 0) {
            return nothing;
        }
        const currentPowerW = device.powerHistory.reduce((a, b) => a + b, 0) / device.powerHistory.length;

        if (Math.abs(currentPowerW) < 1) return nothing; // Don't show if power is very low

        const { remaining_energy: battery_remaining_energy_entity_id, min_soc: battery_min_soc_entity_id, max_soc: battery_max_soc_entity_id, capacity: battery_capacity_entity_id } = cfg.entities;

        if (!battery_remaining_energy_entity_id || !battery_capacity_entity_id || !battery_min_soc_entity_id || !battery_max_soc_entity_id) {
            return nothing;
        }

        const currentEnergyWhState = this.hass.states[battery_remaining_energy_entity_id];
        const currentSoCState = this.hass.states[battery_capacity_entity_id];
        const minSoCState = this.hass.states[battery_min_soc_entity_id];
        const maxSoCState = this.hass.states[battery_max_soc_entity_id];

        if (!currentEnergyWhState || !currentSoCState || !minSoCState || !maxSoCState) return nothing;

        const currentEnergyWh = parseFloat(currentEnergyWhState.state);
        const currentSoC = parseFloat(currentSoCState.state);
        const minSoC = parseFloat(minSoCState.state);
        const maxSoC = parseFloat(maxSoCState.state);

        if (isNaN(currentEnergyWh) || isNaN(currentSoC) || isNaN(minSoC) || isNaN(maxSoC) || currentSoC === 0) return nothing;

        const totalCapacityWh = currentEnergyWh / (currentSoC / 100);
        const minCapacityWh = totalCapacityWh * (minSoC / 100);
        const maxCapacityWh = totalCapacityWh * (maxSoC / 100);

        let timeHours;
        let statusWord = "";
        let targetCapacity = 0;
        if (device.isSource) { // Discharging
            targetCapacity = minSoC;
            const remainingEnergyWh = currentEnergyWh - minCapacityWh;
            if (remainingEnergyWh <= 0) return html`<span>🪫</span>`;
            timeHours = remainingEnergyWh / currentPowerW;
            statusWord = "empty";
        } else { // Charging
            targetCapacity = maxSoC;
            const energyToFullWh = maxCapacityWh - currentEnergyWh;
            if (energyToFullWh <= 0) return html`<span>🔋</span>`;
            timeHours = energyToFullWh / currentPowerW;
            statusWord = "full";
        }

        if (timeHours <= 0) return nothing;

        const hours = Math.floor(timeHours);
        const minutes = Math.round((timeHours - hours) * 60);

        const targetDate = new Date(Date.now() + timeHours * 3600 * 1000);
        const targetTime = targetDate.toLocaleTimeString(this.hass.locale?.language || navigator.language, {
            hourCycle: 'h23',
            hour: '2-digit',
            minute: '2-digit',
        });
        return html`
            <span>${targetCapacity}% ➜</span>
            <span>🕓${targetTime}</span>
            <span>⏳${hours}:${minutes}</span>
        `;
    }



}
