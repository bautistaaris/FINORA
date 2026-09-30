import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className, size = 32 }: LogoProps) {
  return (
    <svg
      role="img"
      aria-label="FINORA Monogram"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0 object-contain", className)}
    >
      <rect width="64" height="64" rx="14" fill="#1a1c1f" />
      <rect x="12" y="20" width="32" height="6" rx="3" fill="#68dba9" />
      <rect x="12" y="30" width="28" height="6" rx="3" fill="#68dba9" />
      <rect x="12" y="40" width="18" height="6" rx="3" fill="#68dba9" />
      <circle cx="40" cy="43" r="3" fill="#68dba9" />
    </svg>
  );
}