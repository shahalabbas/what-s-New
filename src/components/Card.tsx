import { motion } from 'framer-motion'
import { spring } from '../lib/motion'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  layoutId?: string
  pressable?: boolean
}

export function Card({ children, className = '', onClick, layoutId, pressable = true }: CardProps) {
  const Component = layoutId ? motion.div : (onClick ? motion.button : motion.div)
  return (
    <Component
      layoutId={layoutId}
      onClick={onClick}
      whileTap={pressable && onClick ? { scale: 0.97 } : undefined}
      transition={spring}
      className={`bg-white rounded-2xl shadow-card p-4 w-full text-left ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </Component>
  )
}
