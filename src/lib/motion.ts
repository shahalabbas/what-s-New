export const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }
export const springGentle = { type: 'spring' as const, stiffness: 200, damping: 25 }
export const springSnappy = { type: 'spring' as const, stiffness: 400, damping: 35 }

export const stagger = {
  animate: { transition: { staggerChildren: 0.04 } },
}

export const fadeRise = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: spring,
}

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
}

export const pageSlide = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: springGentle,
}

export const scalePress = {
  whileTap: { scale: 0.97 },
  transition: spring,
}

export const sheetVariants = {
  hidden: { y: '100%', opacity: 0 },
  visible: { y: 0, opacity: 1, transition: springGentle },
  exit: { y: '100%', opacity: 0, transition: { duration: 0.2 } },
}
