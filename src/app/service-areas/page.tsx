import { getServiceAreas } from './actions';
import { getPricingRules } from '@/app/settings/actions';
import ServiceAreasClient from './ServiceAreasClient';
import {
  findMainPricingRule,
  findServiceAreaPricingRule,
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

  const serviceAreaRule = findServiceAreaPricingRule(pricingRules);
  const mainRule = findMainPricingRule(pricingRules);
  const seedRule = serviceAreaRule
    ? serviceAreaRule
    : mainRule
      ? { ...mainRule, id: undefined, rule_name: 'Service Area', rule_type: 'Service area' }
      : null;

  return (
    <ServiceAreasClient
      initialAreas={areas}
      initialPricingRule={seedRule}
    />
  );
}
