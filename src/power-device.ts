import { LitElement, TemplateResult, css, html, nothing } from "lit-element";
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sortDevicesByPowerAndName } from "./energy-data-helper";
import { DeviceNode } from "./DeviceNode";
import "./power-device";

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
                border-radius: 10px;
                transition: box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out, opacity 0.3s ease-in-out;
                position: relative;
                
                overflow: hidden; /* Prevents overflow if children are too wide */
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
            .deviceChildren {
                flex-basis: 100%;
                flex-wrap: wrap;
                padding-left: 20px; /* Aligns with the device name */
                gap: 5px; /* Optional: adds some space between children */
            }
            .deviceChildren.full-width {
                display: flex;
                flex-wrap: wrap;
                gap: 5px; /* Optional: adds some space between children */
            }
            .deviceChildren.full-width > power-device {
                flex-grow: 1;
                flex-basis: 0;
                min-width: 150px; /* Optional: prevent children from becoming too small */
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
    deviceIcon() {
        if (this.device.battery_capacity_entity_id) {
            const batteryCapacity = this.hass.states[this.device.battery_capacity_entity_id];
            if (batteryCapacity) {
                const capacity = parseFloat(batteryCapacity.state);
                if (capacity <= 10) {
                    this.device.icon = 'mdi:battery-outline';
                } else if (capacity > 90) {
                    this.device.icon = 'mdi:battery';
                } else {
                    const iconLevel = Math.floor(capacity / 10) * 10;
                    this.device.icon = `mdi:battery-${iconLevel}`;
                }
                return html`
                        <div class="switchIconPlaceholder" @click=${() => this._showMoreInfo(this.device.battery_capacity_entity_id!)} style="cursor: pointer;">
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

        let currentParentPower = this.currentParentPower;
        let powerDisplay = html`<span class="powerDisplay">No power sensor found</span>`;
        let iconDisplay: TemplateResult | typeof nothing = nothing;

        if (device.switchEntityId) {
            iconDisplay = html`
                <state-badge
                    .hass=${this.hass}
                    .stateObj=${this.hass!.states[device.switchEntityId]}
                    .stateColor=${true}
                    @click=${() => this._showMoreInfo(device.switchEntityId!)}
                ></state-badge>
            `;
        } else if (device.icon) {
            iconDisplay = this.deviceIcon();
        } else {
            iconDisplay = html`<div class="switchIconPlaceholder"><ha-icon icon="mdi:border-none-variant" style=" color: var(--disabled-text-color);"></ha-icon></div>`;
        }

        const hasChildren = device.children.length > 0;
        const indicator = hasChildren ? (this._childrenHidden ? '►' : '▼') : '';

        const currentPower = this.device.powerValue ?? 0;
        const isOff = currentPower === 0;
        let percentageDisplay: TemplateResult | typeof nothing = nothing;
        let currentPercentage = 0;
        let onPowerClick: () => void = () => false;

        if (device.powerSensorId) {
            onPowerClick = () => this._showMoreInfo(device.powerSensorId!)
        }

        if (!currentParentPower || currentParentPower == 0) {
            currentParentPower = currentPower; // If no parent power, use current power as reference
        }

        currentPercentage = (currentParentPower > 0) ? (currentPower / currentParentPower) * 100 : 0;
        percentageDisplay = html`<span class=powerPercentages> (${Math.round(currentPercentage).toFixed(0)}%)</span>`;

        powerDisplay = html`<div class="powerDisplay ${device.powerSensorId ? 'has-sensor' : ''}" @click=${onPowerClick}><div>${percentageDisplay}</div><div style="text-wrap: nowrap;">${currentPower.toFixed(0)} W</div></div>`;


        const historyToRender = this.device.powerHistory;
        const maxHistoryPower = this.parentPowerHistory ? Math.max(...this.parentPowerHistory) : Math.max(...historyToRender);
        const childrenToRender = device.sortChildrenByPower ? (device.children.length > 0 ? sortDevicesByPowerAndName(device.children) : []) : device.children;

        // Determine the color for history bars
        const historyBarColor = device.color ?? 'rgba(var(--rgb-accent-color), 0.13)';
        const deviceContent = device.hideNode ? nothing : html`
                <div class="deviceContent ${isOff ? 'is-off' : ''}" style=${isExpanded ? "":"height: 100%;"}>
                    <div class="historyContainer">
                        ${historyToRender.map((p, i) => {
            const hPercentage = maxHistoryPower && maxHistoryPower > 0 ? (p / maxHistoryPower) * 100 : 0;
            const sourceHistory = this.device.sourcePowerHistory?.[i];
            const hasSourceHistory = !device.isSource && sourceHistory && Object.keys(sourceHistory).length > 0;

            return html`
                                <div class="historyBarContainer" style="height: ${Math.min(100, hPercentage)}%;">
                                    ${hasSourceHistory ?
                    Object.values(sourceHistory).map(s => {
                        const segmentPercentage = p > 0 ? (s.power / p) * 100 : 0;
                        return html`<div class="historyBarSegment" style="height: ${segmentPercentage}%; background-color: ${s.color};"></div>`;
                    }) :
                    html`<div class="historyBarSegment" style="height: 100%; background-color: ${historyBarColor};"></div>`
                }
                                </div>`;
        })}
                    </div>
                    ${iconDisplay}
                    <div class="deviceName ${hasChildren ? 'has-children' : ''}" @click=${this._toggleChildren}>${device.name} ${indicator}</div>
                    ${powerDisplay}
                </div>
                
        `
        return html`
            <div class="device">
                ${deviceContent}
                ${isExpanded ? html`
                    <div class="deviceChildren ${device.children_full_width ? 'full-width' : ''}" style="display: ${device.children_full_width ? 'block' : 'flex'};">
                        ${childrenToRender.map((child, idx) => keyed(`${device.name}-${child.name}`, html`
                            <power-device
                                .hass=${this.hass}
                                .device=${child}
                                .currentParentPower=${currentPower}
                                .parentPowerHistory=${historyToRender}
                                .historyBuckets=${this.historyBuckets}
                                .historyBucketDuration=${this.historyBucketDuration}
                            ></power-device>
                        `))}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}