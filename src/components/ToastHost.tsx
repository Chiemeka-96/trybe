import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useToastStore } from '../store/toastStore';

function variantStyles(variant: 'info' | 'success' | 'error') {
  switch (variant) {
    case 'success':
      return {
        wrap: 'border-trybe-200/60 bg-trybe-50/90 dark:bg-trybe-950/90 dark:border-trybe-800/40 text-trybe-800 dark:text-trybe-200',
        icon: <CheckCircle2 size={16} className="text-trybe-600 dark:text-trybe-400" />,
      };
    case 'error':
      return {
        wrap: 'border-red-200/60 bg-red-50/90 dark:bg-red-950/90 dark:border-red-800/40 text-red-700 dark:text-red-200',
        icon: <AlertCircle size={16} className="text-red-500 dark:text-red-400" />,
      };
    default:
      return {
        wrap: 'border-gray-200/80 bg-white/95 dark:bg-gray-900/95 dark:border-gray-700/80 text-gray-700 dark:text-gray-200',
        icon: <Info size={16} className="text-gray-500 dark:text-gray-400" />,
      };
  }
}

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-4 left-0 right-0 z-[9999] pointer-events-none">
      <div className="mx-auto w-full max-w-md px-4 flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const styles = variantStyles(t.variant);
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={`pointer-events-auto rounded-2xl shadow-soft-lg border backdrop-blur-sm ${styles.wrap} p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{styles.icon}</div>
                  <div className="flex-1 min-w-0">
                    {t.title && (
                      <div className="text-sm font-semibold mb-0.5">{t.title}</div>
                    )}
                    <div className="text-sm leading-relaxed">{t.message}</div>
                  </div>
                  <button
                    onClick={() => dismiss(t.id)}
                    className="p-1.5 rounded-xl text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
