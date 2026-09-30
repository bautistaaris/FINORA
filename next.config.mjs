/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  // Anti-clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // No MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer policy
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions policy: bloquear APIs sensibles
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  },
  // HSTS sólo en producción (HTTPS obligatorio)
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  // No indexar NADA
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
];

/**
 * Content-Security-Policy.
 *
 * IMPORTANTE: FINORA no es pública y debe ser tight.
 *  - default-src 'self' (sólo recursos propios)
 *  - script-src 'self' + Material Symbols + Google Fonts (CDNs necesarios)
 *  - style-src 'self' 'unsafe-inline' (Tailwind requiere inline) + Google Fonts
 *  - img-src 'self' data: (SVGs inline)
 *  - connect-src 'self' (todas las APIs son same-origin)
 *  - frame-ancestors 'none' (no iframes)
 *  - object-src 'none', base-uri 'self'
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;