'use client';

import { useState } from 'react';
import PricingGrid from '@/components/PricingGrid';
import { savePricingRule } from '@/app/settings/actions';
import { saveServiceAreaBasePricing } from './actions';
import {
  BASE_ROUTE_FIXED_CALCULATION,
  DEFAULT_MILE_TIERS,
  SERVICE_AREA_FIXED_CALCULATION,
  SERVICE_AREA_RULE_TYPE,
  VEHICLE_TYPES,
  buildInitialVehicles,
  formatVehiclesForSave,
  type MileTier,
  type MinuteTier,
  type VehiclePricing,
} from '@/lib/pricing';

export type ServiceAreaPricingKind = 'inside' | 'base_route';

type Props = {
  kind: ServiceAreaPricingKind;
  initialPricingRule: Record<string, unknown> | null;
  serviceAreaId?: string | null;
  baseAddress: string;
  onToast: (type: 'success' | 'error', message: string) => void;
  onBeforeSave?: () => Promise<string | null | void>;
};

const COPY: Record<
  ServiceAreaPricingKind,
  { title: string; description: string; saveLabel: string; savedLabel: string }
> = {
  inside: {
    title: 'Service area pricing',
    description:
      'Use this table when pickup and drop-off are both inside the blue circle. The fare is pickup → drop-off only.',
    saveLabel: 'Save pricing',
    savedLabel: 'Service area pricing saved.',
  },
  base_route: {
    title: 'Base + pickup + drop-off pricing',
    description:
      'Use this table for base → pickup → drop-off. The service-area radius is free deadhead. Only miles beyond that radius are charged. Example: 9-mile area, 2 miles base → pickup + 5 miles pickup → drop-off = 7 raw miles, which is under 9, so fare is £0. If raw miles are 16, billed miles = 16 − 9 = 7.',
    saveLabel: 'Save base-route pricing',
    savedLabel: 'Base + pickup + drop-off pricing saved.',
  },
};

