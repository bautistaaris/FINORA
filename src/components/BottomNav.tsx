"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", icon: "home", label: "Home", match: (p: string) => p === "/" },
  {
    href: "/movimientos",
    icon: "sync_alt",
    label: "Movimientos",
    match: (p: string) => p.startsWith("/movimientos"),
  },
  {
    href: "/movimientos/nuevo",
    icon: "add",
    label: "Nuevo",
    primary: true,
    match: () => false,
  },
  {
    href: "/inversiones",
    icon: "trending_up",
    label: "Inversiones",
    match: (p: string) => p.startsWith("/inversiones"),
  },
  {
    href: "/mas",
    icon: "grid_view",
    label: "Más",
    match: (p: string) => p.startsWith("/mas"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 w-full z-50 pb-safe bg-surface/85 backdrop-blur-xl shadow-[0_-4px_24px_rgba(0,0,0,0.45)]">
      <div className="relative flex items-center justify-around h-16 px-space-xs">
        {items.slice(0, 2).map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
        <div className="flex items-center justify-center -mt-5">
          <Link
            href={items[2]!.href}
            aria-label="Nuevo Movimiento"
            className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-on-primary shadow-glow-primary-lg active:scale-95 transition-transform duration-150"
          >
            <span className="material-symbols-outlined text-[28px] font-bold">add</span>
          </Link>
        </div>
        {items.slice(3).map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>
      <div className="w-full flex justify-center pb-1.5 pt-0.5">
        <div className="w-32 h-1 rounded-full bg-outline-variant/40" />
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
}: {
  item: { href: string; icon: string; label: string };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center min-w-[56px] min-h-[44px] gap-0.5 transition-colors",
        active
          ? "text-primary [filter:drop-shadow(0_0_10px_rgba(104,219,169,0.45))]"
          : "text-on-surface-variant hover:text-on-surface",
      )}
    >
      <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
      <span className="font-label-sm text-label-sm font-medium">{item.label}</span>
    </Link>
  );
}