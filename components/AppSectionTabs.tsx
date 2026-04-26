"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/contacts", label: "Contact List" },
  { href: "/settings", label: "Settings" },
  { href: "/connector", label: "Connector" },
];

export default function AppSectionTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="rounded-2xl border border-border bg-muted p-1 flex gap-1"
      aria-label="App sections"
    >
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex-1 min-h-[44px] rounded-xl text-sm font-semibold flex items-center justify-center transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground active:bg-card/60"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