export default function ServiceAreaPricingPanel({
  kind,
  initialPricingRule,
  serviceAreaId = null,
  baseAddress,
  onToast,
  onBeforeSave,
}: Props) {
  const copy = COPY[kind];
  const [id, setId] = useState<string | null>((initialPricingRule?.id as string) || null);
  const [saving, setSaving] = useState(false);
  const [mileTiers, setMileTiers] = useState<MileTier[]>(
    (initialPricingRule?.mile_tiers as MileTier[]) || DEFAULT_MILE_TIERS
  );
  const [minuteTiers, setMinuteTiers] = useState<MinuteTier[]>(
    (initialPricingRule?.minute_tiers as MinuteTier[]) || []
  );
  const [vehicles, setVehicles] = useState<Record<string, VehiclePricing>>(
    buildInitialVehicles(initialPricingRule as { vehicles?: Record<string, unknown> } | null)
  );

  const handleVehicleChange = (vType: string, field: keyof VehiclePricing, val: string | boolean) => {
    setVehicles((prev) => ({
      ...prev,
      [vType]: { ...prev[vType], [field]: val },
    }));
  };

  const handleTierPriceChange = (vType: string, type: 'mile' | 'minute', tierId: string, val: string) => {
    setVehicles((prev) => {
      const v = { ...prev[vType] };
      if (type === 'mile') {
        v.mile_tier_prices = { ...v.mile_tier_prices, [tierId]: val };
      } else {
        v.minute_tier_prices = { ...v.minute_tier_prices, [tierId]: val };
      }
      return { ...prev, [vType]: v };
    });
  };

  const addMileTier = () => {
    const newId = Math.random().toString(36).slice(2, 11);
    setMileTiers((p) => [...p, { id: newId, after_miles: '0' }]);
    setVehicles((prev) => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach((v) => {
        up[v] = { ...up[v], mile_tier_prices: { ...up[v].mile_tier_prices, [newId]: '0.00' } };
      });
      return up;
    });
  };

  const removeMileTier = (tierId: string) => {
    setMileTiers((p) => p.filter((t) => t.id !== tierId));
    setVehicles((prev) => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach((v) => {
        const nextPrices = { ...up[v].mile_tier_prices };
        delete nextPrices[tierId];
        up[v] = { ...up[v], mile_tier_prices: nextPrices };
      });
      return up;
    });
  };

  const addMinuteTier = () => {
    const newId = Math.random().toString(36).slice(2, 11);
    setMinuteTiers((p) => [...p, { id: newId, after_minutes: '0' }]);
    setVehicles((prev) => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach((v) => {
        up[v] = { ...up[v], minute_tier_prices: { ...up[v].minute_tier_prices, [newId]: '0.00' } };
      });
      return up;
    });
  };

  const removeMinuteTier = (tierId: string) => {
    setMinuteTiers((p) => p.filter((t) => t.id !== tierId));
    setVehicles((prev) => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach((v) => {
        const nextPrices = { ...up[v].minute_tier_prices };
        delete nextPrices[tierId];
        up[v] = { ...up[v], minute_tier_prices: nextPrices };
      });
      return up;
    });
  };

  const savePricing = async () => {
    setSaving(true);
    try {
      const resolvedAreaId =
        (onBeforeSave ? await onBeforeSave() : undefined) ?? serviceAreaId ?? null;
      const vehiclesPayload = formatVehiclesForSave(vehicles);

      const res =
        kind === 'base_route'
          ? await saveServiceAreaBasePricing({
              ...(id && { id }),
              service_area_id: resolvedAreaId,
              rule_name: 'Base + pickup + drop-off',
              vehicles: vehiclesPayload,
              mile_tiers: mileTiers,
              minute_tiers: minuteTiers,
              apply_web_booker: true,
              apply_dispatch_panel: true,
            })
          : await savePricingRule({
              ...(id && { id }),
              service_area_id: resolvedAreaId,
              rule_name: (initialPricingRule?.rule_name as string) || 'Service Area',
              rule_type: SERVICE_AREA_RULE_TYPE,
              rule_priority: parseInt(String(initialPricingRule?.rule_priority ?? '1')) || 1,
              is_shuttle: Boolean(initialPricingRule?.is_shuttle),
              when_applied: (initialPricingRule?.when_applied as string) || 'Do not limit by time (anytime)',
              fixed_calculation: SERVICE_AREA_FIXED_CALCULATION,
              base_address: baseAddress,
              pickup_area: (initialPricingRule?.pickup_area as string) || '',
              dropoff_area: (initialPricingRule?.dropoff_area as string) || '',
              apply_web_booker: initialPricingRule?.apply_web_booker ?? true,
              apply_dispatch_panel: initialPricingRule?.apply_dispatch_panel ?? true,
              vehicles: vehiclesPayload,
              mile_tiers: mileTiers,
              minute_tiers: minuteTiers,
            });

      if (res.success) {
        if (res.data?.id) setId(res.data.id as string);
        onToast('success', copy.savedLabel);
      } else {
        onToast('error', res.error || 'Failed to save pricing.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-10 pt-8 border-t border-slate-200">
      <h3 className="text-[18px] font-bold text-slate-800 tracking-tight">{copy.title}</h3>
      <p className="text-[13px] text-slate-500 mt-1 mb-6 max-w-3xl leading-relaxed">
        {copy.description}
      </p>
      {kind === 'base_route' && (
        <p className="text-[12px] text-slate-400 mb-6 max-w-3xl leading-relaxed">
          Calculation: {BASE_ROUTE_FIXED_CALCULATION}
        </p>
      )}
      <PricingGrid
        vehicles={vehicles}
        mileTiers={mileTiers}
        minuteTiers={minuteTiers}
        onVehicleChange={handleVehicleChange}
        onTierPriceChange={handleTierPriceChange}
        onAddMileTier={addMileTier}
        onRemoveMileTier={removeMileTier}
        onUpdateMileTier={(tierId, val) => setMileTiers((p) => p.map((t) => (t.id === tierId ? { ...t, after_miles: val } : t)))}
        onAddMinuteTier={addMinuteTier}
        onRemoveMinuteTier={removeMinuteTier}
        onUpdateMinuteTier={(tierId, val) => setMinuteTiers((p) => p.map((t) => (t.id === tierId ? { ...t, after_minutes: val } : t)))}
      />
      <div className="flex justify-end pt-8 pb-4">
        <button
          onClick={savePricing}
          disabled={saving}
          className="px-6 py-2 rounded bg-[#0ea5e9] hover:bg-[#0284c7] disabled:opacity-60 text-white font-medium text-sm transition-colors"
        >
          {saving ? 'Saving…' : copy.saveLabel}
        </button>
      </div>
    </div>
  );
}
