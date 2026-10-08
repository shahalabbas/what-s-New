
interface AppLogoProps {
  size?: number | string
  className?: string
  rounded?: boolean
}

export function AppLogo({ size = 48, className = '', rounded = true }: AppLogoProps) {
  const dimension = typeof size === 'number' ? `${size}px` : size

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      style={{ width: dimension, height: dimension }}
      className={`flex-shrink-0 ${className}`}
      aria-label="What's Next Logo"
    >
      <rect
        width="512"
        height="512"
        rx={rounded ? 120 : 0}
        ry={rounded ? 120 : 0}
        fill="#0A2540"
      />
      {/* Top Pill */}
      <rect x="101" y="140" width="310" height="96" rx="48" fill="#FFFFFF" />
      {/* Bottom Left Pill */}
      <rect x="101" y="276" width="194" height="96" rx="48" fill="#5B96F7" />
      {/* Bottom Right Circle */}
      <circle cx="363" cy="324" r="48" fill="#FFA000" />
    </svg>
  )
}
