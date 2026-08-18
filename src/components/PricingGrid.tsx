'use client';

import { X } from 'lucide-react';
import {
  VEHICLE_TYPES,
  type MileTier,
  type MinuteTier,
  type VehiclePricing,
} from '@/lib/pricing';

type Props = {
  vehicles: Record<string, VehiclePricing>;
  mileTiers: MileTier[];
  minuteTiers: MinuteTier[];
  onVehicleChange: (vehicleType: string, field: keyof VehiclePricing, value: string | boolean) => void;
  onTierPriceChange: (vehicleType: string, type: 'mile' | 'minute', tierId: string, value: string) => void;
  onAddMileTier: () => void;
  onRemoveMileTier: (tierId: string) => void;
  onUpdateMileTier: (tierId: string, value: string) => void;
  onAddMinuteTier: () => void;
  onRemoveMinuteTier: (tierId: string) => void;
  onUpdateMinuteTier: (tierId: string, value: string) => void;
};

export default function PricingGrid({
  vehicles,
  mileTiers,
  minuteTiers,
  onVehicleChange,
  onTierPriceChange,
  onAddMileTier,
  onRemoveMileTier,
  onUpdateMileTier,
  onAddMinuteTier,
  onRemoveMinuteTier,
  onUpdateMinuteTier,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left whitespace-nowrap">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="font-semibold pb-4 w-40 text-slate-800">Product pricing</th>
            {VEHICLE_TYPES.map((v) => (
              <th key={v} className="font-semibold pb-4 px-4 w-48 text-slate-800 truncate">{v}</th>
            ))}
          </tr>
          <tr>
            <td className="py-4"></td>
            {VEHICLE_TYPES.map((v) => (
              <td key={v} className="px-4 py-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={vehicles[v]?.enabled}
                    onChange={(e) => onVehicleChange(v, 'enabled', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0ea5e9]"></div>
                </label>
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Minimum price', key: 'min_price' as const },
            { label: 'Waiting price p/min', key: 'waiting_price' as const },
            { label: 'Start price', key: 'start_price' as const },
          ].map((row) => (
            <tr key={row.key}>
              <td className="py-3 text-slate-500 font-medium">{row.label}</td>
              {VEHICLE_TYPES.map((v) => (
                <td key={v} className="px-4 py-3">
                  <div className="flex items-center gap-1 border-b border-slate-300 w-32 pb-0.5">
                    <span className="text-slate-500">£</span>
                    <input
                      type="text"
                      value={(vehicles[v]?.[row.key] as string) || '0.00'}
                      onChange={(e) => onVehicleChange(v, row.key, e.target.value)}
                      className="w-full focus:outline-none bg-transparent"
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}

          <tr>
            <td className="py-3 flex items-center justify-between pr-4 font-medium text-slate-500">
              <span>Mile price</span>
              <button onClick={onAddMileTier} className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none">+</button>
            </td>
            {VEHICLE_TYPES.map((v) => (
              <td key={v} className="px-4 py-3">
                <div className="flex items-center gap-1 border-b border-slate-300 w-32 pb-0.5">
                  <span className="text-slate-500">£</span>
                  <input
                    type="text"
                    value={vehicles[v]?.base_mile_price || '0.00'}
                    onChange={(e) => onVehicleChange(v, 'base_mile_price', e.target.value)}
                    className="w-full focus:outline-none bg-transparent"
                  />
                </div>
              </td>
            ))}
          </tr>

          {mileTiers.map((tier) => (
            <tr key={tier.id}>
              <td className="py-3 pr-4 flex items-center gap-2 text-slate-500">
                <span>- After</span>
                <input
                  type="text"
                  value={tier.after_miles}
                  onChange={(e) => onUpdateMileTier(tier.id, e.target.value)}
                  className="w-8 border-b border-slate-300 text-center focus:outline-none bg-transparent"
                />
                <span>mi</span>
                <button onClick={() => onRemoveMileTier(tier.id)} className="ml-auto text-red-500 font-bold">
                  <X size={14} />
                </button>
              </td>
              {VEHICLE_TYPES.map((v) => (
                <td key={v} className="px-4 py-3">
                  <div className="flex items-center gap-1 border-b border-slate-300 w-32 pb-0.5">
                    <span className="text-slate-500">£</span>
                    <input
                      type="text"
                      value={vehicles[v]?.mile_tier_prices[tier.id] || '0.00'}
                      onChange={(e) => onTierPriceChange(v, 'mile', tier.id, e.target.value)}
                      className="w-full focus:outline-none bg-transparent"
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}

          <tr>
            <td className="py-3 flex items-center justify-between pr-4 font-medium text-slate-500 mt-2">
              <span>Minute price</span>
              <button onClick={onAddMinuteTier} className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none">+</button>
            </td>
            {VEHICLE_TYPES.map((v) => (
              <td key={v} className="px-4 py-3">
                <div className="flex items-center gap-1 border-b border-slate-300 w-32 pb-0.5">
                  <span className="text-slate-500">£</span>
                  <input
                    type="text"
                    value={vehicles[v]?.base_minute_price || '0.00'}
                    onChange={(e) => onVehicleChange(v, 'base_minute_price', e.target.value)}
                    className="w-full focus:outline-none bg-transparent"
                  />
                </div>
              </td>
            ))}
          </tr>

          {minuteTiers.map((tier) => (
            <tr key={tier.id}>
              <td className="py-3 pr-4 flex items-center gap-2 text-slate-500">
                <span>- After</span>
                <input
                  type="text"
                  value={tier.after_minutes}
                  onChange={(e) => onUpdateMinuteTier(tier.id, e.target.value)}
                  className="w-8 border-b border-slate-300 text-center focus:outline-none bg-transparent"
                />
                <span>min</span>
                <button onClick={() => onRemoveMinuteTier(tier.id)} className="ml-auto text-red-500 font-bold">
                  <X size={14} />
                </button>
              </td>
              {VEHICLE_TYPES.map((v) => (
                <td key={v} className="px-4 py-3">
                  <div className="flex items-center gap-1 border-b border-slate-300 w-32 pb-0.5">
                    <span className="text-slate-500">£</span>
                    <input
                      type="text"
                      value={vehicles[v]?.minute_tier_prices[tier.id] || '0.00'}
                      onChange={(e) => onTierPriceChange(v, 'minute', tier.id, e.target.value)}
                      className="w-full focus:outline-none bg-transparent"
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
