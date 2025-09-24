import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { DeviceNode } from "./DeviceNode";
import { nothing, TemplateResult } from "lit-html";
import { BatteryDeviceConfig, GridDeviceConfig, SolarDeviceConfig } from "./DeviceConfig";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sharedStyles } from "./shared-styles";
import { convertToKWh, getDisplayEnergyUnit } from "./energy-unit-converter";

@customElement("power-device-info")
export class PowerDeviceInfo extends LitElement {
    @property({ attribute: false }) device!: DeviceNode;
    @property({ attribute: false }) public hass!: HomeAssistant;

    static get styles() {
        return [sharedStyles, css`
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
                white-space: nowrap;
            }

            .custom-labels {
                font-style: italic;
                opacity: 0.8;
                justify-content: left;
            }


        `];
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
        if (!this.device) {
            return nothing;
        }

        const hasAdditionalInfo = this.device.show_additional_info;
        const hasCustomLabels = this.device.customLabelTexts && this.device.customLabelTexts.length > 0;

        if (!hasAdditionalInfo && !hasCustomLabels) {
            return nothing;
        }

        return html`
            <div class="container">
                ${hasAdditionalInfo ? html`
                    <div class="info">
                        ${this._renderDeviceInfo(this.device)}
                    </div>
                ` : nothing}
                ${hasCustomLabels ? html`
                    <div class="info custom-labels">
                        ${this.device.customLabelTexts!.join(' • ')}
                    </div>
                ` : nothing}
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
        const todayImportRaw = parseFloat(todayImportState.state);
        const todayExportRaw = parseFloat(todayExportState.state);

        if (isNaN(todayImportRaw) || isNaN(todayExportRaw)) {
            return nothing;
        }

        // Convert to kWh using unit detection
        const todayImportKWh = convertToKWh(todayImportRaw, todayImportState.attributes.unit_of_measurement);
        const todayExportKWh = convertToKWh(todayExportRaw, todayExportState.attributes.unit_of_measurement);

        if (device.isSource) {
            const importDisplay = getDisplayEnergyUnit(todayImportKWh);
            return html`
                <span class="clickable" @click=${() => this._showMoreInfo(gridConfig.entities.today_import!)}>⚡ ${importDisplay.value.toFixed(1)} <span class="units">${importDisplay.unit}</span></span>
            `;
        } else {
            const exportDisplay = getDisplayEnergyUnit(todayExportKWh);
            return html`
                <span class="clickable" @click=${() => this._showMoreInfo(gridConfig.entities.today_export!)}>⚡ ${exportDisplay.value.toFixed(1)} <span class="units">${exportDisplay.unit}</span></span>
            `;
        }
    }

    private _renderSolarInfo(device: DeviceNode, solarConfig: SolarDeviceConfig): TemplateResult | typeof nothing {
        if (!solarConfig.entities.today_energy || !solarConfig.entities.remaining_today_energy_forecast) {
            return nothing;
        }
        const todayEnergyState = this.hass.states[solarConfig.entities.today_energy];
        const forecastEnergyState = this.hass.states[solarConfig.entities.remaining_today_energy_forecast];

        if (!todayEnergyState || !forecastEnergyState) {
            return nothing;
        }
        const todayEnergyRaw = parseFloat(todayEnergyState.state);
        const forecastEnergyRaw = parseFloat(forecastEnergyState.state);

        if (isNaN(todayEnergyRaw) || isNaN(forecastEnergyRaw)) {
            return nothing;
        }

        // Convert to kWh using unit detection
        const todayEnergyKWh = convertToKWh(todayEnergyRaw, todayEnergyState.attributes.unit_of_measurement);
        const forecastEnergyKWh = convertToKWh(forecastEnergyRaw, forecastEnergyState.attributes.unit_of_measurement);

        // Get appropriate display units
        const todayDisplay = getDisplayEnergyUnit(todayEnergyKWh);
        const forecastDisplay = getDisplayEnergyUnit(forecastEnergyKWh);

        return html`
            <span class="clickable" @click=${() => this._showMoreInfo(solarConfig.entities.today_energy!)}>⚡${todayDisplay.value.toFixed(1)} <span class="units">${todayDisplay.unit}</span></span>
            <span class="clickable" @click=${() => this._showMoreInfo(solarConfig.entities.remaining_today_energy_forecast!)}>✨${forecastDisplay.value.toFixed(1)} <span class="units">${forecastDisplay.unit}</span></span>
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
