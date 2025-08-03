import { LitElement, TemplateResult, css, html, nothing } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./DeviceNode";
import { BatteryDeviceConfig } from "./DeviceConfig";

@customElement("power-device-icon")
export class PowerDeviceIcon extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public device!: DeviceNode;
    static get styles() {
        return css`
            .switchIconPlaceholder {
                width: 40px;
                height: 40px;
                flex-shrink: 0;
                display:flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: var(--secondary-text-color);
                font-size:0.7em;
            }
            .clickable {
                cursor: pointer;
            }
            .disabled-icon {
                color: var(--disabled-text-color);
            }
            state-badge {
                cursor: pointer;
                flex-shrink: 0;
                position: relative;
                z-index: 2;
            }
        `;
    }
    private _fireToggleChildren() {
        this.dispatchEvent(new CustomEvent('toggle-children', { bubbles: true, composed: true }));
    }

    private _fireShowMoreInfo(entityId: string) {
        this.dispatchEvent(new CustomEvent('show-more-info', {
            bubbles: true,
            composed: true,
            detail: { entityId }
        }));
    }

    private _getBatteryIcon(capacity: number): string {
        if (capacity <= 10) {
            return 'mdi:battery-outline';
        }
        if (capacity > 90) {
            return 'mdi:battery';
        }
        const iconLevel = Math.floor(capacity / 10) * 10;
        return `mdi:battery-${iconLevel}`;
    }

    private _renderDeviceIcon(): TemplateResult {
        const battConfig = (this.device.deviceConfig as BatteryDeviceConfig);
        if (battConfig?.battery_capacity_entity_id) {
            const batteryCapacityState = this.hass.states[battConfig.battery_capacity_entity_id];
            if (batteryCapacityState) {
                const capacity = parseFloat(batteryCapacityState.state);
                const icon = this._getBatteryIcon(capacity);

                return html`
                    <div class="switchIconPlaceholder clickable" @click=${() => this._fireShowMoreInfo(battConfig.battery_capacity_entity_id!)}>
                        <ha-icon .icon=${icon} title="${capacity}%"></ha-icon>
                        <div>${capacity}%</div>
                    </div>
                `;
            }
        }
        return html`
            <div class="switchIconPlaceholder" @click=${this._fireToggleChildren}>
                <ha-icon .icon=${this.device.icon}></ha-icon>
            </div>
        `;
    }

    render(): TemplateResult | typeof nothing {
        const device = this.device;
        if (device.switchEntityId) {
            return html`
                <state-badge
                    .hass=${this.hass}
                    .stateObj=${this.hass!.states[device.switchEntityId]}
                    .stateColor=${true}
                    @click=${() => this._fireShowMoreInfo(device.switchEntityId!)}
                ></state-badge>
            `;
        }
        if (device.icon) {
            return this._renderDeviceIcon();
        }
        return html`<div class="switchIconPlaceholder"><ha-icon class="disabled-icon" icon="mdi:border-none-variant"></ha-icon></div>`;
    }


}
