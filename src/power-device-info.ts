import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { DeviceNode } from "./DeviceNode";
import { nothing, TemplateResult } from "lit-html";
import { BatteryDeviceConfig } from "./DeviceConfig";
import type { HomeAssistant } from "../hass-frontend/src/types";

@customElement("power-device-info")
export class PowerDeviceInfo extends LitElement {
    @property({ type: Array }) devices: (DeviceNode | undefined)[] = [];
    @property({ attribute: false }) public hass!: HomeAssistant;

    static get styles() {
        return css`
            .container {
                display: flex;
                flex-direction: row;
                gap: 5px;
                justify-content: space-evenly;
            }
            .item-container {
                flex: 1;
                min-width: 0;
           //     text-align: center;
            }
            .battery-info {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .remaining-time {
                font-size: 0.8em;
                color: var(--secondary-text-color);
            }
        `;
    }

    render() {
        if (!this.devices || this.devices.length === 0) {
            return nothing;
        }
        return html`
            <div class="container">
                ${this.devices.map((device) => {
                    if (!device) {
                        return html`<div class="item-container"></div>`;
                    }
                    const batteryConfig = device.deviceConfig as BatteryDeviceConfig;
                    return html`
                        <div class="item-container">
                            ${batteryConfig.battery_capacity_entity_id
                                ? this._renderBatteryInfo(device, batteryConfig)
                                : nothing}
                        </div>
                    `;
                })}
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
        if (currentPowerW > 0) { // Discharging
            const remainingEnergyWh = currentEnergyWh - minCapacityWh;
            if (remainingEnergyWh <= 0) return "Empty";
            timeHours = remainingEnergyWh / currentPowerW;
        } else { // Charging
            const energyToFullWh = maxCapacityWh - currentEnergyWh;
            if (energyToFullWh <= 0) return "Full";
            timeHours = energyToFullWh / -currentPowerW;
        }

        if (timeHours <= 0) return null;

        const hours = Math.floor(timeHours);
        const minutes = Math.round((timeHours - hours) * 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}
