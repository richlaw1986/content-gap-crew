import { Header } from '@/components/layout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar + main rendered by children (page.tsx controls the sidebar) */}
        {children}
      </div>
    </div>
  );
}
