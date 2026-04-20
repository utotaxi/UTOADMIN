import { getServiceAreas } from './actions';
import ServiceAreasClient from './ServiceAreasClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Service Areas | UTO Admin Panel',
  description: 'Manage serviceable zones for UTO ride sharing.',
};

export default async function ServiceAreasPage() {
  const areas = await getServiceAreas();

  return <ServiceAreasClient initialAreas={areas} />;
}
