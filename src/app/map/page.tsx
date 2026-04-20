import { supabaseAdmin } from '@/lib/supabase';
import { getServiceAreas } from '../service-areas/actions';
import LiveMapClient from './LiveMapClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Live Map | UTO Admin Panel',
  description: 'Real-time map of drivers and service areas.',
};

async function getOnlineDrivers() {
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .select('*, user:user_id(full_name, phone)')
    .order('is_online', { ascending: false });

  if (error) {
    console.error('Error fetching drivers:', error);
    return [];
  }

  return data || [];
}

export default async function LiveMapPage() {
  const [areas, drivers] = await Promise.all([
    getServiceAreas(),
    getOnlineDrivers(),
  ]);

  return <LiveMapClient initialAreas={areas} initialDrivers={drivers} />;
}
