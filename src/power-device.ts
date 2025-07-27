import { LitElement, TemplateResult, css, html, nothing } from "lit-element";
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sortDevicesByPowerAndName } from "./energy-data-helper";
import { DeviceNode } from "./DeviceNode";
import "./power-device";
import "./power-devices-container";

@customElement("power-device")
export class PowerDevice extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public device!: DeviceNode;
    @property({ type: Number }) public currentParentPower?: number;
    @property({ type: Number }) public historyBuckets!: number;
    @property({ type: Number }) public historyBucketDuration!: number;
    @property({ attribute: false }) public parentPowerHistory?: number[];

    @state() private _childrenHidden = true;



    firstUpdated() {
        this._childrenHidden = this.device.childrenHidden ?? true; // Default to true if not set
    }


    disconnectedCallback(): void {
        super.disconnectedCallback();

    }

    private _showMoreInfo(entityId: string) {
        const event = new CustomEvent("hass-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId },
        });
        this.dispatchEvent(event);
    }

    private _toggleChildren() {
        if (this.device.children.length > 0) {
            this._childrenHidden = !this._childrenHidden;
            this.device.childrenHidden = this._childrenHidden; // Update the device state to reflect the visibility
        }
    }

    static get styles() {
        return css`
            :host([is-expanded]) {
                flex-basis: 100%;
                width: 100%;            
            }
            :host(:not([is-expanded])) {
                flex-basis: 0;
                flex-grow: 1;
                flex-shrink: 1;
            }            
            .switchIconPlaceholder {
                width: 40px;
                height: 40px;
                flex-shrink: 0;
                display:inline-flex;
                align-items: center;
                justify-content: center;
            }
            .device {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                margin-top: 3px;
                position: relative;
                height: 100%;
            }
            .deviceContent {
                display: flex;
                align-items: center;
                flex-basis: 100%;
                min-width: 0; /* Prevents text overflow issues */
                box-shadow: 0 2px 7px rgba(0,0,0,0.8);
                border-radius: var(--ha-card-border-radius, 12px);
                border-width: var(--ha-card-border-width, 1px);
                border-style: solid;
                border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));

                transition: box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out, opacity 0.3s ease-in-out;
                position: relative;
                height: 100%;
                overflow: hidden; /* Prevents overflow if children are too wide */
            }
            :host([is-expanded]) .deviceContent {
                height: auto;
            }
            
            .deviceContent.is-off {
                opacity: 0.6;
            }

            .deviceContent:hover {
                box-shadow: 0 4px 14px rgba(0,0,0,0.8);
                transform: scale(1.01);
            }
            .deviceName {
                flex-grow: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-left: 0px;
                position: relative;
                z-index: 2;
                text-shadow: 0px 0px 4px rgba(0,0,0,1);
            }
            .deviceName.has-children {
                cursor: pointer;
            }
            .powerDisplay {
                margin-left: auto; /* Aligns to the right */
                padding-left: 8px; /* Adds space between name and power */
                padding-right: 8px; /* Adds space between power and right edge */
                position: relative;
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                align-items: center;
                z-index: 2;
                text-shadow: 0px 0px 4px rgba(0,0,0,1);
            }
            .powerDisplay.has-sensor{
                cursor: pointer;
            }
            .clickable {
                cursor: pointer;
            }
            .no-wrap {
                text-wrap: nowrap;
            }
            .disabled-icon {
                color: var(--disabled-text-color);
            }
            .powerPercentages{
                font-size: 0.7em;
                margin-right: 4px; /* Adds space between percentage and power value */
            }
            state-badge {
                cursor: pointer;
                flex-shrink: 0;
                position: relative;
                z-index: 2;
            }
            .historyContainer {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                flex-direction: row;
                align-items: flex-end;
                pointer-events: none;
                overflow: hidden;
                border-radius: 10px;
                z-index: 1;
            }
            .historyBarContainer {
                flex-grow: 1;
                display: flex;
                flex-direction: column-reverse; /* To stack from bottom up */
            }
            .historyBarSegment {
                width: 100%;
            }
        `;
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

    private _renderIcon(): TemplateResult | typeof nothing {
        const device = this.device;
        if (device.switchEntityId) {
            return html`
                <state-badge
                    .hass=${this.hass}
                    .stateObj=${this.hass!.states[device.switchEntityId]}
                    .stateColor=${true}
                    @click=${() => this._showMoreInfo(device.switchEntityId!)}
                ></state-badge>
            `;
        }
        if (device.icon) {
            return this.deviceIcon();
        }
        return html`<div class="switchIconPlaceholder"><ha-icon class="disabled-icon" icon="mdi:border-none-variant"></ha-icon></div>`;
    }

    private _renderPowerDisplay(): TemplateResult {
        const device = this.device;
        const currentPower = device.powerValue ?? 0;
        let parentPower = this.currentParentPower;

        if (!parentPower || parentPower === 0) {
            parentPower = currentPower; // If no parent power, use current power as reference
        }

        const currentPercentage = (parentPower > 0) ? (currentPower / parentPower) * 100 : 0;
        const percentageDisplay = html`<span class=powerPercentages> (${Math.round(currentPercentage).toFixed(0)}%)</span>`;

        const onPowerClick = device.powerSensorId
            ? () => this._showMoreInfo(device.powerSensorId!)
            : () => { }; // No-op if no sensor

        return html`<div class="powerDisplay ${device.powerSensorId ? 'has-sensor' : ''}" @click=${onPowerClick}><div>${percentageDisplay}</div><div class="no-wrap">${currentPower.toFixed(0)} W</div></div>`;
    }

    private _renderHistoryBars(historyToRender: number[], maxHistoryPower: number, historyBarColor: string): TemplateResult {
        return html`
            <div class="historyContainer">
                ${historyToRender.map((p, i) => {
            const hPercentage = maxHistoryPower && maxHistoryPower > 0 ? (p / maxHistoryPower) * 100 : 0;
            const sourceHistory = this.device.sourcePowerHistory?.[i];
            const hasSourceHistory = !this.device.isSource && sourceHistory && Object.keys(sourceHistory).length > 0;

            return html`
                        <div class="historyBarContainer" style="height: ${Math.min(100, hPercentage)}%;">
                            ${hasSourceHistory
                    ? Object.values(sourceHistory).map(s => {
                        const segmentPercentage = p > 0 ? (s.power / p) * 100 : 0;
                        return html`<div class="historyBarSegment" style="height: ${segmentPercentage}%; background-color: ${s.color};"></div>`;
                    })
                    : html`<div class="historyBarSegment" style="height: 100%; background-color: ${historyBarColor};"></div>`
                }
                        </div>`;
        })}
            </div>
        `;
    }

    private _renderChildren(children: DeviceNode[], currentPower: number, historyToRender: number[]): TemplateResult {
        const device = this.device;
        return html`
            <power-devices-container
                .hass=${this.hass}
                .devices=${children}
                .currentParentPower=${currentPower}
                .parentPowerHistory=${historyToRender}
                .historyBuckets=${this.historyBuckets}
                .historyBucketDuration=${this.historyBucketDuration}
                .devices_full_width=${device.children_full_width}
            ></power-devices-container>
        `;
    }

    deviceIcon() {
        if (this.device.battery_capacity_entity_id) {
            const batteryCapacityState = this.hass.states[this.device.battery_capacity_entity_id];
            if (batteryCapacityState) {
                const capacity = parseFloat(batteryCapacityState.state);
                this.device.icon = this._getBatteryIcon(capacity);

                return html`
                        <div class="switchIconPlaceholder clickable" @click=${() => this._showMoreInfo(this.device.battery_capacity_entity_id!)}>
                            <ha-icon .icon=${this.device.icon} title="${capacity}%"></ha-icon>
                        </div>
                    `
            }
        }
        return html`
                <div class="switchIconPlaceholder" @click=${this._toggleChildren}>
                    <ha-icon .icon=${this.device.icon}></ha-icon>
                </div>
            `
    }

    render() {
        const device = this.device;
        if (device.isUnmeasured && (device.powerValue == undefined || device.powerValue < 1)) {
            return nothing; // Do not render unmeasured devices with power < 1W
        }

        const isExpanded = !this._childrenHidden && device.children.length > 0;
        if (isExpanded) {
            this.setAttribute('is-expanded', '');
        } else {
            this.removeAttribute('is-expanded');
        }

        const powerDisplay = this._renderPowerDisplay();
        const iconDisplay = this._renderIcon();

        const hasChildren = device.children.length > 0;
        const indicator = hasChildren ? (this._childrenHidden ? '►' : '▼') : '';

        const currentPower = this.device.powerValue ?? 0;
        const isOff = currentPower === 0;

        const historyToRender = this.device.powerHistory;
        const maxHistoryPower = this.parentPowerHistory ? Math.max(...this.parentPowerHistory) : Math.max(...historyToRender);
        const childrenToRender = device.sortChildrenByPower ? (device.children.length > 0 ? sortDevicesByPowerAndName(device.children) : []) : device.children;

        // Determine the color for history bars
        const historyBarColor = device.color ?? 'rgba(var(--rgb-accent-color), 0.13)';
        const historyBars = this._renderHistoryBars(historyToRender, maxHistoryPower, historyBarColor);
        const deviceContent = device.hideNode ? nothing : html`
                <div class="deviceContent ${isOff ? 'is-off' : ''}">
                    ${historyBars}
                    ${iconDisplay}
                    <div class="deviceName ${hasChildren ? 'has-children' : ''}" @click=${this._toggleChildren}>${device.name} ${indicator}</div>
                    ${powerDisplay}
                </div>
                
        `
        return html`
            <div class="device">
                ${deviceContent}
                ${isExpanded ? this._renderChildren(childrenToRender, currentPower, historyToRender) : nothing}
            </div>
        `;
    }
}