import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { sheetVariants } from '../lib/motion'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  fullHeight?: boolean
}

export function BottomSheet({ isOpen, onClose, children, title, fullHeight = false }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl safe-bottom ${
              fullHeight ? 'max-h-[90vh]' : 'max-h-[80vh]'
            } flex flex-col`}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose()
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
            {title && (
              <div className="px-5 py-3 border-b border-border flex-shrink-0">
                <h2 className="text-lg font-semibold text-primary-text">{title}</h2>
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
