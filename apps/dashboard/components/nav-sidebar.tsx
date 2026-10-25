"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessagesSquareIcon,
  DatabaseIcon,
  BoxesIcon,
  SettingsIcon,
  ClipboardListIcon,
  FileSignatureIcon,
  WorkflowIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/dashboard", label: "Console", icon: MessagesSquareIcon },
  { href: "/dashboard/orders", label: "Orders", icon: ClipboardListIcon },
  { href: "/dashboard/flow", label: "Flow", icon: WorkflowIcon },
  { href: "/dashboard/inventory", label: "Inventory", icon: BoxesIcon },
  { href: "/dashboard/contracts", label: "Contracts", icon: FileSignatureIcon },
  { href: "/dashboard/data", label: "Data", icon: DatabaseIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <span className="text-sm font-semibold">MRP II Negotiation</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
