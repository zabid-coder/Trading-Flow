import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  icon?: React.ReactNode;
  status?: 'active' | 'warning' | 'error' | 'neutral';
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className, 
  title, 
  icon,
  status = 'neutral',
  ...rest
}) => {
  const statusColors = {
    active: 'border-l-4 border-l-emerald-500',
    warning: 'border-l-4 border-l-amber-500',
    error: 'border-l-4 border-l-rose-500',
    neutral: 'border-l-4 border-l-slate-700'
  };

  return (
    <div 
      className={cn(
        "glass-panel rounded-xl p-5 md:p-6 transition-all duration-300 hover:shadow-lg hover:border-slate-600",
        statusColors[status],
        className
      )}
      {...rest}
    >
      {(title || icon) && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs md:text-sm font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </h3>
          {icon && <span className="text-slate-400">{icon}</span>}
        </div>
      )}
      {children}
    </div>
  );
};
