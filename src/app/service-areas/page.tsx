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

function stripIds(rule: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!rule) return null;
  const { id: _id, service_area_id: _areaId, ...rest } = rule;
  return rest;
}

export default async function ServiceAreasPage() {
  const [areas, pricingRules] = await Promise.all([
    getServiceAreas(),
    getPricingRules(),
  ]);

  const baseArea = findBaseServiceArea(areas);
  const serviceAreaRule = findPricingRuleForServiceArea(pricingRules, baseArea?.id);
  const mainRule = findMainPricingRule(pricingRules);
  const seedRule = (serviceAreaRule || stripIds(mainRule as Record<string, unknown> | null)) as Record<string, unknown> | null;

  let seedBaseRouteRule: Record<string, unknown> | null = stripIds(seedRule);
  try {
    const baseRouteRows = await getServiceAreaBasePricing(baseArea?.id ?? null);
    if (baseRouteRows[0]) seedBaseRouteRule = baseRouteRows[0] as Record<string, unknown>;
  } catch (err) {
    console.error('Failed to load service_area_base_pricing (table may not exist yet):', err);
  }

  return (
    <ServiceAreasClient
      initialAreas={areas}
      initialPricingRule={seedRule}
      initialBaseRoutePricing={seedBaseRouteRule}
      serviceAreaId={baseArea?.id ?? null}
    />
  );
}
