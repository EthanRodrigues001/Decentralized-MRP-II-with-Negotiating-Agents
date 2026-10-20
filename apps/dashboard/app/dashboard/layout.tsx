import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { NavSidebar } from "@/components/nav-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen className="h-svh">
      <NavSidebar />
      <SidebarInset className="flex flex-col min-h-0">
        <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
          <SidebarTrigger />
          <ThemeToggle />
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
