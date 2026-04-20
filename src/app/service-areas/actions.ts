'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { ServiceArea } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabaseAdmin
    .from('service_areas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching service areas:', error);
    return [];
  }

  return data || [];
}

export async function createServiceArea(area: {
  name: string;
  description?: string;
  area_type: 'polygon' | 'circle';
  coordinates: [number, number][];
  radius_meters?: number;
  color: string;
}): Promise<{ success: boolean; error?: string; data?: ServiceArea }> {
  const { data, error } = await supabaseAdmin
    .from('service_areas')
    .insert({
      name: area.name,
      description: area.description || null,
      area_type: area.area_type,
      coordinates: area.coordinates,
      radius_meters: area.radius_meters || null,
      color: area.color,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating service area:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/service-areas');
  revalidatePath('/map');
  return { success: true, data };
}

export async function updateServiceArea(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    coordinates: [number, number][];
    radius_meters: number;
    color: string;
    is_active: boolean;
  }>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('service_areas')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating service area:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/service-areas');
  revalidatePath('/map');
  return { success: true };
}

export async function deleteServiceArea(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('service_areas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting service area:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/service-areas');
  revalidatePath('/map');
  return { success: true };
}

export async function toggleServiceArea(
  id: string,
  is_active: boolean
): Promise<{ success: boolean; error?: string }> {
  return updateServiceArea(id, { is_active });
}
