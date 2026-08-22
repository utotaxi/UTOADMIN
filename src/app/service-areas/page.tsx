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
  let baseRouteRows: Record<string, unknown>[] = [];
  try {
    baseRouteRows = await getServiceAreaBasePricing(baseArea?.id ?? null);
  } catch (err) {
    console.error('Failed to load service_area_base_pricing (table may not exist yet):', err);
  }
  const serviceAreaRule = findPricingRuleForServiceArea(pricingRules, baseArea?.id);
  const mainRule = findMainPricingRule(pricingRules);
  const seedRule = serviceAreaRule
    ? serviceAreaRule
    : mainRule
      ? { ...mainRule, id: undefined, service_area_id: undefined, rule_name: 'Service Area', rule_type: 'Service area' }
      : null;
  const seedBaseRouteRule = baseRouteRows[0]
    || (seedRule
      ? { ...seedRule, id: undefined, rule_name: 'Base + pickup + drop-off' }
      : null);

  return (
    <ServiceAreasClient
      initialAreas={areas}
      initialPricingRule={seedRule}
      initialBaseRoutePricing={seedBaseRouteRule}
      serviceAreaId={baseArea?.id ?? null}
    />
  );
}
