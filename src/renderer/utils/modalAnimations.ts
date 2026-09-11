import type { Variants, Transition } from 'framer-motion';

export const modalBackdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalBackdropTransition: Transition = {
  duration: 0.18,
  ease: 'easeInOut',
};

export const modalContentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 8 },
};

export const modalContentTransition: Transition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
};
