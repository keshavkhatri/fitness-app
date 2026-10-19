import { InjectionToken } from '@angular/core';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from '@revenuecat/purchases-capacitor';

/**
 * The few RevenueCat calls the app uses, as an interface. The real SDK is loaded the first time it is needed
 * (so it isn't part of the app's startup bundle and never loads on the web or in tests), and specs provide a fake.
 */
export interface RevenueCatSdk {
  configure(options: { apiKey: string }): Promise<void>;
  getOfferings(): Promise<PurchasesOfferings>;
  purchasePackage(options: { aPackage: PurchasesPackage }): Promise<{ customerInfo: CustomerInfo }>;
  getCustomerInfo(): Promise<{ customerInfo: CustomerInfo }>;
  restorePurchases(): Promise<{ customerInfo: CustomerInfo }>;
  addCustomerInfoUpdateListener(listener: (customerInfo: CustomerInfo) => void): Promise<string>;
}

const loadPurchases = () => import('@revenuecat/purchases-capacitor').then((m) => m.Purchases);

export const REVENUECAT_SDK = new InjectionToken<RevenueCatSdk>('REVENUECAT_SDK', {
  providedIn: 'root',
  factory: () => ({
    configure: async (options) => (await loadPurchases()).configure(options),
    getOfferings: async () => (await loadPurchases()).getOfferings(),
    purchasePackage: async (options) => (await loadPurchases()).purchasePackage(options),
    getCustomerInfo: async () => (await loadPurchases()).getCustomerInfo(),
    restorePurchases: async () => (await loadPurchases()).restorePurchases(),
    addCustomerInfoUpdateListener: async (listener) => (await loadPurchases()).addCustomerInfoUpdateListener(listener),
  }),
});
