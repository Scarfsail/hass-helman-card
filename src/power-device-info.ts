import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { DeviceNode } from "./DeviceNode";
import { nothing, TemplateResult } from "lit-html";
import { BatteryDeviceConfig } from "./DeviceConfig";
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
            .battery-info {
                display: flex;
                flex-direction: row;
                align-items: center;
                flex-basis: 100%;                
                font-size: 0.8em;
            }
            .remaining-time {
                //font-size: 0.8em;
                margin-left: auto;
                color: var(--secondary-text-color);
            }
        `;
    }

    render() {
        if (!this.device || !this.device.show_additional_info) {
            return nothing;
        }
        const batteryConfig = this.device.deviceConfig as BatteryDeviceConfig;
        
        return html`
            <div class="container">
                ${batteryConfig.battery_capacity_entity_id
                    ? this._renderBatteryInfo(this.device, batteryConfig)
                    : nothing}
            </div>
        `;
    }

    private _renderBatteryInfo(device:DeviceNode, cfg: BatteryDeviceConfig): TemplateResult | typeof nothing { 
        if (!cfg.battery_capacity_entity_id)
            return nothing;

        const remainingTime = this._calculateRemainingTime(device, cfg);

        return html`
            <div class="battery-info">
                <span>${this.hass.states[cfg.battery_capacity_entity_id]?.state}%</span>
                ${remainingTime ? html`<span class="remaining-time">${remainingTime}</span>` : nothing}
            </div>
        `;
    }

    private _calculateRemainingTime(device: DeviceNode, cfg: BatteryDeviceConfig): string | null {
        if (!device.powerHistory || device.powerHistory.length === 0) {
            return null;
        }
        const currentPowerW = device.powerHistory.reduce((a, b) => a + b, 0) / device.powerHistory.length;

        if (Math.abs(currentPowerW) < 1) return null; // Don't show if power is very low

        const { battery_remaining_energy_entity_id, battery_min_soc_entity_id, battery_max_soc_entity_id, battery_capacity_entity_id } = cfg;

        if (!battery_remaining_energy_entity_id || !battery_capacity_entity_id || !battery_min_soc_entity_id || !battery_max_soc_entity_id) {
            return null;
        }

        const currentEnergyWhState = this.hass.states[battery_remaining_energy_entity_id];
        const currentSoCState = this.hass.states[battery_capacity_entity_id];
        const minSoCState = this.hass.states[battery_min_soc_entity_id];
        const maxSoCState = this.hass.states[battery_max_soc_entity_id];

        if (!currentEnergyWhState || !currentSoCState || !minSoCState || !maxSoCState) return null;

        const currentEnergyWh = parseFloat(currentEnergyWhState.state);
        const currentSoC = parseFloat(currentSoCState.state);
        const minSoC = parseFloat(minSoCState.state);
        const maxSoC = parseFloat(maxSoCState.state);

        if (isNaN(currentEnergyWh) || isNaN(currentSoC) || isNaN(minSoC) || isNaN(maxSoC) || currentSoC === 0) return null;

        const totalCapacityWh = currentEnergyWh / (currentSoC / 100);
        const minCapacityWh = totalCapacityWh * (minSoC / 100);
        const maxCapacityWh = totalCapacityWh * (maxSoC / 100);

        let timeHours;
        let statusWord = "";
        let targetCapacity = 0;
        if (device.isSource) { // Discharging
            targetCapacity = minSoC;
            const remainingEnergyWh = currentEnergyWh - minCapacityWh;
            if (remainingEnergyWh <= 0) return "Empty";
            timeHours = remainingEnergyWh / currentPowerW;
            statusWord = "empty";
        } else { // Charging
            targetCapacity = maxSoC;
            const energyToFullWh = maxCapacityWh - currentEnergyWh;
            if (energyToFullWh <= 0) return "Full";
            timeHours = energyToFullWh / currentPowerW;
            statusWord = "full";
        }

        if (timeHours <= 0) return null;

        const hours = Math.floor(timeHours);
        const minutes = Math.round((timeHours - hours) * 60);

        const targetDate = new Date(Date.now() + timeHours * 3600 * 1000);
        const targetTime = targetDate.toLocaleTimeString(this.hass.locale?.language || navigator.language, {
            hour: '2-digit',
            minute: '2-digit',
        });
        return `${targetTime} ➜ ${targetCapacity}%`;
    }
}
