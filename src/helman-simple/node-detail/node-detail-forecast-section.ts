import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload } from "../../helman-api";
import {
    getUnifiedForecastOverviewConfig,
    type UnifiedForecastOverviewConfig,
    type UnifiedForecastOverviewPreset,
} from "../../helman-forecast/unified-forecast-visibility";
import {
    getSharedForecastOwner,
    type SharedForecastOwner,
    type SharedForecastSnapshot,
} from "../../helman-forecast/shared-forecast-owner";
import type { LocalizeFunction } from "../../localize/localize";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";
import type { NodeType } from "./node-detail-types";
import "../../helman-forecast/helman-unified-forecast-detail";

const OVERVIEW_PRESET_BY_NODE_TYPE: Record<NodeType, UnifiedForecastOverviewPreset> = {
    battery: "battery",
    house: "house",
    solar: "solar",
    grid: "grid",
};

@customElement("node-detail-forecast-section")
export class NodeDetailForecastSection extends LitElement {
    static styles = [nodeDetailSharedStyles];

    private _forecastOwner?: SharedForecastOwner;
    private _unsubscribeForecastOwner?: () => void;

    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: String }) public nodeType!: NodeType;

    @state() private _hass?: HomeAssistant;
    @state() private _forecast: ForecastPayload | null = null;
    @state() private _isForecastLoading = false;
    @state() private _forecastLoadFailed = false;

    public get hass(): HomeAssistant | undefined {
        return this._hass;
    }

    public set hass(value: HomeAssistant | undefined) {
        const shouldReloadForecast = this._hass?.connection !== value?.connection;
        this._hass = value;
        if (shouldReloadForecast) {
            this._detachForecastOwner();
            this._resetForecastState();
        }
        if (this.isConnected) {
            this._syncForecastOwner();
        }
    }

    connectedCallback(): void {
        super.connectedCallback();
        this._syncForecastOwner();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._detachForecastOwner();
    }

    render() {
        if (!this._hass || !this.localize || !this.nodeType) {
            return nothing;
        }

        const overviewConfig = this._getOverviewConfig();

        return html`
            <div class="forecast-section">
                <helman-unified-forecast-detail
                    .hass=${this._hass}
                    .localize=${this.localize}
                    .forecast=${this._forecast}
                    .loading=${this._isForecastLoading}
                    .loadFailed=${this._forecastLoadFailed}
                    .overviewConfig=${overviewConfig}
                    .mobileDensity=${"comfortable"}
                    .showSectionTitle=${false}
                ></helman-unified-forecast-detail>
            </div>
        `;
    }

    private _getOverviewConfig(): UnifiedForecastOverviewConfig {
        return getUnifiedForecastOverviewConfig(OVERVIEW_PRESET_BY_NODE_TYPE[this.nodeType]);
    }

    private _resetForecastState(): void {
        this._forecast = null;
        this._isForecastLoading = false;
        this._forecastLoadFailed = false;
    }

    private _syncForecastOwner(): void {
        const hass = this._hass;
        if (!this.isConnected || !hass) {
            return;
        }

        const owner = getSharedForecastOwner(hass);
        if (this._forecastOwner === owner) {
            this._applyForecastSnapshot(owner.getSnapshot());
            return;
        }

        this._detachForecastOwner();
        this._forecastOwner = owner;
        this._applyForecastSnapshot(owner.getSnapshot());
        this._unsubscribeForecastOwner = owner.subscribe((snapshot) => {
            this._applyForecastSnapshot(snapshot);
        });
    }

    private _detachForecastOwner(): void {
        this._unsubscribeForecastOwner?.();
        this._unsubscribeForecastOwner = undefined;
        this._forecastOwner = undefined;
    }

    private _applyForecastSnapshot(snapshot: SharedForecastSnapshot): void {
        this._forecast = snapshot.forecast;
        this._isForecastLoading = snapshot.loading;
        this._forecastLoadFailed = snapshot.loadFailed;
    }
}
