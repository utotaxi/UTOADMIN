'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function getPricingRules() {
  // If the table doesn't exist yet, this will fail gracefully or we handle error
  const { data, error } = await supabaseAdmin
    .from('pricing_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pricing rules:', error);
    // Return empty array, anticipating the table might not exist
    return [];
  }

  return data || [];
}

export async function savePricingRule(rule: any) {
  const { 
    id, rule_name, rule_type, rule_priority, is_shuttle, when_applied, 
    fixed_calculation, base_address, pickup_area, dropoff_area, 
    apply_web_booker, apply_dispatch_panel, vehicles, mile_tiers, minute_tiers 
  } = rule;
  
  const updates = { 
    rule_name, rule_type, rule_priority, is_shuttle, when_applied, 
    fixed_calculation, base_address, pickup_area, dropoff_area, 
    apply_web_booker, apply_dispatch_panel, vehicles, mile_tiers, minute_tiers 
  };
  
  if (id) {
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
      
    if (error) return { success: false, error: error.message };
    revalidatePath('/settings');
    revalidatePath('/service-areas');
    return { success: true, data };
  } else {
    // For now, let's assume we are updating the first rule or creating one
    // It's a single "global" or generic rule until they add listing UI
    // If they want to just maintain ONE config for now:
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .insert(updates)
      .select()
      .single();
      
    if (error) return { success: false, error: error.message };
    revalidatePath('/settings');
    revalidatePath('/service-areas');
    return { success: true, data };
  }
}

export async function deletePricingRule(id: string) {
  const { error } = await supabaseAdmin
    .from('pricing_rules')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting pricing rule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/settings');
  revalidatePath('/service-areas');
  return { success: true };
}
