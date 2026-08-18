'use client';

import { useState } from 'react';
import PricingGrid from '@/components/PricingGrid';
import { savePricingRule } from '@/app/settings/actions';
import {
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

type Props = {
  initialPricingRule: Record<string, unknown> | null;
  baseAddress: string;
  onToast: (type: 'success' | 'error', message: string) => void;
  onBeforeSave?: () => Promise<void>;
};

export default function ServiceAreaPricingPanel({
  initialPricingRule,
  baseAddress,
  onToast,
  onBeforeSave,
}: Props) {
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
      if (onBeforeSave) await onBeforeSave();
      const payload = {
        ...(id && { id }),
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
        vehicles: formatVehiclesForSave(vehicles),
        mile_tiers: mileTiers,
        minute_tiers: minuteTiers,
      };
      const res = await savePricingRule(payload);
      if (res.success) {
        if (res.data?.id) setId(res.data.id);
        onToast('success', 'Service area pricing saved.');
      } else {
        onToast('error', res.error || 'Failed to save service area pricing.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-10 pt-8 border-t border-slate-200">
      <h3 className="text-[18px] font-bold text-slate-800 tracking-tight">Service area pricing</h3>
      <p className="text-[13px] text-slate-500 mt-1 mb-6 max-w-3xl leading-relaxed">
        Rates for trips billed against this circle. Pickup and drop-off both inside the blue circle
        are charged as pickup → drop-off only. Any trip that starts or ends outside the circle is
        charged as base → pickup → drop-off, treating this circle as the base.
      </p>
      <PricingGrid
        vehicles={vehicles}
        mileTiers={mileTiers}
        minuteTiers={minuteTiers}
        onVehicleChange={handleVehicleChange}
        onTierPriceChange={handleTierPriceChange}
        onAddMileTier={addMileTier}
        onRemoveMileTier={removeMileTier}
        onUpdateMileTier={(id, val) => setMileTiers((p) => p.map((t) => (t.id === id ? { ...t, after_miles: val } : t)))}
        onAddMinuteTier={addMinuteTier}
        onRemoveMinuteTier={removeMinuteTier}
        onUpdateMinuteTier={(id, val) => setMinuteTiers((p) => p.map((t) => (t.id === id ? { ...t, after_minutes: val } : t)))}
      />
      <div className="flex justify-end pt-8 pb-4">
        <button
          onClick={savePricing}
          disabled={saving}
          className="px-6 py-2 rounded bg-[#0ea5e9] hover:bg-[#0284c7] disabled:opacity-60 text-white font-medium text-sm transition-colors"
        >
          {saving ? 'Saving…' : 'Save pricing'}
        </button>
      </div>
    </div>
  );
}
