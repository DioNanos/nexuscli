/**
 * Icon Wrapper Component
 *
 * Provides consistent icon rendering using lucide-react
 * Ensures all icons have uniform sizing and styling across the app
 */

import * as Icons from 'lucide-react';
import './Icon.css';

export default function Icon({ name, size = 20, className = '', ...props }) {
  const LucideIcon = Icons[name];

  if (!LucideIcon) {
    console.warn(`Icon "${name}" not found in lucide-react`);
    return null;
  }

  return (
    <LucideIcon
      size={size}
      className={`icon ${className}`}
      strokeWidth={2}
      {...props}
    />
  );
}
