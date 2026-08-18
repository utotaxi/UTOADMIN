'use client';

import { useState, useCallback } from 'react';
import { ServiceArea } from '@/types';
import { savePricingRule, deletePricingRule } from './actions';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PricingGrid from '@/components/PricingGrid';
import {
  DEFAULT_MILE_TIERS,
  DEFAULT_VEHICLE_DATA,
  SERVICE_AREA_FIXED_CALCULATION,
  VEHICLE_TYPES,
  buildInitialVehicles,
  formatVehiclesForSave,
  type MileTier,
  type MinuteTier,
  type VehiclePricing,
} from '@/lib/pricing';

interface SettingsClientProps {
  initialAreas: ServiceArea[];
  initialPricingRule: any | null; // Null if no existing DB rows
}

export default function SettingsClient({ initialAreas, initialPricingRule }: SettingsClientProps) {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const [id, setId] = useState<string | null>(initialPricingRule?.id || null);
  const [ruleName, setRuleName] = useState(initialPricingRule?.rule_name || '');
  const [ruleType, setRuleType] = useState(initialPricingRule?.rule_type || 'Dynamic route');
  const [rulePriority, setRulePriority] = useState(initialPricingRule?.rule_priority || '2');
  const [isShuttle, setIsShuttle] = useState<boolean>(initialPricingRule?.is_shuttle || false);
  const [whenApplied, setWhenApplied] = useState(initialPricingRule?.when_applied || 'Do not limit by time (anytime)');
  const [fixedCalculation, setFixedCalculation] = useState(initialPricingRule?.fixed_calculation || 'Fixed Start Point Only: [Base Address] → [Pickup Address] → [Drop-off Address]');
  const [baseAddress, setBaseAddress] = useState(initialPricingRule?.base_address || '');
  const [pickupArea, setPickupArea] = useState(initialPricingRule?.pickup_area || '');
  const [dropoffArea, setDropoffArea] = useState(initialPricingRule?.dropoff_area || '');
  const [applyWebBooker, setApplyWebBooker] = useState<boolean>(initialPricingRule?.apply_web_booker ?? true);
  const [applyDispatchPanel, setApplyDispatchPanel] = useState<boolean>(initialPricingRule?.apply_dispatch_panel ?? true);
  
  const [mileTiers, setMileTiers] = useState<MileTier[]>(initialPricingRule?.mile_tiers || DEFAULT_MILE_TIERS);
  const [minuteTiers, setMinuteTiers] = useState<MinuteTier[]>(initialPricingRule?.minute_tiers || []);
  const [vehicles, setVehicles] = useState<Record<string, VehiclePricing>>(buildInitialVehicles(initialPricingRule));

  const handleVehicleChange = (vType: string, field: keyof VehiclePricing, val: any) => {
    setVehicles(prev => ({
      ...prev,
      [vType]: {
        ...prev[vType],
        [field]: val
      }
    }));
  };

  const handleTierPriceChange = (vType: string, type: 'mile' | 'minute', tierId: string, val: string) => {
    setVehicles(prev => {
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
    const newId = Math.random().toString(36).substr(2, 9);
    setMileTiers(p => [...p, { id: newId, after_miles: '0' }]);
    
    // Add default price keys
    setVehicles(prev => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach(v => {
        up[v] = { ...up[v], mile_tier_prices: { ...up[v].mile_tier_prices, [newId]: '0.00' } };
      });
      return up;
    });
  };

  const removeMileTier = (tierId: string) => {
    setMileTiers(p => p.filter(t => t.id !== tierId));
    // Cleanup prices
    setVehicles(prev => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach(v => {
        const newPrices = { ...up[v].mile_tier_prices };
        delete newPrices[tierId];
        up[v] = { ...up[v], mile_tier_prices: newPrices };
      });
      return up;
    });
  };

  const addMinuteTier = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setMinuteTiers(p => [...p, { id: newId, after_minutes: '0' }]);
    
    setVehicles(prev => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach(v => {
        up[v] = { ...up[v], minute_tier_prices: { ...up[v].minute_tier_prices, [newId]: '0.00' } };
      });
      return up;
    });
  };

  const removeMinuteTier = (tierId: string) => {
    setMinuteTiers(p => p.filter(t => t.id !== tierId));
    setVehicles(prev => {
      const up = { ...prev };
      VEHICLE_TYPES.forEach(v => {
        const newPrices = { ...up[v].minute_tier_prices };
        delete newPrices[tierId];
        up[v] = { ...up[v], minute_tier_prices: newPrices };
      });
      return up;
    });
  };

  const updateMileTierValue = (id: string, val: string) => {
    setMileTiers(p => p.map(t => t.id === id ? { ...t, after_miles: val } : t));
  };
  
  const updateMinuteTierValue = (id: string, val: string) => {
    setMinuteTiers(p => p.map(t => t.id === id ? { ...t, after_minutes: val } : t));
  };

  const saveToSupabase = async () => {
    const payload = {
      ...(id && { id }),
      rule_name: ruleName,
      rule_type: ruleType,
      rule_priority: parseInt(String(rulePriority)) || 2,
      is_shuttle: isShuttle,
      when_applied: whenApplied,
      fixed_calculation: fixedCalculation,
      base_address: baseAddress,
      pickup_area: pickupArea,
      dropoff_area: dropoffArea,
      apply_web_booker: applyWebBooker,
      apply_dispatch_panel: applyDispatchPanel,
      vehicles: formatVehiclesForSave(vehicles),
      mile_tiers: mileTiers,
      minute_tiers: minuteTiers
    };

    const res = await savePricingRule(payload);
    if (res.success) {
      if (res.data?.id) setId(res.data.id);
      showToast('success', 'Pricing settings saved successfully.');
    } else {
      showToast('error', res.error || 'Failed to save settings.');
    }
  };

  const handleDelete = async () => {
    if (!id) {
      showToast('error', 'No pricing rule to delete yet.');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (!id) return;
    const res = await deletePricingRule(id);
    setShowDeleteConfirm(false);
    if (res.success) {
      showToast('success', 'Pricing rule deleted successfully.');
      setId(null);
      setRuleName('');
      setRuleType('Dynamic route');
      setRulePriority('2');
      setIsShuttle(false);
      setWhenApplied('Do not limit by time (anytime)');
      setFixedCalculation('Fixed Start Point Only: [Base Address] → [Pickup Address] → [Drop-off Address]');
      setBaseAddress('');
      setPickupArea('');
      setDropoffArea('');
      setApplyWebBooker(true);
      setApplyDispatchPanel(true);
      setMileTiers([]);
      setMinuteTiers([]);
      
      const resetV: Record<string, VehiclePricing> = {};
      VEHICLE_TYPES.forEach(tag => resetV[tag] = { ...DEFAULT_VEHICLE_DATA, mile_tier_prices: { ...DEFAULT_VEHICLE_DATA.mile_tier_prices } });
      setVehicles(resetV);
    } else {
      showToast('error', res.error || 'Failed to delete pricing rule.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-8 text-slate-800 bg-white">
      {toast && (
        <div className={cn(
          "fixed top-6 right-6 z-[9999] px-5 py-3 rounded-lg shadow-lg border text-[13px] font-medium flex items-center gap-2 transition-all animate-[slideIn_0.3s_ease-out]",
          toast.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        )}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      <h1 className="text-2xl font-bold mb-8">Prices</h1>

      <div className="max-w-6xl space-y-12">
        {/* Top Information Map */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-1">{ruleName || 'New Pricing Rule'}</h2>
          <p className="text-[13px] text-slate-500 mb-6">
            This pricing rule can be filled in to describe prices for each one of your products
          </p>

          <div className="border-b border-t border-slate-100 py-6 mb-8">
            <p className="text-[13px] text-slate-500 mb-6 max-w-3xl">
              Dynamic rules calculate trip prices based on distance and duration, location to location prices have a fixed price, on-meter prices are calculated by the taxi meter
            </p>

            <div className="flex gap-8 mb-6">
              <div className="flex-1 max-w-[200px]">
                <label className="text-xs text-slate-500 mb-1 block">Name *</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full border-b border-slate-400 py-1 text-[13px] bg-transparent focus:outline-none"
                />
              </div>
              <div className="flex-1 max-w-[200px]">
                <label className="text-xs text-slate-500 mb-1 block">Type *</label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                  className="w-full border-b border-slate-400 py-1 text-[13px] bg-transparent focus:outline-none"
                >
                  <option>Dynamic route</option>
                  <option>Fixed route</option>
                </select>
              </div>
              <div className="flex-1 max-w-[200px]">
                <label className="text-xs text-slate-500 mb-1 block">Priority *</label>
                <input
                  type="text"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                  className="w-full border-b border-slate-400 py-1 text-[13px] bg-transparent focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-slate-700">
              <input type="checkbox" checked={isShuttle} onChange={(e) => setIsShuttle(e.target.checked)} className="rounded border-slate-300 text-slate-700 focus:ring-transparent" />
              Shuttle Service (Per-Passenger Pricing) <span className="underline hover:text-slate-900 ml-1">(Instruction video)</span>
            </label>
          </div>

          <div className="space-y-10 border-b border-slate-100 pb-10 mb-8">
            <div>
              <label className="text-sm font-medium block text-slate-400 mb-2">Tell us when this rule should be applied</label>
              <select 
                value={whenApplied}
                onChange={e => setWhenApplied(e.target.value)}
                className="w-full max-w-xl border-b border-slate-400 py-1.5 text-[13px] focus:outline-none bg-transparent"
              >
                <option>Do not limit by time (anytime)</option>
              </select>
            </div>

            <div>
              <label className="text-[13px] font-bold block text-slate-500 mb-1">Fixed Address Pricing Calculation</label>
              <p className="text-[12px] text-slate-400 mb-4 max-w-3xl leading-relaxed">
                This feature enables you to use a fixed address as the starting and/or ending point for route calculations, ensuring accurate distance and time estimates. The total route distance and duration will be determined based on the selected option:
              </p>
              <select 
                value={fixedCalculation}
                onChange={e => setFixedCalculation(e.target.value)}
                className="w-full max-w-2xl border-b border-slate-400 py-1.5 text-[13px] focus:outline-none bg-transparent mb-6 text-slate-700"
              >
                <option>Fixed Start Point Only: [Base Address] → [Pickup Address] → [Drop-off Address]</option>
                <option>{SERVICE_AREA_FIXED_CALCULATION}</option>
              </select>

              <div className="max-w-xl">
                <label className="text-xs text-slate-500 mb-1 block">Base address</label>
                <input
                  type="text"
                  value={baseAddress}
                  onChange={(e) => setBaseAddress(e.target.value)}
                  className="w-full border-b border-slate-400 py-1 text-[13px] bg-transparent focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Existing Rules */}
        <div className="space-y-8">
          <div>
            <label className="text-sm font-medium block text-slate-400 mb-2">Tell us where this rule should be applied</label>
            <select className="w-96 border-b border-slate-400 py-1.5 text-[13px] text-slate-700 bg-transparent focus:outline-none">
              <option>Limit this rule to specific locations</option>
            </select>
          </div>

          <div className="flex gap-10">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Pickup address in area *</label>
              <select
                value={pickupArea}
                onChange={(e) => setPickupArea(e.target.value)}
                className="w-56 border-b border-slate-400 py-1 text-sm bg-transparent focus:outline-none"
              >
                <option value="">Select Pickup</option>
                {initialAreas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Dropoff address in area *</label>
              <select
                value={dropoffArea}
                onChange={(e) => setDropoffArea(e.target.value)}
                className="w-56 border-b border-slate-400 py-1 text-sm focus:outline-none"
              >
                <option value="">Select Dropoff</option>
                {initialAreas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Apps Selection */}
        <div className="pt-4 border-t border-slate-100">
          <label className="text-sm text-slate-500 mb-3 block">Select the apps that this rule should apply to.</label>
          <div className="flex gap-8 text-sm text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={applyWebBooker} onChange={(e) => setApplyWebBooker(e.target.checked)} className="rounded border-slate-300 text-[#0ea5e9] focus:ring-[#0ea5e9]" />
              Web Booker - GET A QUOTE
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={applyDispatchPanel} onChange={(e) => setApplyDispatchPanel(e.target.checked)} className="rounded border-slate-300 text-[#0ea5e9] focus:ring-[#0ea5e9]" />
              Dispatch Panel
            </label>
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="pt-8">
          <PricingGrid
            vehicles={vehicles}
            mileTiers={mileTiers}
            minuteTiers={minuteTiers}
            onVehicleChange={handleVehicleChange}
            onTierPriceChange={handleTierPriceChange}
            onAddMileTier={addMileTier}
            onRemoveMileTier={removeMileTier}
            onUpdateMileTier={updateMileTierValue}
            onAddMinuteTier={addMinuteTier}
            onRemoveMinuteTier={removeMinuteTier}
            onUpdateMinuteTier={updateMinuteTierValue}
          />
        </div>

        {/* Bottom Actions */}
        <div className="flex justify-end gap-3 pt-10 pb-20">
          <button onClick={handleDelete} className="px-6 py-2 rounded bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors">
            Delete
          </button>
          <button onClick={saveToSupabase} className="px-6 py-2 rounded bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-medium text-sm transition-colors">
            Save
          </button>
        </div>
      </div>
      
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden animate-[slideUp_0.3s_ease-out]">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Pricing Rule?</h3>
              <p className="text-slate-500 text-sm">
                Are you sure you want to delete this pricing rule?
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-600 font-medium text-sm hover:bg-slate-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded shadow-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); scale: 0.95; }
          to { opacity: 1; transform: translateY(0); scale: 1; }
        }
      `}</style>
    </div>
  );
}
