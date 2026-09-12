/**
 * Google Play hands RevenueCat a subscription as `<productId>:<basePlanId>`;
 * the app's PRODUCT_IDS are the bare ids. If the two are ever compared raw,
 * the paywall shows hard-coded fallback prices and purchases take the
 * deprecated purchaseProduct() path — quietly, in production, only on
 * Android. These pin the bare-id handling on every seam.
 */
import type { PurchasesPackage } from 'react-native-purchases';
import { bareProductId, findPackage, indexPrices } from '@/lib/billing';

const pkg = (identifier: string, productId: string, priceString: string): PurchasesPackage =>
  ({ identifier, product: { identifier: productId, priceString } }) as unknown as PurchasesPackage;

describe('bareProductId', () => {
  it('strips a Play base-plan suffix and leaves bare ids alone', () => {
    expect(bareProductId('atleato_pro_monthly:monthly')).toBe('atleato_pro_monthly');
    expect(bareProductId('atleato_pro_monthly')).toBe('atleato_pro_monthly');
    expect(bareProductId(':weird')).toBe(':weird');
  });
});

describe('indexPrices', () => {
  it('keys each price by the raw store identifier AND the bare product id', () => {
    const prices = indexPrices([pkg('pro_monthly', 'atleato_pro_monthly:monthly', '$9.99')]);
    expect(prices['atleato_pro_monthly:monthly']).toBe('$9.99');
    expect(prices['atleato_pro_monthly']).toBe('$9.99');
  });

  it('does not let a second base plan overwrite the bare key', () => {
    const prices = indexPrices([
      pkg('pro_monthly', 'atleato_pro_monthly:monthly', '$9.99'),
      pkg('pro_monthly_promo', 'atleato_pro_monthly:promo', '$4.99'),
    ]);
    expect(prices['atleato_pro_monthly']).toBe('$9.99');
    expect(prices['atleato_pro_monthly:promo']).toBe('$4.99');
  });

  it('skips packages with no product or no price', () => {
    expect(indexPrices([{ identifier: 'x' } as unknown as PurchasesPackage])).toEqual({});
  });
});

describe('findPackage', () => {
  const packages = [
    pkg('pro_monthly', 'atleato_pro_monthly:monthly', '$9.99'),
    pkg('legend_yearly', 'atleato_legend_yearly:yearly', '$191.90'),
  ];

  it('matches by RevenueCat package identifier', () => {
    expect(findPackage(packages, 'legend_yearly')?.identifier).toBe('legend_yearly');
  });

  it('matches a bare product id against a suffixed store identifier', () => {
    expect(findPackage(packages, 'atleato_pro_monthly')?.identifier).toBe('pro_monthly');
  });

  it('matches a suffixed id exactly', () => {
    expect(findPackage(packages, 'atleato_legend_yearly:yearly')?.identifier).toBe('legend_yearly');
  });

  it('returns undefined for an unknown id so the caller can fall back', () => {
    expect(findPackage(packages, 'atleato_pro_yearly')).toBeUndefined();
  });
});
