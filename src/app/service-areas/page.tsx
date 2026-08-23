import { getServiceAreas, getServiceAreaBasePricing } from './actions';
import { getPricingRules } from '@/app/settings/actions';
import ServiceAreasClient from './ServiceAreasClient';
import {
  findBaseServiceArea,
  findMainPricingRule,
  findPricingRuleForServiceArea,
} from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Service Areas | UTO Admin Panel',
  description: 'Manage serviceable zones for UTO ride sharing.',
};

export default async function ServiceAreasPage() {
  const [areas, pricingRules] = await Promise.all([
    getServiceAreas(),
    getPricingRules(),
  ]);

  const baseArea = findBaseServiceArea(areas);
  const serviceAreaRule = findPricingRuleForServiceArea(pricingRules, baseArea?.id);
  const mainRule = findMainPricingRule(pricingRules);
  const table1 = serviceAreaRule || mainRule || null;

  // Never reuse Table 1's row id — Table 2 lives in a different table.
  const table1Seed = table1 ? { ...table1, id: undefined } : null;

  let table2: Record<string, unknown> | null = null;
  try {
    const rows = await getServiceAreaBasePricing(baseArea?.id ?? null);
    table2 = (rows[0] as Record<string, unknown> | undefined) ?? null;
  } catch (error) {
    console.error('service_area_base_pricing unavailable; seeding Table 2 from Table 1', error);
  }

  return (
    <ServiceAreasClient
      initialAreas={areas}
      initialPricingRule={table1}
      initialBaseRoutePricing={table2 ?? table1Seed}
      serviceAreaId={baseArea?.id ?? null}
    />
  );
}
