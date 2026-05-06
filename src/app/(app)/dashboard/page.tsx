import { DashboardClient } from '@/components/dashboard-client';

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6 font-headline">Tableau de Bord Administrateur</h1>
      <DashboardClient />
    </div>
  );
}
