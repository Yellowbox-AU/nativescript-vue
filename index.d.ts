import {
    Page,
    NavigationEntry,
    BackstackEntry,
} from '@nativescript/core'
import { ItemEventData } from '@nativescript/core'
import { Frame } from '@nativescript/core'
import { View } from '@nativescript/core'
import { ShowModalOptions } from '@nativescript/core'
import { Vue, VueConstructor, VueConfiguration } from 'vue/types/vue'
import ElementNode from './platform/nativescript/renderer/ElementNode'

// ListView ItemEventData with the addition of the item property
export type NativeScriptVueItemEventData<T> = ItemEventData & { item: T }

// TODO: define fully.
type TargetFrame = any;

export interface NavigationEntryVue extends NavigationEntry {
    props?: Record<string, any>,
    frame?: TargetFrame,
    resolveOnEvent?: "navigatingTo" | "navigatedTo" | string
    // Page.navigatingToEvent | Page.navigatedToEvent
}

export type navigateTo = (
    component: Parameters<import('vue').CreateElement>[0],
    options?: NavigationEntryVue,
    cb?: () => Page,
) => Promise<Page>

export type navigateBack = (
    options?: {
        frame?: TargetFrame
    },
    backstackEntry?: BackstackEntry,
) => void

export interface ModalOptions extends Partial<ShowModalOptions> {
    target?: any; // optional Vue target to open the modal from
    props?: Record<string, any>;
}

// create a nativescript vue class that extends vue.js
export interface NativeScriptVue<V = View> extends Vue {
    nativeView: V
    $el: ElementNode

    $navigateTo: navigateTo
    $navigateBack: navigateBack

    $modal?: { close: (data?: any) => void };

    $showModal: (component: import('vue').ComponentOptions<Vue> | string, options?: ModalOptions) => Promise<any>;

    /**
     * starts the nativescript application
     */
    $start: () => void
}

export interface NativeScriptVueConstructor extends VueConstructor<NativeScriptVue>
{
    options: any

    navigateTo: navigateTo
    navigateBack: navigateBack
                                              
    /**
     * Registers NativeScript Plugin.
     * @param elementName Name of the element to use in your template
     * @param resolver  function to register the element
     * @param meta meta associated with the element
     */
    registerElement: (elementName: string, resolver: Function, meta?: any) => void
                                              
    config: NativeScriptVueConfiguration
}

interface NativeScriptVueConfiguration extends VueConfiguration {
  suppressRenderLogs: boolean;
}

export const NativeScriptVue: NativeScriptVueConstructor

// export as namespace NativeScriptVue;
export default NativeScriptVue;
