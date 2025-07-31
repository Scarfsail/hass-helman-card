import { LitElement, TemplateResult, css, html, nothing } from "lit-element";
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sortDevicesByPowerAndName } from "./energy-data-helper";
import { DeviceNode } from "./DeviceNode";
import "./power-device";
import "./power-devices-container";
import "./power-device-history-bars";
import "./power-device-icon";

@customElement("power-device")
export class PowerDevice extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public device!: DeviceNode;
    @property({ type: Number }) public currentParentPower?: number;
    @property({ type: Number }) public historyBuckets!: number;
    @property({ type: Number }) public historyBucketDuration!: number;
    @property({ attribute: false }) public parentPowerHistory?: number[];

    @state() private _childrenCollapsed = true;



    firstUpdated() {
        this._childrenCollapsed = this.device.childrenCollapsed ?? true; // Default to true if not set
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
            this._childrenCollapsed = !this._childrenCollapsed;
            this.device.childrenCollapsed = this._childrenCollapsed; // Update the device state to reflect the visibility
        }
    }

    static get styles() {
        return css`
            :host([is-expanded]) {
                flex-basis: 100%;
                width: 100%;
                height: 100%;
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
                position: relative;
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
            .childrenContainer{
                padding-left: 10px;
                width:100%;
            }
        `;
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

        return html`<div class="powerDisplay ${device.powerSensorId ? 'has-sensor' : ''}" @click=${onPowerClick} style="${this.device.compact ? 'flex-direction: column; align-items: center;' : ''}">
                        <div>${percentageDisplay}</div>
                        <div class="no-wrap">${currentPower.toFixed(0)} W</div>
                    </div>`;
    }

    private _renderChildren(children: DeviceNode[], currentPower: number, historyToRender: number[]): TemplateResult {
        const device = this.device;
        return html`
            <div class="childrenContainer">
                <power-devices-container
                    .hass=${this.hass}
                    .devices=${children}
                    .currentParentPower=${currentPower}
                    .parentPowerHistory=${historyToRender}
                    .historyBuckets=${this.historyBuckets}
                    .historyBucketDuration=${this.historyBucketDuration}
                    .devices_full_width=${device.children_full_width}
                    .sortChildrenByPower=${device.sortChildrenByPower}
                ></power-devices-container>
            </div>
        `;
    }

    render() {
        const device = this.device;
        if (device.isUnmeasured && (device.powerValue == undefined || device.powerValue < 1)) {
            return nothing; // Do not render unmeasured devices with power < 1W
        }

        const isExpanded = !this._childrenCollapsed && device.children.length > 0;
        if (!this.device.hideChildren) {
            if (isExpanded) {
                this.setAttribute('is-expanded', '');
            } else {
                this.removeAttribute('is-expanded');
            }
        }

        const powerDisplay = this._renderPowerDisplay();
        const iconDisplay = html`<power-device-icon 
                                    .hass=${this.hass} 
                                    .device=${this.device}
                                    @toggle-children=${this._toggleChildren}
                                    @show-more-info=${(e: CustomEvent) => this._showMoreInfo(e.detail.entityId)}
                                 ></power-device-icon>`;

        const hasChildren = device.children.length > 0 && !device.hideChildrenIndicator;
        const indicator = hasChildren ? (this._childrenCollapsed ? '►' : '▼') : '';

        const currentPower = this.device.powerValue ?? 0;
        const isOff = currentPower === 0;

        const historyToRender = this.device.powerHistory;
        const maxHistoryPower = this.parentPowerHistory ? Math.max(...this.parentPowerHistory) : Math.max(...historyToRender);
        const childrenToRender = device.children;

        // Determine the color for history bars
        const historyBarColor = device.color ?? 'rgba(var(--rgb-accent-color), 0.13)';
        const historyBars = html`<power-device-history-bars 
                                    .device=${this.device}
                                    .historyToRender=${historyToRender}
                                    .maxHistoryPower=${maxHistoryPower}
                                    .historyBarColor=${historyBarColor}>
                                 </power-device-history-bars>`;
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
                ${isExpanded && !this.device.hideChildren ? this._renderChildren(childrenToRender, currentPower, historyToRender) : nothing}
            </div>
        `;
    }
}