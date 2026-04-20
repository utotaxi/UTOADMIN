import SettingsClient from './SettingsClient';
import { getServiceAreas } from '@/app/service-areas/actions';
import { getPricingRules } from './actions';

export default async function SettingsPage() {
  const [areas, pricingRules] = await Promise.all([
    getServiceAreas(),
    getPricingRules(),
  ]);

  return (
    <div className="flex-1 overflow-auto bg-[#f1f5f9]">
      <SettingsClient 
        initialAreas={areas} 
        initialPricingRule={pricingRules.length > 0 ? pricingRules[0] : null} 
      />
    </div>
  );
}
