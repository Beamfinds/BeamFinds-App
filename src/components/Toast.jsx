import { motion, AnimatePresence } from 'framer-motion'
import useAppStore from '../store/appStore.js'

const ICONS = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' }
const COLORS = { success: '#2ecc71', error: '#e74c3c', warning: '#f39c12', info: '#3498db' }

export default function Toast() {
  const { toasts, removeToast } = useAppStore()

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className="glass-card flex items-center gap-3 px-4 py-3 pointer-events-auto cursor-pointer min-w-64 max-w-xs"
            style={{ borderLeft: `3px solid ${COLORS[t.type] || COLORS.info}` }}
            onClick={() => removeToast(t.id)}
          >
            <i className={`fas ${ICONS[t.type] || ICONS.info} text-sm`} style={{ color: COLORS[t.type] || COLORS.info }} />
            <span className="text-sm text-text-main">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
